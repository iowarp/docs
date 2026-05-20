# GPU CTE API

This guide describes how to call `AsyncPutBlob`, `AsyncGetBlob`, and
`AsyncGetOrCreateTag` from CUDA GPU kernels using the CTE (Context Transfer
Engine) client API. Two usage patterns are covered:

1. **CPU-side with fork client** -- the simpler path where a CPU test process
   launches a background Chimaera runtime and issues CTE calls from host code
   using shared-memory buffers.
2. **GPU kernel-side** -- the advanced path where a CUDA `__global__` kernel
   allocates tasks, submits them through the GPU-to-CPU queue, and waits for
   completion entirely on-device.

## Headers

```cpp
#include <chimaera/chimaera.h>
#include <chimaera/pool_query.h>
#include <chimaera/singletons.h>
#include <clio_cte/core/core_client.h>
#include <clio_cte/core/core_tasks.h>

// GPU memory backends (GPU kernel path only)
#include <clio_ctp/memory/backend/gpu_shm_mmap.h>
#include <clio_ctp/memory/backend/gpu_malloc.h>
#include <clio_ctp/util/gpu_api.h>
```

## CPU-Side Usage (Fork Client)

This is the recommended starting point. A fork client spawns a background
Chimaera runtime in a child process, then the parent issues CTE calls from
normal host code. Blob data is allocated in shared memory so the runtime
workers can access it directly.

### 1. Initialize Chimaera

```cpp
bool ok = chi::CHIMAERA_INIT(chi::ChimaeraMode::kClient, /*fork=*/true);
```

The second argument `true` forks a background runtime. Allow ~500 ms for the
child process to start before issuing tasks.

### 2. Create the CTE Pool

```cpp
chi::PoolId core_pool_id = clio_cte::core::kCtePoolId;
clio_cte::core::Client core_client(core_pool_id);

clio_cte::core::CreateParams params;
auto create_task = core_client.AsyncCreate(
    chi::PoolQuery::Dynamic(),
    clio_cte::core::kCtePoolName, core_pool_id, params);
create_task.Wait();
```

### 3. Register a Storage Target

CTE needs at least one storage backend for blob data.

```cpp
auto reg_task = core_client.AsyncRegisterTarget(
    "/tmp/cte_gpu_test.dat",         // path on disk
    chimaera::bdev::BdevType::kFile, // file-backed target
    16 * 1024 * 1024,                // 16 MB capacity
    chi::PoolQuery::Local(),
    chi::PoolId(700, 0));            // target pool ID
reg_task.Wait();
```

### 4. Create a Tag

Tags group blobs logically. The returned `tag_id_` is required by PutBlob
and GetBlob.

```cpp
auto tag_task = core_client.AsyncGetOrCreateTag("my_gpu_tag");
tag_task.Wait();
clio_cte::core::TagId tag_id = tag_task->tag_id_;
```

### 5. AsyncPutBlob

Allocate a shared-memory buffer, fill it, then submit a PutBlob task.

```cpp
const size_t blob_size = 4096;

// Allocate in shared memory (accessible to runtime workers)
hipc::FullPtr<char> buf = CHI_IPC->AllocateBuffer(blob_size);
std::memset(buf.ptr_, 0xAB, blob_size);

// Cast to a void ShmPtr for the CTE API
hipc::ShmPtr<> blob_data = buf.shm_.Cast<void>();

auto put = core_client.AsyncPutBlob(
    tag_id,
    "my_blob",            // blob name
    /*offset=*/0,
    /*size=*/blob_size,
    blob_data,
    /*score=*/-1.0f,      // -1 = auto-place
    clio_cte::core::Context(),
    /*flags=*/0,
    chi::PoolQuery::Local());
put.Wait();
assert(put->GetReturnCode() == 0);
```

### 6. AsyncGetBlob

Allocate an output buffer in shared memory and submit a GetBlob task.

```cpp
hipc::FullPtr<char> out_buf = CHI_IPC->AllocateBuffer(blob_size);
std::memset(out_buf.ptr_, 0, blob_size);
hipc::ShmPtr<> out_data = out_buf.shm_.Cast<void>();

auto get = core_client.AsyncGetBlob(
    tag_id,
    "my_blob",
    /*offset=*/0,
    /*size=*/blob_size,
    /*flags=*/0,
    out_data,
    chi::PoolQuery::Local());
get.Wait();
assert(get->GetReturnCode() == 0);
// out_buf.ptr_ now contains the retrieved blob data
```

## GPU Kernel-Side Usage

For submitting CTE tasks directly from a CUDA `__global__` kernel, additional
setup is required. The GPU kernel uses `CHIMAERA_GPU_INIT` to set up per-thread
allocators, then calls `CHI_IPC->NewTask<T>()` and `CHI_IPC->Send()` exactly
like host code.

### Memory Backend Setup (Host Side)

Three GPU memory backends must be initialized before launching the kernel:

```cpp
// 1. Primary backend -- task object allocation (GpuShmMmap = UVM)
hipc::MemoryBackendId backend_id(20, 0);
hipc::GpuShmMmap gpu_backend;
gpu_backend.shm_init(backend_id, 10 * 1024 * 1024, "/my_gpu_cte", 0);

// Register with the IPC manager so the GPU kernel can allocate from it
CHI_IPC->RegisterGpuAllocator(
    backend_id, gpu_backend.data_, gpu_backend.data_capacity_);

// 2. GPU-to-CPU backend -- FutureShm lives here (UVM, CPU+GPU visible)
hipc::MemoryBackendId g2c_backend_id(21, 0);
hipc::GpuShmMmap g2c_backend;
g2c_backend.shm_init(g2c_backend_id, 4 * 1024 * 1024, "/my_gpu_g2c", 0);

// 3. GPU heap backend -- device memory for serialization scratch
hipc::MemoryBackendId heap_backend_id(22, 0);
hipc::GpuMalloc gpu_heap_backend;
gpu_heap_backend.shm_init(heap_backend_id, 4 * 1024 * 1024, "/my_gpu_heap", 0);
```

### IpcManagerGpuInfo Setup (Host Side)

Pack the backends and queue pointer into a struct that the kernel receives
by value:

```cpp
chi::IpcManagerGpuInfo gpu_info;
gpu_info.backend =
    static_cast<hipc::MemoryBackend &>(gpu_backend);
gpu_info.gpu2cpu_queue =
    CHI_IPC->GetGpuQueue(0);  // pre-existing GPU-to-CPU queue
gpu_info.gpu2cpu_backend =
    static_cast<hipc::MemoryBackend &>(g2c_backend);
gpu_info.gpu_heap_backend =
    static_cast<hipc::MemoryBackend &>(gpu_heap_backend);
```

### Kernel Launch (Host Side)

Use a non-blocking CUDA stream to avoid serializing with the default stream
(important when a persistent GPU orchestrator kernel is also running):

```cpp
cudaStream_t stream;
cudaStreamCreateWithFlags(&stream, cudaStreamNonBlocking);

my_cte_kernel<<<1, 1, 0, stream>>>(gpu_info, pool_id, tag_id);

// Poll or synchronize as needed (see polling pattern below)
```

### GPU Kernel Implementation

```cpp
__global__ void my_cte_kernel(chi::IpcManagerGpu gpu_info,
                              chi::PoolId pool_id,
                              clio_cte::core::TagId tag_id) {
  // Initialize per-thread GPU allocators and IPC context
  CHIMAERA_GPU_INIT(gpu_info);

  // ---- GetOrCreateTag ----
  auto tag_task = CHI_IPC->NewTask<clio_cte::core::GetOrCreateTagTask<>>(
      chi::CreateTaskId(),
      pool_id,
      chi::PoolQuery::ToLocalCpu(),  // route to CPU worker
      "my_gpu_tag",
      clio_cte::core::TagId::GetNull());
  auto tag_future = CHI_IPC->Send(tag_task);
  tag_future.Wait();
  clio_cte::core::TagId result_tag_id = tag_future->tag_id_;

  // ---- PutBlob ----
  const size_t blob_size = 4096;
  hipc::FullPtr<char> buf = CHI_IPC->AllocateBuffer(blob_size);
  // Fill buffer on device...

  auto put_task = CHI_IPC->NewTask<clio_cte::core::PutBlobTask>(
      chi::CreateTaskId(),
      pool_id,
      chi::PoolQuery::ToLocalCpu(),
      result_tag_id,
      "my_blob",
      /*offset=*/0ULL,
      /*size=*/(chi::u64)blob_size,
      buf.shm_.Cast<void>(),
      /*score=*/-1.0f,
      clio_cte::core::Context(),
      /*flags=*/0U);
  auto put_future = CHI_IPC->Send(put_task);
  put_future.Wait();

  // ---- GetBlob ----
  hipc::FullPtr<char> out = CHI_IPC->AllocateBuffer(blob_size);
  auto get_task = CHI_IPC->NewTask<clio_cte::core::GetBlobTask>(
      chi::CreateTaskId(),
      pool_id,
      chi::PoolQuery::ToLocalCpu(),
      result_tag_id,
      "my_blob",
      /*offset=*/0ULL,
      /*size=*/(chi::u64)blob_size,
      /*flags=*/0U,
      out.shm_.Cast<void>());
  auto get_future = CHI_IPC->Send(get_task);
  get_future.Wait();
  // out.ptr_ now contains the retrieved data
}
```

### Routing from GPU Kernels

| PoolQuery | Direction | Description |
|-----------|-----------|-------------|
| `PoolQuery::ToLocalCpu()` | GPU to CPU | Task enters the `gpu2cpu_queue` and is processed by a CPU worker. Use this for CTE blob operations. |
| `PoolQuery::Local()` | GPU to GPU | Task stays on the GPU orchestrator. Use for GPU-native module methods. |
| `PoolQuery::LocalGpuBcast()` | CPU to GPU | CPU pushes a task to GPU orchestrator. Used from host code, not inside kernels. |

For CTE blob I/O, always use `PoolQuery::ToLocalCpu()` because the CTE
runtime (storage targets, metadata) runs on CPU workers.

### GPU Wait with Stop Flag

`future.Wait()` spins on the GPU until the CPU worker marks the future
complete. For robustness, use a manual poll loop with a CPU-controlled stop
flag so the host can terminate a stuck kernel:

```cpp
__global__ void safe_kernel(chi::IpcManagerGpu gpu_info,
                            /* ... */,
                            volatile int *d_stop) {
  CHIMAERA_GPU_INIT(gpu_info);
  // ... NewTask + Send ...
  auto fshm_full = future.GetFutureShm();
  chi::FutureShm *fshm = fshm_full.ptr_;
  while (fshm && !fshm->flags_.AnySystem(chi::FutureShm::FUTURE_COMPLETE)) {
    // Bypass GPU L2 cache to see CPU-written stop flag
    int stop = atomicAdd_system(const_cast<int *>(d_stop), 0);
    if (stop) return;
    CTP_THREAD_MODEL->Yield();
  }
}
```

On the host side, allocate `d_stop` with `cudaMallocManaged` and set it to 1
if the kernel times out.

## Context Structure

`clio_cte::core::Context` controls compression and placement behavior. Pass a
default-constructed `Context()` for standard uncompressed I/O.

Key fields:

| Field | Default | Description |
|-------|---------|-------------|
| `dynamic_compress_` | 0 | 0=skip, 1=static, 2=dynamic compression |
| `compress_lib_` | 0 | Compression library index (0-10) |
| `compress_preset_` | 2 | 1=FAST, 2=BALANCED, 3=BEST |
| `min_persistence_level_` | 0 | 0=volatile, 1=temp-nonvolatile, 2=long-term |
| `score` (PutBlob param) | -1.0 | -1=auto, 0.0-1.0=explicit tier (higher=faster) |

## CMake Integration

GPU CTE kernels must be compiled with CUDA (`*.cu` files or
`set_source_files_properties(... LANGUAGE CUDA)`). Link against:

```cmake
target_link_libraries(my_target
  clio_cte_core_client   # CTE client library
  chimaera_cxx          # Chimaera runtime
  clio_ctp_host       # Shared memory primitives
)
```

Enable CUDA in the project:

```cmake
enable_language(CUDA)
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CUDA_ARCHITECTURES 70 80 90)
```

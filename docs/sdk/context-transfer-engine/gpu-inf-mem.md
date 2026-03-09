# GPU Infinite Memory (UVM Backend)

`GpuShmMmap` is IOWarp's **Unified Virtual Memory (UVM)** memory backend.
It allocates a single region with `cudaMallocManaged` so that both CPU
threads and GPU kernels can read and write the same bytes without any
explicit copy or synchronization primitive beyond a memory fence.

This is the backbone of the GPU transport layer: `FutureShm` ring buffers,
task queues, and ArenaAllocator scratch regions all live in UVM memory so
a CPU worker and a GPU orchestrator kernel can exchange data at cache speed
rather than PCIe bandwidth.

## Why UVM Instead of Pinned Memory

Pinned host memory (`cudaMallocHost`) requires **system-scope atomics**
(`atomicAdd_system`, `atomicExch_system`) for GPU→CPU visibility.  These
atomics in turn require `cudaDevAttrHostNativeAtomicSupported`, which is
`0` on most discrete/PCIe GPUs (e.g. RTX 4070, A100 over PCIe).  Without
hardware support the operations silently fall back to slower paths and can
exhibit stale-read races.

UVM with `cudaDevAttrConcurrentManagedAccess` (available on SM 6.0+ GPUs)
uses the GPU's hardware page-migration engine to maintain coherence, so:

- **Standard device-scope atomics** on the GPU are visible to the CPU.
- **`std::atomic` on the CPU** is visible to the GPU.
- No `clflush`, write-combining flags, or `__threadfence_system` needed.

| Feature | `cudaMallocHost` (pinned) | `cudaMallocManaged` (UVM) |
|---------|--------------------------|--------------------------|
| GPU→CPU atomics | `atomicAdd_system` required | device-scope sufficient |
| Hardware requirement | `HostNativeAtomicSupported` | `ConcurrentManagedAccess` |
| Cross-process sharing | Yes (via IPC handles) | No (single process only) |
| Free with | `cudaFreeHost` | `cudaFree` |
| Typical use | small control flags | ring buffers, allocators |

## Header

```cpp
#include <hermes_shm/memory/backend/gpu_shm_mmap.h>
```

Requires `HSHM_ENABLE_CUDA=1` or `HSHM_ENABLE_ROCM=1`.

## Allocation

```cpp
hipc::MemoryBackendId backend_id(100, 0); // (major, minor) — must be unique
hipc::GpuShmMmap backend;

bool ok = backend.shm_init(
    backend_id,
    32 * 1024 * 1024,  // 32 MB total (headers + data)
    "/my_uvm_region",  // informational name — not a file path
    0);                // GPU device ID (informational)

assert(ok);
char   *data     = backend.data_;           // usable data region
size_t  capacity = backend.data_capacity_;  // usable bytes (total − 8 KB headers)
```

`shm_init` calls `cudaMallocManaged(&ptr, size, cudaMemAttachGlobal)` and
lays out the region as:

```
[ 4 KB backend header ][ 4 KB shared header ][ data ... ]
```

The two header pages are reserved for `MemoryBackendHeader` metadata; your
allocator or ring buffer should start from `data_`.

## Passing to a GPU Kernel

`GpuShmMmap` is a plain struct (no vtable, no host-only members) and can
be passed to a `__global__` kernel **by value** as part of
`IpcManagerGpuInfo`.  The `data_` pointer is a CUDA-managed virtual
address valid on both host and device.

```cpp
chi::IpcManagerGpuInfo gpu_info;
gpu_info.backend         = static_cast<hipc::MemoryBackend &>(backend);
gpu_info.gpu2cpu_backend = static_cast<hipc::MemoryBackend &>(g2c_backend);
// ... set queue pointers ...

my_kernel<<<blocks, threads, 0, stream>>>(gpu_info, ...);
```

Inside the kernel, `CHIMAERA_GPU_ORCHESTRATOR_INIT` (or `CHIMAERA_GPU_INIT`
for client kernels) reconstructs the per-block ArenaAllocator from
`gpu_info.backend`, partitioning the UVM region evenly across blocks.

## Registering with the IPC Manager

On the host side, register the backend so the CPU-side IPC manager can
resolve allocator IDs returned by the GPU:

```cpp
CHI_IPC->RegisterGpuAllocator(
    backend_id,
    backend.data_,
    backend.data_capacity_);
```

This records a mapping from `backend_id` → `(data_, capacity)` so that
`FutureShm` offsets written by a GPU thread can be dereferenced by a CPU
worker without an extra copy.

## Memory Layout Inside the Region

After calling `shm_init`, build an ArenaAllocator (or any other
`HSHM_DEFAULT_ALLOC_GPU_T`) directly on top of the UVM region:

```cpp
// Host side — initialize allocator
auto *alloc = reinterpret_cast<HSHM_DEFAULT_ALLOC_GPU_T *>(backend.data_);
new (alloc) HSHM_DEFAULT_ALLOC_GPU_T();
alloc->shm_init(backend_id, nullptr, backend.data_, backend.data_capacity_);
```

The same bytes are then accessible from the GPU kernel as the
`gpu_alloc_table_[thread_id]` entry set up by `CHIMAERA_GPU_ORCHESTRATOR_INIT`.

## Destruction

```cpp
backend.shm_destroy(); // calls cudaFree internally
```

Do **not** call `cudaFreeHost` — the backing memory was allocated with
`cudaMallocManaged`, not `cudaMallocHost`.

`shm_attach` is intentionally unsupported; UVM allocations are
process-local and cannot be imported by another PID.

## Limitations

| Limitation | Detail |
|-----------|--------|
| Single-process only | No `shm_attach`; cannot share across PIDs |
| Minimum size | Enforced to 1 MB (`kMinBackendSize`) |
| Requires CUDA/ROCm | Compiled out when neither flag is set |
| SM requirement | `ConcurrentManagedAccess` needed for coherent access; available on SM 6.0+ (Pascal and newer) |

## Relation to Other Backends

| Backend | Memory type | GPU accessible | Cross-process |
|---------|------------|---------------|--------------|
| `MallocBackend` | Host heap | No | No |
| `PosixShmMmap` | POSIX shm | No | Yes |
| `GpuShmMmap` | UVM (managed) | Yes (coherent) | No |
| `GpuMalloc` | Device DRAM | Yes (device-scope) | Yes (IPC handles) |

For tasks that must be visible to CPU workers, use `GpuShmMmap`.  For
opaque device-side scratch memory shared across processes, use `GpuMalloc`.

## CMake

```cmake
target_link_libraries(my_target hermes_shm_cuda)
target_compile_definitions(my_target PRIVATE HSHM_ENABLE_CUDA=1)
```

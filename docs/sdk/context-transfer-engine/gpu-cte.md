---
sidebar_position: 3
title: GPU CTE API
description: Calling CTE blob operations from CUDA / ROCm / SYCL kernels via the producer-only GPU path.
---

# GPU CTE API

The Context Transfer Engine (CTE) has **no GPU-specific API surface**. Every CTE entry point — `AsyncPutBlob`, `AsyncGetBlob`, `AsyncGetOrCreateTag`, `AsyncRegisterTarget`, etc. — lives behind `#if CTP_IS_HOST` in `clio_cte::core::Client` (see `context-transfer-engine/core/include/clio_cte/core/core_client.h`). To drive CTE from a GPU kernel you use the same producer-only path the runtime exposes for any Module: pre-allocate `PutBlobTask` / `GetBlobTask` slots on the host, submit them from the kernel via `CHI_IPC->Send`, and let the CPU runtime do the CTE work.

For the full producer-only model — backend kinds, slot layout, `CHIMAERA_GPU_INIT`, `Worker::ProcessNewTaskGpu`, removed APIs — start at the [GPU Client Kernels guide](../context-runtime/6.gpu_clients.md). This page only covers the CTE-specific pieces on top of that pattern.

## Headers

```cpp
#include <clio_runtime/clio_runtime.h>
#include <clio_runtime/singletons.h>
#include <clio_runtime/gpu/gpu_ipc_manager.h>
#include <clio_runtime/gpu/future.h>
#include <clio_runtime/bdev/bdev_client.h>      // to register a bdev target
#include <clio_cte/core/core_client.h>
#include <clio_cte/core/core_tasks.h>
#include <clio_ctp/util/gpu_api.h>              // CTP_GPU_FUN, GpuApi::*
```

## Host-side setup

The host bootstraps the runtime, creates the CTE pool, registers at least one storage target, and creates the tag the kernel will reference. This is identical to a non-GPU CTE program; the kernel is just an extra producer that issues task submissions later.

```cpp
REQUIRE(chi::CHIMAERA_INIT(chi::ChimaeraMode::kServer));
REQUIRE(clio_cte::core::CLIO_CTE_CLIENT_INIT());

auto *cte = CLIO_CTE_CLIENT;
cte->Init(clio_cte::core::kCtePoolId);

// 1. Create the CTE pool
clio_cte::core::CreateParams params;
cte->AsyncCreate(
    chi::PoolQuery::Dynamic(),
    clio_cte::core::kCtePoolName,
    clio_cte::core::kCtePoolId, params).Wait();

// 2. Register a bdev storage target (kRam shown here)
const chi::u64 kRamCapacity = 64ULL << 20;
chi::PoolId bdev_pool_id(960, 0);
chimaera::bdev::Client bdev_client(bdev_pool_id);
bdev_client.AsyncCreate(
    chi::PoolQuery::Dynamic(),
    std::string("cte_gpu_ram"),
    bdev_pool_id,
    chimaera::bdev::BdevType::kRam,
    kRamCapacity).Wait();
cte->AsyncRegisterTarget(
    "cte_gpu_ram", chimaera::bdev::BdevType::kRam, kRamCapacity,
    chi::PoolQuery::Local(), bdev_pool_id).Wait();

// 3. Create the tag
auto tag_task = cte->AsyncGetOrCreateTag("my_gpu_tag");
tag_task.Wait();
clio_cte::core::TagId tag_id = tag_task->tag_id_;
```

## CTE-callable methods from GPU kernels

The kernel never sees `clio_cte::core::Client`. Instead the host placement-news a `PutBlobTask` (or `GetBlobTask`) into a registered GPU backend; the kernel submits its `FullPtr`. The two Module methods most often driven from a kernel are:

| Module method | Task struct | Role of the kernel |
|---|---|---|
| `clio_cte::core::Method::kPutBlob` | `clio_cte::core::PutBlobTask` | Producer of bytes already on the GPU |
| `clio_cte::core::Method::kGetBlob` | `clio_cte::core::GetBlobTask` | Consumer that wants bytes landed in GPU memory |

Other CTE methods (`AsyncDelBlob`, `AsyncReorganizeBlob`, `AsyncListTargets`, `AsyncGetTagSize`, etc.) follow the same pattern; the host constructs the task POD, the kernel calls `CHI_IPC->Send`. There is nothing GPU-specific about them.

All CTE task constructors are `CTP_CROSS_FUN`, so you can also construct the POD on the device if you prefer — but the host-construct + `cudaMemcpy`-into-place idiom is simpler and is what the reference test uses.

## Memory layout

CTE tasks carry blob bytes by reference (`ctp::ipc::ShmPtr<>`), not by value. You allocate two GPU backends:

- A **task backend** holding one (`PutBlobTask` + `FutureShm`) slot plus one (`GetBlobTask` + `FutureShm`) slot. Either `kPinnedHost` or `kDeviceMem` works; the reference test uses `kDeviceMem` to exercise the D2H/H2D POD copy path.
- A **blob-data backend** holding the actual bytes. For GPU producers `kDeviceMem` is the natural choice; the bdev runtime uses `chi::DeviceAwareMemcpy` to read it.

```
task_backend (kDeviceMem, capacity = put_slot + get_slot + slack)
+----------------------+----------------+-----------------------+--------------+
| PutBlobTask          | FutureShm      | GetBlobTask           | FutureShm    |
+----------------------+----------------+-----------------------+--------------+
^                                       ^
task_dev_base                           task_dev_base + put_slot

blob_backend (kDeviceMem, capacity = kBlobBytes)
+-----------------------------------------------------------+
| blob payload (kernel writes for Put / reads after Get)    |
+-----------------------------------------------------------+
```

The blob `ShmPtr` you stamp into the task carries the raw device address in `off_` and a null `alloc_id` (the bdev path detects the device pointer via `chi::g_is_device_pointer`).

## End-to-end example: Put + Get with `kDeviceMem`

The full reference is `context-transfer-engine/test/unit/gpu/test_cte_devmem_putget.cc` (CTest name `cte_devmem_putget_cuda`). This is a condensed version.

### Host: allocate backends and stamp prototypes

```cpp
auto *ipc = CHI_CPU_IPC;
chi::IpcManagerGpuInfo gpu_info =
    ipc->GetGpuIpcManager()->GetGpuInfo(/*gpu_id=*/0);

const chi::u32 kBlobBytes = 256;
const chi::u32 kPutSlot =
    sizeof(clio_cte::core::PutBlobTask) + sizeof(chi::gpu::FutureShm);
const chi::u32 kGetSlot =
    sizeof(clio_cte::core::GetBlobTask) + sizeof(chi::gpu::FutureShm);
const chi::u32 kTaskBackendBytes = kPutSlot + kGetSlot + 64;

char *task_dev_base = nullptr;
auto task_alloc_id = ipc->AllocateAndRegisterGpuBackend(
    /*gpu_id=*/0, chi::gpu::IpcManager::MemKind::kDeviceMem,
    kTaskBackendBytes, &task_dev_base);

char *blob_dev = nullptr;
auto blob_alloc_id = ipc->AllocateAndRegisterGpuBackend(
    /*gpu_id=*/0, chi::gpu::IpcManager::MemKind::kDeviceMem,
    kBlobBytes, &blob_dev);

// Build the blob ShmPtr (raw device address + null alloc_id).
ctp::ipc::ShmPtr<> blob_shm;
blob_shm.alloc_id_.SetNull();
blob_shm.off_ = reinterpret_cast<chi::u64>(blob_dev);

// PutBlob prototype constructed in host memory, then copied to device.
alignas(64) char put_proto[kPutSlot];
std::memset(put_proto, 0, sizeof(put_proto));
auto *put_proto_task = new (put_proto) clio_cte::core::PutBlobTask(
    chi::CreateTaskId(), clio_cte::core::kCtePoolId,
    chi::PoolQuery::ToLocalCpu(),
    tag_id, "blob_a",
    /*offset=*/chi::u64(0), static_cast<chi::u64>(kBlobBytes),
    blob_shm, /*score=*/-1.0f,
    clio_cte::core::Context(), /*flags=*/chi::u32(0));
put_proto_task->pod_size_ = sizeof(clio_cte::core::PutBlobTask);
new (put_proto + sizeof(clio_cte::core::PutBlobTask))
    chi::gpu::FutureShm();
ctp::GpuApi::Memcpy(task_dev_base, put_proto, sizeof(put_proto));

// GetBlob prototype, occupying the second slot.
alignas(64) char get_proto[kGetSlot];
std::memset(get_proto, 0, sizeof(get_proto));
auto *get_proto_task = new (get_proto) clio_cte::core::GetBlobTask(
    chi::CreateTaskId(), clio_cte::core::kCtePoolId,
    chi::PoolQuery::ToLocalCpu(),
    tag_id, "blob_a",
    /*offset=*/chi::u64(0), static_cast<chi::u64>(kBlobBytes),
    /*flags=*/chi::u32(0), blob_shm);
get_proto_task->pod_size_ = sizeof(clio_cte::core::GetBlobTask);
new (get_proto + sizeof(clio_cte::core::GetBlobTask))
    chi::gpu::FutureShm();
ctp::GpuApi::Memcpy(task_dev_base + kPutSlot, get_proto, sizeof(get_proto));

// Kernel-visible FullPtrs (raw device addresses in off_).
ctp::ipc::FullPtr<clio_cte::core::PutBlobTask> put_fp;
put_fp.shm_.alloc_id_.SetNull();
put_fp.shm_.off_ = reinterpret_cast<chi::u64>(task_dev_base);
put_fp.ptr_ = reinterpret_cast<clio_cte::core::PutBlobTask *>(task_dev_base);

ctp::ipc::FullPtr<clio_cte::core::GetBlobTask> get_fp;
get_fp.shm_.alloc_id_.SetNull();
get_fp.shm_.off_ = reinterpret_cast<chi::u64>(task_dev_base + kPutSlot);
get_fp.ptr_ = reinterpret_cast<clio_cte::core::GetBlobTask *>(
    task_dev_base + kPutSlot);
```

### Kernel: submit and wait

```cpp
__global__ void PutKernel(
    chi::IpcManagerGpuInfo info,
    ctp::ipc::FullPtr<clio_cte::core::PutBlobTask> task) {
  CHIMAERA_GPU_INIT(info, /*ipc_ptr=*/nullptr);
  if (threadIdx.x != 0) return;
  auto fut = g_ipc_manager_ptr->Send(task);
  fut.Wait();
  (void)g_ipc_manager;
}

__global__ void GetKernel(
    chi::IpcManagerGpuInfo info,
    ctp::ipc::FullPtr<clio_cte::core::GetBlobTask> task) {
  CHIMAERA_GPU_INIT(info, /*ipc_ptr=*/nullptr);
  if (threadIdx.x != 0) return;
  auto fut = g_ipc_manager_ptr->Send(task);
  fut.Wait();
  (void)g_ipc_manager;
}
```

The kernel does not see `clio_cte::core::Client`. It only sees `chi::gpu::IpcManager::Send` and the pre-built `FullPtr`s.

### Host: launch and verify

```cpp
// Fill blob_dev with a known pattern using a regular CUDA kernel,
// then submit the PutBlob.
FillKernel<<<...>>>(blob_dev, kBlobBytes, /*seed=*/0xC3u);
ctp::GpuApi::Synchronize();

PutKernel<<<1, 32>>>(gpu_info, put_fp);
ctp::GpuApi::Synchronize();

// Pull the return code back from device memory.
clio_cte::core::PutBlobTask put_after{};
ctp::GpuApi::Memcpy(reinterpret_cast<char *>(&put_after),
                    task_dev_base, sizeof(put_after));
REQUIRE(put_after.return_code_.load() == 0u);

// Zero the device buffer so GetBlob is provably observable.
std::vector<char> zeros(kBlobBytes, 0);
ctp::GpuApi::Memcpy(blob_dev, zeros.data(), kBlobBytes);

GetKernel<<<1, 32>>>(gpu_info, get_fp);
ctp::GpuApi::Synchronize();

// Verify the device buffer now matches the original pattern.

ipc->FreeGpuBackend(/*gpu_id=*/0, blob_alloc_id);
ipc->FreeGpuBackend(/*gpu_id=*/0, task_alloc_id);
```

## Routing

Inside the kernel, `chi::PoolQuery::ToLocalCpu()` is the only meaningful routing mode for CTE — the CTE Module's containers run on CPU workers. Using any other mode from a kernel is not supported. From the host side you can use any standard pool query for CTE; the GPU path is irrelevant once you are submitting from CPU code.

## `Context` quick reference

`clio_cte::core::Context` controls compression and placement decisions. A default-constructed `Context{}` is the right starting point for uncompressed I/O. Key fields:

| Field | Default | Meaning |
|---|---|---|
| `dynamic_compress_` | 0 | 0 = skip, 1 = static lib, 2 = dynamic selection |
| `compress_lib_` | 0 | Compression library index |
| `compress_preset_` | 2 | 1 = FAST, 2 = BALANCED, 3 = BEST |
| `min_persistence_level_` | 0 | 0 = volatile, 1 = temp-nonvolatile, 2 = long-term |
| `score` (PutBlob arg) | -1.0 | -1 = auto-place, 0.0-1.0 = explicit tier |

## CMake integration

CTE adds nothing GPU-specific on top of the runtime's CMake setup. You enable GPU support with the same options described in the [GPU Client Kernels guide](../context-runtime/6.gpu_clients.md#cmake-integration):

```bash
cmake -S . -B build -DCLIO_CORE_ENABLE_CUDA=ON      # CUDA
cmake -S . -B build -DCLIO_CORE_ENABLE_ROCM=ON      # ROCm
cmake -S . -B build -DCLIO_CORE_ENABLE_SYCL=ON \    # SYCL
    -DCMAKE_CXX_COMPILER=icpx
```

A target that submits CTE tasks from a kernel needs to link both the CTE client library and the runtime; see the `add_cuda_executable(test_cte_devmem_putget ...)` block in `context-transfer-engine/test/unit/CMakeLists.txt` for a working setup.

## Tests

| File | Backend | CTest name |
|---|---|---|
| `context-transfer-engine/test/unit/gpu/test_cte_devmem_putget.cc` | CUDA | `cte_devmem_putget_cuda` |

Run with:

```bash
cd build
ctest -R cte_devmem_putget -V
```

## Related references

- [GPU Client Kernels](../context-runtime/6.gpu_clients.md) — full producer-only model.
- `context-transfer-engine/core/include/clio_cte/core/core_client.h` — every CTE entry point (host-only).
- `context-transfer-engine/core/include/clio_cte/core/core_tasks.h` — `PutBlobTask`, `GetBlobTask`, `Context`, `TagId`.
- `context-transfer-engine/test/unit/gpu/test_cte_devmem_putget.cc` — reference end-to-end test.

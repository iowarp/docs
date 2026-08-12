---
sidebar_position: 4
title: GPU Infinite Memory (UVM)
description: Software-managed GPU demand paging over the CUDA VMM primitives.
---

# GPU Infinite Memory (UVM)

The `clio_cte_uvm` module provides a **software-managed GPU demand-paging
system** built on the CUDA Driver API's virtual memory management (VMM)
primitives.  It lets you reserve an enormous virtual address space (up to
512 GB by default) on the GPU while backing only the pages that are
actually touched with physical device memory.  Pages that have not been
accessed yet consume no physical memory; pages that are evicted are saved to
host RAM (or to a CTE blob store) and transparently restored on next access.

## Headers

```cpp
// gpu_vmm.h pulls in <cuda.h>/<cuda_runtime.h>, so it is only usable when a
// GPU backend is enabled. All UVM code below is compiled behind this guard.
// (The leading /**/ keeps the #include inside the #if for the docs compile
// check; in real code you would just write a normal `#include` line.)
#if defined(CTP_ENABLE_CUDA) || defined(CTP_ENABLE_ROCM)
/**/ #include <clio_cte/uvm/gpu_vmm.h>
#endif
```

The manager lives in namespace `clio::cte::uvm`.  Link against
`clio_cte_uvm`.  Requires `WRP_CORE_ENABLE_CUDA=ON`.

## Core Concepts

| Concept | Detail |
|---------|--------|
| Virtual address space | Reserved once with `cuMemAddressReserve`; no physical cost |
| Page size | 2 MB default, auto-aligned to GPU hardware granularity |
| Physical backing | Allocated on-demand per page with `cuMemCreate` + `cuMemMap` |
| Eviction target | Host pinned RAM (`cudaMallocHost`) or CTE blob store |
| Thread safety | All public methods protected by `std::mutex` |
| Async support | Separate transfer and compute CUDA streams |

## Configuration

```cpp
#if defined(CTP_ENABLE_CUDA) || defined(CTP_ENABLE_ROCM)
/**/ #include <clio_cte/uvm/gpu_vmm.h>

void example() {
  using namespace clio::cte::uvm;
  GpuVmmConfig cfg;
  cfg.va_size_bytes   = 512ULL * 1024 * 1024 * 1024;  // 512 GB virtual space
  cfg.page_size       = 2ULL * 1024 * 1024;           // 2 MB pages
  cfg.fill_value      = 0;                            // newly-mapped page fill (int)
  cfg.device          = 0;                            // CUDA device ordinal
  cfg.prefetch_window = 0;                            // pages to auto-touch ahead
  cfg.use_cte         = false;                        // use CTE blob store for eviction
  (void)cfg;
}
#endif
```

All fields have defaults; a zero-initialized `GpuVmmConfig` is valid and
uses 512 GB / 2 MB pages / device 0 / host-RAM backing.

## Initialization and Teardown

```cpp
#if defined(CTP_ENABLE_CUDA) || defined(CTP_ENABLE_ROCM)
/**/ #include <clio_cte/uvm/gpu_vmm.h>

void example() {
  using namespace clio::cte::uvm;
  GpuVmmConfig cfg;
  GpuVirtualMemoryManager vmm;

  CUresult res = vmm.init(cfg);  // reserve VA, create streams, verify granularity
  (void)res;
  // ... use vmm ...
  vmm.destroy();                 // unmap all pages, free host backing, release VA
}
#endif
```

`init` validates that `page_size` is a multiple of the GPU's hardware
allocation granularity (queried with `cuMemGetAllocationGranularity`).  It
fails if the device does not support virtual memory management.

## Demand Paging — Page In

```cpp
#if defined(CTP_ENABLE_CUDA) || defined(CTP_ENABLE_ROCM)
/**/ #include <clio_cte/uvm/gpu_vmm.h>

void example() {
  using namespace clio::cte::uvm;
  GpuVirtualMemoryManager vmm;
  vmm.init();

  size_t page_idx    = 0;
  size_t byte_offset = 0;
  size_t byte_length = 6ULL * 1024 * 1024;

  // Touch a single 2 MB page (zero-based page index)
  vmm.touchPage(page_idx);

  // Touch all pages that cover a byte range
  vmm.touchRange(byte_offset, byte_length);

  // Non-blocking touch on the internal transfer stream
  vmm.touchPageAsync(page_idx);
  vmm.syncTransfer();  // wait for async touches

  vmm.destroy();
}
#endif
```

On first touch, `touchPage` calls `cuMemCreate` to allocate a 2 MB physical
chunk, maps it into the reserved VA with `cuMemMap` + `cuMemSetAccess`, then
launches a fill kernel.  If the page was previously evicted, the saved host
buffer (or CTE blob) is copied back to the device instead.

## Eviction — Page Out

```cpp
#if defined(CTP_ENABLE_CUDA) || defined(CTP_ENABLE_ROCM)
/**/ #include <clio_cte/uvm/gpu_vmm.h>

void example() {
  using namespace clio::cte::uvm;
  GpuVirtualMemoryManager vmm;
  vmm.init();
  size_t page_idx = 0;
  vmm.touchPage(page_idx);

  // Evict a single page to host RAM (synchronous D2H copy)
  vmm.evictPage(page_idx);

  // Async eviction — D2H copy queued on transfer stream
  vmm.touchPage(page_idx);
  vmm.evictPageAsync(page_idx);
  vmm.syncTransfer();

  vmm.destroy();
}
#endif
```

Eviction:
1. Copies the 2 MB page to a `cudaMallocHost` buffer (or `AsyncPutBlob`
   when `use_cte=true`).
2. Unmaps the page from the VA range (`cuMemUnmap`).
3. Releases the physical allocation (`cuMemRelease`).

After eviction the virtual address is still valid but accessing it from a
GPU kernel will fault.  The next `touchPage` call restores the data.

## Prefetching

Set `cfg.prefetch_window = N` to automatically touch the next `N` pages
whenever a page is touched:

```cpp
#if defined(CTP_ENABLE_CUDA) || defined(CTP_ENABLE_ROCM)
/**/ #include <clio_cte/uvm/gpu_vmm.h>

void example() {
  using namespace clio::cte::uvm;
  GpuVmmConfig cfg;
  cfg.prefetch_window = 3;  // touching page P also touches P+1, P+2, P+3 async
  (void)cfg;
}
#endif
```

Prefetch touches are issued on the transfer stream and do not block the
caller.

## Querying State

```cpp
#if defined(CTP_ENABLE_CUDA) || defined(CTP_ENABLE_ROCM)
/**/ #include <clio_cte/uvm/gpu_vmm.h>

void example() {
  using namespace clio::cte::uvm;
  GpuVirtualMemoryManager vmm;
  vmm.init();
  size_t page_idx = 0;
  vmm.touchPage(page_idx);

  CUdeviceptr base    = vmm.getBasePtr();         // VA range start (device pointer)
  size_t page_size    = vmm.getPageSize();
  size_t total        = vmm.getTotalPages();
  size_t mapped       = vmm.getMappedPageCount();   // pages with physical backing
  size_t evicted      = vmm.getEvictedPageCount();  // pages saved to host RAM

  bool is_mapped  = vmm.isMapped(page_idx);
  bool is_evicted = vmm.isEvictedToHost(page_idx);

  // Device pointer to the start of page N
  CUdeviceptr page_ptr = vmm.getPagePtr(page_idx);

  (void)base; (void)page_size; (void)total; (void)mapped; (void)evicted;
  (void)is_mapped; (void)is_evicted; (void)page_ptr;
  vmm.destroy();
}
#endif
```

## CTE Blob Store Backing

When `cfg.use_cte = true` the module uses CTE `AsyncPutBlob` / `AsyncGetBlob`
for eviction instead of host pinned RAM.  This lets evicted pages survive
process restart and be loaded from a persistent storage tier.

Requires the CTE pool to be initialized before calling `vmm.init()`.  The
module creates one blob per page named by its index.

## Stream Management

```cpp
#if defined(CTP_ENABLE_CUDA) || defined(CTP_ENABLE_ROCM)
/**/ #include <clio_cte/uvm/gpu_vmm.h>

void example() {
  using namespace clio::cte::uvm;
  GpuVirtualMemoryManager vmm;
  vmm.init();

  cudaStream_t xfer = vmm.getTransferStream();  // D2H / H2D copies
  cudaStream_t comp = vmm.getComputeStream();   // kernel launches

  vmm.syncTransfer();  // cudaStreamSynchronize(transfer_stream_)
  vmm.syncCompute();   // cudaStreamSynchronize(compute_stream_)

  (void)xfer; (void)comp;
  vmm.destroy();
}
#endif
```

Use `getComputeStream()` for kernels that read or write demand-paged memory
so they are ordered after any in-flight page-in operations on the transfer
stream.

## Full Example

```cpp
#if defined(CTP_ENABLE_CUDA) || defined(CTP_ENABLE_ROCM)
/**/ #include <clio_cte/uvm/gpu_vmm.h>

// A simple fill kernel (defined in your own .cu translation unit).
__global__ void writeKernel(int *ptr, int value, size_t count);

void example() {
  using namespace clio::cte::uvm;

  // 1. Configure a 4 GB virtual address space with 2 MB pages
  GpuVmmConfig cfg;
  cfg.va_size_bytes   = 4ULL * 1024 * 1024 * 1024;
  cfg.prefetch_window = 2;

  GpuVirtualMemoryManager vmm;
  vmm.init(cfg);

  // 2. Touch page 0 — physical memory allocated, filled with cfg.fill_value
  vmm.touchPage(0);

  // 3. Write custom data via a GPU kernel (getPagePtr returns a CUdeviceptr)
  int *page0 = reinterpret_cast<int *>(vmm.getPagePtr(0));
  writeKernel<<<1, 256, 0, vmm.getComputeStream()>>>(page0, 42,
                                                     vmm.getPageSize());
  vmm.syncCompute();

  // 4. Evict page 0 to free device memory
  vmm.evictPage(0);
  // physical memory is now released; VA still valid

  // 5. Re-touch page 0 — data restored from host backing
  vmm.touchPage(0);
  // page0 now contains the data written in step 3

  vmm.destroy();
}
#endif
```

## CMake Integration

```cmake
find_package(clio_cte REQUIRED)

target_link_libraries(my_target PRIVATE clio_cte_uvm)
enable_language(CUDA)
set_target_properties(my_target PROPERTIES CUDA_SEPARABLE_COMPILATION ON)
```

## Hardware Requirements

- CUDA 10.2+ (virtual memory management API)
- GPU with driver-side virtual memory support (`CU_DEVICE_ATTRIBUTE_VIRTUAL_MEMORY_MANAGEMENT_SUPPORTED`)
- SM 7.0+ (Volta) recommended for best performance

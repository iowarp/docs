# GPU Infinite Memory (CUDA UVM)

## Overview

The GPU Infinite Memory module (`wrp_cte::uvm`) provides software-managed
demand paging for GPU virtual memory. It allows applications to reserve a
virtual address (VA) range far larger than physical GPU memory (up to 512 GB
by default) and back pages with physical memory on demand.

Key capabilities:

- **Demand paging** &mdash; physical memory is allocated only when a page is
  explicitly touched, keeping the GPU memory footprint minimal.
- **Eviction and restoration** &mdash; pages can be evicted to pinned host RAM
  (or optionally to a CTE blob store) and later restored with their data
  intact.
- **Prefetching** &mdash; touching a page automatically prefetches a
  configurable number of subsequent pages asynchronously.
- **Async overlap** &mdash; separate transfer and compute CUDA streams allow
  data movement to overlap with kernel execution.
- **Userspace only** &mdash; no kernel driver modifications or root privileges
  required. Uses the CUDA driver API (`cuMemAddressReserve`,
  `cuMemCreate`, `cuMemMap`).

Typical use cases include LLM weight overcommitment, sparse tensor
computations, and workloads that exceed the physical GPU memory capacity.

## Installation

### Prerequisites

- Linux x86_64 with an NVIDIA GPU (compute capability 7.0+)
- CUDA Toolkit 12.0 or later
- NVIDIA driver 525+ installed on the host

### Install with Conda (recommended)

The conda installer automatically pulls in `cuda-toolkit` from `conda-forge`
and `nvidia` channels, so you do **not** need a system-wide CUDA installation.

```bash
# Clone the repository
git clone --recursive https://github.com/iowarp/clio-core.git
cd clio-core

# Install with CUDA variant (creates the "iowarp" conda environment)
./install.sh cuda
```

This runs the following under the hood:

1. Creates (or reuses) a `iowarp` conda environment with Miniconda
2. Installs `cuda-toolkit` and `cuda-cudart` from conda-forge/nvidia
3. Runs `rattler-build` with the `cuda.yaml` variant, which selects the
   `cuda-release` CMake preset
4. Installs headers and libraries into `$CONDA_PREFIX`

After installation, verify:

```bash
conda activate iowarp
ls $CONDA_PREFIX/lib/libwrp_cte_uvm.so      # UVM shared library
ls $CONDA_PREFIX/include/wrp_cte/uvm/gpu_vmm.h  # Public header
```

#### Manual conda build

If you need more control, you can invoke `rattler-build` directly:

```bash
conda activate iowarp
conda install -y rattler-build cuda-toolkit -c conda-forge -c nvidia

rattler-build build \
  --recipe installers/conda/ \
  --variant-config installers/conda/variants/cuda.yaml \
  -c conda-forge -c nvidia

# Install the built package
conda install -c build/conda-output -c conda-forge -c nvidia iowarp-core
```

### Install from Source

```bash
# Configure with the cuda-release preset
cmake --preset=cuda-release

# Build
cmake --build build --parallel

# Install
sudo cmake --install build
```

This installs `libwrp_cte_uvm.so` to `$PREFIX/lib/` and headers to
`$PREFIX/include/wrp_cte/uvm/`.

## Linking

### CMake

```cmake
find_package(wrp_cte_uvm REQUIRED)
target_link_libraries(your_app PRIVATE wrp_cte::uvm)
```

The CMake package automatically links the CUDA driver and runtime libraries.

## Quick Start

```cpp
#include <wrp_cte/uvm/gpu_vmm.h>

using namespace wrp_cte::uvm;

int main() {
    // 1. Configure
    GpuVmmConfig config;
    config.va_size_bytes   = 512ULL * 1024 * 1024 * 1024;  // 512 GB VA space
    config.page_size       = 2ULL * 1024 * 1024;            // 2 MB pages
    config.fill_value      = 0;                              // Zero-fill new pages
    config.prefetch_window = 4;                              // Prefetch 4 pages ahead

    // 2. Initialize
    GpuVirtualMemoryManager vmm;
    vmm.init(config);

    // 3. Touch pages on demand
    vmm.touchPage(0);                              // Back page 0 with physical memory
    CUdeviceptr ptr = vmm.getPagePtr(0);            // Get device pointer
    // ... launch kernels using ptr on vmm.getComputeStream() ...

    // 4. Touch a range (covers all pages in the byte range)
    vmm.touchRange(0, 64ULL * 1024 * 1024);        // Back first 64 MB

    // 5. Evict pages to free physical memory
    vmm.evictPage(0);                               // Data saved to host RAM

    // 6. Re-touch restores the original data (not re-filled)
    vmm.touchPage(0);                               // Data restored from host

    // 7. Cleanup
    vmm.destroy();
    return 0;
}
```

## Configuration

All configuration is passed through `GpuVmmConfig`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `va_size_bytes` | `size_t` | 512 GB | Total virtual address space to reserve. No physical memory is allocated upfront. |
| `page_size` | `size_t` | 2 MB | Granularity for demand paging. Aligned up to the hardware allocation granularity. |
| `fill_value` | `int` | 5 | Value used to fill freshly allocated pages (as `int` words). |
| `device` | `int` | 0 | CUDA device ordinal. |
| `prefetch_window` | `size_t` | 4 | Number of pages to prefetch ahead asynchronously when `touchPage()` is called. Set to 0 to disable. |
| `use_cte` | `bool` | false | When true, evicted pages are stored in a CTE blob store instead of pinned host RAM. Requires IOWarp CTE to be running. |
| `cte_tag_name` | `string` | `"gpu_vmm_pages"` | Tag name used in the CTE blob store for page data. |

## API Reference

### Lifecycle

```cpp
CUresult init(const GpuVmmConfig &config = GpuVmmConfig());
void destroy();
```

`init()` reserves the VA range, creates CUDA streams, and prepares the page
table. `destroy()` unmaps all pages, frees backing stores, and releases the VA
reservation. Also called by the destructor.

### Demand Paging

```cpp
CUresult touchPage(size_t page_index);
CUresult touchPageAsync(size_t page_index);
CUresult touchRange(size_t offset, size_t size);
```

- **`touchPage`** &mdash; synchronously backs a page. If the page was
  previously evicted, its data is restored from host RAM (or CTE). Otherwise
  the page is filled with `fill_value`. Automatically calls `prefetchAhead()`.
- **`touchPageAsync`** &mdash; queues the page backing on the transfer stream.
  The caller must call `syncTransfer()` before accessing the page. Does not
  trigger prefetch.
- **`touchRange`** &mdash; touches all pages covering the byte range
  `[offset, offset + size)`.

### Eviction

```cpp
CUresult evictPage(size_t page_index);
CUresult evictPageAsync(size_t page_index);
```

- **`evictPage`** &mdash; synchronously copies page data to host RAM (or CTE),
  then unmaps and releases the physical allocation. The VA slot is preserved.
- **`evictPageAsync`** &mdash; the D2H copy runs on the transfer stream,
  allowing the compute stream to continue. Synchronizes before unmapping.

### Prefetching

```cpp
void prefetchAhead(size_t page_index);
```

Asynchronously touches pages `[page_index + 1, page_index + prefetch_window]`
on the transfer stream. Called automatically by `touchPage()`.

### Query

```cpp
CUdeviceptr getBasePtr() const;
size_t getPageSize() const;
size_t getTotalPages() const;
size_t getMappedPageCount() const;
size_t getEvictedPageCount() const;
bool isMapped(size_t page_index) const;
bool isEvictedToHost(size_t page_index) const;
CUdeviceptr getPagePtr(size_t page_index) const;
```

### Stream Management

```cpp
cudaStream_t getTransferStream() const;
cudaStream_t getComputeStream() const;
void syncTransfer();
void syncCompute();
```

The VMM maintains two CUDA streams:

- **Transfer stream** &mdash; used for all H2D / D2H copies and async page
  operations.
- **Compute stream** &mdash; intended for user kernel launches. This separation
  allows overlapping data movement with computation.

## Architecture

### Memory Layout

```
Virtual Address Space (e.g. 512 GB)
┌─────────┬─────────┬─────────┬─────────┬─── ─ ─ ─ ─ ─┬─────────┐
│ Page 0  │ Page 1  │ Page 2  │ Page 3  │   ...        │ Page N  │
│ 2 MB    │ 2 MB    │ 2 MB    │ 2 MB    │              │ 2 MB    │
├─────────┼─────────┼─────────┼─────────┤              ├─────────┤
│ MAPPED  │ (empty) │ MAPPED  │ (empty) │              │ (empty) │
└─────────┴─────────┴─────────┴─────────┴─── ─ ─ ─ ─ ─┴─────────┘
     │                   │
     ▼                   ▼
  Physical            Physical
  GPU Memory          GPU Memory
```

The entire VA range is reserved with `cuMemAddressReserve()` at `init()` time.
No physical memory is consumed. Each page is independently backed by physical
memory via `cuMemCreate()` + `cuMemMap()` when touched, and released via
`cuMemUnmap()` + `cuMemRelease()` when evicted.

### Page Lifecycle

```
             touchPage()              evictPage()
  UNMAPPED ─────────────► MAPPED ──────────────► EVICTED (host RAM)
                            ▲                         │
                            │      touchPage()        │
                            └─────────────────────────┘
                             (data restored, not re-filled)
```

### CTE Integration

When `use_cte = true`, evicted pages are stored as blobs in the CTE blob store
instead of pinned host RAM. This allows page data to persist across process
restarts and to be backed by any CTE storage target (NVMe, distributed
storage, etc.).

```cpp
GpuVmmConfig config;
config.use_cte = true;
config.cte_tag_name = "my_model_weights";
vmm.init(config);
```

Each page is stored as a blob named `page_<index>` under the configured tag.

## Example: LLM Weight Overcommitment

This example demonstrates loading model weights that exceed GPU memory by
paging layers in and out on demand.

```cpp
#include <wrp_cte/uvm/gpu_vmm.h>

using namespace wrp_cte::uvm;

void run_inference(size_t num_layers, size_t layer_size) {
    GpuVmmConfig config;
    config.va_size_bytes   = num_layers * layer_size;
    config.page_size       = layer_size;    // One page per layer
    config.fill_value      = 0;
    config.prefetch_window = 2;             // Prefetch next 2 layers

    GpuVirtualMemoryManager vmm;
    vmm.init(config);

    for (size_t layer = 0; layer < num_layers; ++layer) {
        // Touch this layer (prefetch triggers for layer+1, layer+2)
        vmm.touchPage(layer);
        CUdeviceptr weights = vmm.getPagePtr(layer);

        // Launch inference kernel on compute stream
        // run_layer_kernel<<<..., vmm.getComputeStream()>>>(weights, ...);
        vmm.syncCompute();

        // Evict layers we're done with to free GPU memory
        if (layer >= 2) {
            vmm.evictPageAsync(layer - 2);
        }
    }

    vmm.destroy();
}
```

## Running the Tests

The UVM module includes a comprehensive test suite:

```bash
# Build with CUDA enabled
cmake --preset=cuda-release
cmake --build build --target test_gpu_vmm

# Run the tests
./build/bin/test_gpu_vmm
```

The tests cover:

| Test | Description |
|------|-------------|
| Basic Demand Paging | Touch individual pages, verify fill values |
| Page Eviction | Map, evict, re-touch pages |
| Touch Range | Back all pages in a byte range |
| Large VA Reservation | Reserve 512 GB, touch sparse pages |
| Kernel Access Full VA | GPU kernel reads 256 scattered pages across 512 GB |
| Evict and Restore | Write custom data, evict, restore, verify preservation |
| Prefetch Window | Verify automatic prefetching of subsequent pages |
| Async Overlap | Concurrent eviction and compute on separate streams |
| Multi-Page Round-Trip | Evict and restore 5 pages with distinct values |

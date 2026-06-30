---
sidebar_position: 1
---

# Memory Backends Guide

## Overview

Memory backends provide the underlying memory regions that allocators manage. A backend is always created first, then an allocator is constructed on top of it. HSHM supports shared memory, private memory, and GPU memory backends.

## Backend Lifecycle

Every backend supports two operations:
- `shm_init()` — Create and initialize a new memory region (the **owner**)
- `shm_attach()` — Attach to an existing memory region created by another process

## MallocBackend

Wraps `malloc` for private (non-shared) in-process memory. Useful for single-process tests and allocators that don't need cross-process sharing.

```cpp
#include "clio_ctp/memory/allocator/buddy_allocator.h"
#include "clio_ctp/memory/backend/malloc_backend.h"

void example() {
  ctp::ipc::MallocBackend backend;
  size_t heap_size = 128 * 1024 * 1024;  // 128 MB
  // Reserve room for the allocator object plus the heap it manages.
  size_t backend_size = sizeof(ctp::ipc::BuddyAllocator) + heap_size;
  backend.shm_init(ctp::ipc::MemoryBackendId(0, 0), backend_size);

  // Create an allocator on top of this backend
  auto *alloc = backend.MakeAlloc<ctp::ipc::BuddyAllocator>();
  (void)alloc;

  backend.shm_destroy();
}
```

## PosixShmMmap

The primary backend for cross-process shared memory. Uses `shm_open` and `mmap` to create memory-mapped regions accessible by multiple processes.

```cpp
#include "clio_ctp/memory/backend/posix_shm_mmap.h"

void example() {
  // Process 0 (owner): create the shared-memory region by name
  ctp::ipc::PosixShmMmap owner;
  owner.shm_init(ctp::ipc::MemoryBackendId::GetRoot(),
                 512 * 1024 * 1024, "my_shm_region");

  // Process 1+ : attach to the existing region using the same name
  ctp::ipc::PosixShmMmap client;
  client.shm_attach("my_shm_region");

  client.shm_detach();   // non-owner releases its mapping
  owner.shm_destroy();   // owner unmaps and unlinks the region
}
```

**Ownership model:** The process that calls `shm_init()` is the owner and is responsible for cleanup. Use `SetOwner()` / `UnsetOwner()` to transfer ownership between processes.

## GpuMalloc

Allocates memory directly on the GPU using `cudaMalloc` (CUDA) or `hipMalloc` (ROCm).

```cpp
// Only available when CTP_ENABLE_CUDA or CTP_ENABLE_ROCM is set
#include "clio_ctp/memory/backend/gpu_malloc.h"

void example() {
#if CTP_ENABLE_CUDA || CTP_ENABLE_ROCM
  ctp::ipc::GpuMalloc backend;
  size_t data_capacity = 1024 * 1024;  // 1 MB (enforced minimum)
  backend.shm_init(ctp::ipc::MemoryBackendId(0, 0), data_capacity,
                   "gpu_region", /*gpu_id=*/0);
  backend.shm_destroy();
#endif
}
```

**Memory Layout:**
```
GPU Memory: [MemoryBackendHeader | GpuMallocPrivateHeader | Data...]
```

**Characteristics:**
- Allocates entire region on GPU via `GpuApi::Malloc()`
- Creates an IPC handle (`GpuIpcMemHandle`) for cross-process GPU memory sharing
- Enforces minimum 1MB data size
- Freed via `GpuApi::Free()`
- Conditionally compiled: `#if CTP_ENABLE_CUDA || CTP_ENABLE_ROCM`

## GpuShmMmap

GPU-accessible POSIX shared memory. Combines host shared memory with GPU registration for zero-copy GPU access.

```cpp
// Only available when CTP_ENABLE_CUDA, CTP_ENABLE_ROCM, or CTP_ENABLE_SYCL is set
#include "clio_ctp/memory/backend/gpu_shm_mmap.h"

void example() {
#if CTP_ENABLE_CUDA || CTP_ENABLE_ROCM || CTP_ENABLE_SYCL
  ctp::ipc::GpuShmMmap backend;
  size_t backend_size = 1024 * 1024;  // 1 MB (enforced minimum)
  backend.shm_init(ctp::ipc::MemoryBackendId(0, 0), backend_size,
                   "gpu_shm_region", /*gpu_id=*/0);
  backend.shm_destroy();
#endif
}
```

**Memory Layout:**
```
POSIX SHM File: [4KB backend header | 4KB shared header | Data...]
Virtual Memory:  [4KB private header | 4KB shared header | Data...]
```

**Characteristics:**
- Creates POSIX shared memory object (`shm_open`)
- Maps with combined private/shared access (`MapMixedMemory`)
- Registers memory with GPU via `GpuApi::RegisterHostMemory()`
- GPU can access the memory directly without explicit transfers
- Supports `shm_attach()` for other processes to join
- Enforces minimum 1MB backend size
- Conditionally compiled: `#if CTP_ENABLE_CUDA || CTP_ENABLE_ROCM`

**Key Difference from GpuMalloc:**
- Memory lives on the host (CPU) but is GPU-accessible
- Inherently shareable via POSIX shared memory (no IPC handle needed)
- Better for data that both CPU and GPU need to access

## GPU Compatibility

### GpuApi

The `GpuApi` class provides an abstraction over CUDA and ROCm:

| Method | Description |
|--------|-------------|
| `GpuApi::Malloc(size)` | Allocate GPU memory |
| `GpuApi::Free(ptr)` | Free GPU memory |
| `GpuApi::Memcpy(dst, src, size, kind)` | Copy memory between host/device |
| `GpuApi::RegisterHostMemory(ptr, size)` | Register host memory for GPU access |
| `GpuApi::UnregisterHostMemory(ptr)` | Unregister host memory |
| `GpuApi::GetIpcMemHandle(ptr)` | Get IPC handle for GPU memory sharing |

### Conditional Compilation

GPU backends are only compiled when CUDA or ROCm is enabled:

```cpp
#if CTP_ENABLE_CUDA || CTP_ENABLE_ROCM
  // GPU-specific code
#endif

#if CTP_IS_HOST
  // Host-only operations (initialization, IPC setup)
#endif

#if CTP_IS_GPU
  // GPU kernel operations
#endif
```

## Related Documentation

- [Allocator Guide](./allocator_guide) - Allocators that manage memory from these backends
- [Vector Guide](../types/vector_guide) - Shared-memory vectors that use these allocators

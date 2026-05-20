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
#include "clio_ctp/memory/backend/malloc_backend.h"

hipc::MallocBackend backend;
size_t heap_size = 128 * 1024 * 1024;  // 128 MB
backend.shm_init(hipc::MemoryBackendId(0, 0), heap_size);

// Create an allocator on top of this backend
auto *alloc = backend.MakeAlloc<hipc::BuddyAllocator>();
```

## PosixShmMmap

The primary backend for cross-process shared memory. Uses `shm_open` and `mmap` to create memory-mapped regions accessible by multiple processes.

```cpp
#include "clio_ctp/memory/backend/posix_shm_mmap.h"

PosixShmMmap backend;

// Process 0: Create shared memory
backend.shm_init(MemoryBackendId(0, 0), 512 * 1024 * 1024, "/my_shm_region");

// Process 1+: Attach to existing shared memory
backend.shm_attach("/my_shm_region");
```

**Ownership model:** The process that calls `shm_init()` is the owner and is responsible for cleanup. Use `SetOwner()` / `UnsetOwner()` to transfer ownership between processes.

## GpuMalloc

Allocates memory directly on the GPU using `cudaMalloc` (CUDA) or `hipMalloc` (ROCm).

```cpp
// Only available when CTP_ENABLE_CUDA or CTP_ENABLE_ROCM is set
GpuMalloc backend;
backend.shm_init(backend_id, data_capacity);
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
// Only available when CTP_ENABLE_CUDA or CTP_ENABLE_ROCM is set
GpuShmMmap backend;
backend.shm_init(backend_id, url, data_capacity);
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

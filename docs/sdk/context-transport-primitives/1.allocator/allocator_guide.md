# Memory Allocators & Backends Guide

## Overview

HSHM provides a hierarchy of memory allocators and backends for shared memory, private memory, and GPU memory management. The allocator system supports cross-process memory sharing, GPU-accessible allocations, and lock-free multi-threaded allocation.

## Allocator Architecture

All allocators inherit from the `Allocator` base class and are wrapped via `BaseAllocator<CoreAllocT>` which provides type-safe allocation methods.

**Source:** `hermes_shm/memory/allocator/allocator.h`

### Core Pointer Types

HSHM uses offset-based pointers for process-independent shared memory addressing:

| Type | Description |
|------|-------------|
| `OffsetPtr<T>` | Offset from allocator base. Process-independent. |
| `AtomicOffsetPtr<T>` | Atomic version of OffsetPtr for concurrent access. |
| `ShmPtr<T>` | Allocator ID + offset. Identifies memory across allocators. |
| `FullPtr<T>` | Combines a raw pointer (`ptr_`) with a `ShmPtr` (`shm_`). Fast local access with cross-process capability. |

```cpp
// FullPtr usage
hipc::FullPtr<char> ptr(alloc, size);
char* raw = ptr.ptr_;           // Direct access (fast)
hipc::ShmPtr<> shm = ptr.shm_; // Shared memory handle (cross-process)
```

### Common Allocator API

All allocators expose these methods through `BaseAllocator`:

```cpp
// Raw offset allocation
OffsetPtr AllocateOffset(size_t size);
void FreeOffsetNoNullCheck(OffsetPtr ptr);

// Type-safe allocation
FullPtr<T> Allocate<T>(size_t size);
void Free<T>(FullPtr<T> ptr);

// Object allocation with construction
FullPtr<T> NewObj<T>(Args&&... args);
void DelObj<T>(FullPtr<T> ptr);

// Array allocation
FullPtr<T> AllocateObjs<T>(size_t count);
FullPtr<T> NewObjs<T>(size_t count, Args&&... args);
void DelObjs<T>(FullPtr<T> ptr, size_t count);
```

## Memory Backends

Memory backends provide the underlying memory regions that allocators manage. A backend is always created first, then an allocator is constructed on top of it.

### Backend Lifecycle

Every backend supports two operations:
- `shm_init()` — Create and initialize a new memory region (the **owner**)
- `shm_attach()` — Attach to an existing memory region created by another process

### MallocBackend

Wraps `malloc` for private (non-shared) in-process memory. Useful for single-process tests and allocators that don't need cross-process sharing.

```cpp
#include "hermes_shm/memory/backend/malloc_backend.h"

hipc::MallocBackend backend;
size_t heap_size = 128 * 1024 * 1024;  // 128 MB
backend.shm_init(hipc::MemoryBackendId(0, 0), heap_size);

// Create an allocator on top of this backend
auto *alloc = backend.MakeAlloc<hipc::BuddyAllocator>();
```

### PosixShmMmap

The primary backend for cross-process shared memory. Uses `shm_open` and `mmap` to create memory-mapped regions accessible by multiple processes.

```cpp
#include "hermes_shm/memory/backend/posix_shm_mmap.h"

PosixShmMmap backend;

// Process 0: Create shared memory
backend.shm_init(MemoryBackendId(0, 0), 512 * 1024 * 1024, "/my_shm_region");

// Process 1+: Attach to existing shared memory
backend.shm_attach("/my_shm_region");
```

**Ownership model:** The process that calls `shm_init()` is the owner and is responsible for cleanup. Use `SetOwner()` / `UnsetOwner()` to transfer ownership between processes.

### GpuMalloc

**Source:** `hermes_shm/memory/backend/gpu_malloc.h`

Allocates memory directly on the GPU using `cudaMalloc` (CUDA) or `hipMalloc` (ROCm).

```cpp
// Only available when HSHM_ENABLE_CUDA or HSHM_ENABLE_ROCM is set
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
- Conditionally compiled: `#if HSHM_ENABLE_CUDA || HSHM_ENABLE_ROCM`

### GpuShmMmap

**Source:** `hermes_shm/memory/backend/gpu_shm_mmap.h`

GPU-accessible POSIX shared memory. Combines host shared memory with GPU registration for zero-copy GPU access.

```cpp
// Only available when HSHM_ENABLE_CUDA or HSHM_ENABLE_ROCM is set
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
- Conditionally compiled: `#if HSHM_ENABLE_CUDA || HSHM_ENABLE_ROCM`

**Key Difference from GpuMalloc:**
- Memory lives on the host (CPU) but is GPU-accessible
- Inherently shareable via POSIX shared memory (no IPC handle needed)
- Better for data that both CPU and GPU need to access

## Allocator Types

### MallocAllocator

**Source:** `hermes_shm/memory/allocator/malloc_allocator.h`

Wraps standard `malloc`/`free`. Used for private (non-shared) memory when no shared memory backend is needed.

```cpp
// Access the global singleton
auto* alloc = HSHM_MALLOC;

// Allocate and free
auto ptr = alloc->AllocateObjs<int>(100);
alloc->DelObjs<int>(ptr, 100);
```

**Characteristics:**
- No shared memory support (`shm_attach()` throws `SHMEM_NOT_SUPPORTED`)
- Prepends a `MallocPage` header (magic number + size) to each allocation
- Available as a global singleton via `HSHM_MALLOC` macro
- Tracks total allocation size when `HSHM_ALLOC_TRACK_SIZE` is enabled

### ArenaAllocator

**Source:** `hermes_shm/memory/allocator/arena_allocator.h`

Bump-pointer allocator. Allocations advance a pointer through a contiguous region. Individual frees are not supported — the entire arena is freed at once via `Reset()`.

```cpp
#include "hermes_shm/memory/backend/malloc_backend.h"
#include "hermes_shm/memory/allocator/arena_allocator.h"

// Create backend and allocator
hipc::MallocBackend backend;
backend.shm_init(hipc::MemoryBackendId(0, 0),
                 sizeof(hipc::ArenaAllocator<false>) + 128 * 1024 * 1024);
auto *alloc = backend.MakeAlloc<hipc::ArenaAllocator<false>>();

// Allocate (fast bump-pointer)
auto ptr = alloc->Allocate<char>(1024);

// Cannot free individual allocations — Free() is a no-op
// Reset the entire arena to reclaim all memory
alloc->Reset();

// Query state
size_t remaining = alloc->GetRemainingSize();
```

**Characteristics:**
- Extremely fast allocation (single pointer increment)
- No fragmentation
- No individual free support — use `Reset()` to reclaim all memory
- Throws `OUT_OF_MEMORY` if arena is exhausted
- GPU-compatible (`HSHM_CROSS_FUN` annotations)

**Best for:** Temporary allocations, scratch buffers, phase-based allocation patterns.

### BuddyAllocator

**Source:** `hermes_shm/memory/allocator/buddy_allocator.h`

Power-of-two free list allocator. Maintains separate free lists for different size classes, providing efficient allocation with bounded fragmentation.

```cpp
#include "hermes_shm/memory/backend/malloc_backend.h"
#include "hermes_shm/memory/allocator/buddy_allocator.h"

// Create backend and allocator
hipc::MallocBackend backend;
size_t heap_size = 128 * 1024 * 1024;  // 128 MB
backend.shm_init(hipc::MemoryBackendId(0, 0),
                 sizeof(hipc::BuddyAllocator) + heap_size);
auto *alloc = backend.MakeAlloc<hipc::BuddyAllocator>();

// Allocate and free
auto ptr = alloc->Allocate<char>(4096);
std::memset(ptr.ptr_, 0xAB, 4096);  // Write to allocated memory
alloc->Free(ptr);
```

**Size Classes:**

| Range | Strategy |
|-------|----------|
| 32B - 16KB (small) | Round up to power-of-2, allocate from free list or small arena |
| 16KB - 1MB (large) | Round down to power-of-2, best-fit search in free list |

**Constants:**
- `kMinSize` = 32 bytes (2^5)
- `kSmallThreshold` = 16KB (2^14)
- `kMaxSize` = 1MB (2^20)
- `kSmallArenaSize` = 64KB

**Internal Design:**
- `small_pages_[10]` - Free lists for sizes 2^5 through 2^14
- `large_pages_[6]` - Free lists for sizes 2^15 through 2^20
- Small arena: 64KB chunks divided into pages using a greedy algorithm
- Supports `Expand()` to add more memory regions
- Reallocate support for in-place growth when possible

### MultiProcessAllocator

**Source:** `hermes_shm/memory/allocator/mp_allocator.h`

Three-tier hierarchical allocator designed for multi-process, multi-threaded environments. Each tier adds more contention but accesses more memory.

**Architecture:**

```
┌─────────────────────────────────────┐
│         Global BuddyAllocator       │  ← Slow path (global lock)
├─────────────────────────────────────┤
│  ProcessBlock (per-process)         │  ← Medium path (process lock)
│  ├── ThreadBlock (thread 0)         │  ← Fast path (lock-free)
│  ├── ThreadBlock (thread 1)         │
│  └── ThreadBlock (thread N)         │
├─────────────────────────────────────┤
│  ProcessBlock (another process)     │
│  ├── ThreadBlock ...                │
│  └── ...                            │
└─────────────────────────────────────┘
```

**Tier Details:**

| Tier | Component | Lock | Default Size |
|------|-----------|------|-------------|
| Fast | ThreadBlock (per-thread BuddyAllocator) | None | 2MB |
| Medium | ProcessBlock (per-process BuddyAllocator) | Mutex | 16MB |
| Slow | Global BuddyAllocator | Mutex | Remaining |

**Key Methods:**
- `EnsureTls()` - Ensures the current thread has a ThreadBlock
- `AllocateProcessBlock()` - Creates a ProcessBlock for the current process
- `shm_attach()` / `shm_detach()` - Attach/detach processes from the allocator

**Best for:** Production shared-memory allocator for multi-process runtimes.

## Multi-Process Usage

The allocator system is designed for multiple processes to share the same memory region. The pattern is:

1. **Process 0** creates the backend and allocator (`shm_init` / `MakeAlloc`)
2. **Process 1+** attaches to the existing backend and allocator (`shm_attach` / `AttachAlloc`)
3. All processes allocate and free from the same allocator concurrently
4. Ownership is transferred so the last process standing handles cleanup

### Example: Multi-Process BuddyAllocator

From `context-transport-primitives/test/unit/allocator/test_buddy_allocator_multiprocess.cc`:

```cpp
#include "hermes_shm/memory/allocator/buddy_allocator.h"
#include "hermes_shm/memory/backend/posix_shm_mmap.h"

using namespace hshm::ipc;

constexpr size_t kShmSize = 512 * 1024 * 1024;  // 512 MB
const std::string kShmUrl = "/buddy_allocator_multiprocess_test";

int main(int argc, char **argv) {
  int rank = std::atoi(argv[1]);
  int duration_sec = std::atoi(argv[2]);

  PosixShmMmap backend;

  if (rank == 0) {
    // Owner: create shared memory and allocator
    backend.shm_init(MemoryBackendId(0, 0), kShmSize, kShmUrl);
    BuddyAllocator *alloc = backend.MakeAlloc<BuddyAllocator>();

    // Transfer ownership so another process handles cleanup
    backend.UnsetOwner();

    // Use the allocator...
    auto ptr = alloc->Allocate<char>(4096);
    alloc->Free(ptr);

  } else {
    // Non-owner: attach to existing shared memory and allocator
    backend.shm_attach(kShmUrl);
    BuddyAllocator *alloc = backend.AttachAlloc<BuddyAllocator>();

    // Take ownership (this process will handle cleanup)
    backend.SetOwner();

    // Use the same allocator concurrently
    auto ptr = alloc->Allocate<char>(4096);
    alloc->Free(ptr);
  }

  return 0;
}
```

### Example: Multi-Process MultiProcessAllocator

From `context-transport-primitives/test/unit/allocator/test_mp_allocator_multiprocess.cc`:

```cpp
#include "hermes_shm/memory/allocator/mp_allocator.h"
#include "hermes_shm/memory/backend/posix_shm_mmap.h"

using namespace hshm::ipc;

constexpr size_t kShmSize = 512 * 1024 * 1024;  // 512 MB
const std::string kShmUrl = "/mp_allocator_multiprocess_test";

int main(int argc, char **argv) {
  int rank = std::atoi(argv[1]);
  int duration_sec = std::atoi(argv[2]);
  int nthreads = std::atoi(argv[3]);

  PosixShmMmap backend;
  MultiProcessAllocator *allocator = nullptr;

  if (rank == 0) {
    // Owner: create shared memory and allocator
    backend.shm_init(MemoryBackendId(0, 0), kShmSize, kShmUrl);
    allocator = backend.MakeAlloc<MultiProcessAllocator>();
    backend.UnsetOwner();
  } else {
    // Non-owner: attach to existing shared memory and allocator
    backend.shm_attach(kShmUrl);
    allocator = backend.AttachAlloc<MultiProcessAllocator>();
    backend.SetOwner();
  }

  // Each process spawns nthreads, all allocating concurrently
  // for duration_sec seconds from the shared allocator
  std::vector<std::thread> threads;
  for (int i = 0; i < nthreads; ++i) {
    threads.emplace_back([allocator, duration_sec]() {
      auto start = std::chrono::steady_clock::now();
      auto end = start + std::chrono::seconds(duration_sec);
      std::mt19937 rng(std::random_device{}());
      std::uniform_int_distribution<size_t> dist(1, 16 * 1024);

      while (std::chrono::steady_clock::now() < end) {
        size_t size = dist(rng);
        auto ptr = allocator->Allocate<char>(size);
        if (!ptr.IsNull()) {
          std::memset(ptr.ptr_, 0xAB, size);
          allocator->Free(ptr);
        }
      }
    });
  }
  for (auto &t : threads) t.join();

  if (rank == 0) backend.UnsetOwner();
  return 0;
}
```

### Orchestrating Multi-Process Tests

The shell script `run_mp_allocator_multiprocess_test.sh` shows how to orchestrate multiple processes:

```bash
#!/bin/bash
TEST_BINARY="./test_mp_allocator_multiprocess"
DURATION=5
NTHREADS=2

# Step 1: Rank 0 initializes shared memory
$TEST_BINARY 0 $DURATION $NTHREADS &
RANK0_PID=$!

# Step 2: Wait for rank 0 to finish initialization
sleep 2

# Step 3: Additional ranks attach to existing shared memory
$TEST_BINARY 1 $DURATION $NTHREADS &
RANK1_PID=$!

$TEST_BINARY 2 $DURATION $NTHREADS &
RANK2_PID=$!

# Step 4: Wait for all processes to complete
wait $RANK0_PID $RANK1_PID $RANK2_PID
```

**Key points:**
- Rank 0 must start first and complete `shm_init()` + `MakeAlloc()` before other ranks attach
- The `sleep 2` ensures the shared memory region is fully initialized
- `MakeAlloc<AllocT>()` constructs the allocator in the backend's data region via placement new and calls `shm_init()`
- `AttachAlloc<AllocT>()` reinterprets the existing memory as an allocator and calls `shm_attach()` — no reinitialization
- Ownership (`SetOwner`/`UnsetOwner`) determines which process destroys the shared memory on exit

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
#if HSHM_ENABLE_CUDA || HSHM_ENABLE_ROCM
  // GPU-specific code
#endif

#if HSHM_IS_HOST
  // Host-only operations (initialization, IPC setup)
#endif

#if HSHM_IS_GPU
  // GPU kernel operations
#endif
```

## Choosing an Allocator

| Allocator | Use Case | Shared Memory | GPU | Free Support |
|-----------|----------|:---:|:---:|:---:|
| MallocAllocator | Private heap allocations | No | No | Yes |
| ArenaAllocator | Temporary / scratch buffers | Yes | Yes | Reset only |
| BuddyAllocator | General-purpose shared memory | Yes | Yes | Yes |
| MultiProcessAllocator | Multi-process production use | Yes | Yes | Yes |

## Related Documentation

- [Data Structures Guide](../types/data_structures_guide) - Data structures that use these allocators

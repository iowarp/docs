---
sidebar_position: 2
---

# Allocator Guide

## Overview

HSHM provides a hierarchy of memory allocators for shared memory, private memory, and GPU memory management. All allocators inherit from the `Allocator` base class and are wrapped via `BaseAllocator<CoreAllocT>` which provides type-safe allocation methods.

## Core Pointer Types

HSHM uses offset-based pointers for process-independent shared memory addressing:

| Type | Description |
|------|-------------|
| `OffsetPtr<T>` | Offset from allocator base. Process-independent. |
| `AtomicOffsetPtr<T>` | Atomic version of OffsetPtr for concurrent access. |
| `ShmPtr<T>` | Allocator ID + offset. Identifies memory across allocators. |
| `FullPtr<T>` | Combines a raw pointer (`ptr_`) with a `ShmPtr` (`shm_`). Fast local access with cross-process capability. |

```cpp
#include "clio_ctp/memory/allocator/buddy_allocator.h"
#include "clio_ctp/memory/backend/malloc_backend.h"

void example() {
  ctp::ipc::MallocBackend backend;
  backend.shm_init(ctp::ipc::MemoryBackendId(0, 0),
                   sizeof(ctp::ipc::BuddyAllocator) + 16 * 1024 * 1024);
  auto *alloc = backend.MakeAlloc<ctp::ipc::BuddyAllocator>();

  // FullPtr combines a raw pointer with a shared-memory handle
  ctp::ipc::FullPtr<char> ptr = alloc->Allocate<char>(1024);
  char *raw = ptr.ptr_;                   // Direct access (fast)
  ctp::ipc::ShmPtr<char> shm = ptr.shm_;  // Shared memory handle (cross-process)
  (void)raw;
  (void)shm;
  alloc->Free(ptr);
}
```

## Common Allocator API

All allocators expose these methods through `BaseAllocator`:

```cpp
#include "clio_ctp/memory/allocator/buddy_allocator.h"
#include "clio_ctp/memory/backend/malloc_backend.h"

void example() {
  ctp::ipc::MallocBackend backend;
  backend.shm_init(ctp::ipc::MemoryBackendId(0, 0),
                   sizeof(ctp::ipc::BuddyAllocator) + 16 * 1024 * 1024);
  auto *alloc = backend.MakeAlloc<ctp::ipc::BuddyAllocator>();

  // Raw offset allocation
  ctp::ipc::OffsetPtr<> off = alloc->AllocateOffset(128);
  alloc->FreeOffsetNoNullCheck(off);

  // Type-safe allocation
  ctp::ipc::FullPtr<int> buf = alloc->Allocate<int>(64 * sizeof(int));
  alloc->Free(buf);

  // Array allocation (no construction)
  ctp::ipc::FullPtr<int> arr = alloc->AllocateObjs<int>(100);
  alloc->Free(arr);

  // Object allocation with construction
  ctp::ipc::FullPtr<int> obj = alloc->NewObj<int>(42);
  alloc->DelObj(obj);

  // Array allocation with construction
  ctp::ipc::FullPtr<int> objs = alloc->NewObjs<int>(100, 7);
  alloc->DelObjs(objs, 100);
}
```

## Allocator Types

### MallocAllocator

Wraps standard `malloc`/`free`. Used for private (non-shared) memory when no shared memory backend is needed.

```cpp
#include "clio_ctp/memory/allocator/malloc_allocator.h"

void example() {
  // Access the global singleton
  auto *alloc = CTP_MALLOC;

  // Allocate and free
  ctp::ipc::FullPtr<int> ptr = alloc->AllocateObjs<int>(100);
  alloc->Free(ptr);
}
```

**Characteristics:**
- No shared memory support (`shm_attach()` throws `SHMEM_NOT_SUPPORTED`)
- Prepends a `MallocPage` header (magic number + size) to each allocation
- Available as a global singleton via `CTP_MALLOC` macro
- Tracks total allocation size when `CTP_ALLOC_TRACK_SIZE` is enabled

### ArenaAllocator

Bump-pointer allocator. Allocations advance a pointer through a contiguous region. Individual frees are not supported — the entire arena is freed at once via `Reset()`.

```cpp
#include "clio_ctp/memory/allocator/arena_allocator.h"
#include "clio_ctp/memory/backend/malloc_backend.h"

void example() {
  // Create backend and allocator
  ctp::ipc::MallocBackend backend;
  backend.shm_init(ctp::ipc::MemoryBackendId(0, 0),
                   sizeof(ctp::ipc::ArenaAllocator<false>) + 128 * 1024 * 1024);
  auto *alloc = backend.MakeAlloc<ctp::ipc::ArenaAllocator<false>>();

  // Allocate (fast bump-pointer)
  ctp::ipc::FullPtr<char> ptr = alloc->Allocate<char>(1024);
  (void)ptr;

  // Individual frees are not supported — Reset reclaims the entire arena
  alloc->Reset();

  // Query state
  size_t remaining = alloc->GetRemainingSize();
  (void)remaining;
}
```

**Characteristics:**
- Extremely fast allocation (single pointer increment)
- No fragmentation
- No individual free support — use `Reset()` to reclaim all memory
- Throws `OUT_OF_MEMORY` if arena is exhausted
- GPU-compatible (`CTP_CROSS_FUN` annotations)

**Best for:** Temporary allocations, scratch buffers, phase-based allocation patterns.

### BuddyAllocator

Power-of-two free list allocator. Maintains separate free lists for different size classes, providing efficient allocation with bounded fragmentation.

```cpp
#include <cstring>
#include "clio_ctp/memory/allocator/buddy_allocator.h"
#include "clio_ctp/memory/backend/malloc_backend.h"

void example() {
  // Create backend and allocator
  ctp::ipc::MallocBackend backend;
  size_t heap_size = 128 * 1024 * 1024;  // 128 MB
  backend.shm_init(ctp::ipc::MemoryBackendId(0, 0),
                   sizeof(ctp::ipc::BuddyAllocator) + heap_size);
  auto *alloc = backend.MakeAlloc<ctp::ipc::BuddyAllocator>();

  // Allocate and free
  ctp::ipc::FullPtr<char> ptr = alloc->Allocate<char>(4096);
  std::memset(ptr.ptr_, 0xAB, 4096);  // Write to allocated memory
  alloc->Free(ptr);
}
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

```cpp
#include <cstdlib>
#include <string>
#include "clio_ctp/memory/allocator/buddy_allocator.h"
#include "clio_ctp/memory/backend/posix_shm_mmap.h"

using namespace ctp::ipc;

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

```cpp
#include <cstdlib>
#include <cstring>
#include <chrono>
#include <random>
#include <string>
#include <thread>
#include <vector>
#include "clio_ctp/memory/allocator/mp_allocator.h"
#include "clio_ctp/memory/backend/posix_shm_mmap.h"

using namespace ctp::ipc;

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

## Choosing an Allocator

| Allocator | Use Case | Shared Memory | GPU | Free Support |
|-----------|----------|:---:|:---:|:---:|
| MallocAllocator | Private heap allocations | No | No | Yes |
| ArenaAllocator | Temporary / scratch buffers | Yes | Yes | Reset only |
| BuddyAllocator | General-purpose shared memory | Yes | Yes | Yes |
| MultiProcessAllocator | Multi-process production use | Yes | Yes | Yes |

## Related Documentation

- [Memory Backends Guide](./memory_backend_guide) - Backends that provide memory regions for these allocators
- [Vector Guide](../types/vector_guide) - Shared-memory vectors that use these allocators
- [Ring Buffer Guide](../types/ring_buffer_guide) - Lock-free circular queues

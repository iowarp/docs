---
sidebar_position: 1
---

# Vector Guide

## Overview

HSHM provides two vector variants: `ctp::ipc::vector` for shared memory and `ctp::priv::vector` for private memory. For standard Module development, use `std::vector`. The HSHM vectors are needed when data must be accessible from GPU kernels or live in shared memory across processes.

## ctp::ipc::vector

**Source:** `clio_ctp/data_structures/ipc/vector.h`

A dynamic array stored in shared memory using offset-based pointers (`OffsetPtr<T>`) for process-independent addressing.

```cpp
#include <clio_ctp/data_structures/ipc/vector.h>
#include <clio_ctp/memory/backend/malloc_backend.h>
#include <clio_ctp/memory/allocator/arena_allocator.h>

void example() {
  using namespace ctp::ipc;

  // Create a memory backend and a concrete allocator (mirrors the unit tests)
  MallocBackend backend;
  backend.shm_init(MemoryBackendId(0, 0), 1024 * 1024);
  auto *alloc = backend.MakeAlloc<ArenaAllocator<false>>();

  // Construct with an allocator; the optional second argument is an initial size
  vector<int, ArenaAllocator<false>> vec(alloc, 10);  // 10 default-initialized elements

  // Standard vector operations
  vec.push_back(42);
  vec.emplace_back(100);
  int val = vec[0];
  vec.resize(20);
  vec.reserve(50);
  vec.clear();

  // Iteration
  int sum = 0;
  for (auto it = vec.begin(); it != vec.end(); ++it) {
    sum += *it;
  }
}
```

**Template Parameters:**
- `T` - Element type
- `AllocT` - Allocator type (determines shared vs private memory)

**Key Differences from std::vector:**
- Requires an allocator at construction time
- Uses `OffsetPtr<T>` internally instead of raw pointers
- Safe for cross-process access in shared memory
- Annotated with `CTP_CROSS_FUN` for GPU compatibility

## ctp::priv::vector

**Source:** `clio_ctp/data_structures/priv/vector.h`

A private-memory vector with allocator integration. Supports the same API as `std::vector` plus serialization.

```cpp
#include <clio_ctp/data_structures/priv/vector.h>
#include <cstdlib>

// A minimal allocator providing the AllocateObjs/Allocate/Free API the
// vector requires (mirrors SimpleHeapAllocator from the unit tests).
class SimpleHeapAllocator {
 public:
  template <typename T>
  ctp::ipc::FullPtr<T> AllocateObjs(size_t count) {
    ctp::ipc::FullPtr<T> result;
    result.ptr_ = static_cast<T*>(malloc(count * sizeof(T)));
    result.shm_.off_ = 0;
    result.shm_.alloc_id_ = ctp::ipc::AllocatorId::GetNull();
    return result;
  }

  template <typename T = char>
  ctp::ipc::FullPtr<T> Allocate(size_t size) {
    ctp::ipc::FullPtr<T> result;
    result.ptr_ = static_cast<T*>(malloc(size));
    result.shm_.off_ = 0;
    result.shm_.alloc_id_ = ctp::ipc::AllocatorId::GetNull();
    return result;
  }

  template <typename T, bool ATOMIC = false>
  void Free(const ctp::ipc::FullPtr<T, ATOMIC>& ptr) {
    if (ptr.ptr_ != nullptr) {
      free(ptr.ptr_);
    }
  }
};

void example() {
  using namespace ctp::priv;
  SimpleHeapAllocator alloc;

  // Construction takes the allocator as the last argument
  vector<int, SimpleHeapAllocator> vec({1, 2, 3, 4, 5}, &alloc);
  vector<int, SimpleHeapAllocator> vec2(10, 0, &alloc);  // 10 zeros

  // Full STL-compatible API
  vec.push_back(6);
  vec.pop_back();
  vec.insert(vec.cbegin() + 2, 99);
  vec.erase(vec.cbegin());

  // Reverse iteration
  int sum = 0;
  for (auto it = vec.rbegin(); it != vec.rend(); ++it) {
    sum += *it;
  }
}
```

**Optimizations:**
- Uses `memcpy`/`memmove` for trivially copyable types (POD optimization)
- Exponential capacity growth strategy
- Annotated with `CTP_CROSS_FUN` for GPU compatibility

## When to Use Each

| Variant | Use Case |
|---------|----------|
| `std::vector` | Default choice for Module task data |
| `ctp::priv::vector` | Private memory with serialization support or GPU access |
| `ctp::ipc::vector` | Cross-process shared memory regions |

## Related Documentation

- [Allocator Guide](../allocator/allocator_guide) - Memory allocators used by these vectors

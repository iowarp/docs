---
sidebar_position: 1
---

# Vector Guide

## Overview

HSHM provides two vector variants: `hshm::ipc::vector` for shared memory and `hshm::priv::vector` for private memory. For standard ChiMod development, use `std::vector`. The HSHM vectors are needed when data must be accessible from GPU kernels or live in shared memory across processes.

## hshm::ipc::vector

**Source:** `hermes_shm/data_structures/ipc/vector.h`

A dynamic array stored in shared memory using offset-based pointers (`OffsetPtr<T>`) for process-independent addressing.

```cpp
#include <hermes_shm/data_structures/ipc/vector.h>

// Create with an allocator
hshm::ipc::vector<int, AllocT> vec(alloc, 10);  // 10 elements

// Standard vector operations
vec.push_back(42);
vec.emplace_back(100);
int val = vec[0];
vec.resize(20);
vec.reserve(50);
vec.clear();

// Iteration
for (auto it = vec.begin(); it != vec.end(); ++it) {
  process(*it);
}
```

**Template Parameters:**
- `T` - Element type
- `AllocT` - Allocator type (determines shared vs private memory)

**Key Differences from std::vector:**
- Requires an allocator at construction time
- Uses `OffsetPtr<T>` internally instead of raw pointers
- Safe for cross-process access in shared memory
- Annotated with `HSHM_CROSS_FUN` for GPU compatibility

## hshm::priv::vector

**Source:** `hermes_shm/data_structures/priv/vector.h`

A private-memory vector with allocator integration. Supports the same API as `std::vector` plus serialization.

```cpp
#include <hermes_shm/data_structures/priv/vector.h>

// Standard construction
hshm::priv::vector<int> vec = {1, 2, 3, 4, 5};
hshm::priv::vector<int> vec2(10, 0);  // 10 zeros

// Full STL-compatible API
vec.push_back(6);
vec.pop_back();
vec.insert(vec.begin() + 2, 99);
vec.erase(vec.begin());

// Reverse iteration
for (auto it = vec.rbegin(); it != vec.rend(); ++it) {
  process(*it);
}
```

**Optimizations:**
- Uses `memcpy`/`memmove` for trivially copyable types (POD optimization)
- Exponential capacity growth strategy
- Annotated with `HSHM_CROSS_FUN` for GPU compatibility

## When to Use Each

| Variant | Use Case |
|---------|----------|
| `std::vector` | Default choice for ChiMod task data |
| `hshm::priv::vector` | Private memory with serialization support or GPU access |
| `hshm::ipc::vector` | Cross-process shared memory regions |

## Related Documentation

- [Allocator Guide](../allocator/allocator_guide) - Memory allocators used by these vectors

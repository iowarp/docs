---
sidebar_position: 2
---

# Ring Buffer Guide

## Overview

**Source:** `clio_ctp/data_structures/ipc/ring_buffer.h`

A lock-free circular queue for concurrent producer-consumer patterns. Configurable via compile-time flags.

## Configuration Flags

The header defines `ctp::ipc::RingQueueFlag`. Combine these enumerators to
configure a `ring_buffer`'s thread-safety model and full-buffer behavior:

```cpp
#include <clio_ctp/data_structures/ipc/ring_buffer.h>

void example() {
  using namespace ctp::ipc;

  uint32_t spsc     = RING_BUFFER_SPSC_FLAGS;        // Single producer, single consumer
  uint32_t mpsc     = RING_BUFFER_MPSC_FLAGS;        // Multiple producers, single consumer
  uint32_t wait     = RING_BUFFER_WAIT_FOR_SPACE;    // Block until space is available
  uint32_t err      = RING_BUFFER_ERROR_ON_NO_SPACE; // Push() returns false if full
  uint32_t dynamic  = RING_BUFFER_DYNAMIC_SIZE;      // Resize when full
  uint32_t fixed    = RING_BUFFER_FIXED_SIZE;        // Fixed-size buffer
  uint32_t lock_pop = RING_BUFFER_LOCK_POP;          // Serialize Pop() for MPMC use

  // Flags are OR-ed together as the ring_buffer FLAGS template argument, e.g.
  uint32_t spsc_fixed = RING_BUFFER_SPSC_FLAGS | RING_BUFFER_FIXED_SIZE |
                        RING_BUFFER_ERROR_ON_NO_SPACE;

  (void)spsc; (void)mpsc; (void)wait; (void)err;
  (void)dynamic; (void)fixed; (void)lock_pop; (void)spsc_fixed;
}
```

## Pre-defined Type Aliases

| Alias | Flags | Description |
|-------|-------|-------------|
| `spsc_ring_buffer<T>` | SPSC + Fixed + Error | Single-producer single-consumer, fixed size |
| `mpsc_ring_buffer<T>` | MPSC + Fixed + Wait | Multi-producer single-consumer, blocks when full |
| `circular_mpsc_ring_buffer<T>` | MPSC + Fixed + Error | Multi-producer single-consumer, wraps around |
| `ext_ring_buffer<T>` | MPSC + Dynamic + Wait | Extensible, resizes when full |

## Usage

```cpp
#include <clio_ctp/data_structures/ipc/ring_buffer.h>
#include <clio_ctp/memory/backend/malloc_backend.h>
#include <clio_ctp/memory/allocator/arena_allocator.h>

void example() {
  using namespace ctp::ipc;

  // Set up a memory backend and allocator, exactly as the unit tests do.
  MallocBackend backend;
  backend.shm_init(MemoryBackendId(0, 0), 1024 * 1024);
  auto *alloc = backend.MakeAlloc<ArenaAllocator<false>>();

  // Create a fixed-size SPSC ring buffer with depth 1024
  spsc_ring_buffer<int, ArenaAllocator<false>> rb(alloc, 1024);

  // Producer
  rb.Push(42);
  rb.Emplace(100);

  // Consumer
  int val;
  if (rb.Pop(val)) {
    // Got value
  }

  // Query state
  size_t count = rb.Size();
  bool empty = rb.Empty();
  bool full = rb.Full();
  (void)count; (void)empty; (void)full;
}
```

## RingBufferEntry

Each entry has an atomic ready flag for lock-free synchronization:

The header provides `ctp::ipc::RingBufferEntry<T>`. Its public interface:

```cpp
#include <clio_ctp/data_structures/ipc/ring_buffer.h>

void example() {
  ctp::ipc::RingBufferEntry<int> entry;

  entry.GetData() = 42;     // Access / modify the stored data (T& GetData())
  entry.SetReady();         // Mark entry as containing data (release semantics)

  if (entry.IsReady()) {    // Check if entry has data (acquire semantics)
    int value = entry.GetData();
    (void)value;
    entry.ClearReady();     // Mark entry as consumed
  }
}
```

## Internal Design

- Uses atomic head/tail pointers for lock-free operation
- Head is the consumer pointer, tail is the producer pointer
- Queue capacity is `depth + 1` to distinguish full from empty
- MPSC mode uses atomic tail with CAS for concurrent producers
- SPSC mode uses non-atomic pointers for maximum performance
- Includes worker metadata: `assigned_worker_id_`, `signal_fd_`, `tid_`, `active_`

## Related Documentation

- [Allocator Guide](../allocator/allocator_guide) - Memory allocators used by ring buffers
- [Atomic Types Guide](./atomic_types_guide) - Atomic primitives used in ring buffers

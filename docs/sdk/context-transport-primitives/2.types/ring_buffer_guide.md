---
sidebar_position: 2
---

# Ring Buffer Guide

## Overview

**Source:** `hermes_shm/data_structures/ipc/ring_buffer.h`

A lock-free circular queue for concurrent producer-consumer patterns. Configurable via compile-time flags.

## Configuration Flags

```cpp
namespace ctp::ipc {
enum RingQueueFlag {
  RING_BUFFER_SPSC_FLAGS       = 0x01,  // Single Producer Single Consumer
  RING_BUFFER_MPSC_FLAGS       = 0x02,  // Multiple Producer Single Consumer
  RING_BUFFER_WAIT_FOR_SPACE   = 0x04,  // Block until space available
  RING_BUFFER_ERROR_ON_NO_SPACE = 0x08, // Return error if full
  RING_BUFFER_DYNAMIC_SIZE     = 0x10,  // Resize when full
  RING_BUFFER_FIXED_SIZE       = 0x20,  // Fixed-size buffer
};
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
#include <hermes_shm/data_structures/ipc/ring_buffer.h>

// Create a fixed-size SPSC ring buffer with depth 1024
ctp::ipc::spsc_ring_buffer<int> rb(alloc, 1024);

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
```

## RingBufferEntry

Each entry has an atomic ready flag for lock-free synchronization:

```cpp
template<typename T>
struct RingBufferEntry {
  bool IsReady();     // Check if entry has data
  void SetReady();    // Mark entry as containing data
  void ClearReady();  // Mark entry as consumed
  T& GetData();       // Access the entry data
};
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

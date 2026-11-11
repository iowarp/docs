---
sidebar_position: 4
---

# Unordered Map Guide

## Overview

**Source:** `clio_ctp/data_structures/priv/unordered_map_ll.h`

A chaining (linked-list) hash map. The hash space is partitioned across a
bucket array; each bucket is a singly-linked chain of nodes. When locking is
enabled (the default) every bucket owns its own `ctp::RwLock`, so single-key
operations are self-synchronizing and the table can grow safely while other
threads read and write it.

**Key Characteristics:**
- **Chaining Design**: A vector of buckets, each a singly-linked list of key/value nodes.
- **Self-Locking (no external mutex needed)**: Single-key operations (`insert`, `insert_or_assign`, `operator[]`, `find`, `contains`, `count`, `erase`) are thread-safe via per-bucket `RwLock`s plus a map-wide growth lock. Pass `EnableLocking = false` as the last template argument for an unsynchronized single-threaded variant.
- **Automatic Growth**: The table rehashes once `size` reaches `ext_percent * bucket_count`, multiplying the bucket count by `ext_mult`.
- **Pointer-Based API**: Lookups return raw pointers (`nullptr` when absent), not iterators. There is no `.at()`.
- **NOT Shared-Memory Compatible**: For runtime-only data structures, not task parameters.

## Basic Usage

```cpp
#include <cstddef>
#include <cstdint>
#include <clio_ctp/data_structures/priv/unordered_map_ll.h>

void example() {
  // Create a map with 32 buckets (host-side global allocator).
  ctp::priv::unordered_map_ll<uint64_t, uint64_t> map(32);

  // Insert. insert()/insert_or_assign() return InsertResult{bool inserted; T* value;}
  auto [inserted, value_ptr] = map.insert(1, 100);  // insert if absent
  map.insert_or_assign(2, 200);                      // insert or overwrite
  map[3] = 300;                                      // operator[] creates if missing

  // Lookup
  uint64_t* val = map.find(1);   // returns nullptr if not found
  bool exists = map.contains(3);
  size_t n = map.count(2);       // 0 or 1

  // Remove
  map.erase(1);
  map.clear();

  // Iterate
  map.for_each([](const uint64_t& key, uint64_t& value) {
    // Process each element
  });
}
```

## Constructor

```cpp
#include <cstdint>
#include <clio_ctp/data_structures/priv/unordered_map_ll.h>

void example() {
  // num_buckets, ext_percent (grow threshold), ext_mult (growth factor)
  ctp::priv::unordered_map_ll<uint64_t, uint64_t> map(16, 0.6, 2);
}
```

**Parameters:**
- `num_buckets`: Initial number of buckets (default: 16). The table grows automatically, so this is a performance hint — size it near the expected key count to avoid rehash churn.
- `ext_percent`: Load factor that triggers growth (default: 0.6). The table rehashes once `size >= ext_percent * bucket_count`.
- `ext_mult`: Bucket-count multiplier applied on each rehash (default: 2; clamped to a minimum of 2).

The host-side constructor shown here uses the global `MallocAllocator`. An
allocator-taking overload also exists:
`unordered_map_ll<Key, T> map(alloc, num_buckets, ext_percent, ext_mult)`.

## API Reference

```cpp
#include <cstddef>
#include <cstdint>
#include <clio_ctp/data_structures/priv/unordered_map_ll.h>

void example() {
  ctp::priv::unordered_map_ll<uint64_t, uint64_t> map(16);

  // Insertion -- returns InsertResult{bool inserted; uint64_t* value;}
  auto r1 = map.insert(1, 100);            // insert if absent
  auto r2 = map.insert_or_assign(1, 101);  // insert or overwrite
  uint64_t& ref = map[2];                  // insert default if missing

  // Lookup
  uint64_t* ptr = map.find(1);             // nullptr if not found
  bool exists = map.contains(1);           // existence check
  size_t cnt = map.count(1);               // 0 or 1

  // Removal
  size_t erased = map.erase(1);            // number erased (0 or 1)
  map.clear();                             // remove all entries

  // Size / capacity
  size_t s = map.size();                   // element count
  bool e = map.empty();                    // empty check
  size_t b = map.bucket_count();           // current bucket count

  // Iteration
  map.for_each([](const uint64_t& key, uint64_t& value) { /* ... */ });
}
```

`insert` and `insert_or_assign` return `ctp::priv::InsertResult<T>`, an
aggregate `{ bool inserted; T* value; }`: `inserted` is `true` when a new entry
was created, and `value` points to the stored value. A `const` map exposes a
`const T* find(key) const` overload that returns a `const T*`.

## Key Differences from std::unordered_map

| Feature | std::unordered_map | ctp::priv::unordered_map_ll |
|---------|-------------------|----------------------|
| Internal Structure | Implementation-defined | Bucket array of singly-linked chains (explicit) |
| Growth | Dynamic rehashing | Automatic rehash at `ext_percent * bucket_count` |
| Lookup Result | Iterators | Raw pointers (`nullptr` when absent) |
| Missing-Key Access | `.at()` throws | No `.at()`; use `find()` (nullptr) or `operator[]` (inserts default) |
| Pointer Stability | Invalidated on rehash | Value pointers stay valid across rehash (nodes are re-threaded, not reallocated) |
| Shared Memory | Not compatible | Not compatible |

## When to Use

| Scenario | Recommendation |
|----------|---------------|
| Runtime container data structures (caches, registries) | `ctp::priv::unordered_map_ll` |
| Task input/output parameters | `std::unordered_map` or `chi::ipc::` types |
| Client-side code | `std::unordered_map` |
| Data requiring serialization | `std::unordered_map` with cereal |

---
sidebar_position: 4
---

# Unordered Map Guide

## Overview

**Source:** `clio_ctp/data_structures/priv/unordered_map_ll.h`

A hash map implementation using a vector of lists design that provides efficient concurrent access when combined with external locking. Each bucket contains a `std::list` of key-value pairs; the hash space is partitioned across a fixed number of buckets set at construction time.

**Key Characteristics:**
- **Vector of Lists Design**: Uses a vector of buckets, each containing a list of key-value pairs
- **External Locking Required**: No internal mutexes — users must provide synchronization
- **Bucket Partitioning**: Hash space is partitioned across multiple buckets for better cache locality
- **Standard API**: Compatible with `std::unordered_map` interface
- **NOT Shared-Memory Compatible**: For runtime-only data structures, not task parameters

## Basic Usage

```cpp
#include <clio_ctp/data_structures/priv/unordered_map_ll.h>

// Create map with 32 buckets
ctp::priv::unordered_map_ll<int, std::string> map(32);

// Insert
auto [inserted, ptr] = map.insert(1, "hello");
map.insert_or_assign(2, "world");
map[3] = "foo";

// Lookup
std::string* val = map.find(1);      // Returns nullptr if not found
const std::string& ref = map.at(2);  // Throws if not found
bool exists = map.contains(3);

// Remove
map.erase(1);
map.clear();

// Iterate
map.for_each([](const int& key, std::string& value) {
  // Process each element
});
```

## Constructor

```cpp
ctp::priv::unordered_map_ll<Key, T> map(max_concurrency);
```

**Parameters:**
- `max_concurrency`: Number of buckets (default: 16). Higher values give better distribution at the cost of more memory. Typical values: 16-64.

## API Reference

```cpp
// Insertion operations
auto [inserted, value_ptr] = map.insert(key, value);          // Insert if not exists
auto [inserted, value_ptr] = map.insert_or_assign(key, value); // Insert or update
T& ref = map[key];                                            // Insert default if missing

// Lookup operations
T* ptr = map.find(key);                    // Returns nullptr if not found
const T* ptr = map.find(key) const;        // Const version
T& ref = map.at(key);                      // Throws if not found
bool exists = map.contains(key);           // Check existence
size_t count = map.count(key);             // Returns 0 or 1

// Removal operations
size_t erased = map.erase(key);            // Returns number of elements erased
map.clear();                               // Remove all elements

// Size operations
size_t s = map.size();                     // Total element count
bool e = map.empty();                      // Check if empty
size_t b = map.bucket_count();             // Number of buckets

// Iteration
map.for_each([](const Key& key, T& value) { /* ... */ });
```

Insert operations return `std::pair<bool, T*>` where `first` is `true` if insertion occurred and `second` is a pointer to the value.

## Key Differences from std::unordered_map

| Feature | std::unordered_map | ctp::priv::unordered_map_ll |
|---------|-------------------|----------------------|
| Internal Structure | Implementation-defined | Vector of lists (explicit) |
| Bucket Count | Dynamic rehashing | Fixed at construction |
| Iterator Stability | Unstable across insertions | Stable (list-based) |
| Shared Memory | Not compatible | Not compatible |
| Return Values | Iterators | Pointers to values |

## When to Use

| Scenario | Recommendation |
|----------|---------------|
| Runtime container data structures (caches, registries) | `ctp::priv::unordered_map_ll` |
| Task input/output parameters | `std::unordered_map` or `chi::ipc::` types |
| Client-side code | `std::unordered_map` |
| Data requiring serialization | `std::unordered_map` with cereal |

# Data Structures Guide

## Overview

HSHM provides data structures designed for shared memory and GPU compatibility. These are alternatives to STL containers for use cases requiring cross-process sharing or GPU kernel access.

For standard ChiMod development, use `std::string` and `std::vector`. The HSHM data structures below are needed when:
- Data must be accessible from GPU kernels
- Data must live in shared memory across processes
- You need lock-free concurrent queues

## Vector

HSHM provides two vector variants: `hshm::ipc::vector` for shared memory and `hshm::priv::vector` for private memory.

### hshm::ipc::vector

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

### hshm::priv::vector

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

### When to Use Each

| Variant | Use Case |
|---------|----------|
| `std::vector` | Default choice for ChiMod task data |
| `hshm::priv::vector` | Private memory with serialization support or GPU access |
| `hshm::ipc::vector` | Cross-process shared memory regions |

## Ring Buffer

**Source:** `hermes_shm/data_structures/ipc/ring_buffer.h`

A lock-free circular queue for concurrent producer-consumer patterns. Configurable via compile-time flags.

### Configuration Flags

```cpp
namespace hshm::ipc {
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

### Pre-defined Type Aliases

| Alias | Flags | Description |
|-------|-------|-------------|
| `spsc_ring_buffer<T>` | SPSC + Fixed + Error | Single-producer single-consumer, fixed size |
| `mpsc_ring_buffer<T>` | MPSC + Fixed + Wait | Multi-producer single-consumer, blocks when full |
| `circular_mpsc_ring_buffer<T>` | MPSC + Fixed + Error | Multi-producer single-consumer, wraps around |
| `ext_ring_buffer<T>` | MPSC + Dynamic + Wait | Extensible, resizes when full |

### Usage

```cpp
#include <hermes_shm/data_structures/ipc/ring_buffer.h>

// Create a fixed-size SPSC ring buffer with depth 1024
hshm::ipc::spsc_ring_buffer<int> rb(alloc, 1024);

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

### RingBufferEntry

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

### Internal Design

- Uses atomic head/tail pointers for lock-free operation
- Head is the consumer pointer, tail is the producer pointer
- Queue capacity is `depth + 1` to distinguish full from empty
- MPSC mode uses atomic tail with CAS for concurrent producers
- SPSC mode uses non-atomic pointers for maximum performance
- Includes worker metadata: `assigned_worker_id_`, `signal_fd_`, `tid_`, `active_`

## String

**Source:** `hermes_shm/data_structures/priv/string.h`

An SSO (Short String Optimization) string backed by `hshm::priv::vector`.

```cpp
#include <hermes_shm/data_structures/priv/string.h>

// Construction
hshm::string s1("hello");
hshm::string s2(std::string("world"));
hshm::string s3(s1);  // Copy

// Standard string API
s1.append(" world");
s1 += "!";
size_t pos = s1.find("world");
hshm::string sub = s1.substr(0, 5);
bool eq = (s1 == s2);

// Access
const char* cstr = s1.c_str();
char ch = s1[0];
size_t len = s1.size();

// Conversion to/from std::string
std::string std_str = s1.str();
std::string std_str2 = static_cast<std::string>(s1);
```

**Template Parameters:**
- `T` - Character type (default: `char`)
- `AllocT` - Allocator type
- `SSOSize` - Short string buffer size (default: 32 bytes)

**Key Features:**
- Short strings (32 bytes or fewer) stored inline without heap allocation
- Longer strings use `hshm::priv::vector` as backing store
- Full `std::string`-compatible API: `find`, `substr`, `replace`, `starts_with`, `ends_with`
- Annotated with `HSHM_CROSS_FUN` for GPU compatibility
- Serialization support via `save()`/`load()`

**Type Alias:** `hshm::string` is a convenience alias for `hshm::priv::basic_string<char>`.

## Unordered Map (Vector of Lists)

**Source:** `hermes_shm/data_structures/priv/unordered_map_ll.h`

A hash map implementation using a vector of lists design that provides efficient concurrent access when combined with external locking. Each bucket contains a `std::list` of key-value pairs; the hash space is partitioned across a fixed number of buckets set at construction time.

**Key Characteristics:**
- **Vector of Lists Design**: Uses a vector of buckets, each containing a list of key-value pairs
- **External Locking Required**: No internal mutexes - users must provide synchronization
- **Bucket Partitioning**: Hash space is partitioned across multiple buckets for better cache locality
- **Standard API**: Compatible with `std::unordered_map` interface
- **NOT Shared-Memory Compatible**: For runtime-only data structures, not task parameters

### Basic Usage

```cpp
#include <hermes_shm/data_structures/priv/unordered_map_ll.h>

// Create map with 32 buckets
hshm::priv::unordered_map_ll<int, std::string> map(32);

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

### Constructor

```cpp
hshm::priv::unordered_map_ll<Key, T> map(max_concurrency);
```

**Parameters:**
- `max_concurrency`: Number of buckets (default: 16). Higher values give better distribution at the cost of more memory. Typical values: 16-64.

### API Reference

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

### Key Differences from std::unordered_map

| Feature | std::unordered_map | hshm::priv::unordered_map_ll |
|---------|-------------------|----------------------|
| Internal Structure | Implementation-defined | Vector of lists (explicit) |
| Bucket Count | Dynamic rehashing | Fixed at construction |
| Iterator Stability | Unstable across insertions | Stable (list-based) |
| Shared Memory | Not compatible | Not compatible |
| Return Values | Iterators | Pointers to values |

### When to Use

| Scenario | Recommendation |
|----------|---------------|
| Runtime container data structures (caches, registries) | `hshm::priv::unordered_map_ll` |
| Task input/output parameters | `std::unordered_map` or `chi::ipc::` types |
| Client-side code | `std::unordered_map` |
| Data requiring serialization | `std::unordered_map` with cereal |

## GPU Compatibility

All HSHM data structures use cross-platform annotations for CPU/GPU compilation:

| Annotation | Purpose |
|-----------|---------|
| `HSHM_INLINE_CROSS_FUN` | Inline function callable from both CPU and GPU |
| `HSHM_CROSS_FUN` | Function callable from both CPU and GPU |
| `HSHM_IS_HOST` | Compile-time check: true when compiling for CPU |
| `HSHM_IS_GPU` | Compile-time check: true when compiling for GPU |

These annotations expand to CUDA `__host__ __device__` or HIP equivalents when GPU support is enabled, and are no-ops on CPU-only builds.

```cpp
// Example: Method accessible from both CPU and GPU
HSHM_INLINE_CROSS_FUN
T& vector::operator[](size_t index) {
  return data_[index];
}
```

## Related Documentation

- [Allocator Guide](../allocator/allocator_guide) - Memory allocators used by these data structures
- [Atomic Types Guide](./atomic_types_guide) - Atomic primitives used in ring buffers

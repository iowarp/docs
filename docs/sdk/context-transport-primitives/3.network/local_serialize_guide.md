# LocalSerialize Guide

## Overview

`LocalSerialize` and `LocalDeserialize` are lightweight binary serialization classes in the `ctp::ipc` namespace. They serialize C++ objects into a contiguous `std::vector<char>` buffer without requiring external dependencies like cereal. They are used internally by the SHM transport in Lightbeam, and are available for general-purpose binary serialization needs.

**Header:**
```cpp
#include <clio_ctp/data_structures/serialization/local_serialize.h>
```

## Core Classes

### ctp::ipc::LocalSerialize

Serializes objects into a contiguous memory buffer:

```cpp
#include <cstddef>
#include <vector>

template <typename DataT = std::vector<char>>
class LocalSerialize {
 public:
    DataT& data_;

    // Construct and reset buffer
    LocalSerialize(DataT& data);

    // Construct without resetting buffer
    LocalSerialize(DataT& data, bool);

    // Operators
    template <typename T>
    LocalSerialize& operator<<(const T& obj);   // Stream-style save

    template <typename T>
    LocalSerialize& operator&(const T& obj);     // Generic save

    template <typename... Args>
    LocalSerialize& operator()(Args&&... args);   // Variadic save

    // Low-level binary write
    LocalSerialize& write_binary(const char* data, size_t size);
};
```

### ctp::ipc::LocalDeserialize

Deserializes objects from a contiguous memory buffer:

```cpp
#include <cstddef>
#include <vector>

template <typename DataT = std::vector<char>>
class LocalDeserialize {
 public:
    const DataT& data_;
    size_t cur_off_ = 0;

    LocalDeserialize(const DataT& data);

    // Operators
    template <typename T>
    LocalDeserialize& operator>>(T& obj);         // Stream-style load

    template <typename T>
    LocalDeserialize& operator&(T& obj);           // Generic load

    template <typename... Args>
    LocalDeserialize& operator()(Args&&... args);  // Variadic load

    // Low-level binary read
    LocalDeserialize& read_binary(char* data, size_t size);
};
```

## Supported Types

LocalSerialize automatically handles the following types:

| Type Category | Examples | Serialization Method |
|---------------|----------|---------------------|
| Arithmetic | `int`, `float`, `double`, `bool`, `char`, `size_t` | Direct binary copy |
| Enums | Any `enum` / `enum class` | Serialized as underlying type |
| `std::string` | | Size-prefixed byte array |
| `std::vector<T>` | `vector<int>`, `vector<string>` | Size-prefixed, elements serialized recursively |
| `std::list<T>` | `list<int>` | Size-prefixed, elements serialized recursively |
| `std::unordered_map<K,V>` | `unordered_map<int,int>` | Size-prefixed key-value pairs |
| Nested containers | `vector<vector<int>>` | Recursive serialization |
| Custom types | User-defined classes | Via `serialize()`, `save()`/`load()` methods |

### Arithmetic type optimization

For `std::vector<T>` where `T` is arithmetic (e.g., `vector<int>`, `vector<double>`), the entire data block is written/read as a single `memcpy` call for performance, rather than element-by-element.

## Custom Type Serialization

There are four ways to make a custom type serializable. LocalSerialize checks them in this order:

### 1. Free `serialize()` function

```cpp
#include <clio_ctp/data_structures/serialization/local_serialize.h>
#include <string>
#include <vector>

struct MyStruct {
  int x;
  std::string name;
};

// Free serialize() found via argument-dependent lookup.
template <typename Ar>
void serialize(Ar& ar, MyStruct& obj) {
  ar & obj.x;
  ar & obj.name;
}

void example() {
  MyStruct obj{42, "hello"};

  std::vector<char> buffer;
  ctp::ipc::LocalSerialize<> serializer(buffer);
  serializer << obj;

  MyStruct restored;
  ctp::ipc::LocalDeserialize<> deserializer(buffer);
  deserializer >> restored;
}
```

### 2. Free `save()`/`load()` functions

```cpp
#include <clio_ctp/data_structures/serialization/local_serialize.h>
#include <string>
#include <vector>

struct MyStruct {
  int x;
  std::string name;
};

// Free save()/load() pair found via argument-dependent lookup.
template <typename Ar>
void save(Ar& ar, const MyStruct& obj) {
  ar << obj.x << obj.name;
}

template <typename Ar>
void load(Ar& ar, MyStruct& obj) {
  ar >> obj.x >> obj.name;
}

void example() {
  MyStruct obj{42, "hello"};

  std::vector<char> buffer;
  ctp::ipc::LocalSerialize<> serializer(buffer);
  serializer << obj;

  MyStruct restored;
  ctp::ipc::LocalDeserialize<> deserializer(buffer);
  deserializer >> restored;
}
```

### 3. Member `serialize()` method

```cpp
#include <clio_ctp/data_structures/serialization/local_serialize.h>
#include <string>
#include <vector>

struct MyStruct {
  int x;
  std::string name;

  template <typename Ar>
  void serialize(Ar& ar) {
    ar(x, name);
  }
};

void example() {
  MyStruct obj;
  obj.x = 42;
  obj.name = "hello";

  std::vector<char> buffer;
  ctp::ipc::LocalSerialize<> serializer(buffer);
  serializer << obj;

  MyStruct restored;
  ctp::ipc::LocalDeserialize<> deserializer(buffer);
  deserializer >> restored;
}
```

### 4. Member `save()`/`load()` methods

```cpp
#include <clio_ctp/data_structures/serialization/local_serialize.h>
#include <string>
#include <vector>

struct MyStruct {
  int x;
  std::string name;

  template <typename Ar>
  void save(Ar& ar) const {
    ar << x << name;
  }

  template <typename Ar>
  void load(Ar& ar) {
    ar >> x >> name;
  }
};

void example() {
  MyStruct obj;
  obj.x = 42;
  obj.name = "hello";

  std::vector<char> buffer;
  ctp::ipc::LocalSerialize<> serializer(buffer);
  serializer << obj;

  MyStruct restored;
  ctp::ipc::LocalDeserialize<> deserializer(buffer);
  deserializer >> restored;
}
```

## Type Traits

You can detect at compile time whether a type is serializable:

```cpp
#include <clio_ctp/data_structures/serialization/local_serialize.h>

void example() {
  // True if T can be serialized by archive type Ar
  static_assert(
      ctp::ipc::is_serializeable_v<ctp::ipc::LocalSerialize<>, int>);
}
```

The `is_loading` and `is_saving` type traits distinguish serialization direction:

```cpp
#include <clio_ctp/data_structures/serialization/local_serialize.h>

void example() {
  // LocalSerialize:  is_saving = true,  is_loading = false
  static_assert(ctp::ipc::LocalSerialize<>::is_saving::value);
  static_assert(!ctp::ipc::LocalSerialize<>::is_loading::value);
  // LocalDeserialize: is_saving = false, is_loading = true
  static_assert(ctp::ipc::LocalDeserialize<>::is_loading::value);
  static_assert(!ctp::ipc::LocalDeserialize<>::is_saving::value);
}
```

## Examples

### Basic Arithmetic Serialization

```cpp
#include <clio_ctp/data_structures/serialization/local_serialize.h>
#include <vector>
#include <cassert>

void example() {
  int original = 42;

  // Serialize
  std::vector<char> buffer;
  ctp::ipc::LocalSerialize<> serializer(buffer);
  serializer << original;

  // Deserialize
  int restored = 0;
  ctp::ipc::LocalDeserialize<> deserializer(buffer);
  deserializer >> restored;

  assert(restored == 42);
}
```

### Multiple Values

```cpp
#include <clio_ctp/data_structures/serialization/local_serialize.h>
#include <string>
#include <vector>
#include <cassert>

void example() {
  int val1 = 10;
  double val2 = 3.14;
  std::string val3 = "hello";

  // Serialize using operator()
  std::vector<char> buffer;
  ctp::ipc::LocalSerialize<> serializer(buffer);
  serializer(val1, val2, val3);

  // Deserialize using operator()
  int r1; double r2; std::string r3;
  ctp::ipc::LocalDeserialize<> deserializer(buffer);
  deserializer(r1, r2, r3);

  assert(r1 == 10);
  assert(r2 == 3.14);
  assert(r3 == "hello");
}
```

### Containers

```cpp
#include <clio_ctp/data_structures/serialization/local_serialize.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <cassert>

void example() {
  std::vector<int> vec = {1, 2, 3, 4, 5};
  std::unordered_map<std::string, std::string> map = {
      {"key1", "value1"}, {"key2", "value2"}
  };

  // Serialize
  std::vector<char> buffer;
  ctp::ipc::LocalSerialize<> serializer(buffer);
  serializer << vec << map;

  // Deserialize
  std::vector<int> rvec;
  std::unordered_map<std::string, std::string> rmap;
  ctp::ipc::LocalDeserialize<> deserializer(buffer);
  deserializer >> rvec >> rmap;

  assert(rvec.size() == 5);
  assert(rmap["key1"] == "value1");
}
```

### Custom Struct

```cpp
#include <clio_ctp/data_structures/serialization/local_serialize.h>
#include <string>
#include <vector>
#include <cassert>

class RequestMeta {
 public:
  int request_id;
  std::string operation;
  std::vector<int> data_sizes;

  template <typename Ar>
  void serialize(Ar& ar) {
    ar(request_id, operation, data_sizes);
  }
};

void example() {
  RequestMeta original;
  original.request_id = 42;
  original.operation = "write";
  original.data_sizes = {1024, 2048, 4096};

  // Serialize
  std::vector<char> buffer;
  ctp::ipc::LocalSerialize<> serializer(buffer);
  serializer << original;

  // Deserialize
  RequestMeta restored;
  ctp::ipc::LocalDeserialize<> deserializer(buffer);
  deserializer >> restored;

  assert(restored.request_id == 42);
  assert(restored.operation == "write");
  assert(restored.data_sizes.size() == 3);
}
```

## Cereal Compatibility

When `CTP_ENABLE_CEREAL` is defined, LocalSerialize can also handle `cereal::BinaryData<T>` wrappers for raw binary data blocks. This allows types that use cereal's binary data API to work transparently with LocalSerialize.

## Error Handling

`LocalDeserialize::read_binary()` checks for out-of-bounds reads. If a read would exceed the buffer size, it logs an error and returns without modifying the output buffer:

```
LocalDeserialize::read_binary: Attempted to read beyond end of data
```

## Related Documentation

- [Lightbeam Networking Guide](./lightbeam_networking_guide) - LocalSerialize is used by the SHM transport backend

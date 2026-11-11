---
sidebar_position: 3
---

# String Guide

## Overview

**Source:** `clio_ctp/data_structures/priv/string.h`

An SSO (Short String Optimization) string for private memory. Short strings (fewer than `SSOSize` bytes) are stored inline without heap allocation; longer strings allocate from the supplied allocator. The type is the template `ctp::priv::basic_string<T, AllocT, SSOSize>`; the alias `ctp::priv::string<AllocT, SSOSize>` fixes `T = char`.

## Usage

Every string holds a pointer to an allocator (`AllocT*`) that satisfies the
library allocator interface (`AllocateObjs`, `Allocate`, `Free` returning
`ctp::ipc::FullPtr`). The example below defines a minimal malloc-backed
allocator — the same one used by the unit tests — and uses the
`ctp::priv::string` alias.

```cpp
#include <clio_ctp/data_structures/priv/string.h>
#include <string>
#include <cstdlib>

// Minimal heap allocator satisfying the library allocator interface
// (matches SimpleHeapAllocator in test_priv_string.cc).
class SimpleHeapAllocator {
 public:
  template <typename T>
  ctp::ipc::FullPtr<T> AllocateObjs(size_t count) {
    return Allocate<T>(count * sizeof(T));
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
  SimpleHeapAllocator alloc;
  using String = ctp::priv::string<SimpleHeapAllocator>;

  // Construction (allocator is passed explicitly)
  String s1(&alloc, "hello");
  String s2(&alloc, std::string("world"));
  String s3(s1);  // Copy

  // Standard string API
  s1.append(" world");
  s1 += "!";
  size_t pos = s1.find("world");        // 6
  String sub = s1.substr(0, 5);          // "hello"
  bool eq = (s1 == s3);

  // Access
  const char* cstr = s1.c_str();
  char ch = s1[0];                       // 'h'
  size_t len = s1.size();

  // Conversion to std::string
  std::string std_str = s1.str();
  std::string std_str2 = std::string(s1);
  (void)pos; (void)eq; (void)cstr; (void)ch; (void)len;
}
```

## Template Parameters

- `T` - Character type (default: `char`)
- `AllocT` - Allocator type
- `SSOSize` - Short string buffer size (default: 32 bytes)

## Key Features

- Short strings (fewer than `SSOSize` bytes) stored inline without heap allocation
- Longer strings allocate from the supplied `AllocT` allocator
- Large subset of the `std::string` API: `find`, `substr`, `replace`, `erase`, `compare`, `starts_with`, `ends_with`
- Annotated with `CTP_CROSS_FUN` for GPU compatibility
- Serialization support via `save()`/`load()`

**Type Alias:** `ctp::priv::string<AllocT, SSOSize>` is a convenience alias for `ctp::priv::basic_string<char, AllocT, SSOSize>`. There is no allocator-free `ctp::string` type — an allocator template argument is always required.

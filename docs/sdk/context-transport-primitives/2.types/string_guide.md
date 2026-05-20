---
sidebar_position: 3
---

# String Guide

## Overview

**Source:** `hermes_shm/data_structures/priv/string.h`

An SSO (Short String Optimization) string backed by `ctp::priv::vector`. Short strings (32 bytes or fewer) are stored inline without heap allocation.

## Usage

```cpp
#include <hermes_shm/data_structures/priv/string.h>

// Construction
ctp::string s1("hello");
ctp::string s2(std::string("world"));
ctp::string s3(s1);  // Copy

// Standard string API
s1.append(" world");
s1 += "!";
size_t pos = s1.find("world");
ctp::string sub = s1.substr(0, 5);
bool eq = (s1 == s2);

// Access
const char* cstr = s1.c_str();
char ch = s1[0];
size_t len = s1.size();

// Conversion to/from std::string
std::string std_str = s1.str();
std::string std_str2 = static_cast<std::string>(s1);
```

## Template Parameters

- `T` - Character type (default: `char`)
- `AllocT` - Allocator type
- `SSOSize` - Short string buffer size (default: 32 bytes)

## Key Features

- Short strings (32 bytes or fewer) stored inline without heap allocation
- Longer strings use `ctp::priv::vector` as backing store
- Full `std::string`-compatible API: `find`, `substr`, `replace`, `starts_with`, `ends_with`
- Annotated with `CTP_CROSS_FUN` for GPU compatibility
- Serialization support via `save()`/`load()`

**Type Alias:** `ctp::string` is a convenience alias for `ctp::priv::basic_string<char>`.

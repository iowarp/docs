# Logging Guide

This guide covers the `HLOG` logging macro provided by the Context Transport
Primitives (CTP) `clio_ctp/util/logging.h` header for structured logging and
error reporting, along with the companion `HIPRINT` macro for plain output.

## Overview

CTP exposes a single unified logging macro:

- `HLOG(LOG_CODE, format_string, ...args)`: emits a log record at the given
  level, prefixed with the source location, level name, thread id, and function
  name. The level (`kInfo`, `kError`, `kFatal`, etc.) selects both the routing
  (stdout vs stderr) and the compile-time/runtime filtering.

A second macro, `HIPRINT(format_string, ...args)`, prints a formatted line to
stdout with no level, location, or filtering — useful for tool/benchmark output.

Both macros dispatch through the `ctp::Logger` singleton (`CTP_LOG`) and use the
brace-style `{}` formatting provided by `ctp::Formatter` (not printf `%`
specifiers). Logging is thread-safe.

## Log Levels

The system defines several predefined log levels as macros (lower value = more
verbose):

| Level      | Code | Description                          | Output |
|------------|------|--------------------------------------|--------|
| `kDebug`   | 0    | Low-priority debugging information   | stdout |
| `kInfo`    | 1    | Useful information the user should know | stdout |
| `kSuccess` | 2    | Operation completed successfully     | stdout |
| `kWarning` | 3    | Something might be wrong             | stderr |
| `kError`   | 4    | A non-fatal error has occurred       | stderr |
| `kFatal`   | 5    | A fatal error (causes program exit)  | stderr |

Messages whose `LOG_CODE` is below the compile-time threshold `CTP_LOG_LEVEL`
(default `kInfo`) are compiled out entirely; the rest are additionally subject
to runtime filtering.

## Informational Logging

### Syntax
```text
HLOG(kInfo, format_string, ...args)
```

### Purpose
Logs informational messages at the `kInfo` level. These messages are displayed
on stdout and provide useful information to users about program execution.

### Parameters
- `LOG_CODE`: The log level (here `kInfo`); selects routing and filtering
- `format_string`: Brace-style (`{}`) format string formatted by `ctp::Formatter`
- `...args`: Arguments substituted into the `{}` placeholders

### Output Format
```
filepath:line LEVEL thread_id function_name message
```

### Examples

#### Basic Information Logging
```cpp
#include "clio_ctp/util/logging.h"
#include "clio_ctp/util/singleton.h"

void example() {
  HLOG(kInfo, "Server started on port {}", 8080);
  // Output: /path/to/file.cc:45 INFO 12345 example Server started on port 8080
}
```

#### Performance Metrics
```cpp
#include <string>
#include "clio_ctp/util/logging.h"
#include "clio_ctp/util/singleton.h"

void example() {
  std::string test_name = "test_malloc";
  std::string alloc_type = "malloc";
  size_t obj_size = 1024;
  double msec = 50.0;
  int nthreads = 4;
  size_t count = 1000000;
  double kops = 20000.0;
  HLOG(kInfo, "{},{},{},{},{},{} ms,{} KOps",
       test_name, alloc_type, obj_size, msec, nthreads, count, kops);
}
```

#### Debug Logging (Debug Builds Only)
`kDebug` records are compiled out unless `CTP_LOG_LEVEL` is lowered to `kDebug`:
```cpp
#include <string>
#include "clio_ctp/util/logging.h"
#include "clio_ctp/util/singleton.h"

void example() {
  std::string owner = "thread_123";
  HLOG(kDebug, "Acquired read lock for {}", owner);
}
```

#### Status Messages
```cpp
#include "clio_ctp/util/logging.h"
#include "clio_ctp/util/singleton.h"

void example() {
  HLOG(kInfo, "Lz4: output buffer is potentially too small");
  HLOG(kInfo, "test_name,alloc_type,obj_size,msec,nthreads,count,KOps");
}
```

## Error Logging

### Syntax
```text
HLOG(kError, format_string, ...args)   // or kWarning / kFatal
```

### Purpose
Logs problems at the `kWarning`, `kError`, or `kFatal` level. These messages are
displayed on stderr. A `kFatal` record terminates the program (`exit(1)`) after
it is written.

### Parameters
- `LOG_CODE`: Error level (`kWarning`, `kError`, or `kFatal`)
- `format_string`: Brace-style (`{}`) format string formatted by `ctp::Formatter`
- `...args`: Arguments substituted into the `{}` placeholders

### Output Format
```
filepath:line LEVEL thread_id function_name message
```

### Examples

#### Fatal Errors (Program Termination)
```cpp
#include <exception>
#include "clio_ctp/util/logging.h"
#include "clio_ctp/util/singleton.h"

void example() {
  try {
    // ... work that may throw ...
  } catch (const std::exception &e) {
    HLOG(kFatal, "Exception: {}", e.what());
    // Output: /path/to/file.cc:63 FATAL 12345 example Exception: ...
    // Program exits after this message
  }
}
```

#### Non-Fatal Errors
```cpp
#include <string>
#include "clio_ctp/util/logging.h"
#include "clio_ctp/util/singleton.h"

void example() {
  std::string err_buf = "Permission denied";
  HLOG(kError, "shm_open failed: {}", err_buf);
  // Output: /path/to/file.cc:66 ERROR 12345 example shm_open failed: Permission denied

  HLOG(kError, "Failed to generate key");
}
```

#### System/Hardware Errors
Device backends typically expose an integer error code plus a string description;
log both, guarding the string against `nullptr`:
```cpp
#include "clio_ctp/util/logging.h"
#include "clio_ctp/util/singleton.h"

void example() {
  int device_err = 2;
  const char *err_str = "out of memory";
  HLOG(kError, "GpuLinker::Link: cuInit failed ({}): {}",
       device_err, err_str ? err_str : "unknown");
}
```

## Additional Features

### Plain Output with HIPRINT
For messages that do not need a level, source location, or filtering, use
`HIPRINT`, which prints a single formatted line to stdout:
```cpp
#include <string>
#include "clio_ctp/util/logging.h"
#include "clio_ctp/util/singleton.h"

void example() {
  std::string status = "ready";
  HIPRINT("Status update: {}", status);
}
```

### Environment Configuration

#### Runtime Log Level
Set `CTP_LOG_LEVEL` to raise or lower the runtime threshold. It accepts either a
numeric code or a level name (case-insensitive). Records below the threshold are
suppressed:
```bash
export CTP_LOG_LEVEL=debug   # show everything from kDebug up
export CTP_LOG_LEVEL=4        # show only kError and kFatal
```

#### Log File Output
Set `CTP_LOG_OUT` to also write logs (without ANSI color codes) to a file:
```bash
export CTP_LOG_OUT="/tmp/clio_ctp.log"
```

### Compile-Time Threshold
- `CTP_LOG_LEVEL` is also a compile-time macro (default `kInfo`). Any `HLOG`
  whose `LOG_CODE` is below it is removed by the preprocessor/`if constexpr`
  and has zero runtime cost.
- In a default build, `kDebug` (0) is below the `kInfo` (1) threshold, so debug
  logs are compiled out. Lower `CTP_LOG_LEVEL` to `kDebug` to enable them.

## Best Practices

1. **Use appropriate log levels**:
   - `HLOG(kInfo, ...)` for normal operational messages
   - `HLOG(kError, ...)` for recoverable errors
   - `HLOG(kFatal, ...)` for unrecoverable errors that should terminate the program

2. **Include context in error messages**:
   ```cpp
   #include <cerrno>
   #include <cstring>
   #include "clio_ctp/util/logging.h"
   #include "clio_ctp/util/singleton.h"

   void example() {
     size_t size = 4096;
     HLOG(kError, "Failed to allocate {} bytes: {}", size, std::strerror(errno));
   }
   ```

3. **Format structured data consistently**:
   ```cpp
   #include <string>
   #include "clio_ctp/util/logging.h"
   #include "clio_ctp/util/singleton.h"

   void example() {
     std::string op_name = "write";
     double duration = 12.5;
     std::string status = "ok";
     HLOG(kInfo, "operation={},duration_ms={},status={}",
          op_name, duration, status);
   }
   ```

4. **Avoid logging in tight loops** - the formatting cost is paid on every call
   that passes the level check.

## Thread Safety

The logging system is thread-safe and automatically includes thread IDs in log
output, making it suitable for multi-threaded applications.

## Performance Considerations

- Log messages are formatted only when the log level passes the runtime check
- Records below the runtime `CTP_LOG_LEVEL` are skipped before formatting
- Records below the compile-time `CTP_LOG_LEVEL` have zero overhead in release
  builds because they are removed at compile time

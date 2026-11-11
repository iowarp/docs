# Singleton Utilities Guide

## Overview

The Singleton Utilities API in Hermes Shared Memory (HSHM) provides multiple singleton patterns optimized for different use cases, including thread safety, cross-device compatibility, and performance requirements. These utilities enable global state management across complex applications and shared memory systems.

## Singleton Variants

### Basic Singleton (Thread-Safe)

```cpp
#include <string>

#include "clio_ctp/util/singleton.h"

struct MyStruct {
  std::string string_;
  int int_ = 0;
};

void example() {
  // Thread-safe singleton access: MyStruct is constructed on the first call
  // and the same instance is returned on every subsequent call.
  MyStruct *config = ctp::Singleton<MyStruct>::GetInstance();
  config->string_ = "localhost:5432";
  config->int_ = 100;

  // A second access (e.g. from another thread) returns the same instance.
  MyStruct *same = ctp::Singleton<MyStruct>::GetInstance();
  same->int_ = 200;
}
```

### Lockfree Singleton (High Performance)

```cpp
#include <atomic>
#include <cstddef>

#include "clio_ctp/util/singleton.h"

struct MetricsCollector {
  std::atomic<size_t> counter_{0};

  void Increment() { counter_.fetch_add(1, std::memory_order_relaxed); }
  size_t GetCount() const { return counter_.load(std::memory_order_relaxed); }
};

void example() {
  // High-performance singleton without locking overhead. Use only with a
  // type that is itself thread-safe (here, an atomic counter).
  MetricsCollector *metrics =
      ctp::LockfreeSingleton<MetricsCollector>::GetInstance();
  metrics->Increment();  // Very fast, no locks
}
```

### Cross-Device Singleton

```cpp
#include <cstdio>

#include "clio_ctp/util/singleton.h"

struct GPUManager {
  int device_count = 0;
};

// Works on both host and device code.
CTP_CROSS_FUN
void example() {
  GPUManager *gpu_mgr = ctp::CrossSingleton<GPUManager>::GetInstance();
  printf("Found %d GPU devices\n", gpu_mgr->device_count);

  // Lockfree variant for device kernels: access without locking overhead.
  GPUManager *fast = ctp::LockfreeCrossSingleton<GPUManager>::GetInstance();
  (void)fast;
}
```

### Global Singleton (Eager Initialization)

```cpp
#include <string>

#include "clio_ctp/util/singleton.h"

struct Logger {
  std::string last_message_;

  void Log(const std::string &message) { last_message_ = message; }
};

// GlobalSingleton<T> holds a static T that is constructed during program
// initialization, so the instance already exists before first use.
Logger *g_logger = ctp::GlobalSingleton<Logger>::GetInstance();

void example() {
  // Logger already exists and is ready.
  ctp::GlobalSingleton<Logger>::GetInstance()->Log("Function called");
}
```

### Platform-Aware Global Singleton

```cpp
#include <string>

#include "clio_ctp/util/singleton.h"

struct NetworkManager {
  std::string local_hostname = "localhost";
};

// GlobalCrossSingleton<T> automatically chooses the best implementation for
// the platform: a GlobalSingleton on the host, a LockfreeCrossSingleton on
// the device.
CTP_CROSS_FUN
void example() {
  NetworkManager *net_mgr =
      ctp::GlobalCrossSingleton<NetworkManager>::GetInstance();
  (void)net_mgr->local_hostname;
}
```

## C-Style Global Variable Singletons

### Basic Global Variables

```cpp
#include <string>

#include "clio_ctp/util/singleton.h"

struct DatabaseConfig {
  std::string connection_string_;
  int max_connections_ = 0;
};

// Header declaration (place in a .h):
CTP_DEFINE_GLOBAL_VAR_H(DatabaseConfig, g_db_config);

// Source-file definition (place in exactly one .cc):
CTP_DEFINE_GLOBAL_VAR_CC(DatabaseConfig, g_db_config);

// Usage
void example() {
  DatabaseConfig *config = CTP_GET_GLOBAL_VAR(DatabaseConfig, g_db_config);
  config->connection_string_ = "prod:5432";
  config->max_connections_ = 500;
}
```

### Cross-Platform Global Variables

```cpp
#include <cstddef>

#include "clio_ctp/util/singleton.h"

struct SharedMemoryPool {
  size_t pool_size_ = 0;
  void *memory_base_ = nullptr;
};

// Header - works on host and device:
CTP_DEFINE_GLOBAL_CROSS_VAR_H(SharedMemoryPool, g_memory_pool);

// Source file:
CTP_DEFINE_GLOBAL_CROSS_VAR_CC(SharedMemoryPool, g_memory_pool);

// Usage in cross-platform code
CTP_CROSS_FUN
void example() {
  SharedMemoryPool *pool =
      CTP_GET_GLOBAL_CROSS_VAR(SharedMemoryPool, g_memory_pool);
  (void)pool;
}
```

### Pointer-Based Global Variables

```cpp
#include <string>

#include "clio_ctp/util/singleton.h"

struct TaskScheduler {
  std::string name_;
  bool running_ = true;
};

// Header - pointer version for lazy initialization:
CTP_DEFINE_GLOBAL_PTR_VAR_H(TaskScheduler, g_task_scheduler);

// Source file:
CTP_DEFINE_GLOBAL_PTR_VAR_CC(TaskScheduler, g_task_scheduler);

// Usage - the instance is automatically created on first access.
void example() {
  TaskScheduler *scheduler =
      CTP_GET_GLOBAL_PTR_VAR(TaskScheduler, g_task_scheduler);
  scheduler->running_ = false;
}
```

### Cross-Platform Pointer Variables

```cpp
#include <cstddef>

#include "clio_ctp/util/singleton.h"

struct DeviceMemoryManager {
  size_t total_memory_ = 0;
  size_t available_memory_ = 0;
};

// Header:
CTP_DEFINE_GLOBAL_CROSS_PTR_VAR_H(DeviceMemoryManager, g_device_memory);

// Source file:
CTP_DEFINE_GLOBAL_CROSS_PTR_VAR_CC(DeviceMemoryManager, g_device_memory);

// Cross-platform usage
CTP_CROSS_FUN
void example() {
  DeviceMemoryManager *mgr =
      CTP_GET_GLOBAL_CROSS_PTR_VAR(DeviceMemoryManager, g_device_memory);
  (void)mgr;
}
```

## Macro Wrappers for Global Variable Singletons

### Simplifying Access with Macros

For frequently used singletons, create convenient macro wrappers to reduce code verbosity and provide cleaner API access:

```cpp
#include "clio_ctp/util/singleton.h"

// Define convenient macros for common singletons
#define DATABASE_CONFIG ctp::Singleton<DatabaseConfig>::GetInstance()
#define METRICS_COLLECTOR ctp::LockfreeSingleton<MetricsCollector>::GetInstance()
#define GPU_MANAGER ctp::CrossSingleton<GPUManager>::GetInstance()
#define LOGGER ctp::GlobalSingleton<Logger>::GetInstance()
#define NETWORK_MANAGER ctp::GlobalCrossSingleton<NetworkManager>::GetInstance()

// Global variable style macros
#define MEMORY_POOL CTP_GET_GLOBAL_VAR(SharedMemoryPool, g_memory_pool)
#define TASK_SCHEDULER CTP_GET_GLOBAL_PTR_VAR(TaskScheduler, g_task_scheduler)
#define DEVICE_MEMORY \
  CTP_GET_GLOBAL_CROSS_PTR_VAR(DeviceMemoryManager, g_device_memory)
```

### Usage Examples with Macros

**Before** - Verbose singleton access:
```cpp
#include <cstddef>
#include <string>

#include "clio_ctp/util/singleton.h"

struct DatabaseConfig {
  std::string connection_string_;
  int max_connections_ = 0;
  void Configure(const std::string &host, int max_conn) {
    connection_string_ = host;
    max_connections_ = max_conn;
  }
};
struct MetricsCollector {
  size_t count_ = 0;
  void Increment() { ++count_; }
};
struct Logger {
  std::string last_message_;
  void Log(const std::string &msg) { last_message_ = msg; }
};
struct GPUManager {
  int device_count = 0;
};
struct NetworkManager {
  std::string local_hostname;
};

void example() {
  // Verbose and repetitive: the fully-qualified type is repeated everywhere.
  ctp::Singleton<DatabaseConfig>::GetInstance()->Configure("prod:5432", 500);
  ctp::LockfreeSingleton<MetricsCollector>::GetInstance()->Increment();
  ctp::GlobalSingleton<Logger>::GetInstance()->Log("System configured");

  // Long variable declarations
  auto *gpu_mgr = ctp::CrossSingleton<GPUManager>::GetInstance();
  auto *net_mgr = ctp::GlobalCrossSingleton<NetworkManager>::GetInstance();
  (void)gpu_mgr;
  (void)net_mgr;
}
```

**After** - Clean macro access:
```cpp
#include <string>

#include "clio_ctp/util/singleton.h"

struct DatabaseConfig {
  void Configure(const std::string &, int) {}
};
struct MetricsCollector {
  void Increment() {}
};
struct Logger {
  void Log(const std::string &) {}
};
struct GPUManager {
  int device_count = 0;
};
struct NetworkManager {
  std::string local_hostname;
};

// Define the access macros once...
#define DATABASE_CONFIG ctp::Singleton<DatabaseConfig>::GetInstance()
#define METRICS_COLLECTOR ctp::LockfreeSingleton<MetricsCollector>::GetInstance()
#define LOGGER ctp::GlobalSingleton<Logger>::GetInstance()
#define GPU_MANAGER ctp::CrossSingleton<GPUManager>::GetInstance()
#define NETWORK_MANAGER ctp::GlobalCrossSingleton<NetworkManager>::GetInstance()

void example() {
  // Clean and concise
  DATABASE_CONFIG->Configure("prod:5432", 500);
  METRICS_COLLECTOR->Increment();
  LOGGER->Log("System configured");

  // Short, readable access
  (void)GPU_MANAGER->device_count;
  (void)NETWORK_MANAGER->local_hostname;
}
```

### Recommended Macro Naming Conventions

```cpp
#include "clio_ctp/util/singleton.h"

// 1. SCREAMING_SNAKE_CASE for singleton instances
#define CONFIG_MANAGER ctp::Singleton<ConfigManager>::GetInstance()
#define CACHE_MANAGER ctp::LockfreeSingleton<CacheManager>::GetInstance()

// 2. Prefix with component name for large applications
#define DB_CONNECTION_POOL ctp::Singleton<ConnectionPool>::GetInstance()
#define DB_QUERY_CACHE ctp::LockfreeSingleton<QueryCache>::GetInstance()

// 3. Use descriptive names that match functionality
#define THREAD_POOL ctp::GlobalSingleton<ThreadPoolManager>::GetInstance()
#define ERROR_REPORTER ctp::CrossSingleton<ErrorReporter>::GetInstance()

// 4. For global variables, match the variable name pattern
#define SHARED_BUFFER CTP_GET_GLOBAL_VAR(SharedBuffer, g_shared_buffer)
#define TEMP_ALLOCATOR CTP_GET_GLOBAL_PTR_VAR(TempAllocator, g_temp_alloc)
```

### Advanced Macro Patterns

**Conditional Access Macros:**
```cpp
#include "clio_ctp/util/singleton.h"

// Macro with null check for optional singletons
#define SAFE_LOGGER (LOGGER ? LOGGER : &null_logger_instance)

// Debug-only singleton access
#ifdef DEBUG
#define DEBUG_PROFILER ctp::Singleton<Profiler>::GetInstance()
#else
#define DEBUG_PROFILER (&null_profiler_instance)
#endif
```

**Functional Macros:**
```cpp
#include "clio_ctp/util/singleton.h"

// Macro that performs common operations
#define LOG_INFO(msg) LOGGER->Log(LogLevel::kInfo, msg)
#define LOG_ERROR(msg) LOGGER->Log(LogLevel::kError, msg)
#define INCREMENT_COUNTER(name) METRICS_COLLECTOR->IncrementCounter(name)
#define RECORD_LATENCY(name, duration) \
  METRICS_COLLECTOR->RecordLatency(name, duration)
```

**Type-Safe Wrapper Macros:**
```cpp
#include "clio_ctp/util/singleton.h"

// Wrapper with type checking
#define GET_CONFIG(type) \
  (static_cast<type *>(ctp::Singleton<ConfigRegistry>::GetInstance()->Get(#type)))

// Usage: auto* db_cfg = GET_CONFIG(DatabaseConfig);
```

### Best Practices for Singleton Macros

1. **Consistency**: Use the same naming convention across your entire codebase
2. **Documentation**: Document what each macro expands to and its thread safety guarantees
3. **Scope**: Place macro definitions in a central header file included by all modules
4. **Namespace**: Consider using a prefix to avoid naming conflicts
5. **Type Safety**: Ensure macros maintain type safety and don't hide important type information
6. **Debugging**: Make macros debugger-friendly - avoid complex expressions
7. **Performance**: Use appropriate singleton type (lockfree vs thread-safe) based on usage patterns

### Header File Organization

```cpp
// singletons.h - Central singleton definitions
#ifndef PROJECT_SINGLETONS_H
#define PROJECT_SINGLETONS_H

#include "clio_ctp/util/singleton.h"
// Project headers that declare the singleton payload types:
// #include "config/config_manager.h"
// #include "metrics/metrics_collector.h"
// #include "logging/logger.h"

// Define all singleton access macros
#define CONFIG_MANAGER ctp::Singleton<ConfigManager>::GetInstance()
#define METRICS_COLLECTOR ctp::LockfreeSingleton<MetricsCollector>::GetInstance()
#define APP_LOGGER ctp::GlobalSingleton<Logger>::GetInstance()

// Functional convenience macros
#define LOG_INFO_MSG(msg) APP_LOGGER->Info(msg)
#define LOG_ERROR_MSG(msg) APP_LOGGER->Error(msg)
#define COUNT(metric) METRICS_COLLECTOR->Increment(metric)

#endif  // PROJECT_SINGLETONS_H
```

## Best Practices

1. **Thread Safety**: Use `Singleton<T>` for thread-safe access, `LockfreeSingleton<T>` only with thread-safe types
2. **Cross-Platform Code**: Use `CrossSingleton<T>` and `GlobalCrossSingleton<T>` for code that runs on both host and device
3. **Python Compatibility**: Avoid standard singletons in code called by Python; use global variables instead
4. **Eager vs Lazy**: Use `GlobalSingleton<T>` for resources needed at startup, regular singletons for lazy initialization
5. **Resource Management**: Implement proper destructors and cleanup in singleton classes
6. **Configuration**: Use singletons for application-wide configuration and settings
7. **Performance**: Use lockfree variants in performance-critical paths with appropriate atomic types
8. **Memory Management**: Be aware that singletons live for the entire program duration
9. **Testing**: Design singleton classes to be testable by allowing dependency injection where possible
10. **Documentation**: Document singleton lifetime and thread safety guarantees for each singleton class
11. **Macro Wrappers**: Create convenient macro wrappers for frequently accessed singletons to improve code readability
12. **Naming Conventions**: Use consistent SCREAMING_SNAKE_CASE naming for singleton access macros
```

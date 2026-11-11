# System Introspection Guide

## Overview

The System Introspection API in Hermes Shared Memory (HSHM) provides cross-platform access to system resources, process information, and hardware capabilities. This guide covers the `SystemInfo` class and its comprehensive system discovery features.

## Accessing SystemInfo

```cpp
#include "clio_ctp/introspect/system_info.h"

void example() {
  // Get the singleton instance
  ctp::SystemInfo *sys_info = CTP_SYSTEM_INFO;  // Returns SystemInfo*

  // Or create your own instance
  ctp::SystemInfo local_info;

  (void)sys_info;
  (void)local_info;
}
```

## System Resource Information

### Basic System Properties

The SystemInfo class automatically discovers system properties on construction:

```cpp
#include "clio_ctp/introspect/system_info.h"
#include <cstdio>

void example() {
  ctp::SystemInfo *sys_info = CTP_SYSTEM_INFO;

  // Basic system properties (automatically refreshed on construction)
  int process_id = sys_info->pid_;          // Current process ID
  int cpu_count = sys_info->ncpu_;          // Number of CPU cores
  int page_size = sys_info->page_size_;     // Memory page size in bytes
  int user_id = sys_info->uid_;             // Current user ID (Unix)
  int group_id = sys_info->gid_;            // Current group ID (Unix)
  size_t total_ram = sys_info->ram_size_;   // Total system RAM in bytes

  printf("System Info:\n");
  printf("  PID: %d\n", process_id);
  printf("  CPUs: %d\n", cpu_count);
  printf("  Page Size: %d bytes\n", page_size);
  printf("  User/Group: %d/%d\n", user_id, group_id);
  printf("  RAM: %zu GB\n", total_ram / (1024 * 1024 * 1024));
}
```

### Static System Queries

For one-time queries without creating an instance:

```cpp
#include "clio_ctp/introspect/system_info.h"
#include <cstdio>
#include <cstddef>

void example() {
  // Static methods for system information
  int total_cpus = ctp::SystemInfo::GetCpuCount();
  int page_sz = ctp::SystemInfo::GetPageSize();
  int current_tid = ctp::SystemInfo::GetTid();               // Thread ID
  int current_pid = ctp::SystemInfo::GetPid();               // Process ID
  int current_uid = ctp::SystemInfo::GetUid();               // User ID
  int current_gid = ctp::SystemInfo::GetGid();               // Group ID
  size_t ram_bytes = ctp::SystemInfo::GetRamCapacity();

  // Display current process/thread information
  printf("Process Information:\n");
  printf("  CPUs: %d  Page Size: %d  RAM: %zu bytes\n",
         total_cpus, page_sz, ram_bytes);
  printf("  Process ID: %d\n", current_pid);
  printf("  Thread ID: %d\n", current_tid);
  printf("  User ID: %d\n", current_uid);
  printf("  Group ID: %d\n", current_gid);
}
```

### CPU Frequency Management

Query and control CPU frequencies (requires appropriate privileges for setting):

```cpp
#include "clio_ctp/introspect/system_info.h"
#include <cstdio>

void example() {
  ctp::SystemInfo *sys_info = CTP_SYSTEM_INFO;

  // Query CPU frequencies
  size_t current_freq_khz = sys_info->GetCpuFreqKhz(0);   // CPU 0 current frequency
  size_t max_freq_khz = sys_info->GetCpuMaxFreqKhz(0);    // CPU 0 maximum frequency
  size_t min_freq_khz = sys_info->GetCpuMinFreqKhz(0);    // CPU 0 minimum frequency

  // Convert to MHz for readability
  size_t max_freq_mhz = sys_info->GetCpuMaxFreqMhz(0);    // Convenience function
  size_t min_freq_mhz = sys_info->GetCpuMinFreqMhz(0);

  printf("CPU 0 Frequencies:\n");
  printf("  Current: %zu MHz\n", current_freq_khz / 1000);
  printf("  Max (KHz): %zu  Min (KHz): %zu\n", max_freq_khz, min_freq_khz);
  printf("  Range: %zu - %zu MHz\n", min_freq_mhz, max_freq_mhz);

  // Set CPU frequencies (requires root/admin privileges)
  sys_info->SetCpuFreqMhz(0, 2400);          // Set CPU 0 to 2.4 GHz
  sys_info->SetCpuFreqKhz(0, 2400000);       // Same, but in KHz
  sys_info->SetCpuMaxFreqKhz(0, 3000000);    // Set CPU 0 max to 3.0 GHz
  sys_info->SetCpuMinFreqKhz(0, 1200000);    // Set CPU 0 min to 1.2 GHz

  // Refresh all CPU frequency information
  sys_info->RefreshCpuFreqKhz();  // Updates cur_cpu_freq_ vector

  // Display all CPU frequencies
  for (int cpu = 0; cpu < sys_info->ncpu_; ++cpu) {
    printf("CPU %d: %zu MHz\n", cpu, sys_info->cur_cpu_freq_[cpu] / 1000);
  }
}
```

## Thread Management

### Thread Control

```cpp
#include "clio_ctp/introspect/system_info.h"
#include <cstdint>
#include <string>

void example() {
  // Yield the current thread to the scheduler.
  ctp::SystemInfo::YieldThread();

  // Set a human-readable name for the calling thread (best-effort).
  ctp::SystemInfo::SetCurrentThreadName(std::string("worker-0"));

  // Sleep at the platform's best available precision (microseconds).
  ctp::SystemInfo::SleepForUs(100);

  // Total CPU time (user + kernel) consumed by the calling thread, in ns.
  uint64_t cpu_ns = ctp::SystemInfo::ThreadCpuTimeNs();
  (void)cpu_ns;
}
```

### Thread-Local Storage (TLS)

```cpp
#include "clio_ctp/introspect/system_info.h"
#include "clio_ctp/thread/thread_model/thread_model.h"
#include <cstdio>
#include <cstddef>

// Define a thread-specific data structure.
struct ThreadData {
  int thread_id;
  size_t processed_items;
  char buffer[1024];
};

void example() {
  ThreadData thread_data;
  thread_data.thread_id = ctp::SystemInfo::GetTid();
  thread_data.processed_items = 0;

  // Create a TLS key and bind the current thread's data to it.
  ctp::ThreadLocalKey tls_key;
  if (ctp::SystemInfo::CreateTls(tls_key, &thread_data)) {
    printf("TLS key created for thread %d\n", thread_data.thread_id);
  }

  // Update the value stored for the calling thread.
  ThreadData my_data;
  my_data.thread_id = ctp::SystemInfo::GetTid();
  my_data.processed_items = 0;
  ctp::SystemInfo::SetTls(tls_key, &my_data);

  // Later, retrieve the thread-specific data.
  ThreadData *retrieved =
      static_cast<ThreadData *>(ctp::SystemInfo::GetTls(tls_key));
  if (retrieved != nullptr) {
    retrieved->processed_items++;
    printf("Thread %d processed %zu items\n", retrieved->thread_id,
           retrieved->processed_items);
  }
}
```

## Best Practices

1. **Singleton Usage**: Use `CTP_SYSTEM_INFO` for application-wide system information
2. **Error Handling**: Always check return values and handle platform differences gracefully
3. **Privilege Requirements**: CPU frequency modification requires root/admin privileges
4. **Resource Validation**: Verify system resources before allocation
5. **Platform Awareness**: Use conditional compilation for platform-specific features
6. **Performance**: Cache frequently accessed system information rather than querying repeatedly
7. **Thread Safety**: SystemInfo methods are generally thread-safe for reading
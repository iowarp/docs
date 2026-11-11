# Bitfield Types Guide

## Overview

The Bitfield Types API in Hermes Shared Memory (HSHM) provides efficient bit manipulation utilities with support for atomic operations, cross-device compatibility, and variable-length bitfields. These types enable compact storage of flags, permissions, and state information while providing convenient manipulation operations.

## Basic Bitfield Usage

### Standard Bitfield Operations

```cpp
#include "clio_ctp/types/bitfield.h"
#include <cstdint>
#include <cstdio>

void basic_bitfield_example() {
    // Create a 32-bit bitfield
    ctp::bitfield32_t flags;

    // Define some flag constants. BIT_OPT(T, n) expands to ((T)1 << n).
    constexpr uint32_t FLAG_ENABLED    = BIT_OPT(uint32_t, 0);  // Bit 0: 0x1
    constexpr uint32_t FLAG_VISIBLE    = BIT_OPT(uint32_t, 1);  // Bit 1: 0x2
    constexpr uint32_t FLAG_ACTIVE     = BIT_OPT(uint32_t, 2);  // Bit 2: 0x4
    constexpr uint32_t FLAG_PERSISTENT = BIT_OPT(uint32_t, 3);  // Bit 3: 0x8

    // Set individual bits
    flags.SetBits(FLAG_ENABLED);
    flags.SetBits(FLAG_VISIBLE);

    // Set multiple bits at once
    flags.SetBits(FLAG_ACTIVE | FLAG_PERSISTENT);

    // Any(mask) returns the matching bits (non-zero if any are set).
    if (flags.Any(FLAG_ENABLED)) {
        printf("Object is enabled\n");
    }

    // All(mask) is true only when every bit in the mask is set.
    if (flags.All(FLAG_ENABLED | FLAG_VISIBLE)) {
        printf("Object is enabled and visible\n");
    }

    // Unset specific bits
    flags.UnsetBits(FLAG_PERSISTENT);

    // Check individual bits
    bool is_active = flags.Any(FLAG_ACTIVE);
    bool is_persistent = flags.Any(FLAG_PERSISTENT);

    printf("Active: %s, Persistent: %s\n",
           is_active ? "yes" : "no",
           is_persistent ? "yes" : "no");

    // Clear all bits
    flags.Clear();

    // ALL_BITS(T) expands to ~((T)0): a mask with every bit set.
    printf("All flags cleared: %s\n",
           flags.Any(ALL_BITS(uint32_t)) ? "no" : "yes");
}
```

### Different Bitfield Sizes

```cpp
#include "clio_ctp/types/bitfield.h"
#include <cstdint>
#include <cstdio>

void bitfield_sizes_example() {
    // Different sized bitfields
    ctp::bitfield8_t   small_flags;    // 8-bit
    ctp::bitfield16_t  medium_flags;   // 16-bit
    ctp::bitfield32_t  large_flags;    // 32-bit
    ctp::bitfield64_t  huge_flags;     // 64-bit

    // Generic int-sized bitfield
    ctp::ibitfield int_flags;          // int-sized
    int_flags.SetBits(0x1);

    // Set some bits in each
    small_flags.SetBits(0x03);          // Set bits 0,1
    medium_flags.SetBits(0xFF00);       // Set bits 8-15
    large_flags.SetBits(0xAAAAAAAA);    // Alternating bits
    huge_flags.SetBits(0x123456789ABCDEFULL);

    // bits_.load() returns the underlying integer value. Cast to a matching
    // width so the printf format specifiers are portable across compilers.
    printf("8-bit:  0x%02X\n",   (unsigned)small_flags.bits_.load());
    printf("16-bit: 0x%04X\n",   (unsigned)medium_flags.bits_.load());
    printf("32-bit: 0x%08X\n",   (unsigned)large_flags.bits_.load());
    printf("64-bit: 0x%016llX\n", (unsigned long long)huge_flags.bits_.load());
}
```

### Bit Masking and Ranges

```cpp
#include "clio_ctp/types/bitfield.h"
#include <cstdint>
#include <cstdio>

void bitfield_masking_example() {
    ctp::bitfield32_t permissions;

    // Define permission masks using MakeMask(start, length).
    uint32_t read_mask  = ctp::bitfield32_t::MakeMask(0, 3);  // Bits 0-2
    uint32_t write_mask = ctp::bitfield32_t::MakeMask(3, 3);  // Bits 3-5
    uint32_t exec_mask  = ctp::bitfield32_t::MakeMask(6, 3);  // Bits 6-8
    uint32_t owner_mask = ctp::bitfield32_t::MakeMask(9, 3);  // Bits 9-11

    printf("Permission masks:\n");
    printf("Read:  0x%03X (bits 0-2)\n", (unsigned)read_mask);
    printf("Write: 0x%03X (bits 3-5)\n", (unsigned)write_mask);
    printf("Exec:  0x%03X (bits 6-8)\n", (unsigned)exec_mask);
    printf("Owner: 0x%03X (bits 9-11)\n", (unsigned)owner_mask);

    // Set permissions for user, group, others
    permissions.SetBits(read_mask | write_mask | exec_mask);  // Owner: RWX
    permissions.SetBits(read_mask << 3);                      // Group: R--
    permissions.SetBits(read_mask << 6);                      // Others: R--

    // Check specific permission groups
    bool owner_can_read = permissions.Any(read_mask);
    bool group_can_write = permissions.Any(write_mask << 3);
    bool others_can_exec = permissions.Any(exec_mask << 6);

    printf("Owner can read: %s\n", owner_can_read ? "yes" : "no");
    printf("Group can write: %s\n", group_can_write ? "yes" : "no");
    printf("Others can exec: %s\n", others_can_exec ? "yes" : "no");

    // CopyBits(field, mask) does an in-place intersection:
    //   bits_ = bits_ & (field.bits_ & mask)
    // It keeps only the bits that are set in BOTH this field and the masked
    // source. Pre-filling with ALL_BITS therefore extracts exactly the
    // masked bits of `permissions` into `new_permissions`.
    ctp::bitfield32_t new_permissions(ALL_BITS(uint32_t));
    new_permissions.CopyBits(permissions, read_mask | exec_mask);

    printf("Extracted R-X permissions: 0x%08X\n",
           (unsigned)new_permissions.bits_.load());
}
```

## Atomic Bitfield Operations

### Thread-Safe Bitfield Usage

```cpp
#include "clio_ctp/types/bitfield.h"
#include <bit>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <thread>
#include <vector>

void atomic_bitfield_example() {
    // Atomic bitfield for thread-safe operations
    ctp::abitfield32_t shared_status;

    constexpr uint32_t WORKER_READY    = BIT_OPT(uint32_t, 0);
    constexpr uint32_t WORKER_BUSY     = BIT_OPT(uint32_t, 1);
    constexpr uint32_t WORKER_DONE     = BIT_OPT(uint32_t, 2);
    constexpr uint32_t SYSTEM_SHUTDOWN = BIT_OPT(uint32_t, 31);

    const int num_workers = 4;
    std::vector<std::thread> workers;

    // Launch worker threads
    for (int i = 0; i < num_workers; ++i) {
        workers.emplace_back([&shared_status, i]() {
            // Signal this worker is ready (atomic OR via SetBits).
            shared_status.SetBits(WORKER_READY);

            // Wait until the ready flag is observed. Note the parentheses:
            // & binds looser than ==, so the mask test MUST be parenthesized.
            while ((shared_status.bits_.load() & WORKER_READY) == 0) {
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }

            // Set busy flag and do work
            shared_status.SetBits(WORKER_BUSY);
            std::this_thread::sleep_for(std::chrono::milliseconds(100 * i));
            shared_status.UnsetBits(WORKER_BUSY);

            // Signal completion
            shared_status.SetBits(WORKER_DONE);

            printf("Worker %d completed\n", i);
        });
    }

    // Monitor progress until the DONE flag is set.
    while (!shared_status.All(WORKER_DONE)) {
        uint32_t status = shared_status.bits_.load();
        // Portable population count (C++20 <bit>) instead of the GCC-only
        // __builtin_popcount. std::popcount requires an unsigned argument.
        int ready_count = std::popcount<uint32_t>(status & WORKER_READY);
        int busy_count  = std::popcount<uint32_t>(status & WORKER_BUSY);
        int done_count  = std::popcount<uint32_t>(status & WORKER_DONE);

        printf("Status - Ready: %d, Busy: %d, Done: %d\n",
               ready_count, busy_count, done_count);

        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }

    // Signal shutdown
    shared_status.SetBits(SYSTEM_SHUTDOWN);

    // Wait for all workers
    for (auto& worker : workers) {
        worker.join();
    }

    printf("All workers completed. Final status: 0x%08X\n",
           (unsigned)shared_status.bits_.load());
}
```

### Lock-Free Status Tracking

```cpp
#include "clio_ctp/types/bitfield.h"
#include <bit>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <thread>
#include <vector>

class TaskManager {
    // There is no abitfield64_t typedef; use the abitfield<T> alias directly.
    ctp::abitfield<uint64_t> task_status_;  // Track up to 64 tasks

public:
    bool StartTask(int task_id) {
        if (task_id >= 64) return false;
        
        uint64_t task_bit = BIT_OPT(uint64_t, task_id);
        
        // Check if task is already running
        if (task_status_.Any(task_bit)) {
            return false;  // Task already active
        }
        
        // Atomically set the task bit
        task_status_.SetBits(task_bit);
        return true;
    }
    
    void CompleteTask(int task_id) {
        if (task_id >= 64) return;
        
        uint64_t task_bit = BIT_OPT(uint64_t, task_id);
        task_status_.UnsetBits(task_bit);
    }
    
    bool IsTaskActive(int task_id) {
        if (task_id >= 64) return false;
        
        uint64_t task_bit = BIT_OPT(uint64_t, task_id);
        return task_status_.Any(task_bit);
    }
    
    int GetActiveTaskCount() {
        // Portable 64-bit population count (C++20 <bit>) instead of the
        // GCC-only __builtin_popcountll.
        return std::popcount<uint64_t>(task_status_.bits_.load());
    }
    
    std::vector<int> GetActiveTasks() {
        std::vector<int> active_tasks;
        uint64_t status = task_status_.bits_.load();
        
        for (int i = 0; i < 64; ++i) {
            if (status & BIT_OPT(uint64_t, i)) {
                active_tasks.push_back(i);
            }
        }
        
        return active_tasks;
    }
    
    void WaitForAllTasks() {
        while (task_status_.bits_.load() != 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
    }
};

void task_management_example() {
    TaskManager manager;
    std::vector<std::thread> workers;
    
    // Start multiple tasks
    for (int i = 0; i < 10; ++i) {
        if (manager.StartTask(i)) {
            workers.emplace_back([&manager, i]() {
                printf("Task %d started\n", i);
                
                // Simulate work
                std::this_thread::sleep_for(
                    std::chrono::milliseconds(100 + i * 50));
                
                manager.CompleteTask(i);
                printf("Task %d completed\n", i);
            });
        }
    }
    
    // Monitor progress
    while (manager.GetActiveTaskCount() > 0) {
        auto active = manager.GetActiveTasks();
        printf("Active tasks: ");
        for (int task : active) {
            printf("%d ", task);
        }
        printf("(total: %d)\n", manager.GetActiveTaskCount());
        
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
    }
    
    // Wait for completion
    for (auto& worker : workers) {
        worker.join();
    }
    
    printf("All tasks completed\n");
}
```

## Large Bitfields

### Variable-Length Bitfields

```cpp
#include "clio_ctp/types/bitfield.h"
#include <cstddef>
#include <cstdio>

void big_bitfield_example() {
    // Create a bitfield with 256 bits (8 x 32-bit words)
    ctp::big_bitfield<256> large_bitfield;

    // size() returns the number of 32-bit words backing the bitfield.
    printf("Bitfield size: %zu 32-bit words\n", large_bitfield.size());

    // SetBits(start, length) sets a range of bits.
    large_bitfield.SetBits(10, 20);  // Set 20 bits starting from bit 10

    // Any(start, length) is true if any bit in the range is set.
    bool has_bits_30_40 = large_bitfield.Any(30, 10);
    bool has_bits_10_30 = large_bitfield.Any(10, 20);

    printf("Bits 30-39 set: %s\n", has_bits_30_40 ? "yes" : "no");
    printf("Bits 10-29 set: %s\n", has_bits_10_30 ? "yes" : "no");

    // All(start, length) is true only if every bit in the range is set.
    bool all_bits_10_30 = large_bitfield.All(10, 20);
    printf("All bits 10-29 set: %s\n", all_bits_10_30 ? "yes" : "no");

    // Set additional ranges
    large_bitfield.SetBits(64, 32);   // Set bits 64-95
    large_bitfield.SetBits(128, 64);  // Set bits 128-191

    // Clear() resets every word back to zero.
    large_bitfield.Clear();
    printf("Bitfield cleared\n");
}
```

### Custom-Sized Bitfields

```cpp
#include "clio_ctp/types/bitfield.h"
#include <cstddef>
#include <cstdio>
#include <vector>

template<size_t NUM_NODES>
class NodeStatusTracker {
    ctp::big_bitfield<NUM_NODES> online_nodes_;
    ctp::big_bitfield<NUM_NODES> healthy_nodes_;
    ctp::big_bitfield<NUM_NODES> maintenance_nodes_;
    
public:
    void SetNodeOnline(size_t node_id) {
        if (node_id < NUM_NODES) {
            online_nodes_.SetBits(node_id, 1);
            printf("Node %zu is now online\n", node_id);
        }
    }
    
    void SetNodeOffline(size_t node_id) {
        if (node_id < NUM_NODES) {
            online_nodes_.UnsetBits(node_id, 1);
            healthy_nodes_.UnsetBits(node_id, 1);
            printf("Node %zu is now offline\n", node_id);
        }
    }
    
    void SetNodeHealthy(size_t node_id, bool healthy) {
        if (node_id < NUM_NODES) {
            if (healthy) {
                healthy_nodes_.SetBits(node_id, 1);
            } else {
                healthy_nodes_.UnsetBits(node_id, 1);
            }
            printf("Node %zu health: %s\n", node_id, healthy ? "good" : "bad");
        }
    }
    
    void SetNodeMaintenance(size_t node_id, bool in_maintenance) {
        if (node_id < NUM_NODES) {
            if (in_maintenance) {
                maintenance_nodes_.SetBits(node_id, 1);
                online_nodes_.UnsetBits(node_id, 1);  // Take offline
            } else {
                maintenance_nodes_.UnsetBits(node_id, 1);
            }
            printf("Node %zu maintenance: %s\n", node_id, 
                   in_maintenance ? "active" : "inactive");
        }
    }
    
    size_t GetAvailableNodeCount() {
        size_t count = 0;
        for (size_t i = 0; i < NUM_NODES; ++i) {
            if (online_nodes_.Any(i, 1) && 
                healthy_nodes_.Any(i, 1) && 
                !maintenance_nodes_.Any(i, 1)) {
                count++;
            }
        }
        return count;
    }
    
    std::vector<size_t> GetAvailableNodes() {
        std::vector<size_t> available;
        for (size_t i = 0; i < NUM_NODES; ++i) {
            if (online_nodes_.Any(i, 1) && 
                healthy_nodes_.Any(i, 1) && 
                !maintenance_nodes_.Any(i, 1)) {
                available.push_back(i);
            }
        }
        return available;
    }
    
    void PrintStatus() {
        printf("\n=== Cluster Status ===\n");
        printf("Total nodes: %zu\n", NUM_NODES);
        printf("Available nodes: %zu\n", GetAvailableNodeCount());
        
        auto available = GetAvailableNodes();
        printf("Available node IDs: ");
        for (size_t node : available) {
            printf("%zu ", node);
        }
        printf("\n");
    }
};

void cluster_monitoring_example() {
    // Track status of 1000 nodes
    NodeStatusTracker<1000> cluster;
    
    // Simulate bringing nodes online
    for (size_t i = 0; i < 100; ++i) {
        cluster.SetNodeOnline(i);
        cluster.SetNodeHealthy(i, true);
    }
    
    // Simulate some failures and maintenance
    cluster.SetNodeHealthy(10, false);
    cluster.SetNodeHealthy(25, false);
    cluster.SetNodeMaintenance(50, true);
    cluster.SetNodeMaintenance(75, true);
    
    cluster.PrintStatus();
}
```

## Bitfield Patterns and Best Practices

### State Machine Implementation

```cpp
#include "clio_ctp/types/bitfield.h"
#include <cstdint>
#include <cstdio>
#include <string>

enum class ProcessState : uint32_t {
    CREATED    = BIT_OPT(uint32_t, 0),  // 0x001
    RUNNING    = BIT_OPT(uint32_t, 1),  // 0x002
    SUSPENDED  = BIT_OPT(uint32_t, 2),  // 0x004
    ZOMBIE     = BIT_OPT(uint32_t, 3),  // 0x008
    TERMINATED = BIT_OPT(uint32_t, 4),  // 0x010
    
    // Composite states
    ACTIVE     = RUNNING | SUSPENDED,    // 0x006
    FINISHED   = ZOMBIE | TERMINATED,    // 0x018
};

class Process {
    ctp::abitfield32_t state_;
    int process_id_;
    
public:
    explicit Process(int pid) : process_id_(pid) {
        state_.SetBits(static_cast<uint32_t>(ProcessState::CREATED));
    }
    
    void Start() {
        if (state_.Any(static_cast<uint32_t>(ProcessState::CREATED))) {
            state_.UnsetBits(static_cast<uint32_t>(ProcessState::CREATED));
            state_.SetBits(static_cast<uint32_t>(ProcessState::RUNNING));
            printf("Process %d started\n", process_id_);
        }
    }
    
    void Suspend() {
        if (state_.Any(static_cast<uint32_t>(ProcessState::RUNNING))) {
            state_.UnsetBits(static_cast<uint32_t>(ProcessState::RUNNING));
            state_.SetBits(static_cast<uint32_t>(ProcessState::SUSPENDED));
            printf("Process %d suspended\n", process_id_);
        }
    }
    
    void Resume() {
        if (state_.Any(static_cast<uint32_t>(ProcessState::SUSPENDED))) {
            state_.UnsetBits(static_cast<uint32_t>(ProcessState::SUSPENDED));
            state_.SetBits(static_cast<uint32_t>(ProcessState::RUNNING));
            printf("Process %d resumed\n", process_id_);
        }
    }
    
    void Terminate() {
        if (state_.Any(static_cast<uint32_t>(ProcessState::ACTIVE))) {
            state_.Clear();
            state_.SetBits(static_cast<uint32_t>(ProcessState::TERMINATED));
            printf("Process %d terminated\n", process_id_);
        }
    }
    
    bool IsActive() const {
        return state_.Any(static_cast<uint32_t>(ProcessState::ACTIVE));
    }
    
    bool IsFinished() const {
        return state_.Any(static_cast<uint32_t>(ProcessState::FINISHED));
    }
    
    std::string GetStateString() const {
        uint32_t state = state_.bits_.load();
        
        if (state & static_cast<uint32_t>(ProcessState::CREATED))    return "CREATED";
        if (state & static_cast<uint32_t>(ProcessState::RUNNING))    return "RUNNING";
        if (state & static_cast<uint32_t>(ProcessState::SUSPENDED))  return "SUSPENDED";
        if (state & static_cast<uint32_t>(ProcessState::ZOMBIE))     return "ZOMBIE";
        if (state & static_cast<uint32_t>(ProcessState::TERMINATED)) return "TERMINATED";
        
        return "UNKNOWN";
    }
};

void state_machine_example() {
    Process proc(12345);
    
    printf("Initial state: %s\n", proc.GetStateString().c_str());
    
    proc.Start();
    printf("State: %s, Active: %s\n", 
           proc.GetStateString().c_str(), 
           proc.IsActive() ? "yes" : "no");
    
    proc.Suspend();
    printf("State: %s, Active: %s\n", 
           proc.GetStateString().c_str(), 
           proc.IsActive() ? "yes" : "no");
    
    proc.Resume();
    printf("State: %s, Active: %s\n", 
           proc.GetStateString().c_str(), 
           proc.IsActive() ? "yes" : "no");
    
    proc.Terminate();
    printf("State: %s, Finished: %s\n", 
           proc.GetStateString().c_str(), 
           proc.IsFinished() ? "yes" : "no");
}
```

### Feature Flag System

```cpp
#include "clio_ctp/types/bitfield.h"
#include <cstdint>
#include <cstdio>
#include <sstream>
#include <string>
#include <vector>

class FeatureFlags {
    ctp::bitfield64_t enabled_features_;

public:
    enum Feature : uint64_t {
        ADVANCED_LOGGING    = BIT_OPT(uint64_t, 0),
        GPU_ACCELERATION    = BIT_OPT(uint64_t, 1),
        COMPRESSION         = BIT_OPT(uint64_t, 2),
        ENCRYPTION          = BIT_OPT(uint64_t, 3),
        CACHING             = BIT_OPT(uint64_t, 4),
        ASYNC_IO            = BIT_OPT(uint64_t, 5),
        METRICS_COLLECTION  = BIT_OPT(uint64_t, 6),
        DEBUG_MODE          = BIT_OPT(uint64_t, 7),
        EXPERIMENTAL_API    = BIT_OPT(uint64_t, 8),
        CLOUD_INTEGRATION   = BIT_OPT(uint64_t, 9),
        
        // Feature combinations
        PERFORMANCE_PACK    = GPU_ACCELERATION | COMPRESSION | ASYNC_IO,
        SECURITY_PACK       = ENCRYPTION,
        DEBUG_PACK          = ADVANCED_LOGGING | DEBUG_MODE | METRICS_COLLECTION,
    };
    
    void EnableFeature(Feature feature) {
        enabled_features_.SetBits(static_cast<uint64_t>(feature));
    }
    
    void DisableFeature(Feature feature) {
        enabled_features_.UnsetBits(static_cast<uint64_t>(feature));
    }
    
    bool IsFeatureEnabled(Feature feature) const {
        return enabled_features_.Any(static_cast<uint64_t>(feature));
    }
    
    void EnableFeaturePack(Feature pack) {
        enabled_features_.SetBits(static_cast<uint64_t>(pack));
    }
    
    void LoadFromConfig(const std::string& config_string) {
        // Parse config string format: "feature1,feature2,feature3"
        std::istringstream ss(config_string);
        std::string feature_name;
        
        enabled_features_.Clear();
        
        while (std::getline(ss, feature_name, ',')) {
            if (feature_name == "gpu")        EnableFeature(GPU_ACCELERATION);
            if (feature_name == "compress")   EnableFeature(COMPRESSION);
            if (feature_name == "encrypt")    EnableFeature(ENCRYPTION);
            if (feature_name == "cache")      EnableFeature(CACHING);
            if (feature_name == "async")      EnableFeature(ASYNC_IO);
            if (feature_name == "debug")      EnableFeaturePack(DEBUG_PACK);
            if (feature_name == "perf")       EnableFeaturePack(PERFORMANCE_PACK);
        }
    }
    
    std::string GetEnabledFeaturesString() const {
        std::vector<std::string> features;
        
        if (IsFeatureEnabled(ADVANCED_LOGGING))   features.push_back("logging");
        if (IsFeatureEnabled(GPU_ACCELERATION))   features.push_back("gpu");
        if (IsFeatureEnabled(COMPRESSION))        features.push_back("compression");
        if (IsFeatureEnabled(ENCRYPTION))         features.push_back("encryption");
        if (IsFeatureEnabled(CACHING))            features.push_back("caching");
        if (IsFeatureEnabled(ASYNC_IO))           features.push_back("async_io");
        if (IsFeatureEnabled(METRICS_COLLECTION)) features.push_back("metrics");
        if (IsFeatureEnabled(DEBUG_MODE))         features.push_back("debug");
        
        std::string result;
        for (size_t i = 0; i < features.size(); ++i) {
            if (i > 0) result += ", ";
            result += features[i];
        }
        return result;
    }
};

void feature_flags_example() {
    FeatureFlags flags;
    
    // Enable individual features
    flags.EnableFeature(FeatureFlags::GPU_ACCELERATION);
    flags.EnableFeature(FeatureFlags::COMPRESSION);
    
    printf("Enabled features: %s\n", flags.GetEnabledFeaturesString().c_str());
    
    // Enable feature pack
    flags.EnableFeaturePack(FeatureFlags::DEBUG_PACK);
    printf("After enabling debug pack: %s\n", flags.GetEnabledFeaturesString().c_str());
    
    // Load from configuration
    flags.LoadFromConfig("gpu,encrypt,cache,async");
    printf("From config: %s\n", flags.GetEnabledFeaturesString().c_str());
    
    // Check specific features in application code
    if (flags.IsFeatureEnabled(FeatureFlags::GPU_ACCELERATION)) {
        printf("Using GPU acceleration\n");
    }
    
    if (flags.IsFeatureEnabled(FeatureFlags::ENCRYPTION)) {
        printf("Encryption is enabled\n");
    }
}
```

## Serialization and Persistence

```cpp
#include "clio_ctp/types/bitfield.h"
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <ios>
#include <cereal/archives/binary.hpp>

void serialization_example() {
    // Create and configure bitfield
    ctp::bitfield32_t config_flags;
    config_flags.SetBits(0x12345678);
    
    // Serialize to file
    {
        std::ofstream os("bitfield.bin", std::ios::binary);
        cereal::BinaryOutputArchive archive(os);
        archive(config_flags);
    }
    
    // Deserialize from file
    ctp::bitfield32_t loaded_flags;
    {
        std::ifstream is("bitfield.bin", std::ios::binary);
        cereal::BinaryInputArchive archive(is);
        archive(loaded_flags);
    }
    
    printf("Original:  0x%08X\n", (unsigned)config_flags.bits_.load());
    printf("Loaded:    0x%08X\n", (unsigned)loaded_flags.bits_.load());
    printf("Match:     %s\n", 
           (config_flags.bits_.load() == loaded_flags.bits_.load()) ? "yes" : "no");
}
```

## Best Practices

1. **Use Atomic Variants**: Use `abitfield` types for shared data structures accessed by multiple threads
2. **Define Constants**: Always define named constants for bit positions instead of magic numbers
3. **Mask Operations**: Use `MakeMask()` for multi-bit fields and ranges
4. **Size Selection**: Choose appropriate bitfield size (8, 16, 32, 64 bits) based on your needs
5. **Large Bitfields**: Use `big_bitfield<N>` for bitfields larger than 64 bits
6. **Performance**: Bitfield operations are very fast, but atomic operations have some overhead
7. **Cross-Platform**: All bitfield types work consistently across different architectures
8. **Serialization**: Bitfields support standard serialization libraries for persistence
9. **State Machines**: Use bitfields for efficient state representation with composite states
10. **Feature Flags**: Implement feature toggle systems using bitfields for compact storage and fast checking
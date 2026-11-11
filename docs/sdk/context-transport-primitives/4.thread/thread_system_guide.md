# Thread System Guide

## Overview

The Thread System API in Hermes Shared Memory (HSHM) provides a unified interface for threading across different platforms and execution environments. The system abstracts pthread, std::thread, Argobots, CUDA, and ROCm threading models, allowing applications to work seamlessly across different environments with the same code.

## Thread Model Architecture

### Available Thread Models

The HSHM thread system supports multiple backend implementations:

- **Pthread** (`ThreadType::kPthread`) - POSIX threads for Unix-like systems
- **StdThread** (`ThreadType::kStdThread`) - Standard C++ threading
- **Argobots** (`ThreadType::kArgobots`) - User-level threading library
- **CUDA** (`ThreadType::kCuda`) - NVIDIA GPU threading
- **ROCm** (`ThreadType::kRocm`) - AMD GPU threading

### Default Thread Models

The system automatically selects appropriate thread models based on the platform:

```cpp
#include "clio_ctp/thread/thread_model_manager.h"

#include <cstdio>

void thread_model_overview() {
    // Default thread models are configured at compile time via CMake defines:
    //   Host: CTP_DEFAULT_THREAD_MODEL     = ctp::thread::Pthread (POSIX) or
    //                                        ctp::thread::StdThread (Windows)
    //   GPU:  CTP_DEFAULT_THREAD_MODEL_GPU = ctp::thread::StdThread

    // Access the current thread model (a process-wide singleton pointer).
    auto* thread_model = CTP_THREAD_MODEL;

    // The active backend is reported through the ctp::ThreadType enum.
    ctp::ThreadType type = thread_model->GetType();
    printf("Using thread model type: %d\n", static_cast<int>(type));
}
```

## Basic Threading Operations

### Thread Creation and Management

```cpp
#include "clio_ctp/thread/thread_model_manager.h"

#include <cstdio>
#include <utility>
#include <vector>

void basic_threading_example() {
    // Get the current thread model
    auto* tm = CTP_THREAD_MODEL;
    
    // Create a thread group (optional context for organizing threads)
    ctp::ThreadGroupContext group_ctx{};
    ctp::ThreadGroup group = tm->CreateThreadGroup(group_ctx);
    
    // Define work function
    auto worker_function = [](int thread_id, int iterations) {
        for (int i = 0; i < iterations; ++i) {
            printf("Thread %d: iteration %d\n", thread_id, i);
            CTP_THREAD_MODEL->SleepForUs(100000);  // Sleep for 100ms
        }
        printf("Thread %d completed\n", thread_id);
    };
    
    // Spawn threads
    const int num_threads = 4;
    std::vector<ctp::Thread> threads;
    
    for (int i = 0; i < num_threads; ++i) {
        ctp::Thread thread = tm->Spawn(group, worker_function, i, 10);
        threads.push_back(std::move(thread));
    }
    
    // Wait for all threads to complete
    for (auto& thread : threads) {
        tm->Join(thread);
    }
    
    printf("All threads completed\n");
}
```

### Thread Local Storage

```cpp
#include "clio_ctp/thread/thread_model_manager.h"

#include <cstdio>
#include <string>
#include <vector>

// User TLS payloads derive from ctp::thread::ThreadLocalData.
class WorkerTls : public ctp::thread::ThreadLocalData {
public:
    int thread_id;
    std::string thread_name;
    size_t operation_count;

    WorkerTls(int id, const std::string& name)
        : thread_id(id), thread_name(name), operation_count(0) {
        printf("TLS created for thread %d (%s)\n", thread_id, thread_name.c_str());
    }

    ~WorkerTls() {
        printf("TLS destroyed for thread %d, operations: %zu\n",
               thread_id, operation_count);
    }
};

void thread_local_storage_example() {
    auto* tm = CTP_THREAD_MODEL;

    // Allocate a thread-local key (one slot, shared by all threads).
    ctp::ThreadLocalKey tls_key;
    tm->CreateTls<WorkerTls>(tls_key, nullptr);

    auto worker_with_tls = [&tls_key](int thread_id) {
        // Create per-thread data and store it under the key.
        WorkerTls* tls_data =
            new WorkerTls(thread_id, "Worker-" + std::to_string(thread_id));
        CTP_THREAD_MODEL->SetTls(tls_key, tls_data);

        // Use TLS throughout this thread's execution.
        for (int i = 0; i < 5; ++i) {
            WorkerTls* my_data = CTP_THREAD_MODEL->GetTls<WorkerTls>(tls_key);
            my_data->operation_count++;
            printf("Thread %s: operation %zu\n",
                   my_data->thread_name.c_str(), my_data->operation_count);
            CTP_THREAD_MODEL->SleepForUs(50000);
        }
        delete tls_data;
    };

    // Spawn worker threads.
    ctp::ThreadGroup group = tm->CreateThreadGroup(ctp::ThreadGroupContext{});
    std::vector<ctp::Thread> threads;
    for (int i = 0; i < 3; ++i) {
        threads.push_back(tm->Spawn(group, worker_with_tls, i));
    }

    // Wait for completion.
    for (auto& thread : threads) {
        tm->Join(thread);
    }
}
```

## Cross-Platform Thread Operations

### Thread Utilities

```cpp
#include "clio_ctp/thread/thread_model_manager.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <thread>
#include <utility>
#include <vector>

void thread_utilities_example() {
    auto* tm = CTP_THREAD_MODEL;

    // Get current thread ID (ctp::ThreadId wraps a u64 in .tid_).
    ctp::ThreadId current_tid = tm->GetTid();
    printf("Current thread ID: %llu\n",
           static_cast<unsigned long long>(current_tid.tid_));

    // Yield current thread
    printf("Yielding thread...\n");
    tm->Yield();

    // Sleep for a specific duration
    printf("Sleeping for 1 second...\n");
    tm->SleepForUs(1000000);  // 1 second in microseconds

    printf("Sleep completed\n");
}

void cpu_affinity_example() {
    auto* tm = CTP_THREAD_MODEL;
    ctp::ThreadGroup group = tm->CreateThreadGroup(ctp::ThreadGroupContext{});

    auto cpu_bound_worker = [](int cpu_id) {
        printf("Worker starting on CPU %d\n", cpu_id);

        // CPU-intensive work
        volatile double result = 0.0;
        for (int i = 0; i < 1000000; ++i) {
            result += std::sin(i * 0.001);
        }

        printf("Worker on CPU %d completed, result: %f\n", cpu_id, result);
    };

    const int num_cpus = static_cast<int>(std::thread::hardware_concurrency());
    std::vector<ctp::Thread> threads;

    for (int i = 0; i < std::min(4, num_cpus); ++i) {
        ctp::Thread thread = tm->Spawn(group, cpu_bound_worker, i);

        // Set CPU affinity (a no-op for models that don't support pinning).
        tm->SetAffinity(thread, i);

        threads.push_back(std::move(thread));
    }

    for (auto& thread : threads) {
        tm->Join(thread);
    }
}
```

## Producer-Consumer Pattern

```cpp
#include "clio_ctp/thread/thread_model_manager.h"
#include "clio_ctp/types/atomic.h"

#include <condition_variable>
#include <cstdio>
#include <mutex>
#include <queue>
#include <utility>
#include <vector>

template<typename T>
class ThreadSafeQueue {
    std::queue<T> queue_;
    mutable std::mutex mutex_;  // mutable so Size() const can lock it
    std::condition_variable condition_;
    ctp::ipc::atomic<bool> shutdown_;
    
public:
    ThreadSafeQueue() : shutdown_(false) {}
    
    void Push(T item) {
        std::lock_guard<std::mutex> lock(mutex_);
        queue_.push(std::move(item));
        condition_.notify_one();
    }
    
    bool Pop(T& item) {
        std::unique_lock<std::mutex> lock(mutex_);
        
        condition_.wait(lock, [this] { 
            return !queue_.empty() || shutdown_.load(); 
        });
        
        if (shutdown_.load() && queue_.empty()) {
            return false;  // Shutdown and no more items
        }
        
        item = std::move(queue_.front());
        queue_.pop();
        return true;
    }
    
    void Shutdown() {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            shutdown_.store(true);
        }
        condition_.notify_all();
    }
    
    size_t Size() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return queue_.size();
    }
};

void producer_consumer_example() {
    auto* tm = CTP_THREAD_MODEL;
    ThreadSafeQueue<int> work_queue;
    ctp::ipc::atomic<int> total_produced(0);
    ctp::ipc::atomic<int> total_consumed(0);
    
    // Producer function
    auto producer = [&](int producer_id, int items_to_produce) {
        for (int i = 0; i < items_to_produce; ++i) {
            int item = producer_id * 1000 + i;
            work_queue.Push(item);
            total_produced.fetch_add(1);
            
            printf("Producer %d produced item %d\n", producer_id, item);
            CTP_THREAD_MODEL->SleepForUs(10000);  // 10ms
        }
        printf("Producer %d finished\n", producer_id);
    };
    
    // Consumer function
    auto consumer = [&](int consumer_id) {
        int item;
        int consumed_count = 0;
        
        while (work_queue.Pop(item)) {
            // Process item
            CTP_THREAD_MODEL->SleepForUs(20000);  // 20ms processing time
            
            consumed_count++;
            total_consumed.fetch_add(1);
            
            printf("Consumer %d processed item %d (total: %d)\n", 
                   consumer_id, item, consumed_count);
        }
        
        printf("Consumer %d finished, consumed %d items\n", 
               consumer_id, consumed_count);
    };
    
    // Create thread group
    ctp::ThreadGroup group = tm->CreateThreadGroup(ctp::ThreadGroupContext{});
    std::vector<ctp::Thread> threads;
    
    // Start producers
    const int num_producers = 2;
    const int items_per_producer = 10;
    for (int i = 0; i < num_producers; ++i) {
        threads.push_back(tm->Spawn(group, producer, i, items_per_producer));
    }
    
    // Start consumers
    const int num_consumers = 3;
    for (int i = 0; i < num_consumers; ++i) {
        threads.push_back(tm->Spawn(group, consumer, i));
    }
    
    // Wait for producers to finish
    for (int i = 0; i < num_producers; ++i) {
        tm->Join(threads[i]);
    }
    
    // Allow consumers to finish processing remaining items
    while (work_queue.Size() > 0 && total_consumed.load() < total_produced.load()) {
        tm->SleepForUs(10000);
    }
    
    // Shutdown queue and wait for consumers
    work_queue.Shutdown();
    for (size_t i = num_producers; i < threads.size(); ++i) {
        tm->Join(threads[i]);
    }
    
    printf("Final stats - Produced: %d, Consumed: %d\n", 
           total_produced.load(), total_consumed.load());
}
```

## Thread Pool Implementation

```cpp
#include "clio_ctp/thread/thread_model_manager.h"
#include "clio_ctp/types/atomic.h"

#include <condition_variable>
#include <cstdio>
#include <functional>
#include <mutex>
#include <queue>
#include <utility>
#include <vector>

// Minimal blocking task queue used by the pool. Pop() returns false once the
// queue has been shut down and drained, which lets workers exit cleanly.
template<typename T>
class TaskQueue {
    std::queue<T> queue_;
    std::mutex mutex_;
    std::condition_variable condition_;
    ctp::ipc::atomic<bool> shutdown_;

public:
    TaskQueue() : shutdown_(false) {}

    void Push(T item) {
        std::lock_guard<std::mutex> lock(mutex_);
        queue_.push(std::move(item));
        condition_.notify_one();
    }

    bool Pop(T& item) {
        std::unique_lock<std::mutex> lock(mutex_);
        condition_.wait(lock,
                        [this] { return !queue_.empty() || shutdown_.load(); });
        if (shutdown_.load() && queue_.empty()) {
            return false;
        }
        item = std::move(queue_.front());
        queue_.pop();
        return true;
    }

    void Shutdown() {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            shutdown_.store(true);
        }
        condition_.notify_all();
    }
};

class ThreadPool {
    std::vector<ctp::Thread> workers_;
    TaskQueue<std::function<void()>> task_queue_;
    ctp::ipc::atomic<bool> running_;
    ctp::ThreadGroup group_;

public:
    explicit ThreadPool(size_t num_threads) : running_(true) {
        auto* tm = CTP_THREAD_MODEL;
        group_ = tm->CreateThreadGroup(ctp::ThreadGroupContext{});

        // Create worker threads
        for (size_t i = 0; i < num_threads; ++i) {
            workers_.push_back(tm->Spawn(group_, [this, i]() {
                WorkerLoop(i);
            }));
        }

        printf("Thread pool started with %zu threads\n", num_threads);
    }

    ~ThreadPool() {
        Shutdown();
    }

    template<typename F>
    void Submit(F&& task) {
        if (running_.load()) {
            task_queue_.Push(std::function<void()>(std::forward<F>(task)));
        }
    }

    void Shutdown() {
        if (running_.load()) {
            running_.store(false);
            task_queue_.Shutdown();

            auto* tm = CTP_THREAD_MODEL;
            for (auto& worker : workers_) {
                tm->Join(worker);
            }

            printf("Thread pool shutdown complete\n");
        }
    }

private:
    void WorkerLoop(size_t worker_id) {
        printf("Worker %zu started\n", worker_id);

        std::function<void()> task;
        while (task_queue_.Pop(task)) {
            task();
        }

        printf("Worker %zu finished\n", worker_id);
    }
};

void thread_pool_example() {
    ThreadPool pool(4);

    // Submit various tasks
    for (int i = 0; i < 20; ++i) {
        pool.Submit([i]() {
            printf("Executing task %d on thread %llu\n", i,
                   static_cast<unsigned long long>(
                       CTP_THREAD_MODEL->GetTid().tid_));

            // Simulate work
            CTP_THREAD_MODEL->SleepForUs(100000 + (i % 5) * 50000);

            printf("Task %d completed\n", i);
        });
    }

    // Let tasks run for a while; the pool shuts down on destruction.
    CTP_THREAD_MODEL->SleepForUs(2000000);  // 2 seconds
}
```

## Platform-Specific Thread Models

### Pthread Implementation

```cpp
#include "clio_ctp/thread/thread_model_manager.h"

#include <cstdio>

#if CTP_ENABLE_PTHREADS

void pthread_specific_example() {
    // Create a pthread-based thread model explicitly
    ctp::thread::Pthread pthread_model;
    
    printf("Using pthread model\n");
    printf("Thread type: %d\n", static_cast<int>(pthread_model.GetType()));
    
    // Pthread-specific operations
    pthread_model.Init();
    
    // Create thread with pthread model
    ctp::ThreadGroup group = pthread_model.CreateThreadGroup(ctp::ThreadGroupContext{});
    
    auto pthread_worker = []() {
        printf("Running in pthread worker\n");
        
        // Get pthread-specific thread ID
        auto tid = CTP_THREAD_MODEL->GetTid();
        printf("Pthread TID: %zu\n", tid.tid_);
        
        // Use pthread-specific sleep
        CTP_THREAD_MODEL->SleepForUs(500000);
    };
    
    ctp::Thread thread = pthread_model.Spawn(group, pthread_worker);
    pthread_model.Join(thread);
}

#endif
```

### Standard Thread Implementation

```cpp
#include "clio_ctp/thread/thread_model_manager.h"

#include <chrono>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

void std_thread_example() {
    // Create a std::thread-based model explicitly (always available).
    ctp::thread::StdThread std_model;

    std::cout << "Using std::thread model\n";

    // Standard thread operations
    ctp::ThreadGroup group =
        std_model.CreateThreadGroup(ctp::ThreadGroupContext{});

    auto std_worker = [](const std::string& message) {
        std::cout << "std::thread worker: " << message << "\n";

        // Use std::thread sleep mechanisms
        std::this_thread::sleep_for(std::chrono::milliseconds(200));

        // Get the native std::thread id
        auto tid = std::this_thread::get_id();
        std::cout << "Thread ID: " << tid << std::endl;
    };

    std::vector<ctp::Thread> threads;
    for (int i = 0; i < 3; ++i) {
        std::string msg = "Message from thread " + std::to_string(i);
        threads.push_back(std_model.Spawn(group, std_worker, msg));
    }

    for (auto& thread : threads) {
        std_model.Join(thread);
    }
}
```

## Cross-Device Compatibility

### Host and GPU Thread Coordination

```cpp
#include "clio_ctp/thread/thread_model_manager.h"

#include <cstdio>

CTP_CROSS_FUN void cross_device_function() {
    // This function works on both host and GPU
    auto* tm = CTP_THREAD_MODEL;
    
#if CTP_IS_HOST
    printf("Running on host with thread model: %d\n", 
           static_cast<int>(tm->GetType()));
#elif CTP_IS_GPU
    // GPU-specific operations
    int thread_id = threadIdx.x + blockIdx.x * blockDim.x;
    printf("Running on GPU, thread %d\n", thread_id);
#endif
    
    // Common operations that work on both
    tm->Yield();
}

void cross_device_example() {
    // Host execution
    cross_device_function();
    
#if CTP_ENABLE_CUDA
    // Launch on GPU
    cross_device_function<<<1, 32>>>();
    cudaDeviceSynchronize();
#endif
}
```

## Thread Synchronization Patterns

### Barrier Implementation

```cpp
#include "clio_ctp/thread/thread_model_manager.h"
#include "clio_ctp/types/atomic.h"

#include <condition_variable>
#include <cstdio>
#include <mutex>
#include <vector>

class ThreadBarrier {
    std::mutex mutex_;
    std::condition_variable condition_;
    size_t thread_count_;
    size_t waiting_count_;
    size_t barrier_generation_;
    
public:
    explicit ThreadBarrier(size_t count) 
        : thread_count_(count), waiting_count_(0), barrier_generation_(0) {}
    
    void Wait() {
        std::unique_lock<std::mutex> lock(mutex_);
        size_t current_generation = barrier_generation_;
        
        if (++waiting_count_ == thread_count_) {
            // Last thread to arrive
            waiting_count_ = 0;
            barrier_generation_++;
            condition_.notify_all();
        } else {
            // Wait for all threads to arrive
            condition_.wait(lock, [this, current_generation] {
                return current_generation != barrier_generation_;
            });
        }
    }
};

void barrier_example() {
    const int num_threads = 4;
    ThreadBarrier barrier(num_threads);
    ctp::ipc::atomic<int> phase(0);
    
    auto barrier_worker = [&](int worker_id) {
        for (int i = 0; i < 3; ++i) {
            // Phase 1: Different amounts of work
            CTP_THREAD_MODEL->SleepForUs(100000 + worker_id * 50000);
            printf("Worker %d completed phase %d work\n", worker_id, i + 1);
            
            // Synchronize at barrier
            printf("Worker %d waiting at barrier for phase %d\n", worker_id, i + 1);
            barrier.Wait();
            
            // All threads continue together
            if (worker_id == 0) {
                int current_phase = phase.fetch_add(1) + 1;
                printf("=== All threads synchronized, starting phase %d ===\n", 
                       current_phase);
            }
        }
        
        printf("Worker %d finished all phases\n", worker_id);
    };
    
    auto* tm = CTP_THREAD_MODEL;
    ctp::ThreadGroup group = tm->CreateThreadGroup(ctp::ThreadGroupContext{});
    std::vector<ctp::Thread> threads;
    
    for (int i = 0; i < num_threads; ++i) {
        threads.push_back(tm->Spawn(group, barrier_worker, i));
    }
    
    for (auto& thread : threads) {
        tm->Join(thread);
    }
    
    printf("All workers completed\n");
}
```

## Performance Monitoring

```cpp
#include "clio_ctp/thread/thread_model_manager.h"
#include "clio_ctp/types/atomic.h"

#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <vector>

class ThreadPerformanceMonitor {
    struct ThreadStats {
        ctp::ipc::atomic<size_t> tasks_completed{0};
        ctp::ipc::atomic<size_t> total_execution_time_us{0};
        ctp::ipc::atomic<size_t> max_execution_time_us{0};
        std::chrono::high_resolution_clock::time_point start_time;
    };
    
    std::unordered_map<size_t, std::unique_ptr<ThreadStats>> thread_stats_;
    std::mutex stats_mutex_;
    
public:
    void StartTask(size_t thread_id) {
        std::lock_guard<std::mutex> lock(stats_mutex_);
        if (thread_stats_.find(thread_id) == thread_stats_.end()) {
            thread_stats_[thread_id] = std::make_unique<ThreadStats>();
        }
        thread_stats_[thread_id]->start_time = std::chrono::high_resolution_clock::now();
    }
    
    void EndTask(size_t thread_id) {
        auto end_time = std::chrono::high_resolution_clock::now();
        
        std::lock_guard<std::mutex> lock(stats_mutex_);
        auto it = thread_stats_.find(thread_id);
        if (it != thread_stats_.end()) {
            auto& stats = *it->second;
            
            auto duration = std::chrono::duration_cast<std::chrono::microseconds>(
                end_time - stats.start_time).count();
            
            stats.tasks_completed.fetch_add(1);
            stats.total_execution_time_us.fetch_add(duration);
            
            // Update max execution time
            size_t current_max = stats.max_execution_time_us.load();
            while (duration > current_max && 
                   !stats.max_execution_time_us.compare_exchange_weak(current_max, duration)) {
            }
        }
    }
    
    void PrintStatistics() {
        std::lock_guard<std::mutex> lock(stats_mutex_);
        
        printf("\n=== Thread Performance Statistics ===\n");
        printf("%-10s %-10s %-15s %-15s %-15s\n", 
               "ThreadID", "Tasks", "Total(us)", "Avg(us)", "Max(us)");
        
        for (const auto& [thread_id, stats] : thread_stats_) {
            size_t tasks = stats->tasks_completed.load();
            size_t total_time = stats->total_execution_time_us.load();
            size_t max_time = stats->max_execution_time_us.load();
            double avg_time = tasks > 0 ? double(total_time) / tasks : 0.0;
            
            printf("%-10zu %-10zu %-15zu %-15.1f %-15zu\n",
                   thread_id, tasks, total_time, avg_time, max_time);
        }
    }
};

void performance_monitoring_example() {
    ThreadPerformanceMonitor monitor;
    auto* tm = CTP_THREAD_MODEL;
    
    auto monitored_worker = [&](int worker_id) {
        size_t thread_id = tm->GetTid().tid_;
        
        for (int i = 0; i < 5; ++i) {
            monitor.StartTask(thread_id);
            
            // Simulate variable work
            size_t work_time = 100000 + (rand() % 200000);  // 100-300ms
            tm->SleepForUs(work_time);
            
            monitor.EndTask(thread_id);
            
            printf("Worker %d (TID %zu) completed task %d\n", 
                   worker_id, thread_id, i + 1);
        }
    };
    
    ctp::ThreadGroup group = tm->CreateThreadGroup(ctp::ThreadGroupContext{});
    std::vector<ctp::Thread> threads;
    
    const int num_workers = 3;
    for (int i = 0; i < num_workers; ++i) {
        threads.push_back(tm->Spawn(group, monitored_worker, i));
    }
    
    for (auto& thread : threads) {
        tm->Join(thread);
    }
    
    monitor.PrintStatistics();
}
```

## Best Practices

1. **Thread Model Selection**: Use `CTP_THREAD_MODEL` for automatic platform-appropriate threading
2. **Cross-Platform Code**: Use `CTP_CROSS_FUN` for functions that work on both host and device
3. **Thread Local Storage**: Implement proper cleanup in TLS destructors
4. **Resource Management**: Always join threads before destroying thread groups
5. **Error Handling**: Wrap thread operations in try-catch blocks for robust error handling
6. **Performance**: Use appropriate thread models - Pthread for system integration, StdThread for portability
7. **Synchronization**: Prefer atomic operations over locks when possible for performance
8. **Debugging**: Use thread IDs and names for easier debugging in multi-threaded applications
9. **Memory Management**: Be careful with shared data - use atomic types or proper synchronization
10. **Testing**: Test threading code under high load and stress conditions to verify correctness

## Thread Model Configuration

The thread models are configured at compile time through CMake defines:

- `CTP_DEFAULT_THREAD_MODEL=ctp::thread::Pthread` (Host default)
- `CTP_DEFAULT_THREAD_MODEL_GPU=ctp::thread::StdThread` (GPU default)
- Enable specific models: `CTP_ENABLE_PTHREADS`, `CTP_ENABLE_CUDA`, `CTP_ENABLE_THALLIUM`

Different thread models can be enabled or disabled based on system capabilities and requirements.
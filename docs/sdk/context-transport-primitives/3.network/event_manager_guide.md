# EventManager Guide

## Overview

The `EventManager` class provides an epoll-based event loop for monitoring file descriptors and handling UNIX signals. It is used internally by the Lightbeam networking layer and the runtime worker system for efficient I/O multiplexing.

**Source:** `hermes_shm/include/hermes_shm/lightbeam/event_manager.h`

## Core Data Structures

### EventTrigger

Identifies the source of an event:

```cpp
namespace hshm::lbm {
struct EventTrigger {
  int fd;          // File descriptor that triggered the event
  int event_id;    // Unique event identifier
};
}
```

### EventAction

Abstract base class for event handlers. Subclass this to define custom behavior when an event fires:

```cpp
namespace hshm::lbm {
struct EventAction {
  virtual void Run(const EventInfo &info) = 0;
};
}
```

### EventInfo

Contains full context for a triggered event:

```cpp
namespace hshm::lbm {
struct EventInfo {
  EventTrigger trigger;      // Which fd/event fired
  uint32_t epoll_events;     // epoll event flags (EPOLLIN, EPOLLOUT, etc.)
  EventAction *action;       // Handler to invoke
};
}
```

## EventManager API

### Construction

```cpp
EventManager();
```

Creates an epoll instance internally. The epoll file descriptor is available via `GetEpollFd()`.

### AddEvent

```cpp
void AddEvent(int fd, uint32_t events, EventAction* action);
```

Register a file descriptor for monitoring.

**Parameters:**
- `fd` - File descriptor to watch (socket, pipe, timerfd, etc.)
- `events` - epoll event mask (`EPOLLIN`, `EPOLLOUT`, `EPOLLET`, etc.)
- `action` - Handler invoked when the event triggers

**Example:**
```cpp
class MyHandler : public hshm::lbm::EventAction {
 public:
  void Run(const hshm::lbm::EventInfo &info) override {
    // Handle readable data on info.trigger.fd
    char buf[1024];
    read(info.trigger.fd, buf, sizeof(buf));
  }
};

hshm::lbm::EventManager em;
MyHandler handler;
em.AddEvent(socket_fd, EPOLLIN, &handler);
```

### AddSignalEvent

```cpp
void AddSignalEvent(EventAction* action);
```

Register a handler for `SIGUSR1` signals. Uses `signalfd` internally to convert the signal into a file descriptor event that integrates with the epoll loop.

**Parameters:**
- `action` - Handler invoked when SIGUSR1 is received

**Example:**
```cpp
class WakeupHandler : public hshm::lbm::EventAction {
 public:
  void Run(const hshm::lbm::EventInfo &info) override {
    // Worker was signaled to wake up
  }
};

WakeupHandler wakeup;
em.AddSignalEvent(&wakeup);
```

### Signal

```cpp
static void Signal(pid_t runtime_pid, pid_t tid);
```

Send a `SIGUSR1` signal to a specific thread. Uses `tgkill` to target the exact thread.

**Parameters:**
- `runtime_pid` - Process ID of the target process
- `tid` - Thread ID of the target thread

**Example:**
```cpp
// Wake up a sleeping worker thread
hshm::lbm::EventManager::Signal(getpid(), worker_tid);
```

### Wait

```cpp
void Wait(int timeout_us);
```

Block until one or more registered events fire, then dispatch their handlers.

**Parameters:**
- `timeout_us` - Maximum wait time in microseconds. Use `-1` to block indefinitely, `0` for non-blocking poll.

Internally calls `epoll_wait` with up to `kMaxEvents` (256) events per call. For each triggered event, the corresponding `EventAction::Run()` is invoked.

**Example:**
```cpp
// Event loop
while (running) {
  em.Wait(1000);  // Wait up to 1ms
}
```

### Accessors

```cpp
int GetEpollFd();    // Returns the epoll file descriptor
int GetSignalFd();   // Returns the signalfd (after AddSignalEvent)
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `kMaxEvents` | 256 | Maximum events returned per `epoll_wait` call |

## Usage Pattern

A typical event loop combines file descriptor events with signal-based wakeups:

```cpp
#include <hermes_shm/lightbeam/event_manager.h>

class ReadHandler : public hshm::lbm::EventAction {
 public:
  void Run(const hshm::lbm::EventInfo &info) override {
    char buf[4096];
    ssize_t n = read(info.trigger.fd, buf, sizeof(buf));
    if (n > 0) {
      // Process data
    }
  }
};

class SignalHandler : public hshm::lbm::EventAction {
 public:
  void Run(const hshm::lbm::EventInfo &info) override {
    // Woken up by Signal() call - check for new work
  }
};

void event_loop() {
  hshm::lbm::EventManager em;

  ReadHandler read_handler;
  SignalHandler signal_handler;

  // Monitor a socket for incoming data
  em.AddEvent(socket_fd, EPOLLIN, &read_handler);

  // Allow other threads to wake us via Signal()
  em.AddSignalEvent(&signal_handler);

  // Run event loop
  while (running) {
    em.Wait(10000);  // 10ms timeout
  }
}
```

## Implementation Details

- Uses Linux `epoll` for I/O multiplexing
- Signal events use `signalfd` to convert SIGUSR1 into a pollable file descriptor
- `Signal()` uses `tgkill` syscall for thread-targeted signaling
- Each `Wait()` call processes up to 256 events before returning
- Event handlers run synchronously within `Wait()` — keep them fast to avoid blocking other events

## Related Documentation

- [Lightbeam Networking Guide](./lightbeam_networking_guide) - Network transport layer that uses EventManager for I/O

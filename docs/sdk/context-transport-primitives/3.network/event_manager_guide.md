# EventManager Guide

## Overview

The `EventManager` class provides an epoll-based event loop for monitoring file descriptors and handling UNIX signals. It is used internally by the Lightbeam networking layer and the runtime worker system for efficient I/O multiplexing.

**Source:** `clio_ctp/include/clio_ctp/lightbeam/event_manager.h`

## Core Data Structures

### EventTrigger

Identifies the source of an event:

```cpp
namespace ctp::lbm {
struct EventTrigger {
  int fd_;        // File descriptor / socket that triggered the event
  int event_id_;  // Unique id returned by AddEvent / AddSignalEvent
};
}  // namespace ctp::lbm
```

### EventAction

Abstract base class for event handlers. Subclass this to define custom behavior when an event fires:

```cpp
namespace ctp::lbm {
struct EventInfo;  // defined below

class EventAction {
 public:
  virtual ~EventAction() = default;
  virtual void Run(const EventInfo &event) = 0;
};
}  // namespace ctp::lbm
```

### EventInfo

Contains full context for a triggered event:

```cpp
#include <cstdint>

namespace ctp::lbm {
struct EventTrigger {
  int fd_;
  int event_id_;
};
class EventAction;  // handler base class, defined elsewhere

struct EventInfo {
  EventTrigger trigger_;  // Which fd/event fired
  uint32_t events_;       // Readiness mask (POLLRDNORM on Windows, EPOLLIN on Linux)
  EventAction *action_;   // Handler to invoke
};
}  // namespace ctp::lbm
```

## EventManager API

### Construction

```cpp
namespace ctp::lbm {
class EventManager {
 public:
  // Creates the wait primitive: an epoll instance on Linux, a
  // WSAEvent-based demultiplexer on Windows.
  EventManager();
};
}  // namespace ctp::lbm
```

Creates an epoll instance internally. The epoll file descriptor is available via `GetEpollFd()`.

### AddEvent

```cpp
#include <cstdint>

namespace ctp::lbm {
class EventAction;

class EventManager {
 public:
  // Register a socket/fd for readiness events. Returns the event id (>= 0).
  int AddEvent(int fd, uint32_t events = 0x0100 /*POLLRDNORM*/,
               EventAction *action = nullptr);
};
}  // namespace ctp::lbm
```

Register a file descriptor for monitoring.

**Parameters:**
- `fd` - File descriptor to watch (socket, pipe, timerfd, etc.)
- `events` - epoll event mask (`EPOLLIN`, `EPOLLOUT`, `EPOLLET`, etc.)
- `action` - Handler invoked when the event triggers

**Example:**
```cpp
#include <clio_ctp/lightbeam/event_manager.h>

class MyHandler : public ctp::lbm::EventAction {
 public:
  void Run(const ctp::lbm::EventInfo &info) override {
    // Socket info.trigger_.fd_ is ready; info.events_ holds the mask.
    int ready_fd = info.trigger_.fd_;
    (void)ready_fd;
  }
};

void example(int socket_fd) {
  ctp::lbm::EventManager em;
  MyHandler handler;
  // kDefaultReadEvent is the platform-neutral "data available" mask.
  em.AddEvent(socket_fd, ctp::lbm::kDefaultReadEvent, &handler);
}
```

### AddSignalEvent

```cpp
namespace ctp::lbm {
class EventAction;

class EventManager {
 public:
  // Create this thread's named wakeup event. Returns the event id (>= 0).
  int AddSignalEvent(EventAction *action = nullptr);
};
}  // namespace ctp::lbm
```

Register a handler for `SIGUSR1` signals. Uses `signalfd` internally to convert the signal into a file descriptor event that integrates with the epoll loop.

**Parameters:**
- `action` - Handler invoked when SIGUSR1 is received

**Example:**
```cpp
#include <clio_ctp/lightbeam/event_manager.h>

class WakeupHandler : public ctp::lbm::EventAction {
 public:
  void Run(const ctp::lbm::EventInfo &event) override {
    // This thread was woken by EventManager::Signal(pid, tid).
    (void)event;
  }
};

void example() {
  ctp::lbm::EventManager em;
  WakeupHandler wakeup;
  em.AddSignalEvent(&wakeup);
}
```

### Signal

```cpp
namespace ctp::lbm {
class EventManager {
 public:
  // Wake the thread (runtime_pid, tid) that called AddSignalEvent().
  // Returns 0 on success, -1 if the target has not registered yet.
  static int Signal(int runtime_pid, int tid);
};
}  // namespace ctp::lbm
```

Send a `SIGUSR1` signal to a specific thread. Uses `tgkill` to target the exact thread.

**Parameters:**
- `runtime_pid` - Process ID of the target process
- `tid` - Thread ID of the target thread

**Example:**
```cpp
#include <clio_ctp/introspect/system_info.h>
#include <clio_ctp/lightbeam/event_manager.h>

void example(int worker_tid) {
  // Wake a worker thread (worker_tid) in this process.
  ctp::lbm::EventManager::Signal(ctp::SystemInfo::GetPid(), worker_tid);
}
```

### Wait

```cpp
namespace ctp::lbm {
class EventManager {
 public:
  // Block until an event fires or timeout_us elapses (< 0 = wait forever).
  // Returns the number of events dispatched (0 on timeout).
  int Wait(int timeout_us = -1);
};
}  // namespace ctp::lbm
```

Block until one or more registered events fire, then dispatch their handlers.

**Parameters:**
- `timeout_us` - Maximum wait time in microseconds. Use `-1` to block indefinitely, `0` for non-blocking poll.

Internally calls `epoll_wait` with up to `kMaxEvents` (256) events per call. For each triggered event, the corresponding `EventAction::Run()` is invoked.

**Example:**
```cpp
#include <clio_ctp/lightbeam/event_manager.h>

void example() {
  ctp::lbm::EventManager em;
  bool running = true;
  while (running) {
    int nfds = em.Wait(1000);  // wait up to 1 ms (microseconds)
    (void)nfds;
  }
}
```

### Accessors

```cpp
namespace ctp::lbm {
class EventManager {
 public:
  int GetEpollFd() const;   // Underlying epoll/wait handle (-1 if N/A)
  int GetSignalFd() const;  // Signal handle, valid after AddSignalEvent()
};
}  // namespace ctp::lbm
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `kMaxEvents` | 256 | Maximum events returned per `epoll_wait` call |

## Usage Pattern

A typical event loop combines file descriptor events with signal-based wakeups:

```cpp
#include <clio_ctp/lightbeam/event_manager.h>

class ReadHandler : public ctp::lbm::EventAction {
 public:
  void Run(const ctp::lbm::EventInfo &info) override {
    // Socket info.trigger_.fd_ is readable -- drain it here.
    int ready_fd = info.trigger_.fd_;
    (void)ready_fd;
  }
};

class SignalHandler : public ctp::lbm::EventAction {
 public:
  void Run(const ctp::lbm::EventInfo &info) override {
    // Woken up by an EventManager::Signal() call -- check for new work.
    (void)info;
  }
};

void event_loop(int socket_fd) {
  ctp::lbm::EventManager em;

  ReadHandler read_handler;
  SignalHandler signal_handler;

  // Monitor a socket for incoming data.
  em.AddEvent(socket_fd, ctp::lbm::kDefaultReadEvent, &read_handler);

  // Allow other threads/processes to wake us via Signal().
  em.AddSignalEvent(&signal_handler);

  // Run the event loop.
  bool running = true;
  while (running) {
    em.Wait(10000);  // 10 ms timeout (microseconds)
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

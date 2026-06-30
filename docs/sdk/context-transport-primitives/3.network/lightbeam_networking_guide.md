# Lightbeam Networking Guide

## Overview

Lightbeam is HSHM's high-performance networking abstraction layer that provides a unified `Transport` interface for distributed data transfer. It supports three transport backends — ZeroMQ, POSIX TCP/Unix sockets, and shared memory — with a two-phase messaging protocol that separates metadata from bulk data transfers.

## Core Concepts

### Unified Transport Interface

All transport backends implement a single `Transport` base class with `Send()` and `Recv()` methods. You create transports through `TransportFactory::Get()` and interact with them identically regardless of the underlying mechanism.

### Two-Phase Messaging Protocol

Lightbeam uses a two-phase approach to message transmission:

1. **Metadata Phase**: Sends message metadata (serialized via cereal or LocalSerialize) including bulk descriptors with sizes and flags
2. **Bulk Data Phase**: Transfers the actual data payloads for bulks marked `BULK_XFER`

The `Recv()` method handles both phases automatically: it deserializes metadata, allocates receive buffers from send descriptors, and receives bulk data in a single call.

### Transport Types

```cpp
#include <clio_ctp/lightbeam/transport_factory_impl.h>

namespace ctp::lbm {
    enum class TransportType {
        kZeroMq,   // ZeroMQ (DEALER/ROUTER pattern)
        kSocket,   // POSIX TCP or Unix domain sockets
        kShm       // Shared memory ring buffer
    };

    enum class TransportMode {
        kClient,   // Initiates connections
        kServer    // Listens for connections
    };
}
```

**Compile-time flags:**

| Flag | Description |
|------|-------------|
| `CTP_ENABLE_LIGHTBEAM` | Master switch for all lightbeam transports |
| `CTP_ENABLE_ZMQ` | Enable ZeroMQ transport |

Socket and SHM transports are always available when lightbeam is enabled.

## Data Structures

### ctp::lbm::Bulk

Describes a memory region for data transfer:

```cpp
#include <clio_ctp/lightbeam/lightbeam.h>

struct Bulk {
  ctp::ipc::FullPtr<char> data;  // Pointer to data (supports shared memory)
  size_t size;                   // Size of data in bytes
  ctp::bitfield32_t flags;       // BULK_EXPOSE or BULK_XFER
  void* desc = nullptr;          // Transport handle (e.g., zmq_msg_t*)
  void* mr = nullptr;            // RDMA memory region handle (future)
};
```

**Bulk Flags:**

| Flag | Description |
|------|-------------|
| `BULK_EXPOSE` | Metadata-only: bulk size and ShmPtr are sent, but no data bytes are transferred over the wire |
| `BULK_XFER` | Data transfer: bulk data bytes are transmitted to the receiver |

### ctp::lbm::LbmMeta

Base class for message metadata:

```cpp
#include <clio_ctp/lightbeam/lightbeam.h>

// LbmMeta is a template parameterized on the allocator used for its bulk
// descriptor vectors. Host code uses LbmMeta<> (MallocAllocator).
template <typename AllocT = ctp::ipc::MallocAllocator>
class LbmMeta {
 public:
  ctp::priv::vector<ctp::lbm::Bulk, AllocT> send;  // Sender's bulk descriptors
  ctp::priv::vector<ctp::lbm::Bulk, AllocT> recv;  // Receiver's (set by Recv)
  size_t send_bulks = 0;                  // Count of BULK_XFER entries in send
  size_t recv_bulks = 0;                  // Count of BULK_XFER entries in recv
  ctp::lbm::ClientInfo client_info_;      // Client routing info (not serialized)
};
```

Extend `LbmMeta` to include custom metadata fields. Implement a `serialize()` method that calls `LbmMeta::serialize(ar)` first:

```cpp
#include <clio_ctp/lightbeam/lightbeam.h>
#include <string>

using namespace ctp::lbm;

class MyMeta : public LbmMeta<> {
 public:
  int request_id;
  std::string operation;

  template <typename Ar>
  void serialize(Ar& ar) {
    LbmMeta<>::serialize(ar);
    ar(request_id, operation);
  }
};
```

### ctp::lbm::ClientInfo

Routing information returned by `Recv()`:

```cpp
#include <string>

struct ClientInfo {
  int rc = 0;                // Return code (0 = success, EAGAIN = no data)
  int fd_ = -1;              // Socket fd (SocketTransport server mode)
  std::string identity_;     // ZMQ identity (ZeroMqTransport server mode)
};
```

### ctp::lbm::LbmContext

Context for controlling send/recv behavior:

```cpp
#include <clio_ctp/lightbeam/lightbeam.h>
#include <cstdint>

constexpr uint32_t LBM_SYNC = 0x1;  // Synchronous mode (legacy no-op flag)

struct LbmContext {
  uint32_t flags;                           // LBM_* flags
  int timeout_ms;                           // Timeout in ms (0 = no timeout)
  char* copy_space = nullptr;               // Ring buffer for SHM transport
  ctp::lbm::ShmTransferInfo* shm_info_ = nullptr;  // SHM ring buffer metadata

  LbmContext();                             // Default: no flags, no timeout
  explicit LbmContext(uint32_t f);          // Flags only
  LbmContext(uint32_t f, int timeout);      // Flags + timeout
  bool IsSync() const;
  bool HasTimeout() const;
};
```

## API Reference

### ctp::lbm::Transport

The unified interface implemented by all transports:

```cpp
#include <clio_ctp/lightbeam/lightbeam.h>
#include <string>

using namespace ctp;       // for u32
using namespace ctp::lbm;  // for Bulk, LbmContext, LbmMeta, ClientInfo, ...

// Simplified view of the real ctp::lbm::Transport. Concrete transports
// (ZeroMqTransport, SocketTransport, ShmTransport) derive from it; Transport
// dispatches Expose/Send/Recv to the concrete type via `type_`.
class Transport {
 public:
  TransportType type_;
  TransportMode mode_;

  bool IsServer() const;
  bool IsClient() const;

  // Create a bulk descriptor for a memory region
  Bulk Expose(const ctp::ipc::FullPtr<char>& ptr, size_t data_size, u32 flags);

  // Send metadata and bulk data
  template <typename MetaT>
  int Send(MetaT& meta, const LbmContext& ctx = LbmContext());

  // Receive metadata and bulk data (single call)
  template <typename MetaT>
  ClientInfo Recv(MetaT& meta, const LbmContext& ctx = LbmContext());

  // Free transport-allocated receive buffers
  void ClearRecvHandles(LbmMeta<>& meta);

  // Server-only: get the bound address
  std::string GetAddress() const;

  // Actual bound TCP port (resolves ephemeral port-0 binds); 0 if N/A
  int GetBoundPort() const;

  // Register with an EventManager for event-driven I/O
  void RegisterEventManager(EventManager& em);
};
```

**Key methods:**

- `Expose()`: Creates a `Bulk` descriptor from a `hipc::FullPtr<char>`. No data is transferred yet.
- `Send()`: Serializes metadata, then transmits data for each `BULK_XFER` bulk in `meta.send`. Returns `0` on success.
- `Recv()`: Receives metadata, auto-populates `meta.recv` from `meta.send` descriptors, and receives bulk data. Returns a `ClientInfo` with `rc == 0` on success, `rc == EAGAIN` if no data is available.
- `ClearRecvHandles()`: Frees transport-allocated buffers in `meta.recv`. Must be called after you are done with received data.

### ctp::lbm::TransportFactory

Factory for creating transport instances:

```cpp
#include <clio_ctp/lightbeam/lightbeam.h>
#include <string>

using namespace ctp::lbm;

// TransportPtr is a std::unique_ptr<Transport, TransportDeleter> — the deleter
// dispatches to the concrete transport's destructor via `type_`.
class TransportFactory {
 public:
  static TransportPtr Get(const std::string& addr, TransportType t,
                          TransportMode mode,
                          const std::string& protocol = "", int port = 0);

  static TransportPtr Get(const std::string& addr, TransportType t,
                          TransportMode mode, const std::string& protocol,
                          int port, const std::string& domain);
};
```

**Default ports/protocols when empty:**

| Transport | Default Protocol | Default Port |
|-----------|-----------------|--------------|
| ZeroMQ | `"tcp"` | 8192 |
| Socket | `"tcp"` | 8193 |
| SHM | N/A | N/A |

## Transport Backends

### ZeroMQ Transport

Uses a ROUTER/DEALER socket pattern. Server creates a ROUTER socket; clients create DEALER sockets with unique identities (hostname:PID).

```cpp
#include <clio_ctp/lightbeam/transport_factory_impl.h>

using namespace ctp::lbm;

void zmq_construct_example() {
  // The factory creates a ZeroMqTransport (requires CTP_ENABLE_ZMQ).
  auto server = TransportFactory::Get(
      "127.0.0.1", TransportType::kZeroMq, TransportMode::kServer, "tcp", 8195);
  auto client = TransportFactory::Get(
      "127.0.0.1", TransportType::kZeroMq, TransportMode::kClient, "tcp", 8195);
}
```

**Features:**
- Shared ZMQ context across client instances (2 I/O threads)
- ZMTP heartbeats for dead connection detection (1s interval, 3s timeout)
- Zero-copy sends via `zmq_msg_init_data()`
- Zero-copy receives when no pre-allocated buffer is provided (data pointer points directly into ZMQ message; freed by `ClearRecvHandles()`)
- 4 MB send/recv socket buffers
- Supports `tcp://` and `ipc://` protocols

### Socket Transport

Uses POSIX TCP or Unix domain sockets with scatter-gather I/O (`writev`).

```cpp
#include <clio_ctp/lightbeam/socket_transport.h>
#include <memory>

using namespace ctp::lbm;

void socket_construct_example() {
  // TCP
  auto server = std::make_unique<SocketTransport>(
      TransportMode::kServer, "127.0.0.1", "tcp", 9100);
  auto client = std::make_unique<SocketTransport>(
      TransportMode::kClient, "127.0.0.1", "tcp", 9100);

  // Unix domain socket (POSIX only)
  auto server_ipc = std::make_unique<SocketTransport>(
      TransportMode::kServer, "/tmp/my.sock", "ipc", 0);
  auto client_ipc = std::make_unique<SocketTransport>(
      TransportMode::kClient, "/tmp/my.sock", "ipc", 0);
}
```

**Features:**
- TCP_NODELAY enabled for low-latency transfers
- Non-blocking accept for multi-client servers
- `EventManager` integration for epoll-driven I/O
- Bidirectional: server can send responses back using `client_info_.fd_`
- 4-byte length-prefixed framing (network byte order)
- Single `writev()` syscall for metadata + all bulk data

### Shared Memory Transport

Uses an SPSC (single-producer, single-consumer) ring buffer for zero-network-hop transfer between threads or co-located processes. Requires a shared `LbmContext` with a pre-allocated copy space.

```cpp
#include <clio_ctp/lightbeam/shm_transport.h>
#include <cstring>
#include <thread>

using namespace ctp::lbm;

void shm_intro_example() {
  ShmTransport client(TransportMode::kClient);
  ShmTransport server(TransportMode::kServer);

  // Set up shared copy space for the SPSC ring buffer
  char copy_space[4096];
  ShmTransferInfo shm_info;
  shm_info.copy_space_size_ = 4096;

  LbmContext ctx;
  ctx.copy_space = copy_space;
  ctx.shm_info_ = &shm_info;

  const char* data = "Hello via shared memory";
  LbmMeta<> send_meta;
  send_meta.send.push_back(client.Expose(
      ctp::ipc::FullPtr<char>(const_cast<char*>(data)), strlen(data),
      BULK_XFER));
  send_meta.send_bulks = 1;

  // Send and receive must run in separate threads
  LbmMeta<> recv_meta;
  std::thread sender([&]() { client.Send(send_meta, ctx); });
  auto info = server.Recv(recv_meta, ctx);
  sender.join();
  server.ClearRecvHandles(recv_meta);
}
```

**Features:**
- Uses `LocalSerialize` instead of cereal (no network dependencies)
- ShmPtr passthrough: if a bulk's `alloc_id` is valid (shared memory), only the ShmPtr is transferred — no data copy
- Private memory: if `alloc_id` is null, full data bytes are copied through the ring buffer
- `BULK_EXPOSE` flag: only the ShmPtr is sent (no data at all)
- Automatic chunking for data larger than the ring buffer

## Examples

### Basic Client-Server Communication

```cpp
#include <clio_ctp/lightbeam/transport_factory_impl.h>

#include <cassert>
#include <cerrno>
#include <chrono>
#include <cstring>
#include <string>
#include <thread>

using namespace ctp::lbm;

void basic_example() {
  // Create server and client via factory
  auto server = TransportFactory::Get(
      "127.0.0.1", TransportType::kSocket, TransportMode::kServer, "tcp", 9200);
  auto client = TransportFactory::Get(
      "127.0.0.1", TransportType::kSocket, TransportMode::kClient, "tcp", 9200);

  // Prepare data
  const char* message = "Hello, Lightbeam!";
  size_t message_size = strlen(message);

  // Client: expose memory and send
  LbmMeta<> send_meta;
  send_meta.send.push_back(client->Expose(
      ctp::ipc::FullPtr<char>(const_cast<char*>(message)), message_size,
      BULK_XFER));
  send_meta.send_bulks = 1;

  int rc = client->Send(send_meta);
  assert(rc == 0);

  // Server: receive with retry loop
  LbmMeta<> recv_meta;
  ClientInfo info;
  do {
    info = server->Recv(recv_meta);
    if (info.rc == EAGAIN) {
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
  } while (info.rc == EAGAIN);
  assert(info.rc == 0);

  // Access received data (transport-allocated recv buffer)
  std::string received(recv_meta.recv[0].data.ptr_, recv_meta.recv[0].size);

  // Free transport-allocated buffers
  server->ClearRecvHandles(recv_meta);
}
```

### Custom Metadata with Multiple Bulks

```cpp
#include <clio_ctp/lightbeam/transport_factory_impl.h>

#include <cassert>
#include <cerrno>
#include <cstring>
#include <string>

using namespace ctp::lbm;

class RequestMeta : public LbmMeta<> {
 public:
  int request_id;
  std::string operation;

  template <typename Ar>
  void serialize(Ar& ar) {
    LbmMeta<>::serialize(ar);
    ar(request_id, operation);
  }
};

void custom_metadata_example() {
  auto server = TransportFactory::Get(
      "127.0.0.1", TransportType::kSocket, TransportMode::kServer, "tcp", 9201);
  auto client = TransportFactory::Get(
      "127.0.0.1", TransportType::kSocket, TransportMode::kClient, "tcp", 9201);

  const char* data1 = "First chunk";
  const char* data2 = "Second chunk";

  RequestMeta send_meta;
  send_meta.request_id = 42;
  send_meta.operation = "write";
  send_meta.send.push_back(client->Expose(
      ctp::ipc::FullPtr<char>(const_cast<char*>(data1)), strlen(data1),
      BULK_XFER));
  send_meta.send.push_back(client->Expose(
      ctp::ipc::FullPtr<char>(const_cast<char*>(data2)), strlen(data2),
      BULK_XFER));
  send_meta.send_bulks = 2;

  client->Send(send_meta);

  // Server receives everything in one call
  RequestMeta recv_meta;
  ClientInfo info;
  do {
    info = server->Recv(recv_meta);
  } while (info.rc == EAGAIN);

  // Access metadata and bulk data
  assert(recv_meta.request_id == 42);
  assert(recv_meta.operation == "write");
  std::string chunk0(recv_meta.recv[0].data.ptr_, recv_meta.recv[0].size);
  std::string chunk1(recv_meta.recv[1].data.ptr_, recv_meta.recv[1].size);

  server->ClearRecvHandles(recv_meta);
}
```

### Bidirectional Communication (Socket Transport)

```cpp
#include <clio_ctp/lightbeam/socket_transport.h>

#include <cerrno>
#include <cstring>
#include <memory>

using namespace ctp::lbm;

void bidirectional_example() {
  auto server = std::make_unique<SocketTransport>(
      TransportMode::kServer, "127.0.0.1", "tcp", 9202);
  auto client = std::make_unique<SocketTransport>(
      TransportMode::kClient, "127.0.0.1", "tcp", 9202);

  // Client sends a request
  const char* request = "client_request";
  LbmMeta<> send_meta;
  send_meta.send.push_back(client->Expose(
      ctp::ipc::FullPtr<char>(const_cast<char*>(request)), strlen(request),
      BULK_XFER));
  send_meta.send_bulks = 1;
  client->Send(send_meta);

  // Server receives the request
  LbmMeta<> recv_meta;
  ClientInfo info;
  do {
    info = server->Recv(recv_meta);
  } while (info.rc == EAGAIN);

  // Server sends a response back using the client's fd
  const char* response = "server_response";
  LbmMeta<> resp_meta;
  resp_meta.client_info_.fd_ = info.fd_;  // Route back to this client
  resp_meta.send.push_back(server->Expose(
      ctp::ipc::FullPtr<char>(const_cast<char*>(response)), strlen(response),
      BULK_XFER));
  resp_meta.send_bulks = 1;
  server->Send(resp_meta);

  // Client receives the response
  LbmMeta<> client_recv;
  ClientInfo client_info;
  do {
    client_info = client->Recv(client_recv);
  } while (client_info.rc == EAGAIN);

  server->ClearRecvHandles(recv_meta);
  client->ClearRecvHandles(client_recv);
}
```

### EventManager-Driven Server

```cpp
#include <clio_ctp/lightbeam/socket_transport.h>

#include <memory>

using namespace ctp::lbm;

void event_driven_example() {
  auto server = std::make_unique<SocketTransport>(
      TransportMode::kServer, "127.0.0.1", "tcp", 9203);

  EventManager em;
  server->RegisterEventManager(em);

  // Accept clients, send data, then:
  while (true) {
    int nfds = em.Wait(100000);  // 100ms timeout (in microseconds)
    if (nfds <= 0) continue;

    LbmMeta<> recv_meta;
    auto info = server->Recv(recv_meta);
    if (info.rc == 0) {
      // Process message
      server->ClearRecvHandles(recv_meta);
    }
  }
}
```

### Shared Memory Transport

```cpp
#include <clio_ctp/lightbeam/shm_transport.h>
#include <clio_ctp/lightbeam/transport_factory_impl.h>

#include <cassert>
#include <cstring>
#include <string>
#include <thread>

using namespace ctp::lbm;

void shm_example() {
  // Create shared copy space
  constexpr size_t kCopySpaceSize = 4096;
  char copy_space[kCopySpaceSize] = {};
  ShmTransferInfo shm_info;
  shm_info.copy_space_size_ = kCopySpaceSize;

  LbmContext ctx;
  ctx.copy_space = copy_space;
  ctx.shm_info_ = &shm_info;

  auto client =
      TransportFactory::Get("", TransportType::kShm, TransportMode::kClient);
  auto server =
      TransportFactory::Get("", TransportType::kShm, TransportMode::kServer);

  const char* data = "Hello via shared memory";
  LbmMeta<> send_meta;
  send_meta.send.push_back(client->Expose(
      ctp::ipc::FullPtr<char>(const_cast<char*>(data)), strlen(data),
      BULK_XFER));
  send_meta.send_bulks = 1;

  // Must run sender and receiver in separate threads
  int send_rc = -1;
  std::thread sender([&]() { send_rc = client->Send(send_meta, ctx); });

  LbmMeta<> recv_meta;
  auto info = server->Recv(recv_meta, ctx);
  sender.join();

  assert(info.rc == 0);
  assert(send_rc == 0);

  std::string received(recv_meta.recv[0].data.ptr_, recv_meta.recv[0].size);
  server->ClearRecvHandles(recv_meta);
}
```

## Error Handling

All `Send()` calls return an integer error code. `Recv()` returns a `ClientInfo` struct with an `rc` field.

| Return Code | Meaning |
|-------------|---------|
| `0` | Success |
| `EAGAIN` | No data available (non-blocking recv) |
| `-1` | Generic error (deserialization failure, invalid state) |
| Other positive values | System `errno` or ZMQ error codes |

**Polling pattern:**

```cpp
#include <clio_ctp/lightbeam/transport_factory_impl.h>

#include <cerrno>
#include <chrono>
#include <thread>

using namespace ctp::lbm;

void polling_example() {
  auto server = TransportFactory::Get(
      "127.0.0.1", TransportType::kSocket, TransportMode::kServer, "tcp", 9300);

  LbmMeta<> meta;
  ClientInfo info;
  do {
    info = server->Recv(meta);
    if (info.rc == EAGAIN) {
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
  } while (info.rc == EAGAIN);

  if (info.rc != 0) {
    // Handle error
  }
  server->ClearRecvHandles(meta);
}
```

## Best Practices

1. **Always call `ClearRecvHandles()`** after processing received data to free transport-allocated buffers (ZMQ messages, malloc'd memory).

2. **Data lifetime**: Ensure data passed to `Expose()` remains valid until `Send()` completes.

3. **Serialization**: Always call `LbmMeta::serialize(ar)` first in custom metadata serialize methods.

4. **ZMQ connection time**: ZMQ uses asynchronous connection establishment. The constructor polls for up to 5 seconds for the connection to be ready.

5. **Large TCP transfers**: For data larger than the TCP buffer size, run `Send()` and `Recv()` in separate threads to avoid deadlock.

6. **SHM ring buffer sizing**: Choose a copy space size that balances memory usage with throughput. Data larger than the ring buffer is automatically chunked.

7. **EventManager**: Use `RegisterEventManager()` and `em.Wait()` for efficient multi-client servers instead of busy-polling.

## Related Documentation

- [EventManager Guide](./event_manager_guide) - Epoll-based event loop for I/O multiplexing
- [LocalSerialize Guide](./local_serialize_guide) - Binary serialization used by SHM transport

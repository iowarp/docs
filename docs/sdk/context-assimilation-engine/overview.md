---
sidebar_position: 1
---

# Overview

## Introduction

The Context Assimilation Engine (CAE) is a Chimaera module (`wrp_cae::core`) that ingests external data sources into the IOWarp runtime. It reads data from files, HDF5 datasets, or remote Globus endpoints and stores them as blobs in the Context Transfer Engine (CTE). The CAE is registered as a ChiMod container with pool ID `400.0`.

## Architecture

```
                +-----------+
                |   Client  |  (wrp_cae::core::Client)
                +-----+-----+
                      | AsyncParseOmni / AsyncProcessHdf5Dataset
                      v
           +----------+-----------+
           |       Runtime        |  (wrp_cae::core::Runtime : chi::Container)
           +----------+-----------+
                      |
          +-----------+-----------+
          |                       |
   ParseOmni()          ProcessHdf5Dataset()
          |
          v
  +-------+--------+
  | AssimilatorFactory |  factory.Get(src_url)
  +-------+--------+
          |
    +-----+-----+-----+
    |           |           |
BinaryFile  Hdf5File   GlobusFile
Assimilator Assimilator Assimilator
    |           |           |
    +-----+-----+-----+
          |
          v
  CTE Client (wrp_cte::core::Client)
  Put / Get blob operations
```

### Key Components

| Component | Header | Description |
|-----------|--------|-------------|
| `Runtime` | `wrp_cae/core/core_runtime.h` | Container server-side logic |
| `Client` | `wrp_cae/core/core_client.h` | Client-side async API |
| `AssimilatorFactory` | `wrp_cae/core/factory/assimilator_factory.h` | Creates assimilators by source protocol |
| `BaseAssimilator` | `wrp_cae/core/factory/base_assimilator.h` | Abstract interface for all assimilators |
| `AssimilationCtx` | `wrp_cae/core/factory/assimilation_ctx.h` | Serializable transfer descriptor |

### Namespace and Pool ID

- **Namespace:** `wrp_cae::core`
- **Pool ID:** `constexpr chi::PoolId kCaePoolId(400, 0)` (defined in `constants.h`)
- **ChiMod library name:** Derived from `chimaera_mod.yaml` (`module_name: core`, `namespace: wrp_cae`)

## Factory Pattern

The CAE uses a factory pattern to select the correct assimilator based on the source URL protocol.

### AssimilatorFactory

`AssimilatorFactory::Get(const std::string& src)` parses the protocol from the source URI and returns the appropriate `BaseAssimilator` subclass:

| Protocol | URI Format | Assimilator | Build Flag |
|----------|-----------|-------------|------------|
| `file` | `file::/path/to/file` | `BinaryFileAssimilator` | Always enabled |
| `hdf5` | `hdf5::/path/file.h5:/dataset` | `Hdf5FileAssimilator` | `-DWRP_CORE_ENABLE_HDF5=ON` |
| `globus` | `globus://<endpoint_id>/<path>` | `GlobusFileAssimilator` | `-DCAE_ENABLE_GLOBUS=ON` |

The factory also detects Globus web URLs (`https://app.globus.org/...`) and routes them to `GlobusFileAssimilator`.

Protocol extraction supports two URI styles:
- Standard: `protocol://path` (extracts text before `://`)
- Custom: `protocol::path` (extracts text before `::`)

### BaseAssimilator Interface

All assimilators implement the `BaseAssimilator` abstract class:

```cpp
class BaseAssimilator {
 public:
  virtual ~BaseAssimilator() = default;
  virtual chi::TaskResume Schedule(const AssimilationCtx& ctx,
                                   int& error_code) = 0;
};
```

`Schedule` is a **coroutine**. It uses `co_await` internally to perform async CTE blob operations (create tag, put data). The `error_code` output parameter returns 0 on success.

### Concrete Assimilators

**BinaryFileAssimilator** reads local files in chunks. It extracts the file path from `ctx.src`, respects `range_off` and `range_size` for partial reads, and stores the data as CTE blobs.

**Hdf5FileAssimilator** opens an HDF5 file, discovers all datasets using the HDF5 visitor API, applies include/exclude glob filters from the `AssimilationCtx`, and stores each dataset as a tagged CTE blob with tensor metadata (type and dimensions). It also exposes `ProcessDataset()` publicly for distributed per-dataset processing.

**GlobusFileAssimilator** handles Globus transfers. It supports Globus-to-Globus transfers (via the Globus transfer API with submission IDs and polling) and Globus-to-local downloads (via HTTPS). Authentication tokens are passed through `ctx.src_token`.

## AssimilationCtx

`AssimilationCtx` is the serializable descriptor for a single data transfer:

```cpp
struct AssimilationCtx {
  std::string src;          // Source URI (e.g., "file::/path/to/file")
  std::string dst;          // Destination URI (e.g., "iowarp::tag_name")
  std::string format;       // Data format ("binary", "hdf5")
  std::string depends_on;   // Dependency on another transfer (empty = none)
  size_t range_off;         // Byte offset for partial reads
  size_t range_size;        // Byte count (0 = entire file)
  std::string src_token;    // Source authentication token
  std::string dst_token;    // Destination authentication token
  std::vector<std::string> include_patterns;  // Glob patterns to include
  std::vector<std::string> exclude_patterns;  // Glob patterns to exclude
};
```

Serialization uses the [cereal](https://uscilab.github.io/cereal/) library with binary archives. The client serializes a `std::vector<AssimilationCtx>` into the `ParseOmniTask`, and the runtime deserializes it on the server side.

## Method IDs

Defined in `chimaera_mod.yaml`:

| Method | ID | Description |
|--------|----|-------------|
| `kCreate` | 0 | Container creation |
| `kDestroy` | 1 | Container destruction |
| `kMonitor` | 9 | Container state monitoring |
| `kParseOmni` | 10 | Parse OMNI YAML and schedule transfers |
| `kProcessHdf5Dataset` | 11 | Process a single HDF5 dataset (distributed) |

## Execution Lifecycle

### 1. Client Initialization

```cpp
#include <wrp_cae/core/core_client.h>

// Initialize the global CAE client singleton
// This also initializes the CTE client internally
WRP_CAE_CLIENT_INIT(config_path);

// Access the client via macro
auto* client = WRP_CAE_CLIENT;
```

`WRP_CAE_CLIENT_INIT` creates the CAE container pool via `AsyncCreate`, which triggers `Runtime::Create` on the server side. The runtime initializes its internal CTE client using `wrp_cte::core::kCtePoolId`.

### 2. Load and Parse OMNI File

The typical entry point is the `clio_cae_omni` utility:

```bash
clio_cae_omni /path/to/transfers.yaml
```

Programmatically:

```cpp
// Load OMNI YAML into AssimilationCtx vector
auto contexts = LoadOmni("/path/to/transfers.yaml");

// Submit to CAE runtime
auto future = client->AsyncParseOmni(contexts);
future.Wait();
```

### 3. Runtime Processes Transfers

`Runtime::ParseOmni` executes on a Chimaera worker thread as a coroutine:

1. **Deserialize** the `std::vector<AssimilationCtx>` from the task's binary payload
2. **Create** an `AssimilatorFactory` with the CTE client
3. **For each context:**
   a. Call `factory.Get(ctx.src)` to obtain the correct assimilator
   b. `co_await assimilator->Schedule(ctx, error_code)` to execute the transfer
   c. The assimilator reads data from the source and writes CTE blobs asynchronously
4. **Return** `result_code_`, `error_message_`, and `num_tasks_scheduled_`

### 4. Distributed HDF5 Processing

For HDF5 files with many datasets, the CAE can distribute dataset processing across nodes:

```cpp
auto future = client->AsyncProcessHdf5Dataset(
    chi::PoolQuery::Physical(node_id),  // Route to specific node
    "/path/to/file.h5",
    "/dataset/path",
    "tag_prefix");
```

`Runtime::ProcessHdf5Dataset` opens the HDF5 file, creates an `Hdf5FileAssimilator`, and calls `ProcessDataset()` for the specified dataset.

### 5. Coroutine Execution Model

All runtime methods are C++20 coroutines returning `chi::TaskResume`. When an assimilator needs to perform an async CTE operation (e.g., put a blob), it uses `co_await` to suspend execution. The Chimaera scheduler resumes the coroutine when the CTE operation completes, allowing the worker thread to process other tasks while waiting.

## Client API Reference

### `AsyncCreate`

```cpp
chi::Future<CreateTask> AsyncCreate(
    const chi::PoolQuery& pool_query,
    const std::string& pool_name,
    const chi::PoolId& custom_pool_id,
    const CreateParams& params = CreateParams());
```

Creates the CAE container pool. Submitted to the admin pool for `GetOrCreatePool` processing.

### `AsyncParseOmni`

```cpp
chi::Future<ParseOmniTask> AsyncParseOmni(
    const std::vector<AssimilationCtx>& contexts);
```

Serializes the contexts vector and submits a `ParseOmniTask` to the CAE runtime. The task is routed locally (`PoolQuery::Local()`).

### `AsyncProcessHdf5Dataset`

```cpp
chi::Future<ProcessHdf5DatasetTask> AsyncProcessHdf5Dataset(
    const chi::PoolQuery& pool_query,
    const std::string& file_path,
    const std::string& dataset_path,
    const std::string& tag_prefix);
```

Processes a single HDF5 dataset. Use `PoolQuery::Physical(node_id)` to route to a specific node for distributed processing.

## Adding a New Assimilator

To add support for a new data source protocol:

1. **Create a header** in `core/include/wrp_cae/core/factory/`:

```cpp
class MyAssimilator : public BaseAssimilator {
 public:
  explicit MyAssimilator(std::shared_ptr<wrp_cte::core::Client> cte_client);
  chi::TaskResume Schedule(const AssimilationCtx& ctx,
                           int& error_code) override;
 private:
  std::shared_ptr<wrp_cte::core::Client> cte_client_;
};
```

2. **Implement `Schedule`** in `core/src/factory/`. Use `co_await` for async CTE operations. Set `error_code = 0` on success.

3. **Register in the factory** (`assimilator_factory.cc`):

```cpp
} else if (protocol == "myproto") {
  return std::make_unique<MyAssimilator>(cte_client_);
}
```

4. **Add build guards** if the assimilator has optional dependencies (e.g., `#ifdef MY_ENABLE_FLAG`).

## Build Configuration

| CMake Option | Default | Description |
|-------------|---------|-------------|
| `WRP_CORE_ENABLE_HDF5` | OFF | Enable HDF5 assimilator (requires libhdf5) |
| `CAE_ENABLE_GLOBUS` | OFF | Enable Globus assimilator (requires POCO) |

## Related Documentation

- [OMNI File Format](omni.md) - YAML configuration for data transfers
- [Module Development Guide](../context-runtime/2.module_dev_guide.md) - ChiMod development
- [CTE Documentation](../context-transfer-engine/cte.md) - CTE storage documentation

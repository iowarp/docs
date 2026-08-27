---
sidebar_position: 1
---

# Overview

## Introduction

The Context Assimilation Engine (CAE) is a CLIO Runtime module (`clio_cae::core`) that ingests external data sources into the CLIO Runtime. It reads data from files, HDF5 datasets, or remote Globus endpoints and stores them as blobs in the Context Transfer Engine (CTE). The CAE is registered as a Module container with pool ID `400.0`.

CAE ships a second, optional ChiMod: the **summarizer** (`clio_cae_summarizer`, pool `401.0`). It interposes on the CTE core's task interface and attaches an LLM-generated summary to each matching blob on the way through. See [the interposition chain](../context-transfer-engine/chimod-chain#summarizer-chimod-clio_cae_summarizer) for its behavior and [deployment configuration](../../deployment/configuration) for its keys.

## Architecture

```
                +-----------+
                |   Client  |  (clio_cae::core::Client)
                +-----+-----+
                      | AsyncParseOmni / AsyncProcessHdf5Dataset
                      v
           +----------+-----------+
           |       Runtime        |  (clio::cae::core::Runtime : clio::run::Container)
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
  CTE Client (clio_cte::core::Client)
  Put / Get blob operations
```

### Key Components

| Component | Header | Description |
|-----------|--------|-------------|
| `Runtime` | `clio_cae/core/core_runtime.h` | Container server-side logic |
| `Client` | `clio_cae/core/core_client.h` | Client-side async API |
| `AssimilatorFactory` | `clio_cae/core/factory/assimilator_factory.h` | Creates assimilators by source protocol |
| `BaseAssimilator` | `clio_cae/core/factory/base_assimilator.h` | Abstract interface for all assimilators |
| `AssimilationCtx` | `clio_cae/core/factory/assimilation_ctx.h` | Serializable transfer descriptor |

### Namespace and Pool ID

- **Namespace:** `clio_cae::core`
- **Pool ID:** `constexpr clio::run::PoolId kCaePoolId(400, 0)` (defined in `constants.h`)
- **Module library name:** Derived from `clio_mod.yaml` (`module_name: core`, `namespace: clio_cae`)

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

```text
// Declared in clio_cae/core/factory/base_assimilator.h
namespace clio::cae::core {
class BaseAssimilator {
 public:
  virtual ~BaseAssimilator() = default;
  virtual clio::run::TaskResume Schedule(const AssimilationCtx& ctx,
                                         int& error_code) = 0;
};
}  // namespace clio::cae::core
```

`Schedule` is a **coroutine**. It uses `co_await` internally to perform async CTE blob operations (create tag, put data). The `error_code` output parameter returns 0 on success.

### Concrete Assimilators

**BinaryFileAssimilator** reads local files in chunks. It extracts the file path from `ctx.src`, respects `range_off` and `range_size` for partial reads, and stores the data as CTE blobs.

**Hdf5FileAssimilator** opens an HDF5 file, discovers all datasets using the HDF5 visitor API, applies include/exclude glob filters from the `AssimilationCtx`, and stores each dataset as a tagged CTE blob with tensor metadata (type and dimensions). It also exposes `ProcessDataset()` publicly for distributed per-dataset processing.

**GlobusFileAssimilator** handles Globus transfers. It supports Globus-to-Globus transfers (via the Globus transfer API with submission IDs and polling) and Globus-to-local downloads (via HTTPS). Authentication tokens are passed through `ctx.src_token`.

## AssimilationCtx

`AssimilationCtx` is the serializable descriptor for a single data transfer:

```text
// Declared in clio_cae/core/factory/assimilation_ctx.h
namespace clio::cae::core {
struct AssimilationCtx {
  std::string src;          // Source URI (e.g., "file::/path/to/file")
  std::string dst;          // Destination URI (e.g., "iowarp::tag_name")
  std::string format;       // Data format ("binary", "hdf5")
  std::string depends_on;   // Dependency on another transfer (empty = none)
  size_t range_off;         // Byte offset for partial reads
  size_t range_size;        // Byte count (0 = entire file)
  std::string src_token;    // Source authentication token
  std::string dst_token;    // Destination authentication token
  std::string src_data;     // Inline payload for "string::..." sources
  std::vector<std::string> include_patterns;  // Glob patterns to include
  std::vector<std::string> exclude_patterns;  // Glob patterns to exclude
};
}  // namespace clio::cae::core
```

Serialization uses the [cereal](https://uscilab.github.io/cereal/) library with binary archives. The client serializes a `std::vector<AssimilationCtx>` into the `ParseOmniTask`, and the runtime deserializes it on the server side.

## Method IDs

Defined in `clio_mod.yaml`:

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
#include <clio_cae/core/core_client.h>
#include <string>

void example() {
  std::string config_path = "clio_config.yaml";

  // Initialize the global CAE client singleton
  // This also initializes the CTE client internally
  CLIO_CAE_CLIENT_INIT(config_path);

  // Access the client via macro
  clio::cae::core::Client* client = CLIO_CAE_CLIENT;
  (void)client;
}
```

`CLIO_CAE_CLIENT_INIT` creates the CAE container pool via `AsyncCreate`, which triggers `Runtime::Create` on the server side. The runtime initializes its internal CTE client using `clio::cte::core::kCtePoolId`.

### 2. Load and Parse OMNI File

The typical entry point is the `clio_cae` utility:

```bash
clio_cae /path/to/transfers.yaml
```

Programmatically:

```cpp
#include <clio_cae/core/core_client.h>
#include <clio_cae/core/constants.h>
#include <clio_cae/core/factory/assimilation_ctx.h>
#include <string>
#include <vector>

// LoadOmni is provided by the clio_cae utility (core/util/clio_cae.cc):
// it parses an OMNI YAML file into a vector of AssimilationCtx.
std::vector<clio::cae::core::AssimilationCtx> LoadOmni(
    const std::string& omni_path);

void example() {
  using namespace clio::cae::core;

  // Load OMNI YAML into AssimilationCtx vector
  std::vector<AssimilationCtx> contexts = LoadOmni("/path/to/transfers.yaml");

  // Connect to the CAE core container pool and submit
  Client client(kCaePoolId);
  auto future = client.AsyncParseOmni(contexts);
  future.Wait();
}
```

### 3. Runtime Processes Transfers

`Runtime::ParseOmni` executes on a CLIO Runtime worker thread as a coroutine:

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
#include <clio_cae/core/core_client.h>
#include <clio_cae/core/constants.h>

void example() {
  using namespace clio::cae::core;
  Client client(kCaePoolId);

  clio::run::u32 node_id = 1;
  auto future = client.AsyncProcessHdf5Dataset(
      clio::run::PoolQuery::Physical(node_id),  // Route to specific node
      "/path/to/file.h5",
      "/dataset/path",
      "tag_prefix");
  future.Wait();
}
```

`Runtime::ProcessHdf5Dataset` opens the HDF5 file, creates an `Hdf5FileAssimilator`, and calls `ProcessDataset()` for the specified dataset.

### 5. Coroutine Execution Model

All runtime methods are C++20 coroutines returning `clio::run::TaskResume`. When an assimilator needs to perform an async CTE operation (e.g., put a blob), it uses `co_await` to suspend execution. The CLIO Runtime scheduler resumes the coroutine when the CTE operation completes, allowing the worker thread to process other tasks while waiting.

## Client API Reference

### `AsyncCreate`

```text
// clio::cae::core::Client
clio::run::Future<CreateTask> AsyncCreate(
    const clio::run::PoolQuery& pool_query,
    const std::string& pool_name,
    const clio::run::PoolId& custom_pool_id,
    const CreateParams& params = CreateParams());
```

Creates the CAE container pool. Submitted to the admin pool for `GetOrCreatePool` processing.

### `AsyncParseOmni`

```text
// clio::cae::core::Client
clio::run::Future<ParseOmniTask> AsyncParseOmni(
    const std::vector<AssimilationCtx>& contexts);
```

Serializes the contexts vector and submits a `ParseOmniTask` to the CAE runtime. The task is routed locally (`PoolQuery::Local()`).

### `AsyncProcessHdf5Dataset`

```text
// clio::cae::core::Client
clio::run::Future<ProcessHdf5DatasetTask> AsyncProcessHdf5Dataset(
    const clio::run::PoolQuery& pool_query,
    const std::string& file_path,
    const std::string& dataset_path,
    const std::string& tag_prefix);
```

Processes a single HDF5 dataset. Use `PoolQuery::Physical(node_id)` to route to a specific node for distributed processing.

## Adding a New Assimilator

To add support for a new data source protocol:

1. **Create a header** in `core/include/clio_cae/core/factory/`:

```cpp
#include <clio_cae/core/factory/base_assimilator.h>
#include <clio_cte/core/core_client.h>
#include <memory>
#include <utility>

namespace my_ext {

class MyAssimilator : public clio::cae::core::BaseAssimilator {
 public:
  explicit MyAssimilator(std::shared_ptr<clio::cte::core::Client> cte_client)
      : cte_client_(std::move(cte_client)) {}

  clio::run::TaskResume Schedule(const clio::cae::core::AssimilationCtx& ctx,
                                 int& error_code) override;

 private:
  std::shared_ptr<clio::cte::core::Client> cte_client_;
};

}  // namespace my_ext
```

2. **Implement `Schedule`** in `core/src/factory/`. Use `co_await` for async CTE operations. Set `error_code = 0` on success.

3. **Register in the factory** (`assimilator_factory.cc`):

```text
// Inside AssimilatorFactory::Get(), extend the protocol dispatch chain:
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
- [Module Development Guide](../context-runtime/2.module_dev_guide.md) - Module development
- [CTE Documentation](../context-transfer-engine/cte.md) - CTE storage documentation

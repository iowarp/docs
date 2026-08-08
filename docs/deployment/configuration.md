---
sidebar_position: 1
title: Configuration
description: Complete configuration reference for CLIO Runtime and module deployments.
---

# Configuration Reference

## Overview

IOWarp uses a single YAML file to configure the CLIO Runtime and any modules (ChiMods) that are created at startup via the `compose` section.

When you install IOWarp, a default `~/.clio/clio.yaml` is seeded for you. You can edit it directly or override the path with `CLIO_SERVER_CONF`.

The configuration file is located via (in priority order, first hit wins):

| Source | Priority | Description |
|--------|----------|-------------|
| `CLIO_SERVER_CONF` env var | **1st** | Checked first. Any path you like. |
| `~/.clio/clio.yaml` | **2nd** | Per-user default. Seeded at install time from `context-runtime/config/clio_default.yaml`. |
| Built-in defaults | **3rd** | Compiled-in fallback (default port, default workers, **empty compose** — so no storage tiers). |

:::caution
An **empty** config file is reported as a load failure and logged loudly rather than
being accepted silently. It would otherwise parse as a YAML null, every section would
miss, and the runtime would come up on the built-in defaults — an empty compose section,
so no storage tiers, with the resulting failures (e.g. `PutBlob` out-of-space on the very
first write) surfacing far downstream. The runtime still falls back to defaults, but you
get a warning naming the file.
:::

Legacy `~/.chimaera/` paths are **no longer** consulted — see
[Deprecation Notes](../deprecation-notes).

```bash
# Use the installed default
clio_run start

# Or override with a custom config
export CLIO_SERVER_CONF=/etc/iowarp/clio.yaml
clio_run start
```

Size values throughout the file accept: `B`, `KB`, `MB`, `GB`, `TB` (case-insensitive).

---

## Networking (`networking`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `port` | `9413` | ZeroMQ RPC listener port. Must match across all cluster nodes. Can be overridden by `CLIO_PORT` env var. |
| `neighborhood_size` | `32` | Maximum nodes queried when splitting range queries. |
| `hostfile` | *(none)* | Path to a file listing cluster node IPs/hostnames, one per line. Required for multi-node deployments. |
| `wait_for_restart` | `30` | Seconds to wait for peer nodes during startup. |
| `wait_for_restart_poll_period` | `1` | Seconds between connection retry attempts during startup. |

Two address knobs have **no YAML key** and are set through the environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIO_SERVER_ADDR` | `127.0.0.1` | Address clients dial to reach the runtime. |
| `CLIO_BIND_ADDR` | `0.0.0.0` | Address the runtime's listener sockets bind to. Pin it to `127.0.0.1` on developer machines to avoid per-binary host firewall prompts. |

```yaml
networking:
  port: 9413
  neighborhood_size: 32
  # hostfile: /etc/iowarp/hostfile   # Multi-node only
  wait_for_restart: 30
  wait_for_restart_poll_period: 1
```

**Hostfile format** (one IP or hostname per line):
```
192.168.1.10
192.168.1.11
192.168.1.12
```

---

## Logging (Environment Variables)

Logging is controlled by HLOG, which reads **environment variables** at process startup. The `logging` section in the YAML config file is reserved for future use and is not currently parsed.

| Variable | Default | Description |
|----------|---------|-------------|
| `CTP_LOG_LEVEL` | `info` (compile-time default) | Runtime log level threshold. Messages below this level are suppressed. Accepts: `debug` (0), `info` (1), `success` (2), `warning` (3), `error` (4), `fatal` (5). Case-insensitive strings or numeric values. |
| `CTP_LOG_OUT` | *(none — console only)* | Path to a log file. When set, all log messages are also written to this file (without ANSI color codes). |

```bash
# Show debug-level output and write to a file
export CTP_LOG_LEVEL=debug
export CTP_LOG_OUT=/tmp/clio.log
clio_run start
```

HLOG also applies a **compile-time** threshold (`CTP_LOG_LEVEL` CMake define, default `kInfo`). Messages below the compile-time threshold are compiled out entirely and cannot be enabled at runtime. The runtime environment variable can only raise the threshold further (i.e., make output quieter), or match the compile-time level.

Log routing:
- `debug`, `info`, `success` messages go to **stdout**.
- `warning`, `error`, `fatal` messages go to **stderr**.
- `fatal` messages terminate the process after printing.

---

## Runtime (`runtime`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `num_threads` | `4` | Worker threads for task execution. Overridden by `CLIO_NUM_THREADS`. |
| `queue_depth` | `1024` | Task queue depth per worker. |
| `local_sched` | `"default"` | Local task scheduler algorithm. |
| `first_busy_wait` | `10000` | Microseconds of busy-waiting before a worker sleeps when idle (10 ms). |
| `learning_rate` | `0.2` | SGD learning rate for the task load-prediction model used by the scheduler. |
| `task_progress_interval_ms` | `5000` | Interval for the periodic cross-node task-validity check. Overridden by `CLIO_TASK_PROGRESS_INTERVAL_MS`. |
| `conf_dir` | `/tmp/clio` | Directory for persistent runtime state written by the daemon. |
| `main_segment_size` | `0` (auto) | Size of the main task-data segment (`Future` + task payload allocations). Accepts a byte count or a size string (`"512m"`, `"1g"`). Overridden by `CLIO_MAIN_SEGMENT_SIZE`. |
| `metadata_segment_size` | `0` (auto) | Size of the runtime-wide metadata segment backing CTE's shared-memory tag/blob maps. Auto default is the host's RAM capacity; the reservation is lazy, so only touched pages cost anything. |

```yaml
runtime:
  num_threads: 4
  queue_depth: 1024
  local_sched: "default"
  first_busy_wait: 10000
  learning_rate: 0.2
  # task_progress_interval_ms: 5000
  # main_segment_size: "1g"
  # metadata_segment_size: "8g"
```

**Recommendation**: Set `num_threads` to the number of CPU cores on the node.

:::caution Segment sizing on constrained hosts
`main_segment_size` dominates the daemon's commit charge, and
`metadata_segment_size` dominates its shared-memory live-set exposure —
both matter far more than actual data volume in memory-limited containers
and on Windows. Creation-time safety clamps apply (half the cgroup-aware
budget on Linux, a 1 GB file cap elsewhere). Note that if `/dev/shm` is
smaller than the live set, touching past the tmpfs limit raises `SIGBUS`,
not `ENOMEM`.
:::

---

## GPU Orchestrator (`gpu`)

Only meaningful in a CUDA/ROCm/SYCL build.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `blocks` | `1` | GPU blocks (task queue partitions). Overridden by `CLIO_GPU_BLOCKS`. |
| `threads_per_block` | `32` | Threads per block. Overridden by `CLIO_GPU_THREADS`. |
| `queue_depth` | `16` | Tasks per GPU queue. |

```yaml
gpu:
  blocks: 1
  threads_per_block: 32
  queue_depth: 16
```

---

## Failure Detection (`swim`)

SWIM gossip-based failure detection across cluster nodes.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enabled` | `true` | Enable SWIM failure detection. |
| `direct_probe_timeout_sec` | `30.0` | Timeout for a direct probe of a peer. |
| `indirect_probe_timeout_sec` | `15.0` | Timeout for an indirect (proxied) probe. |
| `suspicion_timeout_sec` | `60.0` | How long a node stays *suspect* before being declared dead. |

```yaml
swim:
  enabled: true
  direct_probe_timeout_sec: 30.0
  indirect_probe_timeout_sec: 15.0
  suspicion_timeout_sec: 60.0
```

---

## Compose Section

The `compose` section declaratively creates module pools at runtime startup. Each entry defines one pool.

```yaml
compose:
  - mod_name: clio_cte_core      # Module shared-library name (e.g., libclio_cte_core.so)
    pool_name: cte_main          # User-defined pool name
    pool_query: local            # Routing: local, dynamic, broadcast
    pool_id: "512.0"             # Unique pool ID
    # ... module-specific parameters
```

Only `clio_bdev` is required. CTE (`clio_cte_core`) and CAE (`clio_cae_core`) are optional — remove their entries if you do not need them.

### Common Compose Fields

| Field | Required | Description |
|-------|----------|-------------|
| `mod_name` | Yes | Name of the Module shared library (without `lib` prefix and `.so` suffix). |
| `pool_name` | Yes | User-defined pool name. |
| `pool_query` | Yes | Routing policy (see below). |
| `pool_id` | Yes | Unique pool ID string (format: `"<major>.<minor>"`). |

### `pool_query` Values

| Value | Description |
|-------|-------------|
| `local` | Create the pool on the local node only. |
| `dynamic` | Auto-detect: reuse an existing local pool, or broadcast creation to all nodes. |
| `broadcast` | Create the pool on all nodes in the cluster. |

---

## Block Device Module (`clio_bdev`)

Block devices provide the shared memory allocator used by other modules. At least one DRAM block device is required.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `bdev_type` | Yes | `"ram"` for DRAM-backed, `"file"` for filesystem-backed. |
| `capacity` | Yes | Maximum capacity (e.g., `"512MB"`, `"100GB"`). |

```yaml
compose:
  # DRAM block device (required)
  - mod_name: clio_bdev
    pool_name: "ram::chi_default_bdev"
    pool_query: local
    pool_id: "301.0"
    bdev_type: ram
    capacity: "512MB"

  # File-backed block device (optional — for NVMe, HDD, etc.)
  # - mod_name: clio_bdev
  #   pool_name: "/mnt/nvme/chi_bdev"
  #   pool_query: local
  #   pool_id: "302.0"
  #   bdev_type: file
  #   capacity: "100GB"
```

For DRAM devices the `pool_name` uses the `ram::<name>` convention. For file-backed devices the `pool_name` is the filesystem path where data is stored.

---

## CTE Module Parameters (`clio_cte_core`)

### Storage Tiers (`storage`)

Array of storage targets. At least one entry is required when CTE is enabled.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | Yes | `ram::<name>` for DRAM storage, or a filesystem path for disk. Supports `${HOME}` expansion. |
| `bdev_type` | Yes | `file`, `ram`, `hbm`, `pinned`, or `noop`. |
| `capacity_limit` | Yes | Maximum capacity (e.g., `"512MB"`, `"200GB"`). `0` / `"0g"` = 80% of total system DRAM. For file tiers this is a cap, not an upfront allocation — the file grows lazily in 1 GB units. |
| `score` | No | Placement priority (0.0–1.0). Higher = preferred. `-1.0` (default) = automatic scoring. |
| `persistence_level` | No | `"volatile"` (default), `"temporary"`, or `"long_term"`. |
| `existing_pool_id` | No | Bind this target to an already-composed bdev pool instead of creating one. Skips `path` / `capacity_limit` validation — routing is purely by pool id. |
| `existing_pool_module` | No | Module name backing `existing_pool_id`, when it is not a plain `clio_bdev`. |

```yaml
storage:
  # RAM tier — fastest, not persistent
  - path: "ram::cte_cache"
    bdev_type: ram
    capacity_limit: 512MB
    score: 1.0

  # NVMe tier
  - path: /mnt/nvme/cte
    bdev_type: file
    capacity_limit: 200GB
    score: 0.9
    persistence_level: temporary

  # HDD tier
  - path: /mnt/hdd/cte
    bdev_type: file
    capacity_limit: 2TB
    score: 0.3
    persistence_level: long_term
```

:::caution `persistence_level` is load-bearing
Placement filters (`Context::min_persistence_level_`) and durable replicas
(`REPLICA_PERSISTENT`, used by the
[replication ChiMod](../sdk/context-transfer-engine/chimod-chain#replication-chimod-clio_cte_replication))
key off this field. A tier left at the default `volatile` can **never**
satisfy a persistence request, so a config with no `temporary` or
`long_term` tier gets no durable copies.
:::

### Data Placement Engine (`dpe`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `dpe_type` | `"max_bw"` | Placement algorithm: `"max_bw"`, `"round_robin"`, `"random"`. |

### Data Organizer

The data organizer is CTE's internal, periodically-driven reorganization
engine. When enabled, the runtime spawns periodic `DynamicReorganize` tasks
that rescore blobs and move them between tiers — no external extension or
explicit `ReorganizeBlob` calls required. The `frecency` organizer promotes
recently/frequently accessed blobs toward fast tiers and demotes cold blobs
toward slow tiers.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `organizer` | `"none"` | Organization policy: `"none"` (disabled) or `"frecency"`. |
| `organizer_tasks` | `1` | Number of periodic task replicas; each organizes a disjoint hash partition of the blob space. |
| `organizer_period_ms` | `5000` | Interval between organizer invocations (ms). |

```yaml
  - mod_name: clio_cte_core
    # ...
    organizer: frecency
    organizer_tasks: 2
    organizer_period_ms: 5000
```

### Bdev Performance Stats Persistence

Each bdev persists its measured performance statistics (latency/bandwidth
and the learned wall-clock model) across sessions so performance does not
need to be re-estimated on every startup. This also feeds the CTE's I/O
emulation mode (`Context::emulate_` on PutBlob/GetBlob), which models the
duration of an operation from these stats instead of performing the I/O.

| Environment variable | Default | Description |
|-----------|---------|-------------|
| `CLIO_BDEV_STATS_DIR` | `<home>/.clio/bdev_perf` | Directory holding per-bdev `.perf` stats files. |
| `CLIO_BDEV_PERSIST_STATS` | `1` | Set to `0` to disable persistence (start from a cold model). |

### Targets (`targets`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `neighborhood` | `1` | Number of storage nodes CTE can buffer to simultaneously. |
| `default_target_timeout_ms` | `30000` | Timeout for storage target operations (ms). |
| `poll_period_ms` | `5000` | How often to rescan targets for bandwidth/capacity stats (ms). |

### Performance Tuning (`performance`)

All fields are optional and override compile-time defaults.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `stat_targets_period_ms` | `50` | Periodic StatTargets interval (ms). |
| `target_stat_interval_ms` | `50` | Interval for per-target statistics collection (ms). |
| `max_concurrent_operations` | `64` | Max concurrent I/O operations. |
| `score_threshold` | `0.7` | Score above which blobs are reorganized. |
| `score_difference_threshold` | `0.05` | Min score delta to trigger reorganization. |
| `flush_metadata_period_ms` | `5000` | Metadata flush interval (ms). |
| `flush_data_period_ms` | `10000` | Data flush interval (ms). |
| `flush_data_min_persistence` | `1` | Min persistence level (1 = temp-nonvolatile). |
| `metadata_log_path` | *(none)* | Write-ahead log + snapshot path for tag/blob metadata. Supports `${HOME}` expansion. |
| `transaction_log_capacity` | `"32MB"` | Write-ahead log capacity. |

:::danger Metadata durability is opt-in
**`metadata_log_path` is required for data to survive a runtime reboot.**
Without it, a persistent tier's bytes survive but nothing remembers which
blob they belong to. The shipped default config sets it to
`${HOME}/.clio/cte_metadata_log`.
:::

```yaml
performance:
  metadata_log_path: "${HOME}/.clio/cte_metadata_log"
  transaction_log_capacity: "32MB"
```

### GPU Metadata Cache (`gpu_metadata_cache`)

Optional; mirrors tag/blob metadata into GPU memory so device-side kernels
can resolve blobs without a host round trip.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enabled` | `false` | Enable the GPU-resident metadata mirror. |
| `capacity` | — | Size of the mirror (size string). |
| `max_blobs` | — | Maximum blob entries. |
| `max_tags` | — | Maximum tag entries. |

---

## CTE Interposition Chain ChiMods

Caching, replication, compression, and semantic-search indexing are separate
ChiMods that stack over the CTE core via `next_pool_id`. Each speaks the
core's own task interface, so a `clio::cte::core::Client` pointed at the top
of the chain works unchanged.

```
cache(563.0) → indexer(564.0) → [compressor(562.0) →] replication(561.0) → core(512.0)
```

| Module | Pool | Purpose | Key parameters |
|--------|------|---------|----------------|
| `clio_cte_cache` | `563.0` | Node-local untransformed copies (locality, zero-IPC SHM reads) | `next_pool_id`, `min_score` |
| `clio_cte_indexer` | `564.0` | BM25 term index serving `SemanticSearch` | `next_pool_id`, `index_log_path`, `index_sweep_period_ms`, `index_wal_compact_bytes`, `tag_re`, `blob_re` |
| `clio_cte_compressor` | `562.0` | Transparent compression (needs `CLIO_CTE_ENABLE_COMPRESS=ON`) | `next_pool_id`, `tracking_enabled` |
| `clio_cte_replication` | `561.0` | Fixed set of persistent replicas (reliability) | `next_pool_id`, `num_replicas`, `cache_score`, `replica_score`, `replicate_period_ms` |
| `clio_cte_filesystem` | `560.0` | POSIX-style filesystem the FUSE / POSIX adapters drive | `next_pool_id` |

:::warning Ordering
Pools are created in file order and a pool cannot be created before the pool
its `next_pool_id` names. List them core → replication → compressor →
indexer → cache → filesystem.
:::

:::note The CTE core no longer implements semantic search
`Method::kSemanticSearch` is served by `clio_cte_indexer`. Without an
indexer pool in the chain there is nothing to answer the query.
:::

See [Cache / Replication / Indexing ChiMods](../sdk/context-transfer-engine/chimod-chain)
for the full behavior, parameter semantics, and module verbs.

---

## CAE Module Parameters (`clio_cae_core`)

CAE is the assimilation / discovery entrypoint: CEE calls `ParseOmni` here,
and CAE forwards the data-path tasks it owns (`GetOrCreateTag`, `PutBlob`,
`GetBlob`, `SemanticSearch`) on to CTE at `next_pool_id`.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `pool_name` | Yes | User-defined pool name. |
| `pool_query` | Yes | Routing policy (`local`, `dynamic`, `broadcast`). |
| `pool_id` | Yes | Unique pool ID. Canonical CAE pool ID is `"400.0"`. |
| `next_pool_id` | No | CTE pool the data path is forwarded to (`"512.0"`). |
| `label_endpoint` | No | Ollama-compatible server URL for transparent LLM labeling. |
| `label_prompts` | No | Named prompt templates. |
| `label_matches` | No | Rules (`tag_re`, `blob_re`, `model`, `prompt`, `context_length`) selecting which blobs get labeled. |

```yaml
- mod_name: clio_cae_core
  pool_name: cae_main
  pool_query: local
  pool_id: "400.0"
  next_pool_id: "512.0"
```

### Transparent LLM labeling (optional)

When configured, `PutBlob` calls `model` on `label_endpoint` for every blob
whose tag and name match a rule, and stores the response as
`{blob_name}_label` in the same tag. Leave it out for a pure-passthrough CAE.

```yaml
- mod_name: clio_cae_core
  pool_name: cae_main
  pool_query: local
  pool_id: "400.0"
  next_pool_id: "512.0"
  label_endpoint: "http://127.0.0.1:11434"
  label_prompts:
    summarize: "Summarize the following text in one short sentence."
  label_matches:
    - tag_re: ".*\\.txt$"
      blob_re: ".*"
      model: "gemma3:1b"
      prompt: "summarize"
      context_length: 4096
```

:::danger Never put CAE in front of CTE at pool 512.0
CAE only mirrors the four data-path method ids above. The rest of its method
ids **collide** with CTE's (CAE `kParseOmni` == CTE `kRegisterTarget` == 10),
so a CTE client hitting CAE for `RegisterTarget` / `TagQuery` / `BlobQuery`
is dispatched to the wrong handler and crashes. CAE gets its own pool
(`400.0`) and forwards; it does not interpose.
:::

---

## Complete Examples

### The Shipped Default (`~/.clio/clio.yaml`)

This is what `make install`, the pip wheel, and the `iowarp/deploy-cpu`
image seed. It brings up a DRAM bdev, the CTE core with a DRAM tier and a
lazily-grown persistent disk tier, CAE, and the full interposition chain.

```yaml
networking:
  port: 9413
  neighborhood_size: 32
  wait_for_restart: 30
  wait_for_restart_poll_period: 1

runtime:
  num_threads: 4
  queue_depth: 1024
  local_sched: "default"
  first_busy_wait: 10000
  learning_rate: 0.2

compose:
  # === Block Device (DRAM) — required ===
  - mod_name: clio_bdev
    pool_name: "ram::chi_default_bdev"
    pool_query: local
    pool_id: "301.0"
    bdev_type: ram
    capacity: "0g"                       # 0g = 80% of total system DRAM

  # === Context Assimilation Engine — its own pool, forwards to CTE ===
  - mod_name: clio_cae_core
    pool_name: cae_main
    pool_query: local
    pool_id: "400.0"
    next_pool_id: "512.0"

  # === Context Transfer Engine core ===
  - mod_name: clio_cte_core
    pool_name: cte_main
    pool_query: local
    pool_id: "512.0"
    storage:
      - path: "ram::cte_ram_tier1"
        bdev_type: "ram"
        capacity_limit: "0g"
        score: 1.0
      # Persistent tier the replication chimod keeps durable copies on.
      - path: "${HOME}/.clio/cte_disk_tier.dat"
        bdev_type: "file"
        capacity_limit: "10GB"
        score: 0.2
        persistence_level: "temporary"
    performance:
      metadata_log_path: "${HOME}/.clio/cte_metadata_log"
      transaction_log_capacity: "32MB"
    dpe:
      dpe_type: "max_bw"
    targets:
      neighborhood: 1
      default_target_timeout_ms: 30000
      poll_period_ms: 5000

  # === Interposition chain: replication → indexer → cache ===
  - mod_name: clio_cte_replication
    pool_name: clio_cte_replication
    pool_query: local
    pool_id: "561.0"
    next_pool_id: "512.0"
    num_replicas: 1
    cache_score: 1.0
    replica_score: 0.2

  # Optional; needs a build with CLIO_CTE_ENABLE_COMPRESS=ON. Enabling it
  # also means re-pointing the indexer's next_pool_id at 562.0.
  # - mod_name: clio_cte_compressor
  #   pool_name: clio_cte_compressor
  #   pool_query: local
  #   pool_id: "562.0"
  #   next_pool_id: "561.0"

  - mod_name: clio_cte_indexer
    pool_name: clio_cte_indexer
    pool_query: local
    pool_id: "564.0"
    next_pool_id: "561.0"
    index_log_path: "${HOME}/.clio/cte_indexer_index"

  - mod_name: clio_cte_cache
    pool_name: clio_cte_cache
    pool_query: local
    pool_id: "563.0"
    next_pool_id: "564.0"
    min_score: 0.5

  # === Context Filesystem — what the FUSE / POSIX adapters drive ===
  - mod_name: clio_cte_filesystem
    pool_name: clio_cte_filesystem
    pool_query: local
    pool_id: "560.0"
    next_pool_id: "563.0"                # chain top
```

### Minimal Single-Node

Only `clio_bdev` is strictly required. Trim to just the core when you want
storage without any policy layers:

```yaml
networking:
  port: 9413

runtime:
  num_threads: 4

compose:
  - mod_name: clio_bdev
    pool_name: "ram::chi_default_bdev"
    pool_query: local
    pool_id: "301.0"
    bdev_type: ram
    capacity: "512MB"

  - mod_name: clio_cte_core
    pool_name: cte_main
    pool_query: local
    pool_id: "512.0"
    storage:
      - path: "ram::cte_ram_tier1"
        bdev_type: ram
        capacity_limit: 512MB
        score: 1.0
    dpe:
      dpe_type: max_bw
```

This config has no persistent tier and no `metadata_log_path`, so nothing
survives a restart, and no interposer, so `SemanticSearch` has no index to
answer from.

### Multi-Tier RAM + NVMe + HDD

```yaml
networking:
  port: 9413

runtime:
  num_threads: 16
  queue_depth: 1024

compose:
  - mod_name: clio_bdev
    pool_name: "ram::chi_default_bdev"
    pool_query: local
    pool_id: "301.0"
    bdev_type: ram
    capacity: "2GB"

  - mod_name: clio_cte_core
    pool_name: cte_main
    pool_query: local
    pool_id: "512.0"
    storage:
      - path: "ram::cte_cache"
        bdev_type: ram
        capacity_limit: 512MB
        score: 1.0
      - path: /mnt/nvme/cte
        bdev_type: file
        capacity_limit: 200GB
        score: 0.9
      - path: /mnt/hdd/cte
        bdev_type: file
        capacity_limit: 2TB
        score: 0.3
    dpe:
      dpe_type: max_bw
    targets:
      neighborhood: 1
      default_target_timeout_ms: 30000
      poll_period_ms: 5000
```

### Multi-Node Cluster (4 nodes)

```yaml
networking:
  port: 9413
  neighborhood_size: 32
  hostfile: /etc/iowarp/hostfile

runtime:
  num_threads: 8
  queue_depth: 1024

compose:
  - mod_name: clio_bdev
    pool_name: "ram::chi_default_bdev"
    pool_query: local
    pool_id: "301.0"
    bdev_type: ram
    capacity: "2GB"

  - mod_name: clio_cte_core
    pool_name: cte_main
    pool_query: dynamic
    pool_id: "512.0"
    storage:
      - path: /mnt/storage
        bdev_type: file
        capacity_limit: 1TB
        score: 0.8
    dpe:
      dpe_type: max_bw
    targets:
      neighborhood: 4
      default_target_timeout_ms: 30000
      poll_period_ms: 5000
```

---

## Docker Deployment

IOWarp uses `memfd_create()` for shared memory on Linux, so no special
`/dev/shm` configuration is needed. Only `mem_limit` matters for resource
control.

The `iowarp/deploy-cpu` image already ships the default config at
`/home/iowarp/.clio/clio.yaml` and runs as the `iowarp` user, so the image
works with no volumes at all. Mount over that path to override it:

```yaml
# docker-compose.yml
services:
  iowarp:
    image: iowarp/deploy-cpu:latest
    container_name: iowarp
    hostname: iowarp
    volumes:
      - ./clio.yaml:/home/iowarp/.clio/clio.yaml:ro
    environment:
      - CTP_LOG_LEVEL=info
    ports:
      - "9413:9413"
    mem_limit: 8g
    command: ["clio_run", "start"]
    restart: unless-stopped
```

Or mount the config anywhere and point `CLIO_SERVER_CONF` at it, which
sidesteps the container's home directory entirely:

```yaml
services:
  iowarp:
    image: iowarp/deploy-cpu:latest
    container_name: iowarp
    hostname: iowarp
    volumes:
      - ./clio.yaml:/etc/iowarp/clio.yaml:ro
    environment:
      - CLIO_SERVER_CONF=/etc/iowarp/clio.yaml
    ports:
      - "9413:9413"
    mem_limit: 8g
    command: ["clio_run", "start"]
    restart: unless-stopped
```

:::tip Persisting data across container restarts
The default config writes the persistent tier, metadata log, and index to
`${HOME}/.clio/`. Add a volume for that directory or those files land in the
container's writable layer and vanish with `docker compose down`:

```yaml
    volumes:
      - ./clio.yaml:/home/iowarp/.clio/clio.yaml:ro
      - iowarp-state:/home/iowarp/.clio

volumes:
  iowarp-state:
```
:::

For multi-node Docker deployments, mount a shared hostfile and set the
`networking.hostfile` path accordingly. See [HPC Cluster](./hpc-cluster) for
details.

---

## Environment Variables

Environment variables are read at process startup. Where a variable overlaps
a YAML key, the **environment wins** — it is applied after the config file is
parsed, so a deployment can retune without editing a config.

:::note
Every variable uses the `CLIO_` prefix (or `CTP_` for transport-primitive
concerns). The old `CHI_` prefix is **no longer recognized** — see
[Deprecation Notes](../deprecation-notes).
:::

### Configuration and startup

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIO_SERVER_CONF` | *(none)* | Path to the YAML config. Highest priority in the lookup order. |
| `CLIO_PORT` | `9413` | RPC listener port. Overrides `networking.port`. |
| `CLIO_SERVER_ADDR` | `127.0.0.1` | Address clients dial to reach the runtime. |
| `CLIO_BIND_ADDR` | `0.0.0.0` | Address the runtime's listener sockets bind to. |
| `CLIO_EPHEMERAL` | `0` | `1` starts the runtime **bare** — the `compose` section is skipped and pools are created explicitly. Equivalent to `clio_run start --ephemeral`. |
| `CLIO_NUM_THREADS` | *(from YAML)* | Worker-thread count. Last word after the config file — useful for forcing a single worker to test whether a failure depends on cross-thread task migration. |
| `CLIO_MAIN_SEGMENT_SIZE` | *(auto)* | Bounds the main task-data segment. Byte count or size string (`"512m"`); `0` restores the auto default. |
| `CLIO_TASK_PROGRESS_INTERVAL_MS` | `5000` | Cross-node task-validity check interval. |
| `CLIO_REPO_PATH` | *(none)* | Where the runtime looks for ChiMod shared libraries. |
| `CLIO_MEMFD_DIR` | `/tmp/clio_$USER` | Per-user directory holding the shared-memory segment files. |

### Client and transport

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIO_IPC_MODE` | *(auto)* | Force a client transport: `SHM`, `IPC` (Unix domain socket), or `TCP`. When unset the client **probes for the fastest usable one** in that order — SHM if the local runtime's main segment exists, then IPC if the server bound a Unix socket, else TCP. Setting this bypasses the probe entirely. |
| `CLIO_WITH_RUNTIME` | — | Whether a client process should co-locate a runtime. |
| `CLIO_WAIT_SERVER` | `30` | Seconds to wait for a local runtime during client init. `0` = fail immediately, `-1` = wait forever. |
| `CLIO_CLIENT_RETRY_TIMEOUT` | `60` | Seconds a client retries a request against a restarted runtime. `0` = fail immediately, `-1` = retry forever. |
| `CLIO_CLIENT_TRY_NEW_SERVERS` | `0` | Non-zero lets a client fail over to other hosts from the hostfile when its server is unreachable. |
| `CLIO_NUM_CONTAINERS` | — | Containers per pool (parallelism within a pool). |
| `CLIO_FORCE_NET` | `0` | Route every task whose `PoolQuery` is not explicitly `Local()` through the network path, even single-node. Benchmarking / testing aid: it makes client-side fast paths stand down. |
| `CLIO_ZMQ_IO_THREADS` | `8` | ZeroMQ I/O threads. The default scales comfortably to ~512 nodes; raise it beyond that. |
| `CLIO_ZMQ_LOCAL_IPC` | *(on for macOS)* | Run the local client↔runtime ROUTER/DEALER over `ipc://` instead of TCP. The cross-node ROUTER is untouched, so multi-node TCP is unaffected. |
| `CLIO_LBM_THALLIUM_PROTOCOL` | — | Thallium/Mercury protocol string (e.g. `ofi+verbs`). |
| `CLIO_LBM_THALLIUM_RPC_THREADS` | — | Thallium RPC handler threads. |

### Shared-memory ingest tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIO_SHM_IN_SHARDS` | `0` (= worker count) | Parallel inbound SHM rings. Each worker drains its own shard, so more shards spread ingest across the pool with no extra threads. `1` restores a single ingest ring. |
| `CLIO_SHM_ASYNC_SEND` | `0` | Defer the SHM response send to a background thread. **Off by default** — it costs ~3× latency on latency-bound workloads. |
| `CLIO_SHM_CLIENT_SPIN_US` | `50` | Waiter spin-before-park budget, in microseconds. |

### CTE

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIO_CTE_POOL` | `512.0` | `major.minor` — bind the process-wide CTE client singleton to an interposing pool (e.g. `563.0` for the chain top). |
| `CLIO_CTE_SHM_TAG_CAPACITY` | `65536` | Tag slots in the SHM metadata mirror. **Resident**, ~80 B per slot. |
| `CLIO_CTE_SHM_BLOB_CAPACITY` | `262144` | Blob slots in the SHM metadata mirror. **Resident**, ~376 B per slot (the defaults are ~100 MB of blob table). Capacity is fixed at creation — entries beyond it are simply not cached and those blobs keep using RPC. Sizing for 1M blobs wants ~2M slots (~0.79 GB), since the load factor caps useful occupancy at 7/8. |
| `CLIO_CTE_BATCHING` | `0` | Opt in to task-merge batching for `PutBlob` / `GetBlob`. |
| `CLIO_INDEXER_PASSIVE` | *(unset)* | Set to disable all indexer maintenance (forward-only interposition). Production triage kill switch. |
| `CLIO_CTE_FUSE_MOUNTPOINT` | *(none)* | Required when the FUSE binary is exec'd with a pre-opened `/dev/fuse` fd (e.g. Apptainer `--fusemount`), which does not communicate the mountpoint any other way. |

### Context Filesystem (CFS) adapters

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIO_CFS_ASYNC_WRITES` | `1` | Allow `write(2)` to return before the runtime has the bytes. `0` restores blocking writes. |
| `CLIO_CFS_WRITE_WINDOW_BYTES` | — | Staging bytes allowed in flight before a write blocks on the oldest. Back-pressure, never a failure. |
| `CLIO_CFS_WRITE_WINDOW_COUNT` | `256` | In-flight write count before back-pressure. |
| `CLIO_CFS_SHM_FILE_CAPACITY` | `65536` | Path entries in the filesystem SHM attribute mirror. **Resident**, ~112 B each (~7 MB at the default). Paths beyond capacity keep using RPC. |

### Block devices

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIO_BDEV_STATS_DIR` | `~/.clio/bdev_perf` | Directory holding per-bdev `.perf` files (measured latency/bandwidth plus the learned wall-clock model). |
| `CLIO_BDEV_PERSIST_STATS` | `1` | `0` disables persistence, so each start begins from a cold model. |

### ADIOS2 adapter startup (large-scale MPI)

At 512+ nodes the local daemon is busy serving cross-node SWIM probes and can
take many seconds to drain its accept queue. These control how the ADIOS2
engine's ranks stagger and retry their client init so they do not stampede it.

| Variable | Default | Description |
|----------|---------|-------------|
| `IOWARP_PPN` | `12` | Ranks per node. Used to derive each rank's node-local index; only local ranks contend for a given daemon. |
| `CLIO_INIT_STAGGER_MS` | `250` | Per-local-rank stagger step. At the defaults, 12 ranks spread over 3 s. |
| `CLIO_INIT_ATTEMPTS` | `60` | Client-init retry attempts. |
| `CLIO_INIT_SLEEP_MS` | `3000` | **Mean** backoff between attempts; the actual sleep is uniform over `[0.5×, 1.5×]` with a per-rank seed, so same-node ranks do not all retry on the same second. Default budget: 60 × ~3 s ≈ 3 minutes. |

### Task scheduling

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIO_TASK_BATCHING` | `1` | Worker-loop task batching. `0` restores the pre-batching dequeue loop — the escape hatch for bisecting a regression to this phase rather than to a container's policy. |
| `CLIO_GPU_BLOCKS` / `CLIO_GPU_THREADS` | `1` / `32` | GPU orchestrator partitioning. Override `gpu.blocks` / `gpu.threads_per_block`. |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `CTP_LOG_LEVEL` | `info` | `debug`, `info`, `success`, `warning`, `error`, `fatal` (case-insensitive; numeric values also accepted). |
| `CTP_LOG_OUT` | *(console only)* | Path to a log file. Messages are also written there, without ANSI color codes. |

See [Logging](#logging-environment-variables) above for the compile-time
threshold caveat and stream routing.

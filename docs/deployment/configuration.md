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
| `CLIO_SERVER_CONF` env var | **1st** | Checked first. |
| `~/.clio/clio.yaml` | **2nd** | Per-user default. Seeded at install time. |
| Built-in defaults | **3rd** | Compiled-in fallback. |

A handful of legacy paths (`~/.clio/chimaera.yaml`, `~/.chimaera/clio.yaml`, `~/.chimaera/chimaera.yaml`) are also accepted for backward compat — see [Deprecation Notes](../deprecation-notes) for the full lookup order.

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
| `num_threads` | `4` | Worker threads for task execution. |
| `queue_depth` | `1024` | Task queue depth per worker. |
| `local_sched` | `"default"` | Local task scheduler algorithm. |
| `first_busy_wait` | `10000` | Microseconds of busy-waiting before a worker sleeps when idle (10 ms). |

```yaml
runtime:
  num_threads: 4
  queue_depth: 1024
  local_sched: "default"
  first_busy_wait: 10000
```

**Recommendation**: Set `num_threads` to the number of CPU cores on the node.

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
| `path` | Yes | `ram::<name>` for DRAM storage, or a filesystem path for disk. |
| `bdev_type` | Yes | `"ram"` for memory-backed, `"file"` for filesystem-backed. |
| `capacity_limit` | Yes | Maximum capacity (e.g., `"512MB"`, `"200GB"`). |
| `score` | No | Placement priority (0.0–1.0). Higher = preferred. `-1.0` = automatic scoring. |

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

  # HDD tier
  - path: /mnt/hdd/cte
    bdev_type: file
    capacity_limit: 2TB
    score: 0.3
```

### Data Placement Engine (`dpe`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `dpe_type` | `"max_bw"` | Placement algorithm: `"max_bw"`, `"round_robin"`, `"random"`. |

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
| `max_concurrent_operations` | `64` | Max concurrent I/O operations. |
| `score_threshold` | `0.7` | Score above which blobs are reorganized. |
| `score_difference_threshold` | `0.05` | Min score delta to trigger reorganization. |
| `flush_metadata_period_ms` | `5000` | Metadata flush interval (ms). |
| `flush_data_period_ms` | `10000` | Data flush interval (ms). |
| `flush_data_min_persistence` | `1` | Min persistence level (1 = temp-nonvolatile). |
| `transaction_log_capacity` | `"32MB"` | Write-ahead log capacity. |

---

## CAE Module Parameters (`clio_cae_core`)

| Parameter | Required | Description |
|-----------|----------|-------------|
| `pool_name` | Yes | User-defined pool name. |
| `pool_query` | Yes | Routing policy (`local`, `dynamic`, `broadcast`). |
| `pool_id` | Yes | Unique pool ID. Default CAE pool ID is `"400.0"`. |

```yaml
- mod_name: clio_cae_core
  pool_name: clio_cae_core_pool
  pool_query: local
  pool_id: "400.0"
```

---

## Complete Examples

### Minimal Single-Node

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

IOWarp uses `memfd_create()` for shared memory on Linux, so no special `/dev/shm` configuration is needed. Only `mem_limit` matters for resource control.

```yaml
# docker-compose.yml
services:
  iowarp:
    image: iowarp/deploy-cpu:latest
    container_name: iowarp
    hostname: iowarp
    volumes:
      - ./clio.yaml:/home/iowarp/.clio/clio.yaml:ro
    ports:
      - "9413:9413"
    mem_limit: 8g
    command: ["clio_run", "start"]
    restart: unless-stopped
```

For multi-node Docker deployments, mount a shared hostfile and set the `networking.hostfile` path accordingly. See [HPC Cluster](./hpc-cluster) for details.

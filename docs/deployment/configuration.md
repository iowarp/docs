---
sidebar_position: 1
title: Configuration
description: Complete configuration reference for IOWarp runtime and CTE deployments.
---

# Configuration Reference

## Overview

IOWarp uses a single YAML file to configure both the Chimaera runtime and any ChiMods (such as CTE, CAE) that are created at startup via the `compose` section.

The configuration file is located via environment variables (in priority order):

| Variable | Priority | Description |
|----------|----------|-------------|
| `CHI_SERVER_CONF` | **Primary** | Path to the configuration YAML. Checked first. |
| `WRP_RUNTIME_CONF` | Fallback | Used when `CHI_SERVER_CONF` is not set. |

```bash
export CHI_SERVER_CONF=/etc/iowarp/config.yaml
chimaera runtime start
```

---

## Runtime Configuration Parameters

### Memory (`memory`)

Controls shared memory segment sizes. Sizes can be specified as `auto`, human-readable strings (`1GB`, `512MB`, `64K`), or raw bytes.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `main_segment_size` | `auto` | Main shared memory segment for task metadata and control structures. `auto` calculates from `queue_depth` and `num_threads`. |
| `client_data_segment_size` | `512MB` | Shared memory segment for application data buffers. |
| `runtime_data_segment_size` | *(optional)* | Runtime-internal data segment. Omit to use the default. |

```yaml
memory:
  main_segment_size: auto        # Or e.g. "4GB"
  client_data_segment_size: 2GB
  runtime_data_segment_size: 2GB
```

> **Docker**: Set `shm_size` to at least the sum of all segments plus ~20% overhead.

---

### Networking (`networking`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `port` | `5555` | ZeroMQ port. Must match across all nodes in a cluster. |
| `neighborhood_size` | `32` | Maximum nodes queried when splitting range queries. |
| `hostfile` | *(none)* | Path to a file listing cluster node IPs, one per line. Required for multi-node deployments. |
| `wait_for_restart` | `30` | Seconds to wait for remote connections during startup. |
| `wait_for_restart_poll_period` | `1` | Seconds between retry attempts during startup. |

```yaml
networking:
  port: 5555
  neighborhood_size: 32
  hostfile: /etc/iowarp/hostfile   # Multi-node only
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

### Runtime (`runtime`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `num_threads` | `4` | Worker threads for task execution. |
| `process_reaper_threads` | `1` | Threads that clean up completed processes. |
| `queue_depth` | `1024` | Task queue depth per worker. |
| `local_sched` | `"default"` | Local task scheduler policy. |
| `heartbeat_interval` | `1000` | Heartbeat interval in milliseconds. |
| `first_busy_wait` | `10000` | Microseconds of busy-waiting before a worker sleeps when idle. |
| `max_sleep` | `50000` | Maximum worker sleep duration in microseconds. |

```yaml
runtime:
  num_threads: 8
  process_reaper_threads: 1
  queue_depth: 1024
  local_sched: "default"
  heartbeat_interval: 1000
  first_busy_wait: 10000
  max_sleep: 50000
```

**Recommendation**: Set `num_threads` to the number of CPU cores on the node.

---

### Logging (`logging`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `level` | `"info"` | Log verbosity: `"debug"`, `"info"`, `"warn"`, `"error"`. |
| `file` | `"/tmp/chimaera.log"` | Path to the log file. |

```yaml
logging:
  level: info
  file: /tmp/chimaera.log
```

---

## Compose Section

The `compose` section declaratively creates ChiMod pools at runtime startup. Each entry defines one pool.

```yaml
compose:
  - mod_name: wrp_cte_core      # ChiMod library name
    pool_name: cte_main          # User-defined pool name
    pool_query: local            # Routing: local, dynamic, broadcast
    pool_id: "512.0"             # Unique pool ID (default CTE pool ID)
    # ... ChiMod-specific parameters
```

### `pool_query` Values

| Value | Description |
|-------|-------------|
| `local` | Create the pool on the local node only. |
| `dynamic` | Auto-detect: use existing pool locally, or broadcast creation. |
| `broadcast` | Create the pool on all nodes in the cluster. |

---

## CTE ChiMod Parameters (`wrp_cte_core`)

### Storage Devices (`storage`)

Array of storage targets. At least one entry is required.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | Yes | Directory path. Use `ram::<name>` for RAM-based storage. |
| `bdev_type` | Yes | `"file"` for filesystem-backed storage, `"ram"` for memory-backed. |
| `capacity_limit` | Yes | Maximum capacity (e.g., `"10GB"`, `"512MB"`). |
| `score` | No | Manual placement score (0.0–1.0). Higher = preferred. `0.0` enables automatic scoring. |

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
| `dpe_type` | `"max_bw"` | Placement algorithm: `"random"`, `"round_robin"`, `"max_bw"`. |

### Targets (`targets`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `neighborhood` | `1` | Number of storage nodes CTE can buffer to simultaneously. |
| `default_target_timeout_ms` | `30000` | Timeout for storage target operations (ms). |
| `poll_period_ms` | `5000` | How often to rescan targets for bandwidth/capacity stats (ms). |

---

## CAE ChiMod Parameters (`wrp_cae_core`)

| Parameter | Required | Description |
|-----------|----------|-------------|
| `pool_name` | Yes | User-defined pool name. |
| `pool_query` | Yes | Routing policy (`local`, `dynamic`, `broadcast`). |
| `pool_id` | Yes | Unique pool ID. Default CAE pool ID is `"400.0"`. |
| `worker_count` | No | Number of CAE ingestion workers (default: `4`). |

```yaml
- mod_name: wrp_cae_core
  pool_name: cae_main
  pool_query: local
  pool_id: "400.0"
  worker_count: 4
```

---

## Complete Examples

### Minimal Single-Node

```yaml
memory:
  main_segment_size: auto
  client_data_segment_size: 512MB

networking:
  port: 5555

runtime:
  num_threads: 4

compose:
  - mod_name: wrp_cte_core
    pool_name: cte_main
    pool_query: local
    pool_id: "512.0"
    storage:
      - path: /tmp/cte_storage
        bdev_type: file
        capacity_limit: 10GB
    dpe:
      dpe_type: max_bw
```

### Multi-Tier RAM + NVMe + HDD

```yaml
memory:
  main_segment_size: auto
  client_data_segment_size: 2GB
  runtime_data_segment_size: 2GB

networking:
  port: 5555

runtime:
  num_threads: 16
  queue_depth: 1024

logging:
  level: info

compose:
  - mod_name: wrp_cte_core
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
memory:
  main_segment_size: auto
  client_data_segment_size: 2GB
  runtime_data_segment_size: 2GB

networking:
  port: 5555
  neighborhood_size: 32
  hostfile: /etc/iowarp/hostfile

runtime:
  num_threads: 8
  queue_depth: 1024
  heartbeat_interval: 1000

logging:
  level: info
  file: /var/log/iowarp/chimaera.log

compose:
  - mod_name: wrp_cte_core
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

```yaml
# docker-compose.yml
services:
  iowarp:
    image: iowarp/chimaera-cte:latest
    shm_size: 6gb   # >= sum of all memory segments + 20%
    volumes:
      - ./config.yaml:/etc/iowarp/config.yaml:ro
      - ./data:/data
    environment:
      - CHI_SERVER_CONF=/etc/iowarp/config.yaml
      - CHI_IPC_MODE=SHM
    ports:
      - "5555:5555"
```

For multi-node Docker deployments, mount a shared hostfile and set the networking hostfile path accordingly. See [HPC Cluster](./hpc-cluster) for details.

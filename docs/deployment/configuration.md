---
sidebar_position: 1
title: Configuration
description: Complete configuration reference for IOWarp runtime and module deployments.
---

# Configuration Reference

## Overview

IOWarp uses a single YAML file to configure the Chimaera runtime and any modules (ChiMods) that are created at startup via the `compose` section.

When you install IOWarp, a default configuration is created at `~/.chimaera/chimaera.yaml`. You can edit this file directly or override it with an environment variable.

The configuration file is located via (in priority order):

| Source | Priority | Description |
|--------|----------|-------------|
| `CHI_SERVER_CONF` env var | **1st** | Checked first. |
| `WRP_RUNTIME_CONF` env var | **2nd** | Legacy fallback. |
| `~/.chimaera/chimaera.yaml` | **3rd** | Default created at install time. |

```bash
# Use the installed default
chimaera runtime start

# Or override with a custom config
export CHI_SERVER_CONF=/etc/iowarp/chimaera.yaml
chimaera runtime start
```

Size values throughout the file accept: `B`, `KB`, `MB`, `GB`, `TB` (case-insensitive).

---

## Networking (`networking`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `port` | `9413` | ZeroMQ RPC listener port. Must match across all cluster nodes. Can be overridden by `CHI_PORT` env var. |
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
| `HSHM_LOG_LEVEL` | `info` (compile-time default) | Runtime log level threshold. Messages below this level are suppressed. Accepts: `debug` (0), `info` (1), `success` (2), `warning` (3), `error` (4), `fatal` (5). Case-insensitive strings or numeric values. |
| `HSHM_LOG_OUT` | *(none — console only)* | Path to a log file. When set, all log messages are also written to this file (without ANSI color codes). |

```bash
# Show debug-level output and write to a file
export HSHM_LOG_LEVEL=debug
export HSHM_LOG_OUT=/tmp/chimaera.log
chimaera runtime start
```

HLOG also applies a **compile-time** threshold (`HSHM_LOG_LEVEL` CMake define, default `kInfo`). Messages below the compile-time threshold are compiled out entirely and cannot be enabled at runtime. The runtime environment variable can only raise the threshold further (i.e., make output quieter), or match the compile-time level.

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
  - mod_name: wrp_cte_core      # ChiMod shared-library name (e.g., libwrp_cte_core.so)
    pool_name: cte_main          # User-defined pool name
    pool_query: local            # Routing: local, dynamic, broadcast
    pool_id: "512.0"             # Unique pool ID
    # ... module-specific parameters
```

Only `chimaera_bdev` is required. CTE (`wrp_cte_core`) and CAE (`wrp_cae_core`) are optional — remove their entries if you do not need them.

### Common Compose Fields

| Field | Required | Description |
|-------|----------|-------------|
| `mod_name` | Yes | Name of the ChiMod shared library (without `lib` prefix and `.so` suffix). |
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

## Block Device ChiMod (`chimaera_bdev`)

Block devices provide the shared memory allocator used by other modules. At least one DRAM block device is required.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `bdev_type` | Yes | `"ram"` for DRAM-backed, `"file"` for filesystem-backed. |
| `capacity` | Yes | Maximum capacity (e.g., `"512MB"`, `"100GB"`). |

```yaml
compose:
  # DRAM block device (required)
  - mod_name: chimaera_bdev
    pool_name: "ram::chi_default_bdev"
    pool_query: local
    pool_id: "301.0"
    bdev_type: ram
    capacity: "512MB"

  # File-backed block device (optional — for NVMe, HDD, etc.)
  # - mod_name: chimaera_bdev
  #   pool_name: "/mnt/nvme/chi_bdev"
  #   pool_query: local
  #   pool_id: "302.0"
  #   bdev_type: file
  #   capacity: "100GB"
```

For DRAM devices the `pool_name` uses the `ram::<name>` convention. For file-backed devices the `pool_name` is the filesystem path where data is stored.

---

## Safe Block Device ChiMod (`clio_safe_bdev`)

An erasure-coded array over member bdevs: data members plus up to
`max_failures` dedicated Reed-Solomon parity members. It starts on as few as
one data member; data and parity members can be added at runtime, a failed
member is marked faulty (reads reconstruct it, writes keep its bytes in the
parity), and `RecoverBdev` rebuilds it onto a new disk.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_failures` | `1` | Parity members the array may take (simultaneous failures it survives). |
| `alloc_log` | `""` | Allocator log path. With it set, the array restores its allocations and its membership (`<alloc_log>.members`: members added or replaced at runtime, failed members) at restart. |
| `distributed` | `false` | `true`: each member is its pool's container on node `node_id` (disks on different nodes). The array runs on the first member's node; a member whose node dies is marked faulty. `false`: every member is this node's container of its pool. |
| `members` | — | Initial members: `pool_name`, `node_id`, `pool_id_major`, `pool_id_minor` of existing bdev pools. |

## CTE ChiMod Parameters (`wrp_cte_core`)

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
| `failover_to_successor` | `false` | While a blob's owner node is dead, route the blob to the first live successor container, which serves it from the replication ChiMod's remote copy (`remote_copies`) until the owner returns. |

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

## Replication ChiMod Parameters (`clio_cte_replication`)

The replication ChiMod (pool `561.0`) sits in the data path below the cache
and makes every put durable before it is acknowledged:

- `num_replicas` copies on the same node's persistent tiers. A restart drops
  the RAM primary; reads, and writes past its end, refill it from a replica.
- `remote_copies` copies on the next containers by hash, which are other
  nodes. Together with the core's `targets.failover_to_successor`, a blob
  stays readable and writable while its owner's node is down. The successor
  records what it changed and hands it back when the owner returns: a
  restarting owner pulls the changes before it serves, and a background sweep
  pushes anything left.

Remote copies protect CTE blobs (file pages, extended attributes, inode
records and staged appends). The filesystem's directory entries and the
stream sizes live in those modules' own state and are not yet covered.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `next_pool_id` | — | Pool below (usually the core, `512.0`). |
| `num_replicas` | `1` | Persistent copies per put on the owner's node. |
| `replicate_period_ms` | `50` | `0`: replicas are written before the put returns. Otherwise a sweep copies dirty blobs every period. |
| `cache_score` | `1.0` | Placement score for a primary re-cached from a replica. |
| `replica_score` | `0.2` | Score of the persistent copies. |
| `remote_copies` | `0` | Copies on the next containers by hash (other nodes), written before a put returns. Needs `failover_to_successor` on the core to be used while a node is down. |
| `handoff_log_path` | `""` | Base path of the handoff log (one file per container, suffixed `.<container>`). It records the changes a container made while covering for a dead owner, so they are still handed back when this node restarts before the owner returns. Empty keeps them in memory only. |

---

## Filesystem ChiMod Parameters (`clio_cte_filesystem`)

The filesystem ChiMod (pool `560.0`) is the POSIX layer the FUSE, POSIX and
STDIO adapters drive. Its namespace is **hash-sharded across every node**;
there is no metadata server:

- A directory's entries and attributes live on the node its path hashes to,
  so create, `O_EXCL`, `mkdir`, `unlink` and `readdir` in one directory are
  handled by a single node.
- A file's inode (mode, times, link count, open handles) lives on the
  node that created it, and so does its size (in the stream pool). That node is chosen by hashing the file's directory
  and is encoded in the file id, so a `stat` takes one hop. It takes two
  after the file was renamed or hard-linked into a directory owned by
  another node.
- File data pages are spread by the CTE core's per-page hash.

If a node dies, only the names and inodes it owns become unavailable. Those
operations fail with `EIO` and everything else keeps working.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `next_pool_id` | — | Pool the page blobs go through, usually the top of the interposition chain (for example `561.0` for replication, or `512.0` for the bare core). |
| `metadata_log_path` | unset | Node-local, append-only log of this node's slice of the namespace. The container id is appended to the file name. `clio_run restart` replays it; a fresh `start` discards it. Unset means the namespace is lost on restart. Keep it on node-local storage, never on shared NFS. |
| `stream_pool_id` | `"565.0"` | Stream pool that holds every file's size and merges deferred appends (see below). Created with defaults if not composed. |

---

## Stream ChiMod Parameters (`clio_cte_stream`)

The stream ChiMod (pool `565.0`) turns a CTE tag into a byte stream. It owns
the stream's page layout (1 MiB page blobs named by page index), its logical
size, and **deferred appends**:

- Every stream has a home container, chosen by the caller. clio-fs uses the
  file's inode home, so a `stat` reads the size without another hop.
- An append is staged as a blob (for crash safety) and returns at once.
  Each node ships its batch, bytes included, to the home every 1 ms. The home orders the
  combined batch, reserves its range from the size, and copies it into the
  pages.
- `close`, `fsync`, and a read or `fstat` through the appending descriptor
  wait for that descriptor's appends to be merged. Other descriptors see
  them within milliseconds (close-to-open consistency).
- Staged appends and merge plans survive a daemon crash: after
  `clio_run restart` they are merged exactly once.

The FUSE adapter uses deferred appends for `O_APPEND` writes on multi-node
mounts. Set `CLIO_FUSE_APPEND` to `deferred`, `reserve` (reserve the end at
the home before each write) or `kernel` (trust the kernel's cached size,
the single-node default) to override.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `next_pool_id` | `"512.0"` | Pool staged and merged bytes go through, usually the top of the interposition chain. |
| `staging_pool_id` | `next_pool_id` | Pool staged (not yet merged) appends are written to. They are written once and read at most once, after a restart, so point it below any cache (for example `561.0`). |
| `log_path` | unset | Node-local log of the sizes, merge plans and merged-append names of the streams this node homes. The container id is appended. Without it, file sizes do not survive `clio_run restart`. |

```yaml
- mod_name: clio_cte_stream   # compose BEFORE clio_cte_filesystem
  pool_name: clio_cte_stream
  pool_query: local
  pool_id: "565.0"
  next_pool_id: "561.0"
  log_path: "/mnt/nvme/$USER/clio/cte_stream_log"
```

---

## CAE ChiMod Parameters (`wrp_cae_core`)

| Parameter | Required | Description |
|-----------|----------|-------------|
| `pool_name` | Yes | User-defined pool name. |
| `pool_query` | Yes | Routing policy (`local`, `dynamic`, `broadcast`). |
| `pool_id` | Yes | Unique pool ID. Default CAE pool ID is `"400.0"`. |

```yaml
- mod_name: wrp_cae_core
  pool_name: wrp_cae_core_pool
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
  - mod_name: chimaera_bdev
    pool_name: "ram::chi_default_bdev"
    pool_query: local
    pool_id: "301.0"
    bdev_type: ram
    capacity: "512MB"

  - mod_name: wrp_cte_core
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
  - mod_name: chimaera_bdev
    pool_name: "ram::chi_default_bdev"
    pool_query: local
    pool_id: "301.0"
    bdev_type: ram
    capacity: "2GB"

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
networking:
  port: 9413
  neighborhood_size: 32
  hostfile: /etc/iowarp/hostfile

runtime:
  num_threads: 8
  queue_depth: 1024

compose:
  - mod_name: chimaera_bdev
    pool_name: "ram::chi_default_bdev"
    pool_query: local
    pool_id: "301.0"
    bdev_type: ram
    capacity: "2GB"

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

IOWarp uses `memfd_create()` for shared memory on Linux, so no special `/dev/shm` configuration is needed. Only `mem_limit` matters for resource control.

```yaml
# docker-compose.yml
services:
  iowarp:
    image: iowarp/deploy-cpu:latest
    container_name: iowarp
    hostname: iowarp
    volumes:
      - ./chimaera.yaml:/home/iowarp/.chimaera/chimaera.yaml:ro
    ports:
      - "9413:9413"
    mem_limit: 8g
    command: ["chimaera", "runtime", "start"]
    restart: unless-stopped
```

For multi-node Docker deployments, mount a shared hostfile and set the `networking.hostfile` path accordingly. See [HPC Cluster](./hpc-cluster) for details.

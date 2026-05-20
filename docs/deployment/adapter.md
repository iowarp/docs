---
sidebar_position: 3
title: FUSE Adapter
description: Mount a CTE-backed virtual filesystem using FUSE — no LD_PRELOAD required.
---

# FUSE Adapter

The FUSE adapter mounts a virtual filesystem backed by the Context Transfer Engine (CTE). Applications read and write files using normal POSIX I/O, and data transparently flows through CTE's tiered storage system — no `LD_PRELOAD`, no code changes, no recompilation.

## How It Works

| Concept | Mapping |
|---------|---------|
| **File** | CTE Tag (tag name = absolute FUSE path, e.g. `/mnt/cte/data/model.bin`) |
| **Directory** | Explicit sentinel tag (path + `/`) created by `mkdir`, or implicit when any tag shares the prefix |
| **File data** | Page-indexed blobs within the tag (`"0"`, `"1"`, `"2"`, …, default page size 1 MB) |
| **Directory listing** | `AsyncTagQuery` with regex matching on tag names |

No in-memory metadata structures are needed. All state — file contents, sizes, timestamps — is stored in CTE.

---

## Installation

### Option 1: install.sh (recommended)

The simplest way to build IOWarp with FUSE support:

```bash
# Install FUSE3 system dependency first
sudo apt install libfuse3-dev fuse3   # Ubuntu / Debian
sudo dnf install fuse3-devel fuse3    # RHEL / Fedora

# Build and install IOWarp with FUSE enabled
bash install.sh release-fuse
```

The `release-fuse` preset builds a Release-mode IOWarp with the FUSE adapter, ADIOS2 adapter, and all standard components enabled.

### Option 2: CMake manual build

If you prefer to configure manually:

```bash
# Using the preset
cmake --preset release-fuse
cmake --build build -j$(nproc)

# Or enable FUSE on any existing preset
cmake -DWRP_CTE_ENABLE_FUSE_ADAPTER=ON ..
cmake --build . --target clio_cte_fuse -j$(nproc)
```

This produces the `clio_cte_fuse` binary. The adapter links against `clio_cte_core_client` and `libfuse3` — it does **not** require MPI or ELF interception.

### Prerequisites

Ensure FUSE3 and `/dev/fuse` are available:

```bash
# Verify installation
ls -l /dev/fuse
fusermount3 --version
```

The IOWarp runtime must also be installed. See [Configuration](./configuration.md) for details.

---

## Usage

### 1. Start the IOWarp runtime

```bash
chimaera runtime start
```

Or with a custom configuration:

```bash
export CHI_SERVER_CONF=/path/to/config.yaml
chimaera runtime start
```

### 2. Mount the FUSE filesystem

```bash
mkdir -p /mnt/cte

# Connect as a client to the already-running runtime
CHI_WITH_RUNTIME=0 clio_cte_fuse /mnt/cte -f
```

| Flag | Description |
|------|-------------|
| `-f` | Run in the foreground (recommended for debugging). Omit to daemonize. |
| `-d` | Debug mode — prints every FUSE callback to stderr. |
| `-o allow_other` | Allow other users to access the mount (requires `user_allow_other` in `/etc/fuse.conf`). |
| `-s` | Single-threaded mode. By default FUSE is multi-threaded. |

Set `CHI_WITH_RUNTIME=0` so the FUSE daemon connects as a pure client to the existing runtime instead of trying to start its own.

### 3. Use it

Any application can read and write files on the mount point with standard tools:

```bash
# Write
echo "Hello, IOWarp!" > /mnt/cte/greeting.txt
cp dataset.csv /mnt/cte/data/dataset.csv

# Read
cat /mnt/cte/greeting.txt
md5sum /mnt/cte/data/dataset.csv

# List
ls /mnt/cte/

# Delete
rm /mnt/cte/greeting.txt
```

### 4. Unmount

```bash
fusermount3 -u /mnt/cte
```

---

## Quick Start Scripts

Ready-to-use scripts are available in `context-transfer-engine/test/integration/fuse-manual/`:

```bash
cd context-transfer-engine/test/integration/fuse-manual

# Start runtime + mount FUSE
./start.sh

# Copy /workspace into the FUSE mount and verify
./copy_workspace.sh

# Stop everything
./stop.sh
```

---

## Configuration

The FUSE adapter inherits its CTE configuration from the running IOWarp runtime. The runtime's `compose` section controls storage backends, tiering, and placement policy. No FUSE-specific configuration file is needed.

Example runtime config (`~/.chimaera/chimaera.yaml`):

```yaml
runtime:
  num_threads: 4
  queue_depth: 1024

compose:
  - mod_name: clio_cte_core
    pool_name: cte_main
    pool_query: local
    pool_id: "512.0"
    storage:
      - path: /mnt/ssd
        bdev_type: file
        capacity_limit: 50GB
        score: 0.8
      - path: /mnt/hdd
        bdev_type: file
        capacity_limit: 500GB
        score: 0.2
    dpe:
      dpe_type: max_bw
```

With this config, files written to the FUSE mount are automatically placed across SSD and HDD tiers based on the `max_bw` data placement engine.

---

## Docker

When running inside a Docker container, the container needs FUSE device access:

```bash
docker run --cap-add SYS_ADMIN --device /dev/fuse \
  --security-opt apparmor:unconfined \
  --security-opt seccomp=unconfined \
  -v /workspace:/workspace \
  iowarp/deps-cpu:latest \
  bash -c "chimaera runtime start & sleep 3 && \
    CHI_WITH_RUNTIME=0 clio_cte_fuse /mnt/cte -f"
```

A ready-made Docker Compose configuration for integration testing is available at:

```
context-transfer-engine/test/integration/fuse/docker-compose.yaml
```

Run it with:

```bash
cd context-transfer-engine/test/integration/fuse
./run_tests.sh
```

---

## Performance

Benchmark results (50 MB `dd` write, 1 MB block size):

| Configuration | Throughput |
|---------------|-----------|
| FUSE + CTE (1 MB pages, SHM) | ~250 MB/s |
| FUSE + CTE (1 MB pages, TCP) | ~250 MB/s |
| Native filesystem | ~500 MB/s |

The 1 MB default page size minimizes the number of CTE blob operations per write. The remaining overhead is from the FUSE kernel round-trip (user → kernel → FUSE daemon → CTE → back).

---

## Supported Operations

| FUSE Operation | Behavior |
|----------------|----------|
| `getattr` | Sentinel tags → directories; regular tags → files; prefix matches → implicit directories |
| `readdir` | Lists direct child tags, implicit subdirectories, and explicit empty directories (sentinel tags) |
| `create` | Creates a new CTE tag with `AsyncGetOrCreateTag` |
| `open` | Looks up existing tag |
| `read` | Page-based `AsyncGetBlob` loop (1 MB pages) |
| `write` | Page-based `AsyncPutBlob` loop (1 MB pages) |
| `release` | Frees per-open file handle |
| `unlink` | Deletes tag with `AsyncDelTag` |
| `mkdir` | Creates sentinel tag (path + `/`) so the directory is immediately visible |
| `rmdir` | Deletes sentinel tag; fails with `ENOTEMPTY` if children exist |
| `truncate` | Updates cached size (CTE does not yet support blob truncation) |
| `utimens` | Accepted silently (CTE manages timestamps internally) |

### Not yet supported

| Operation | Notes |
|-----------|-------|
| `rename` | Would require CTE tag rename support |
| `chmod` / `chown` | CTE does not store POSIX permission metadata |
| `symlink` / `link` | Not in scope |
| `statfs` | Not implemented |

---

## Comparison with Other Adapters

| | POSIX Adapter | STDIO Adapter | FUSE Adapter |
|---|---|---|---|
| **Mechanism** | `LD_PRELOAD` | `LD_PRELOAD` | Kernel VFS mount |
| **Requires preloading** | Yes | Yes | No |
| **Requires recompilation** | No | No | No |
| **Works with any language** | C/C++ only | C/C++ only | Yes (any language) |
| **Intercepts existing binaries** | Yes | Yes | Yes |
| **MPI dependency** | Yes | Yes | No |
| **Performance overhead** | Low (direct SHM) | Low (direct SHM) | Moderate (kernel ↔ userspace copies) |

The FUSE adapter trades some performance for universal compatibility — any program that can open a file path can use it, regardless of language or link-time dependencies.

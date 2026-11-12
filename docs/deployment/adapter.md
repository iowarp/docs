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
cmake -DCLIO_CTE_ENABLE_FUSE_ADAPTER=ON ..
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

The CLIO Runtime must also be installed. See [Configuration](./configuration.md) for details.

---

## Usage

### 1. Start the CLIO Runtime

```bash
clio_run start
```

Or with a custom configuration:

```bash
export CLIO_SERVER_CONF=/path/to/config.yaml
clio_run start
```

### 2. Mount the FUSE filesystem

```bash
mkdir -p /mnt/cte

# Connect as a client to the already-running runtime
CLIO_WITH_RUNTIME=0 clio_cte_fuse /mnt/cte -f
```

| Flag | Description |
|------|-------------|
| `-f` | Run in the foreground (recommended for debugging). Omit to daemonize. |
| `-d` | Debug mode — prints every FUSE callback to stderr. |
| `-o allow_other` | Allow other users to access the mount (requires `user_allow_other` in `/etc/fuse.conf`). |
| `-s` | Single-threaded mode. By default FUSE is multi-threaded (since release X). |

Set `CLIO_WITH_RUNTIME=0` so the FUSE daemon connects as a pure client to the existing runtime instead of trying to start its own.

### Environment variables

`wrp_cte_fuse` reads the following env vars at startup. Set them in the shell that exec's the binary (or in the `env:` of the jarvis package that owns it):

| Variable | Default | Purpose |
|----------|---------|---------|
| `CHI_WITH_RUNTIME` | `0` (recommended for the typical "external runtime" deployment) | When set to `1` / `true`, the FUSE daemon **embeds** the chimaera runtime inside its own process (no separate `chimaera runtime start` needed). When `0` / unset, the daemon connects as a *pure client* to an externally-managed runtime. Embedded mode avoids the fork-after-`CHIMAERA_INIT` corner case where the libfuse daemonize step orphans the chimaera worker threads, so it is the more reliable choice when the FUSE daemon is the only chimaera consumer on the node. In a jarvis pipeline, set this via `embedded_runtime: true` on the `wrp_cte_libfuse` package; in that case also set `do_start: false` on a same-pipeline `wrp_runtime` package so it skips spawning a competing daemon (port 9413 conflict) while still emitting `chimaera_config.yaml`. Order the pipeline so the runtime-owning package starts before any client (`wrp_cte`, the workload). |
| `CHI_SERVER_CONF` | (none) | Path to the chimaera runtime YAML config. Required when `CHI_WITH_RUNTIME=1`. Optional when `0` — the daemon picks it up from the running runtime. |
| `CHI_IPC_MODE` | `SHM` | Transport between the FUSE daemon (as chimaera client) and the runtime. `SHM` for same-node, `TCP` or `IPC` for cross-node. Ignored in embedded mode. |
| `WRP_CTE_FUSE_SINGLE_THREAD` | unset | Set to `1` / `true` to force libfuse into single-threaded dispatch (equivalent to passing `-s`). Useful for debugging deadlocks or comparing MT vs ST throughput. By default the adapter runs multi-threaded. |
| `CHI_FUSE_OVERHEAD` | unset | Set to `1` / `true` to make the FUSE daemon a **chimaera-bypass / overhead-only** server. Writes become no-ops that bump a per-path size counter; reads return zeros. The mount still behaves as a real FUSE filesystem (`getattr`, `readdir`, `create`, `unlink` all work via an in-process map), so you can run `dd` / IOR against it to measure pure kernel ↔ libfuse round-trip cost in isolation from chimaera + bdev. Subtract from the chimaera-backed result to attribute overhead between the two layers. |
| `CLIO_FUSE_PERMISSIONS` | `1` | The mount enforces POSIX mode bits and ownership (libfuse `default_permissions`): the kernel checks access against each file's mode/uid/gid before any request reaches the adapter, as on ext4. Set to `0` to mount without it (every caller that can reach the mount gets access). |
| `CLIO_FUSE_ATIME` | relatime | How reads move access times: `relatime` (the Linux default: a read moves atime when it is not newer than the last modify/change, or is a day old), `strict` (every read), or `0` (noatime). The `-o noatime`, `-o strictatime` and `-o relatime` mount options set it too; an explicit variable wins. |
| `CLIO_FUSE_ATTR_CACHE_S` | `1` single-node, `0` multi-node | Seconds the kernel may reuse attributes (size, mode, times) without asking the adapter. `0` sends every stat to the runtime. On a multi-node mount a non-zero value lets a reader keep a size another node has since changed for up to that long. |
| `CLIO_FUSE_ENTRY_CACHE_S` | `1` | Seconds the kernel may reuse a name lookup. The adapter still resolves the full path at its owner on every operation, so a name removed on another node fails with `ENOENT` at once. |
| `CLIO_FUSE_DIR_ATTR_CACHE_S` | the attribute TTL single-node, `0` (off) multi-node | Seconds the adapter itself reuses a **directory's** attributes. File attributes are never cached by it. Opt-in on multi-node mounts; see [Directory attribute cache](#directory-attribute-cache). |
| `WRP_CTE_FUSE_MOUNTPOINT` | (none) | Only consulted on the apptainer `--fusemount` path (when argv ends with `/dev/fd/<N>`). apptainer doesn't pass the mountpoint via argv, so the caller must export this. Unused in the normal `wrp_cte_fuse /path/to/mnt` invocation. |

### Directory attribute cache

With the kernel attribute cache off (the multi-node default) and permissions
enforced, the kernel asks for the attributes of every directory on a path
each time it walks that path. A `stat`, `open`, `creat` or `unlink` of
`/a/b/c/file` therefore costs one `getattr` per ancestor directory, each a
round trip to the runtime, before the operation itself runs.

`CLIO_FUSE_DIR_ATTR_CACHE_S=<seconds>` makes the adapter answer those
directory `getattr`s from its own cache. It is off by default on multi-node
mounts and is a per-mount choice, not a policy: set it on the mounts whose
workload can accept the staleness below.

- Only directories are cached. File sizes and times are always exact.
- A change this mount makes (create, unlink, mkdir, rmdir, rename, chmod,
  chown, utimens) drops the affected entries immediately.
- A change made through **another node** is not seen until the entry expires.
  For up to the TTL this mount can report a directory's old mode, owner, link
  count and times, can keep applying its old permissions, and can still
  `stat` a directory that was removed elsewhere.
- `0` disables it. On single-node mounts it follows `CLIO_FUSE_ATTR_CACHE_S`
  unless set.

### Directory offsets

Every entry of a directory has an **offset** computed from its name alone: a
hash of the name, spread evenly over the 63-bit offset range. A listing is
returned in ascending offset order (so in hash order, not by name or by
creation time), and the adapter honours the offset `readdir` is called with.

- **Stable.** An entry's offset is the same on every node, in every process
  and across `opendir` calls, for as long as the entry keeps its name. An
  offset from `telldir` in one process can be passed to `seekdir` in another,
  and `seekdir` accepts any offset, not only ones `telldir` returned: the
  listing continues with the first entry at or after it. A walker can
  therefore split one large directory across processes by cutting the offset
  range into pieces (IO500 `pfind` with
  `pfind-parallelize-single-dir-access-using-hashing`).
- **What `d_off` / `telldir` report.** `.` and `..` come first (offsets 1 and
  2 follow them). After any other entry the reported position is the offset
  of the **next** entry in the listing, and `INT64_MAX` after the last one. A
  reader that owns the range `[a, b)` starts with `seekdir(a)` and stops when
  the position reaches `b`.
- **Chunked.** The adapter fetches a directory from the runtime in chunks of
  about 8,192 entries, in offset order, and keeps the current chunk in the
  open directory handle. A directory of any size is listed with bounded
  memory and bounded reply size; a seek fetches only the chunk at the target
  offset. A directory small enough for one reply is fetched whole.
- **Changes during a walk.** Offsets do not move when the directory changes,
  so a walk never skips or repeats an entry that existed for the whole walk.
  An entry created or removed during the walk is seen or not depending on
  whether its offset lies before or after the walk's position, and on whether
  its chunk had already been fetched. A rename during the walk of a large
  directory moves the entry to its new name's offset: the walk can see it
  under both names, or under neither. `rewinddir` (or a new `opendir`)
  re-reads the directory.
- **Equal offsets.** Two names can hash to the same offset (rare: the offset
  has 63 bits). Such entries are listed next to each other, in name order,
  and the position reported between them is their shared offset. The open
  handle that listed some of them remembers how many it returned and resumes
  after them; a `seekdir` to that offset from another handle, or after
  moving elsewhere in the directory, returns all of them again.

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

The FUSE adapter inherits its CTE configuration from the running CLIO Runtime. The runtime's `compose` section controls storage backends, tiering, and placement policy. No FUSE-specific configuration file is needed.

Example runtime config (`~/.clio/clio.yaml`):

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
  bash -c "clio_run start & sleep 3 && \
    CLIO_WITH_RUNTIME=0 clio_cte_fuse /mnt/cte -f"
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

### Multi-threaded dispatch

libfuse multi-threading is the default. Multiple kernel FUSE requests can be served in parallel by separate worker threads inside `wrp_cte_fuse`, which on a 4-writer IOR run (`nprocs=4, ppn=4, xfer=1m, block=256m`) on a single Ares node measured **1,214 MiB/s** for the FUSE protocol path alone (chimaera bypassed via `CHI_FUSE_OVERHEAD=1`) — vs ~220 MiB/s for a single-writer single-threaded baseline (~5.5× scaling).

Set `WRP_CTE_FUSE_SINGLE_THREAD=1` to force the legacy single-threaded loop when debugging concurrency issues.

---

## Supported Operations

| FUSE Operation | Behavior |
|----------------|----------|
| `getattr` | Sentinel tags → directories; regular tags → files; prefix matches → implicit directories |
| `readdir` | Lists direct child tags, implicit subdirectories, and explicit empty directories (sentinel tags). Seekable, in chunks of about 8,192 entries; see [Directory offsets](#directory-offsets) |
| `opendir` / `releasedir` | Allocate / free the per-open listing state (the current chunk) |
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

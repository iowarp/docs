---
sidebar_position: 3
title: FUSE Adapter
description: Mount a CTE-backed virtual filesystem using FUSE on Linux, macOS, and Windows — no LD_PRELOAD required.
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

## Platform Support

`clio_cte_fuse` runs on all three desktop platforms. The FUSE **callbacks and the entire CTE data path below them are identical everywhere** — only the kernel backend and the mount mechanics differ.

| | Linux | macOS | Windows |
|---|---|---|---|
| **Backend** | libfuse3 | [macFUSE](https://macfuse.github.io) 5 (ships libfuse3) | [WinFsp](https://winfsp.dev) 2.0 |
| **Ships in the pip wheel** | Yes | **No** — source build required | Yes |
| **Mountpoint** | Any directory | A directory (kext) or under `/Volumes` (FSKit) | A drive letter (`Z:`) or a directory |
| **Unmount** | `fusermount3 -u` | `umount` / `diskutil unmount force` | Stop the daemon process |
| **Discovery** | `pkg-config fuse3` | `pkg-config fuse3` | `WINFSP_ROOT` (no `.pc` file) |
| **CI coverage** | Build + unit + ops + live mount + xfstests conformance | Build + unit + ops enforced; mount smoke is a non-blocking probe | Build + unit + live WinFsp mount smoke |

:::note macOS is a source build
The macOS wheel does not ship `clio_cte_fuse`. Build from source against macFUSE — see the macOS tab below. (Older notes claiming macOS "has no FUSE3 API" predate macFUSE 5, which does ship libfuse3.)
:::

---

## Installation

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs groupId="os">
<TabItem value="linux" label="Linux" default>

**1. Install libfuse3.** It is a system dependency and is deliberately *not* bundled in the wheel:

```bash
sudo apt install libfuse3-dev fuse3     # Ubuntu / Debian
sudo dnf install fuse3-devel fuse3      # RHEL / Fedora
```

If you only ever run a prebuilt binary, the runtime packages (`fuse3 libfuse3-3` / `fuse3 fuse3-libs`) are enough; the `-dev` / `-devel` packages are needed to *build* the adapter.

**2a. Prebuilt (pip).** The Linux wheel already ships `clio_cte_fuse`:

```bash
pip install iowarp-core
clio_cte_fuse --help
```

**2b. From source.** The `release-fuse` preset is a Release build with the FUSE adapter enabled:

```bash
bash install.sh release-fuse
# or, configuring manually:
cmake --preset release-fuse
cmake --build build -j"$(nproc)"
```

To enable FUSE on any other preset, add `-DCLIO_CTE_ENABLE_FUSE_ADAPTER=ON`.

**3. Verify.** `/dev/fuse` must exist and be accessible:

```bash
ls -l /dev/fuse
fusermount3 --version
```

</TabItem>
<TabItem value="macos" label="macOS">

**1. Install macFUSE.** macFUSE 5 ships libfuse3 — headers, dylib, and a `fuse3` pkg-config file — under `/usr/local`:

```bash
brew install --cask macfuse
```

Installing the cask needs no kernel-extension approval. Only *mounting* through the kext backend does — see the mount step below.

**2. Build from source.** The macOS wheel does not include the adapter, so this step is required:

```bash
cmake --preset release-mac-fuse
cmake --build build-mac-fuse -j"$(sysctl -n hw.ncpu)"
```

`release-mac-fuse` is guarded by a `hostSystemName == Darwin` condition and turns off `io_uring` (Linux-only). To enable FUSE on a different preset, add `-DCLIO_CTE_ENABLE_FUSE_ADAPTER=ON`.

**3. If configure does not find FUSE.** Discovery goes through pkg-config, and macFUSE's `.pc` lives outside the default search path on some setups. Make it visible:

```bash
export PKG_CONFIG_PATH="/usr/local/lib/pkgconfig:/opt/homebrew/lib/pkgconfig:$PKG_CONFIG_PATH"
```

The adapter is skipped — not failed — when the backend is missing, so a silent absence of `bin/clio_cte_fuse` is the symptom. Check for it explicitly:

```bash
test -x build-mac-fuse/bin/clio_cte_fuse && echo "FUSE adapter built"
```

</TabItem>
<TabItem value="windows" label="Windows">

**1. Install WinFsp.** WinFsp provides a FUSE3-compatible header (`inc/fuse3/fuse.h`) and an import library. Install it from [winfsp.dev](https://winfsp.dev), or silently:

```powershell
$msi = "$env:TEMP\winfsp.msi"
Invoke-WebRequest -Uri "https://github.com/winfsp/winfsp/releases/download/v2.0/winfsp-2.0.23075.msi" -OutFile $msi
# ADDLOCAL=ALL pulls in the Developer feature (inc/fuse3 + lib) needed to BUILD.
Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn ADDLOCAL=ALL" -Wait
```

The MSI installs the kernel driver too, so mounting works without a reboot. To only *run* a prebuilt binary, the default (runtime-only) install is enough — the Developer feature is a build-time requirement.

**2a. Prebuilt (pip).** The Windows wheel ships `clio_cte_fuse.exe`:

```powershell
pip install iowarp-core
clio_cte_fuse --help
```

The console script prepends WinFsp's `bin` directory to `PATH` itself, so `winfsp-x64.dll` resolves without a system-wide `PATH` edit. If WinFsp is missing, the script exits with an explanatory error rather than a bare DLL-load failure.

**2b. From source.** There is no dedicated Windows FUSE preset — enable the option on `windows-release`:

```powershell
cmake --preset windows-release -DCLIO_CTE_ENABLE_FUSE_ADAPTER=ON
cmake --build build --config Release -j $env:NUMBER_OF_PROCESSORS
```

WinFsp ships no pkg-config file, so it is located by path rather than by `pkg-config`. The default is `%ProgramFiles(x86)%\WinFsp`; override it if you installed elsewhere:

```powershell
cmake -B build -A x64 -DCLIO_CTE_ENABLE_FUSE_ADAPTER=ON -DWINFSP_ROOT="D:\WinFsp"
```

**3. Verify.** A missing backend skips the adapter rather than failing the build, so check the binary exists:

```powershell
Test-Path build\bin\clio_cte_fuse.exe
```

</TabItem>
</Tabs>

The adapter links against `clio_cte_filesystem_client`, `clio_cte_core_client`, and the platform's FUSE backend — it does **not** require MPI or ELF interception. The CLIO Runtime must also be installed; see [Configuration](./configuration.md).

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

The daemon **create-or-binds** the filesystem pool and the CTE pool underneath it, so no separate `compose` step is required. To size storage tiers explicitly instead of taking the defaults, compose a CTE pool first with `clio_run compose start my_cte.yaml`.

<Tabs groupId="os">
<TabItem value="linux" label="Linux" default>

```bash
mkdir -p /mnt/cte

# Connect as a client to the already-running runtime
CLIO_WITH_RUNTIME=0 clio_cte_fuse /mnt/cte -f
```

Any directory works as a mountpoint.

</TabItem>
<TabItem value="macos" label="macOS">

macFUSE offers two kernel backends, and which one you can use decides where the mountpoint may live.

**Kext backend (default).** Full-featured, but the kernel extension needs one-time user approval: System Settings → Privacy & Security → *Allow* the developer, then reboot. This cannot be automated, which is why CI does not use it.

```bash
mkdir -p ~/cte-mnt
CLIO_WITH_RUNTIME=0 clio_cte_fuse ~/cte-mnt -f
```

**FSKit backend (kext-free).** Requires **macFUSE 5.1+ on macOS 15.4+**, and the mountpoint **must be under `/Volumes`**:

```bash
sudo mkdir -p /Volumes/cte-mnt
sudo chown "$(whoami)" /Volumes/cte-mnt

CLIO_WITH_RUNTIME=0 clio_cte_fuse /Volumes/cte-mnt -f -o backend=fskit
```

:::caution macOS mounting is the least-proven path
The macOS build and its unit + in-process operation suites are enforced in CI, but the live mount smoke test is a **non-blocking probe** — FSKit extension-approval behavior on CI runner images is still unproven. A first mount attempt that hangs rather than failing is a known shape of this problem; bound it with a timeout rather than waiting indefinitely.
:::

</TabItem>
<TabItem value="windows" label="Windows">

WinFsp mounts drive letters natively, which is the usual choice:

```powershell
$env:CLIO_WITH_RUNTIME = "0"
clio_cte_fuse Z: -f
```

A host directory also works in place of `Z:`. Pick a drive letter that is actually free — `Get-PSDrive -PSProvider FileSystem` lists the ones in use.

</TabItem>
</Tabs>

Every argument after the mountpoint is handed to `fuse_main`, so the standard libfuse options apply:

| Flag | Description |
|------|-------------|
| `-f` | Run in the foreground (recommended for debugging, and what CI exercises). Omit to daemonize. |
| `-d` | Debug mode — prints every FUSE callback to stderr. |
| `-o allow_other` | Allow other users to access the mount (requires `user_allow_other` in `/etc/fuse.conf`). |
| `-s` | Single-threaded mode. By default FUSE is multi-threaded. |

Set `CLIO_WITH_RUNTIME=0` so the FUSE daemon attaches to the runtime you already started instead of spawning its own embedded one. Without it the daemon comes up on a private runtime and **the data will not be visible to other clients**.

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

<Tabs groupId="os">
<TabItem value="linux" label="Linux" default>

```bash
fusermount3 -u /mnt/cte
# older systems: fusermount -u /mnt/cte
```

</TabItem>
<TabItem value="macos" label="macOS">

```bash
umount ~/cte-mnt
# if the volume is busy or wedged:
diskutil unmount force ~/cte-mnt
```

</TabItem>
<TabItem value="windows" label="Windows">

There is no `fusermount` on Windows — stopping the daemon makes WinFsp unmount the volume:

```powershell
Stop-Process -Name clio_cte_fuse -Force
```

Or press `Ctrl+C` in the foreground (`-f`) window.

</TabItem>
</Tabs>

---

## Running Under Apptainer (Linux HPC)

Apptainer's `--fusemount` opens `/dev/fuse` and passes the FUSE binary a pre-opened file descriptor as the last argument, `/dev/fd/<N>`. libfuse 3's high-level argv parser rejects that token (it is a libfuse2-era convention), and Apptainer strips the mountpoint from `argv`, so there is no plain `fuse_main` invocation that works.

`clio_cte_fuse` detects a trailing `/dev/fd/<N>` and takes a separate path: it binds the descriptor to a mountpoint itself and drives the protocol with `fuse_session_custom_io()`. Two things this requires:

1. **`CLIO_CTE_FUSE_MOUNTPOINT` must be set** before the binary is exec'd. Apptainer communicates the mountpoint through neither `argv` nor the environment, so the binary cannot discover it and exits with an error rather than guessing.
2. **`CAP_SYS_ADMIN` in the current user namespace** — unprivileged Apptainer (no setuid starter) does not call `mount(2)` itself for a user-supplied binary; it only hands over the descriptor. Apptainer's userns mapping normally provides the capability.

```bash
export CLIO_CTE_FUSE_MOUNTPOINT=/mnt/cte
```

:::warning The pip wheel cannot do this
The custom-io path needs **libfuse 3.14+ headers at build time**. The manylinux images used to build Linux wheels ship libfuse 3.10.2, so the path is compiled out of the published wheel — running it in `--fusemount` mode prints a "needs 3.14+ headers at build time" error and exits. Normal mounting is unaffected. **Build from source against libfuse 3.14+ if you need the Apptainer path.**
:::

This is Linux-only. Windows and macOS always take the ordinary `fuse_main` mount-and-serve route.

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

### End-to-end mount check

The scripts CI uses to validate a real mount are the fastest way to confirm a fresh deployment works. They start the runtime, compose a CTE pool, mount, write + read back + verify a file, then tear everything down:

```bash
# Linux and macOS
CI/fuse_mount_smoke.sh <build-dir>

# macOS with the kext-free FSKit backend
sudo mkdir -p /Volumes/cte_smoke && sudo chown "$(whoami)" /Volumes/cte_smoke
CLIO_SMOKE_MOUNT_POINT=/Volumes/cte_smoke \
CLIO_SMOKE_FUSE_OPTS="-o backend=fskit" \
  CI/fuse_mount_smoke.sh <build-dir>
```

```powershell
# Windows — picks a free drive letter automatically
pwsh CI/fuse_mount_smoke.ps1 -BuildDir <build-dir>
```

`<build-dir>` is a CMake binary directory whose `bin/` holds `clio_run` and `clio_cte_fuse`. Both scripts fail fast with an explicit message if the adapter binary is missing, which is the usual sign that the FUSE backend was not detected at configure time.

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

A FUSE mount created inside a container lives in that container's mount namespace — it is not visible on the host. On macOS and Windows the container also runs inside a Linux VM, so the mount is doubly unreachable from the host filesystem. If you want the mount usable from the host on those platforms, run the FUSE daemon natively (as above) and let containers reach the runtime over the network instead.

When mounting inside a Linux container, the container needs FUSE device access:

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
| `truncate` | `AsyncTruncate` on the filesystem chimod |
| `utimens` | Sets atime/mtime; honors `UTIME_NOW` (resolved server-side, sharing the tag clock) and `UTIME_OMIT` |
| `rename` | `AsyncRename`; honors `RENAME_NOREPLACE` |
| `chmod` / `chown` | `AsyncChmod` / `AsyncChown` — POSIX mode bits and ownership are stored |
| `symlink` / `readlink` | Target string stored in a reserved marker blob under the link's tag |
| `link` | Hard link — both names bind to the same CTE tag, so they share all data and inode |
| `statfs` | Reports real capacity via `GetCapacity` |
| `setxattr` / `getxattr` / `listxattr` / `removexattr` | Extended attributes, stored per tag |
| `fsync` / `flush` | No-ops returning success — writes are already write-through, so there is nothing buffered to flush |
| `fallocate` | Linux only. `FALLOC_FL_KEEP_SIZE` and `FALLOC_FL_ZERO_RANGE`; punch/collapse/insert return `EOPNOTSUPP` |

### Not supported

| Operation | Notes |
|-----------|-------|
| `RENAME_EXCHANGE` / `RENAME_WHITEOUT` | Return `EINVAL` so callers fall back cleanly; would need chimod-level atomic swap / whiteout |
| `fallocate` punch / collapse / insert | Layout-changing; return `EOPNOTSUPP` |

### Caching semantics

The `init` callback deliberately disables the kernel's attribute, entry, and negative caches (`attr_timeout = entry_timeout = negative_timeout = 0`). Metadata can change without *this* FUSE process being the one that changed it, and there is no upcall to invalidate a stale entry — so every `getattr`/lookup goes to the chimod, which is the source of truth. Without this, `ln a b; stat a` would report `a`'s stale cached link count.

The kernel page cache for file *data* stays enabled (`direct_io = 0`). This is what makes `mmap` work: the high-level FUSE API has no `.mmap` callback, so the kernel faults mapped pages through `read` and flushes dirty pages through `write`. Turning `direct_io` on would bypass the page cache and make every `mmap` fail with `ENODEV`.

---

## Comparison with Other Adapters

| | POSIX Adapter | STDIO Adapter | FUSE Adapter |
|---|---|---|---|
| **Platforms** | **Linux only** | **Linux only** | Linux, macOS, Windows |
| **Mechanism** | `LD_PRELOAD` | `LD_PRELOAD` | Kernel VFS mount |
| **Requires preloading** | Yes | Yes | No |
| **Requires recompilation** | No | No | No |
| **Works with any language** | C/C++ only | C/C++ only | Yes (any language) |
| **Intercepts existing binaries** | Yes | Yes | Yes |
| **MPI dependency** | Yes | Yes | No |
| **Performance overhead** | Low (direct SHM) | Low (direct SHM) | Moderate (kernel ↔ userspace copies) |

The FUSE adapter trades some performance for universal compatibility — any program that can open a file path can use it, regardless of language or link-time dependencies.

The POSIX, STDIO, and HDF5 VFD adapters are built on the glibc ELF/`dlsym` interceptor, which has **no macOS or Windows port**. On those platforms FUSE is the only transparent-interception option. (The HDF5 VOL connector is portable and works on all three.)

---

## Troubleshooting

### `clio_cte_fuse` was not built

The adapter is **skipped, not failed**, when its backend is not found at configure time — so the symptom is a missing binary, not a build error. Re-run CMake and look for the warning:

- **Linux** — `FUSE3 not found`. Install `libfuse3-dev` / `fuse3-devel`.
- **macOS** — the `fuse3` `.pc` file is not on the pkg-config path. Add `/usr/local/lib/pkgconfig` (and `/opt/homebrew/lib/pkgconfig` on Apple Silicon) to `PKG_CONFIG_PATH`.
- **Windows** — `WinFsp not found`. Reinstall the MSI with `ADDLOCAL=ALL` so the Developer feature (`inc/fuse3` + `lib`) is present, or pass `-DWINFSP_ROOT=<dir>`.

### Data written through the mount is invisible to other clients

`CLIO_WITH_RUNTIME` was unset or non-zero, so the daemon started its own private embedded runtime. Set `CLIO_WITH_RUNTIME=0` and mount again.

### The mount point does not appear

Give the daemon a few seconds — the CI smoke tests poll for up to 20 s. If the daemon exits first, run it with `-f` and read stderr; `-d` adds a trace of every FUSE callback. On Windows, confirm the drive letter you chose is actually free.

### macOS: mount hangs or is refused

The kext backend needs one-time approval in System Settings → Privacy & Security followed by a reboot. If you cannot approve a kext (managed machines, CI), use the FSKit backend instead: `-o backend=fskit`, macFUSE 5.1+ on macOS 15.4+, mountpoint under `/Volumes`. A hung mount is a known shape here — bound the attempt with a timeout rather than waiting on it.

### Windows: `winfsp-x64.dll` could not be found

The MSI does not add WinFsp's `bin` to the system `PATH`. The pip console script handles this itself; a directly-invoked binary does not. Prepend it manually:

```powershell
$env:PATH = "${env:ProgramFiles(x86)}\WinFsp\bin;$env:PATH"
```

### `mmap` fails with `ENODEV`

Something has enabled `direct_io`, which bypasses the page cache the kernel needs to serve mapped pages. The adapter leaves it off by default; do not pass `-o direct_io`.

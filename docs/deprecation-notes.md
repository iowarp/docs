---
sidebar_position: 9
title: Deprecation Notes
description: Legacy names that have been removed, the ones that still work, and how to migrate a downstream project.
---

# Deprecation Notes

IOWarp was renamed from `chimaera` / `hermes_shm` to `clio` / `clio_ctp`.
For a period, every legacy name kept working as a compatibility alias.

:::danger The compatibility shims have been removed
The `CHI_*` env vars, `<chimaera/…>` and `<hermes_shm/…>` header shims, the
`hshm::` / `hipc::` namespace aliases, the `HSHM_*` and `CHI_*` macro
`#define`s, the `~/.chimaera/` config paths, and the `chimaera` CLI symlink
**no longer exist**. Code or scripts still written against them will fail to
compile or will silently fall back to defaults.

The [migration sweep](#migrating-a-downstream-project) below is now
mandatory rather than optional.
:::

The rest of the documentation uses the canonical name in every example. This
page is where you look up "what was the old name?" and "what should I update
to?".

---

## What still works

| Canonical | Legacy alias | How the alias works |
|-----------|--------------|---------------------|
| `clio_cae` | `clio_cae_omni` | `clio_cae_omni` is installed as a symlink to `clio_cae` (a copy on Windows). |

### Flat vs nested `clio_run` subcommands

`clio_run` accepts both a flat and a nested subcommand form:

| Canonical (flat) | Legacy (nested) |
|------------------|-----------------|
| `clio_run start` | `clio_run runtime start` |
| `clio_run stop` | `clio_run runtime stop` |
| `clio_run restart` | `clio_run runtime restart` |
| `clio_run refresh` | `clio_run repo refresh` |

Both forms resolve to the same handler. The flat form is shorter and is the
form used in docs and examples. The newer subcommands — `compose`, `config`,
`migrate`, `monitor` — have **no** nested form.

---

## What has been removed

### CLI binaries

| Canonical | Removed alias |
|-----------|---------------|
| `clio_run` | `chimaera` — the symlink is no longer installed. |

### Configuration files and directories

The runtime now looks **only** at `$CLIO_SERVER_CONF` and then
`~/.clio/clio.yaml`. These paths are no longer consulted:

- `~/.clio/chimaera.yaml`
- `~/.chimaera/clio.yaml`
- `~/.chimaera/chimaera.yaml`

Installers seed `~/.clio/clio.yaml` only. If your config still lives under
`~/.chimaera/`, move it or point `CLIO_SERVER_CONF` at it — otherwise the
runtime starts on the **built-in defaults**, which have an empty `compose`
section and therefore no storage tiers.

Repository and module manifests are likewise `clio_repo.yaml` and
`clio_mod.yaml` only; the `chimaera_repo.yaml` / `chimaera_mod.yaml`
fallbacks are gone. The file contents did not change — only the filename.

### Environment variables

Every runtime env var moved from a `CHI_` prefix to a `CLIO_` prefix. The
`GetCompat()` helper that used to fall back to `CHI_<suffix>` now reads
`CLIO_<suffix>` and nothing else.

This is the failure mode to watch for: an unset variable is not an error, so
a launch script still exporting `CHI_SERVER_CONF` or `CHI_PORT` will start
the runtime successfully **on the wrong configuration**. Rename them:

| Canonical | Removed alias |
|-----------|---------------|
| `CLIO_SERVER_CONF` | `CHI_SERVER_CONF` |
| `CLIO_IPC_MODE` | `CHI_IPC_MODE` |
| `CLIO_WITH_RUNTIME` | `CHI_WITH_RUNTIME` |
| `CLIO_PORT` | `CHI_PORT` |
| `CLIO_SERVER_ADDR` | `CHI_SERVER_ADDR` |
| `CLIO_REPO_PATH` | `CHI_REPO_PATH` |
| `CLIO_NUM_CONTAINERS` | `CHI_NUM_CONTAINERS` |
| `CLIO_GPU_BLOCKS`, `CLIO_GPU_THREADS` | `CHI_GPU_BLOCKS`, `CHI_GPU_THREADS` |
| `CLIO_INIT_ATTEMPTS`, `CLIO_INIT_SLEEP_MS`, `CLIO_INIT_STAGGER_MS` | `CHI_INIT_*` |
| `CLIO_CLIENT_RETRY_TIMEOUT`, `CLIO_CLIENT_TRY_NEW_SERVERS` | `CHI_CLIENT_*` |
| `CLIO_LBM_THALLIUM_PROTOCOL`, `CLIO_LBM_THALLIUM_RPC_THREADS`, `CLIO_LBM_ZMQ_STATS` | `CHI_LBM_*` |
| `CLIO_MEMFD_DIR`, `CLIO_TEST_DATA_DIR`, `CLIO_WAIT_SERVER`, `CLIO_ZMQ_IO_THREADS` | `CHI_*` (same suffix) |

The rule is mechanical: `CHI_<suffix>` → `CLIO_<suffix>`. See the
[Configuration Reference](./deployment/configuration#environment-variables)
for the full current list.

### C++ headers

| Canonical | Removed alias |
|-----------|---------------|
| `<clio_runtime/clio_runtime.h>` | `<chimaera/chimaera.h>` |
| `<clio_runtime/…>` (whole tree) | `<chimaera/…>` |
| `<clio_ctp/clio_ctp.h>` | `<hermes_shm/hermes_shm.h>` |
| `<clio_ctp/…>` (whole tree) | `<hermes_shm/…>` |

The forwarder shims have been deleted; the legacy trees are not installed.

### C++ macros and namespaces

| Canonical | Removed alias |
|-----------|---------------|
| `CLIO_RUNTIME_INIT(mode, with_runtime)` | `CHIMAERA_INIT(mode, with_runtime)` |
| `CLIO_RUNTIME_FINALIZE()` | `CHIMAERA_FINALIZE()` |
| `CLIO_IPC`, `CLIO_ADMIN`, `CLIO_POOL_MANAGER`, `CLIO_CONFIG_MANAGER`, `CLIO_MODULE_MANAGER`, `CLIO_WORK_ORCHESTRATOR`, `CLIO_CUR_WORKER` | `CHI_*` (same suffix) |
| `CLIO_CHIMOD_CC(...)`, `CLIO_TASK_CC(...)` | `CHI_CHIMOD_CC(...)`, `CHI_TASK_CC(...)` |
| `CLIO_TASK_BODY_BEGIN`, `CLIO_TASK_BODY_END`, `CLIO_CO_AWAIT`, `CLIO_CO_RETURN` | `CHI_*` (same suffix) |
| `CLIO_QUEUE_ALLOC_T`, `CLIO_TASK_ALLOC_T`, `CLIO_PRIV_ALLOC[_T]`, `CLIO_PRIV_SHARED_ALLOC[_T]` | `CHI_*` (same suffix) |
| `ctp::` namespace | `hshm::` |
| `ctp::ipc::` namespace | `hshm::ipc::`, `hipc::` |
| `ctp::thread::`, `ctp::lbm::`, … | `hshm::thread::`, `hshm::lbm::`, … |
| `CTP_*` macros (`CTP_CROSS_FUN`, `CTP_INLINE`, `CTP_GPU_FUN`, `CTP_MALLOC`, …) | matching `HSHM_*` forms |

The compat header `<clio_ctp/compat/hshm_aliases.h>` no longer exists.

### Namespaces, enums, and CMake targets

The `chi::` namespace, the `ChimaeraMode` enum, and the `chimaera_*` CMake
target and library filenames were previously kept for ABI and
dynamic-loader stability. They have since been renamed too:

| Canonical | Removed |
|-----------|---------|
| `clio::run::` namespace (plus `clio::run::priv::`, `clio::run::ipc::`) | `chi::` |
| `clio::run::RuntimeMode::kClient` / `kServer` | `ChimaeraMode::kClient` / `kServer` |
| `clio_run_cxx`, `clio_admin_client`, … | `chimaera_cxx`, `chimaera_admin_runtime`, … |

Downstream CMake must `find_package` / link the `clio_*` target names.

### The Python `context-visualizer` {#context-visualizer}

The standalone Flask dashboard has been removed; the runtime now serves the
dashboard itself (see [Monitoring → Runtime Dashboard](./deployment/monitoring#runtime-dashboard)).

| Then | Now |
|------|-----|
| `python -m context_visualizer [--host H] [--port P]`, `context-visualizer` console script | `clio_run start` serves it; `--viz-bind H --viz-port P` (or `viz:` in `clio.yaml`, or `CLIO_VIZ_*`) |
| `http://127.0.0.1:5000` | `http://127.0.0.1:8080` |
| `pip install iowarp-core[visualizer]`, the `flask` dependency | nothing to install — no Python involved |
| `-DCLIO_CORE_ENABLE_VISUALIZER=ON` | option removed; the dashboard builds whenever `Poco::Net` is found |
| `GET /api/node/<id>/workers`, `/api/node/<id>/system_stats`, `/api/node/<id>/bdev_stats` | `GET /api/nodes/{node}/workers`, `…/system_stats`, `…/bdevs` (`{node}` may be `local`) |
| `GET /api/system`, `/api/workers` | `GET /api/nodes/local/workers` (`/api/health` for liveness) |
| `POST /api/topology/node/<id>/shutdown` / `restart` (via SSH) | no equivalent — run `clio_run stop` / `clio_run restart` on the node |
| Pools page listing the config's `compose` section | Pools page listing the pools actually composed, with **Add Pool** and per-pool destroy |

The `context_visualizer` package, `installers/*` entries, and the pip
`[visualizer]` extra are gone; a script that still runs
`python -m context_visualizer` will fail with `No module named
context_visualizer`.

---

## Migrating a downstream project

The mechanical sweep:

```bash
# Header paths
grep -rl '<chimaera/' --include='*.cc' --include='*.h' --include='*.cpp' \
  | xargs sed -i -E \
    's|<chimaera/|<clio_runtime/|g; s|<clio_runtime/chimaera\.h>|<clio_runtime/clio_runtime.h>|g'

grep -rl '<hermes_shm/' --include='*.cc' --include='*.h' --include='*.cpp' \
  | xargs sed -i -E \
    's|<hermes_shm/|<clio_ctp/|g; s|<clio_ctp/hermes_shm\.h>|<clio_ctp/clio_ctp.h>|g'

# Init / singleton macros
grep -rl '\bCHIMAERA_INIT\b\|\bCHIMAERA_FINALIZE\b\|\bCHI_[A-Z_]' \
    --include='*.cc' --include='*.h' --include='*.cpp' \
  | xargs sed -i -E \
    -e 's/\bCHIMAERA_INIT\b/CLIO_RUNTIME_INIT/g' \
    -e 's/\bCHIMAERA_FINALIZE\b/CLIO_RUNTIME_FINALIZE/g' \
    -e 's/\bCHI_(ADMIN|IPC|CPU_IPC|POOL_MANAGER|CONFIG_MANAGER|MODULE_MANAGER|WORK_ORCHESTRATOR|CUR_WORKER|CHIMOD_CC|TASK_CC|TASK_BODY_BEGIN|TASK_BODY_END|CO_AWAIT|CO_RETURN|QUEUE_ALLOC_T|TASK_ALLOC_T|PRIV_ALLOC_T|PRIV_ALLOC|PRIV_SHARED_ALLOC_T|PRIV_SHARED_ALLOC|CHIMAERA_MANAGER)\b/CLIO_\1/g'

# Transport-primitive namespaces / macros
grep -rl '\bhshm::\|\bhipc::\|\bHSHM_' \
    --include='*.cc' --include='*.h' --include='*.cpp' \
  | xargs sed -i -E \
    -e 's/\bhshm::/ctp::/g' \
    -e 's/\bhipc::/ctp::ipc::/g' \
    -e 's/\bHSHM_/CTP_/g'

# Runtime namespace and mode enum
grep -rl '\bchi::\|\bChimaeraMode\b' \
    --include='*.cc' --include='*.h' --include='*.cpp' \
  | xargs sed -i -E \
    -e 's/\bchi::/clio::run::/g' \
    -e 's/\bChimaeraMode\b/RuntimeMode/g'

# Env vars in launch scripts: rename CHI_<suffix> -> CLIO_<suffix>.
grep -rl '\bCHI_[A-Z_]' --include='*.sh' --include='*.bash' --include='*.yaml' \
  | xargs sed -i -E 's/\bCHI_([A-Z_]+)\b/CLIO_\1/g'

# Config YAMLs (in your repo, not the runtime's):
# rename chimaera_repo.yaml -> clio_repo.yaml and
# rename chimaera_mod.yaml  -> clio_mod.yaml. No content changes needed.

# Per-user config, if you still have one under the legacy directory:
# mkdir -p ~/.clio && mv ~/.chimaera/chimaera.yaml ~/.clio/clio.yaml
```

Then update your `CMakeLists.txt` to `find_package` / link the `clio_*`
target names, and grep your launch scripts one more time for a stray
`CHI_` — that is the failure that does not announce itself.

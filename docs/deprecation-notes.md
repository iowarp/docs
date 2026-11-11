---
sidebar_position: 9
title: Deprecation Notes
description: Legacy names, config paths, env vars, and CLI invocations that still work as aliases of their canonical replacements.
---

# Deprecation Notes

This page lists everything in IOWarp that has been renamed or relocated but
**still works under its old name** as a backward-compatibility alias. If you
have existing scripts, pipelines, container images, or downstream C++ code
written against the legacy names, you do not need to migrate immediately:
every legacy form below resolves to the new canonical form at runtime.

The rest of the documentation uses the **new canonical** name in every
example. This page is the single place to look up "what was the old name?"
or "what should I update to?".

:::tip TL;DR
Old names still work. Migrate at your own pace. No removal is planned at
this time; an explicit deprecation announcement will precede any future
removal.
:::

---

## CLI binaries

| Canonical | Legacy alias | How the alias works |
|-----------|--------------|---------------------|
| `clio_run` | `chimaera` | `chimaera` is installed as a symlink to `clio_run` in the same `bin/` dir. The binary adapts its usage text via `argv[0]` so each name prints the right help. |
| `clio_cae` | `clio_cae_omni` | `clio_cae_omni` is installed as a symlink to `clio_cae`. |

### Flat vs nested subcommand forms

`clio_run` accepts both a flat and a nested subcommand form:

| Canonical (flat) | Legacy (nested) |
|------------------|-----------------|
| `clio_run start` | `clio_run runtime start` |
| `clio_run stop` | `clio_run runtime stop` |
| `clio_run restart` | `clio_run runtime restart` |
| `clio_run refresh` | `clio_run repo refresh` |

Both forms resolve to the same handler. The flat form is shorter and is the
form used in docs and examples.

---

## Configuration files and directories

| Canonical | Legacy alias | How the alias works |
|-----------|--------------|---------------------|
| `~/.clio/clio.yaml` | `~/.clio/chimaera.yaml`, `~/.chimaera/clio.yaml`, `~/.chimaera/chimaera.yaml` | The runtime checks all four paths in priority order; first hit wins. `make install` and the pip wheel seed **both** `~/.clio/clio.yaml` and `~/.chimaera/chimaera.yaml` with identical content. |
| `clio_repo.yaml` | `chimaera_repo.yaml` | The CMake repo parser checks `clio_repo.yaml` first, then falls back to the legacy name. |
| `clio_mod.yaml` | `chimaera_mod.yaml` | Same — parser checks `clio_mod.yaml` first. |

See [Configuration Reference](./deployment/configuration) for the full
priority order including the env-var override.

---

## Environment variables

Every runtime env var migrated from a `CHI_` prefix to a `CLIO_` prefix.
Both prefixes work; the runtime uses an internal `GetCompat()` helper that
reads `CLIO_<suffix>` first and falls back to `CHI_<suffix>`.

| Canonical | Legacy alias |
|-----------|--------------|
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

Any new `CLIO_` env var you find in the docs has a `CHI_` legacy form;
they're documented by their canonical name only.

---

## C++ headers

The runtime header tree moved from `<chimaera/...>` to `<clio_runtime/...>`,
and the transport-primitives layer moved from `<hermes_shm/...>` to
`<clio_ctp/...>`. The umbrella headers also renamed:

| Canonical | Legacy alias |
|-----------|--------------|
| `<clio_runtime/clio_runtime.h>` | `<chimaera/chimaera.h>` |
| `<clio_runtime/...>` (whole tree) | `<chimaera/...>` |
| `<clio_ctp/clio_ctp.h>` | `<hermes_shm/hermes_shm.h>` |
| `<clio_ctp/...>` (whole tree) | `<hermes_shm/...>` |

Every legacy path is a one-line forwarder shim that `#include`s the
canonical path, so any TU built against either form sees the same symbols.

---

## C++ macros and namespaces

### Init / finalize

| Canonical | Legacy alias |
|-----------|--------------|
| `CLIO_RUNTIME_INIT(mode, with_runtime)` | `CHIMAERA_INIT(mode, with_runtime)` |
| `CLIO_RUNTIME_FINALIZE()` | `CHIMAERA_FINALIZE()` |

### Singletons and accessors

| Canonical | Legacy alias |
|-----------|--------------|
| `CLIO_IPC`, `CLIO_ADMIN`, `CLIO_POOL_MANAGER`, `CLIO_CONFIG_MANAGER`, `CLIO_MODULE_MANAGER`, `CLIO_WORK_ORCHESTRATOR`, `CLIO_CUR_WORKER` | `CHI_*` (same suffix) |

### Module / task macros

| Canonical | Legacy alias |
|-----------|--------------|
| `CLIO_CHIMOD_CC(...)`, `CLIO_TASK_CC(...)` | `CHI_CHIMOD_CC(...)`, `CHI_TASK_CC(...)` |
| `CLIO_TASK_BODY_BEGIN`, `CLIO_TASK_BODY_END`, `CLIO_CO_AWAIT`, `CLIO_CO_RETURN` | `CHI_*` (same suffix) |
| `CLIO_QUEUE_ALLOC_T`, `CLIO_TASK_ALLOC_T`, `CLIO_PRIV_ALLOC[_T]`, `CLIO_PRIV_SHARED_ALLOC[_T]` | `CHI_*` (same suffix) |

Each `CLIO_*` form is a `#define` to the matching `CHI_*` macro, placed in
`<clio_runtime/clio_runtime.h>`.

### Transport-primitive namespaces and macros

| Canonical | Legacy alias |
|-----------|--------------|
| `ctp::` namespace | `hshm::` (`namespace hshm = ctp;`) |
| `ctp::ipc::` namespace | `hshm::ipc::`, `hipc::` |
| `ctp::thread::`, `ctp::lbm::`, … | `hshm::thread::`, `hshm::lbm::`, … |
| 89 `CTP_*` macros (`CTP_CROSS_FUN`, `CTP_INLINE`, `CTP_GPU_FUN`, `CTP_MALLOC`, …) | matching `HSHM_*` forms (one `#define HSHM_X CTP_X` per macro) |

The compat header `<clio_ctp/compat/hshm_aliases.h>` is auto-included by the
umbrella `<clio_ctp/clio_ctp.h>`, so any TU that pulls the umbrella sees
all aliases.

---

## What is **not** renamed

These intentionally kept their `chimaera` / `hermes_shm` form to keep the
public ABI surface and dynamic-loader paths stable:

- The C++ namespace `chi::` (still the canonical runtime namespace).
- CMake target names and installed shared-library filenames:
  `chimaera_cxx`, `libchimaera_cxx.so`, `chimaera_admin_runtime`,
  `libchimaera_admin_runtime.so`, …
- The `ChimaeraMode` enum class (`chi::ChimaeraMode::kClient` / `kServer`).
- Identifiers that have `chimaera` as a fragment, e.g. the `chi::Chimaera`
  class itself and any internal `chimaera_manager` symbol.

These can be done in a follow-up pass if there's demand; for now they're
load-bearing for everything that links against the runtime.

---

## Migrating a downstream project

You do not have to migrate. If you want to anyway, the mechanical sweep is:

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

# Env vars in launch scripts: just rename CHI_<suffix> -> CLIO_<suffix>.

# Config YAMLs (in your repo, not the runtime's):
# rename chimaera_repo.yaml -> clio_repo.yaml and
# rename chimaera_mod.yaml  -> clio_mod.yaml. No content changes needed.
```

After the sweep your project will build against the canonical names and
remain compatible with both the current IOWarp Core release and any future
release that keeps the compat shims.

---

## Removal timeline

**None planned.** The shims, aliases, dual-name parsers, and symlinks are
intended to be permanent. If a specific alias is ever scheduled for removal,
the deprecation will be announced here with at least one full release of
overlap before the alias is dropped.

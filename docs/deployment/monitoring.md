---
sidebar_position: 4
title: Monitoring
description: Monitoring and debugging Clio deployments — logging, the runtime's built-in web dashboard, and Darshan I/O analysis.
---

# Monitoring & Debugging

This page covers everything you need to observe a running CLIO Runtime
cluster: structured logging, the runtime's built-in web dashboard, and
external I/O analysis via Darshan.

:::info In active development
Additional capabilities being added:

- **Runtime telemetry exports** — Prometheus / OpenTelemetry sinks
- **Per-Module performance counters** — I/O bandwidth, latency, cache hit rates
- **Structured logging sinks** — JSON output, central aggregation
:::

## Logging

Configure logging in your `clio_conf.yaml`:

```yaml
logging:
  level: info          # debug, info, warn, error
  file: /tmp/clio.log
```

### Docker health checks

```bash
# Check container logs
docker logs iowarp-runtime

# Active worker / pool stats
docker exec iowarp-runtime clio_run monitor
```

---

## Runtime Dashboard

The runtime serves its own web dashboard. When you start a daemon with
`clio_run start`, the admin ChiMod brings up an HTTP server on that node
(default `http://127.0.0.1:8080`) that shows cluster membership, per-node
worker and utilization stats, every pool composed on the node, the settings
the daemon actually came up with, and a management page for every ChiMod that
ships one (bdev, safe-bdev, CTE core). Pools can be created and destroyed
from it.

Nothing about the dashboard is collective: each node answers from its own
state, or forwards an explicitly-addressed query to a peer, so an N-node
cluster serves the same UI from every node without coordinating.

:::note The Python `context_visualizer` is retired
Earlier releases shipped a separate Flask process (`python -m
context_visualizer`, `pip install iowarp-core[visualizer]`) on port 5000.
It has been removed: the package, its console script, and the `flask`
dependency are gone from the pip, conda, spack, and cpack installers, and
`CLIO_CORE_ENABLE_VISUALIZER` is no longer a CMake option. Everything it did
now lives in the runtime, with no Python required. See
[Deprecation Notes](../deprecation-notes#context-visualizer).
:::

### Starting it

```bash
clio_run start                       # dashboard on http://127.0.0.1:8080
clio_run start --viz-port 9000       # a different port
clio_run start --viz-bind 0.0.0.0    # reachable off-box (see the warning below)
clio_run start --no-viz              # don't serve it
```

When the server comes up the daemon logs the address in green:

```
Viz: dashboard listening at http://127.0.0.1:8080
```

The same knobs are available in `~/.clio/clio.yaml` (which overrides the
CLI's default) and in the environment (which overrides the file):

```yaml
viz:
  enabled: true        # serve the dashboard on this node
  port: 8080           # 0 = bind an ephemeral port
  bind: "127.0.0.1"
  max_threads: 16      # HTTP request threads
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIO_VIZ_ENABLE` | *(see below)* | `1`/`0`. Counts as an explicit choice, so `clio_run start` will not override it. |
| `CLIO_VIZ_PORT` | `8080` | TCP port. `0` picks a free one (the bound port is logged). |
| `CLIO_VIZ_BIND` | `127.0.0.1` | Bind address. |
| `CLIO_VIZ_MAX_THREADS` | `16` | HTTP thread-pool size. Thread-per-connection; a browser parks ~6 keep-alive sockets, so keep this comfortably above that. |
| `CLIO_VIZ_PATH` | *(unset)* | `:`-separated list of viz roots to serve pages from instead of the ones next to the loaded ChiMod libraries — edit pages against a running daemon without rebuilding. |

`clio_run start` / `clio_run restart` also accept `--viz` / `--no-viz`,
`--viz-port <port>`, and `--viz-bind <addr>`. Naming a port or bind address
implies `--viz`. See the [Configuration Reference](./configuration#web-dashboard-viz)
for the full table.

Two defaults are deliberate:

- **Loopback only.** The dashboard exposes worker queues, pool layout, and
  device inventory, and it has **no authentication**. Binding `0.0.0.0`
  publishes all of that to the network; prefer an SSH tunnel
  (`ssh -L 8080:127.0.0.1:8080 node1`).
- **Off for embedded runtimes.** A unit test, an adapter, or any process that
  calls `CLIO_INIT` itself gets no listening socket unless it asks. Only the
  daemon CLI turns the dashboard on by default, so a daemon has it and a
  library user does not. Setting `viz.enabled` or `CLIO_VIZ_ENABLE`
  decides it for both.

A port that is already taken logs a warning and disables the dashboard; it
never fails the runtime.

### Pages

The admin ChiMod's shell has three tabs — **Cluster**, **Pools**, **Config** —
plus per-node and per-pool drilldowns. Every page polls the JSON API below
every couple of seconds.

#### Cluster (`/`, `/viz/clio_admin/index.html`) {#topology}

Cluster membership as this node sees it (from its SWIM host table): one card
per node with its IP, alive/dead state, and leader / "this node" badges.
Membership comes from local state, so a dead peer costs nothing to display.
Below the grid, **This node** shows the local CPU and memory meters (with a
sparkline) and a workers summary — queued, blocked, and processed task
counts. Clicking a node card opens its detail page.

#### Node detail (`/viz/clio_admin/node.html?node=<id>`) {#node-detail}

Utilization (CPU sparkline, memory, hostname/IP/leader) and the per-worker
table: active, queued, blocked, periodic, retry, processed, load, and suspend
period. `?node=local` (the default) is this node; a node id forwards each
panel's query to that node.

#### Pools (`/viz/clio_admin/pools.html`)

Every pool composed on this node, grouped into one section per ChiMod. Each
pool is a card:

- **Click** the card to open the pool's website — its module's own page with
  `?pool=<id>` preselected, or the generic pool page
  (`/viz/clio_admin/pool.html`) for modules that ship none.
- The card's corner **×** shuts the pool down after a confirmation
  (`POST /api/pools/{pool}/destroy`). Destroying the admin pool is refused,
  since that is the runtime itself.
- Cards summarize the pool's own `Monitor("stats")` where the module answers
  one, and the tab paints the pool list immediately and streams stats in;
  a partial failure shows a visible error rather than a blank tab.

**Add Pool** lists every loaded ChiMod (with a search box). Modules that
register a create form (bdev, safe-bdev, CTE core) get a typed form with a
**Validate** button that checks every field without creating anything;
any other module gets the generic **compose editor** — identity fields
(`mod_name`, `pool_name`, `pool_id`, `pool_query`) plus a raw-YAML box whose
contents are the compose entry's module parameters, driven through the same
path as `clio_run compose`. Pool ids are prefilled with a free suggestion
that you may edit.

The **Monitor explorer** at the bottom forwards any query string to a pool's
own `Monitor()` handler (`local` or `broadcast` routing) and shows the raw
JSON — the same endpoint a module's own page uses.

Every pool page shows the pool's **task predictions**: the learned per-method
CPU/wall coefficients the scheduler routes with, and their MAPE (average
prediction error).

:::caution Known issue
Destroying a pool whose module runs periodic tasks (safe-bdev, CTE) currently
leaves those periodics retrying against the destroyed pool
([#1000](https://github.com/iowarp/core/issues/1000)).
:::

#### Config (`/viz/clio_admin/config.html`)

The runtime settings this daemon **actually came up with** — not what a file
says — plus the full route table: every endpoint and asset mount, and which
ChiMod registered it. This is how you can tell which modules shipped a UI.

#### Module websites

Any ChiMod may ship a `viz/` directory of HTML/CSS/JS, mounted at
`/viz/<mod_name>/`. Three do today:

| Page | What it shows / does |
|------|----------------------|
| `/viz/clio_bdev/` | One block-device pool at a time: a capacity meter plus the full statistics table (bandwidth, latency, ops, …) from the pool's `Monitor("stats")`. |
| `/viz/clio_safe_bdev/` | Pick an array, watch recovery progress and the member roster live. **Add** a member (an existing bdev pool by name, or name + capacity to create one on the spot; `as_parity=1` raises the parity level), **replace** a failed member, or **remove** one. |
| `/viz/clio_cte_core/` | The pool's storage-target roster (score, free space, capacity, latency, bandwidth, bytes read/written) with **register** (a fresh bdev by type + capacity, or `attach_pool_id` to attach an existing pool such as a safe-bdev array) and **unregister** buttons. |

See [Adding a dashboard page to your ChiMod](../sdk/context-runtime/2.module_dev_guide.md#web-dashboard-integration-registerviz)
to ship your own.

### REST API

Every page is backed by a JSON API on the same port, which you can hit
directly with `curl` or wire into other monitoring tools. All responses are
`application/json`; errors carry an HTTP status (`400` for a bad node/pool
id, `503` when the runtime or a peer did not answer, `404` for an unknown
route) and an `{"error": "..."}` body.

#### Node-local

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Liveness plus this node's identity. |
| `/api/topology` | GET | Cluster membership and SWIM state, from the local host table. |
| `/api/pools` | GET | Pools composed on this node, from the pool manager. |
| `/api/config` | GET | The settings this daemon came up with. |
| `/api/routes` | GET | Every route and asset mount, per ChiMod. |
| `/api/chimods` | GET | Loaded modules, and which registered a create form or shipped pages. |

#### Per-node

`{node}` is a node id from `/api/topology`, or `local`. Addressing this
node by its own id routes locally, so the single-node case never touches the
network. Each of these is one `Monitor()` task to the admin pool on that
node; the admin's forwards use a 5 s timeout so an unreachable peer cannot
pin an HTTP thread.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/nodes/{node}/workers` | GET | Per-worker queue depth, load, and task counts. |
| `/api/nodes/{node}/system_stats` | GET | Sampled CPU / RAM / GPU utilization ring, newer than `?min_event_id`. |
| `/api/nodes/{node}/containers` | GET | Per-pool containers and their learned task-cost models. |
| `/api/nodes/{node}/bdevs` | GET | Every block device on the node, with capacity and throughput. |

#### Per-pool

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pools/{pool}/monitor` | GET | Forward `?query=<string>` to the pool's own `Monitor()` (`?routing=local\|broadcast\|…`). |
| `/api/pools/{pool}/destroy` | POST | Shut a pool down (refused for the admin pool). |
| `/api/pools/compose` | POST | Create a pool of any ChiMod via the compose path — fields `mod_name`, `pool_name`, `pool_id`, `pool_query`, `config` (raw YAML), optional `action=validate`. |

#### Per-module

Modules register their own endpoints under `/api/mod/<mod_name>/…`; the
convention is `GET …/pools` (this node's pools of that module),
`GET …/create` (a form spec) and `POST …/create` (validate or create), plus
whatever management actions the module offers:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mod/clio_bdev/pools` | GET | Block-device pools on this node. |
| `/api/mod/clio_safe_bdev/{pool}/add_member` | POST | Add a data or parity member (`member_name[, capacity, bdev_type, node_id, as_parity]`). |
| `/api/mod/clio_safe_bdev/{pool}/replace_member` | POST | Replace a failed member with a fresh bdev and recover onto it (`failed_pool_id, member_name, capacity[, bdev_type, node_id]`). |
| `/api/mod/clio_safe_bdev/{pool}/remove_member` | POST | Take a member out of service (`member_pool_id[, was_faulty]`). |
| `/api/mod/clio_cte_core/{pool}/targets` | GET | The pool's registered storage targets, with score and capacity. |
| `/api/mod/clio_cte_core/{pool}/register_target` | POST | Register a bdev as a storage target (`name[, bdev_type, capacity \| attach_pool_id]`). |
| `/api/mod/clio_cte_core/{pool}/unregister_target` | POST | Remove a target from placement (`name`). |
| `/api/mod/<mod>/create` | GET / POST | The module's create-form spec, and the validate/create action. |

`GET /api/routes` on a running daemon is the authoritative list, including
any module you added yourself.

POST bodies of type `application/x-www-form-urlencoded` are parsed into the
same parameter map as the query string (the query string wins on a
collision), so `curl -d` and `?key=value` are interchangeable. Create
endpoints answer `{"ok":true,"pool_id":…}` on success and
`{"ok":false,"errors":{field: message}}` at HTTP 400 on validation failure,
all fields at once.

The GETs are all read-only. The POSTs create pools and manage module
resources — the same operations any local RPC client can already perform —
and stay node-local; nothing here shuts a node down or deletes data. (The
retired Python dashboard's SSH-driven node shutdown/restart buttons have no
equivalent; use `clio_run stop` / `clio_run restart` on the node.)

#### Examples

```bash
# Is the dashboard up, and which node am I talking to?
curl http://127.0.0.1:8080/api/health

# Cluster membership
curl http://127.0.0.1:8080/api/topology

# Worker stats on this node, then on node 2
curl http://127.0.0.1:8080/api/nodes/local/workers
curl http://127.0.0.1:8080/api/nodes/2/workers

# Ask the CTE core pool (512.0) for its stats, and list its targets
curl "http://127.0.0.1:8080/api/pools/512.0/monitor?query=stats"
curl http://127.0.0.1:8080/api/mod/clio_cte_core/512.0/targets

# Validate, then create, a 1 GB RAM bdev through the module's own form
curl -d "action=validate&pool_name=ram::scratch&pool_id=305.0&bdev_type=ram&capacity=1GB" \
     http://127.0.0.1:8080/api/mod/clio_bdev/create
curl -d "pool_name=ram::scratch&pool_id=305.0&bdev_type=ram&capacity=1GB" \
     http://127.0.0.1:8080/api/mod/clio_bdev/create

# Shut that pool down again
curl -X POST http://127.0.0.1:8080/api/pools/305.0/destroy

# What did this daemon register?
curl http://127.0.0.1:8080/api/routes
```

### Where the pages come from

A ChiMod's assets are found **relative to the library the runtime actually
loaded**, so a built-but-not-installed tree and an installed tree both work
with no configuration:

| Layout | Libraries | Assets |
|--------|-----------|--------|
| built, not installed | `<build>/bin` | `<build>/bin/viz/<mod_name>` |
| installed (make install, wheel, deb/rpm) | `<prefix>/lib` | `<prefix>/share/clio/viz/<mod_name>` |

`$CLIO_VIZ_PATH` is checked first. If the daemon logs
`Viz: no viz/ assets found for ChiMod <name>`, the module's `viz/` directory
was not staged next to its library — rebuild, or point `CLIO_VIZ_PATH` at
the source tree.

### Build requirements

The HTTP server is `Poco::Net`, linked privately into the runtime library
and picked up by `find_package(Poco COMPONENTS Net …)` at configure time.
The `iowarp/deps-cpu` devcontainer image (`libpoco-dev`) and the conda
recipe (`poco`) provide it, so source builds in the devcontainer and conda
installs have the dashboard. Without Poco the runtime still builds and
starts — CMake reports `Web dashboard (viz): DISABLED (Poco::Net not found)`,
`clio_run start` logs a warning, and the dashboard is simply absent. Install
`libpoco-dev` (apt), `poco-devel` (dnf), or `poco` (conda-forge / brew) and
reconfigure to enable it. `ctest -R cr_viz_tests` exercises the router and
drives the real server over TCP.

### Docker / remote access

The daemon serves the dashboard itself, so exposing it from a container is
just a bind address and a port mapping:

```yaml
# docker-compose.yml — expose the dashboard port alongside the runtime
services:
  iowarp:
    image: iowarp/deploy-cpu:latest
    environment:
      - CLIO_VIZ_BIND=0.0.0.0
      - CLIO_VIZ_PORT=8080
    ports:
      - "9413:9413"   # CLIO Runtime RPC
      - "8080:8080"   # Dashboard
    command: ["clio_run", "start"]
```

For a remote host, leave the bind address on loopback and tunnel instead:

```bash
ssh -L 8080:127.0.0.1:8080 user@node1
# then open http://127.0.0.1:8080 locally
```

:::warning
The dashboard has no authentication, and it can create and destroy pools.
Do not bind it to a public interface without a reverse proxy that enforces
access control.
:::

### Try it: interactive Docker cluster {#interactive-cluster}

An interactive test environment spins up an **8-node CLIO Runtime cluster**
with the dashboard served by node 1 so you can explore every page from your
browser.

#### Location

```
context-runtime/test/integration/interactive/
├── docker-compose.yml   # 8-node runtime cluster
├── hostfile             # Node IP addresses
├── clio_conf.yaml       # Runtime configuration
└── run.sh               # Launcher script
```

#### How it works

- **8 Docker containers** (`iowarp-interactive-node1` through `node8`) run
  the CLIO Runtime on a private Docker network
- **Node 1** starts its runtime with `CLIO_VIZ_ENABLE=1`, `CLIO_VIZ_PORT=5000`,
  and `CLIO_VIZ_BIND=0.0.0.0`, so its built-in dashboard is reachable from
  outside the container; it also runs a `bdev_io` throughput benchmark for a
  few minutes so the worker and device pages have something to show
- The script connects the devcontainer to the Docker network and starts a
  local port-forward so that `localhost:5000` reaches node 1's dashboard —
  VS Code then auto-forwards this to your host browser

#### Running

```bash
cd context-runtime/test/integration/interactive

# Foreground (Ctrl-C to stop)
bash run.sh

# Or run in the background
bash run.sh start

# Follow runtime container logs
bash run.sh logs

# Stop everything (cluster + port forward)
bash run.sh stop
```

Once the cluster is up (~15 seconds), open [http://localhost:5000](http://localhost:5000)
to browse the cluster, click into individual nodes, open the Pools tab, and
try **Add Pool** against a real multi-node runtime. `DASHBOARD_PORT` changes
the forwarded port.

If running from a devcontainer or a host where the workspace is at a
different path, set `HOST_WORKSPACE`:

```bash
HOST_WORKSPACE=/host/path/to/workspace bash run.sh
```

---

## Darshan I/O analysis

For low-level I/O performance analysis, use the [Darshan MCP server](../clio-kit/mcp-servers) from CLIO Kit:

```bash
uvx clio-kit mcp-server darshan
```

This provides 10 tools for bandwidth analysis, access pattern detection, and bottleneck identification.

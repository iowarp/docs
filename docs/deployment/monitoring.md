---
sidebar_position: 4
title: Monitoring
description: Monitoring and debugging Clio deployments — logging, the runtime dashboard, and Darshan I/O analysis.
---

# Monitoring & Debugging

This page covers everything you need to observe a running Clio runtime
cluster: structured logging, the real-time runtime dashboard
(`context_visualizer`), and external I/O analysis via Darshan.

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
  file: /tmp/chimaera.log
```

### Docker health checks

```bash
# Check container logs
docker logs iowarp-runtime

# List active pools
docker exec iowarp-runtime chimaera_pool_list
```

---

## Runtime Dashboard

The `context_visualizer` package provides a lightweight Flask web
application that lets you inspect and manage a live Clio runtime cluster
from your browser. It connects to the runtime using the same client API
used by application code and surfaces cluster topology, per-node worker
statistics, system resource utilization, block device stats, pool
configuration, and the active YAML config.

### Prerequisites

- IOWarp installed with Python support (`CLIO_CORE_ENABLE_PYTHON=ON`)
- A running Clio runtime (`clio_run runtime start`)
- Python dependencies: `flask`, `pyyaml`, `msgpack`

Install the Python dependencies with any of:

```bash
pip install flask pyyaml msgpack
# or
pip install iowarp-core[visualizer]
# or (conda)
conda install flask pyyaml python-msgpack
```

### Starting the dashboard

```bash
python -m context_visualizer
```

Then open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser.

#### CLI options

| Flag | Default | Description |
|------|---------|-------------|
| `--host` | `127.0.0.1` | Bind address. Use `0.0.0.0` to expose on all interfaces. |
| `--port` | `5000` | Listen port. |
| `--debug` | *(off)* | Enable Flask debug mode (auto-reload, verbose errors). |

```bash
# Expose on all interfaces, non-default port
python -m context_visualizer --host 0.0.0.0 --port 8080

# Debug mode (development only)
python -m context_visualizer --debug
```

### Pages

#### Topology (`/`) {#topology}

The landing page shows a live grid of all nodes in the cluster. Each node card displays:

- **Hostname** and **IP address**
- **Status badge** (alive)
- **CPU**, **RAM**, and **GPU** utilization bars (GPU shown only when GPUs are present)
- **Restart** and **Shutdown** action buttons

The search bar supports filtering by node ID (single `3`, range `1-20`, comma-separated `1,3,5`) or by hostname/IP substring.

Clicking a node card navigates to the per-node detail page.

#### Node detail (`/node/<id>`) {#node-detail}

A per-node drilldown page showing:

- **Worker statistics** — per-worker queue depth, blocked tasks, processed count, and more
- **System stats** — time-series CPU, RAM, GPU, and HBM utilization
- **Block device stats** — per-bdev pool throughput and capacity

#### Pools (`/pools`)

Lists all pools defined in the `compose` section of the active configuration file:

| Column | Description |
|--------|-------------|
| **Module** | Module shared-library name (`mod_name`) |
| **Pool Name** | User-defined pool name |
| **Pool ID** | Unique pool identifier |
| **Query** | Routing policy (`local`, `dynamic`, `broadcast`) |

#### Config (`/config`)

Displays the full contents of the active YAML configuration file as formatted JSON, for quick inspection without opening a terminal.

### REST API

All pages are backed by a JSON API. You can query these endpoints directly for scripting or integration with other monitoring tools.

#### Cluster-wide

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/topology` | GET | List all nodes with hostname, IP, CPU/RAM/GPU utilization |
| `/api/system` | GET | High-level system overview (connected, worker/queue/blocked/processed counts) |
| `/api/workers` | GET | Per-worker stats plus a fleet summary (local node) |
| `/api/pools` | GET | Pool list from the `compose` section of the config |
| `/api/config` | GET | Full active configuration as JSON |

#### Per-node

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/node/<id>/workers` | GET | Worker stats for a specific node |
| `/api/node/<id>/system_stats` | GET | System resource utilization entries for a specific node |
| `/api/node/<id>/bdev_stats` | GET | Block device stats for a specific node |

#### Node management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/topology/node/<id>/shutdown` | POST | Gracefully shut down a node via SSH |
| `/api/topology/node/<id>/restart` | POST | Restart a node via SSH |

Shutdown and restart are performed by SSHing from the dashboard host to the target node and running `clio_run runtime stop` or `clio_run runtime restart`. This avoids the problem of a node killing itself mid-RPC. The SSH connection uses `StrictHostKeyChecking=no` and `ConnectTimeout=5`.

**Shutdown response:**
```json
{
  "success": true,
  "returncode": 0,
  "stdout": "",
  "stderr": ""
}
```

Exit codes `0` and `134` (SIGABRT from `std::abort()` in `InitiateShutdown`) are both treated as success.

**Restart** uses `nohup` so the SSH session returns immediately while the node restarts in the background.

All endpoints return `Content-Type: application/json`. On error they return an appropriate HTTP status code (e.g., `503` if the runtime is unreachable, `404` if a node is not found) with an `"error"` field in the response body.

#### Examples

```bash
# Get cluster topology
curl http://127.0.0.1:5000/api/topology

# Get system overview
curl http://127.0.0.1:5000/api/system

# Get worker stats for node 2
curl http://127.0.0.1:5000/api/node/2/workers

# Shut down node 3
curl -X POST http://127.0.0.1:5000/api/topology/node/3/shutdown

# Restart node 3
curl -X POST http://127.0.0.1:5000/api/topology/node/3/restart
```

### Configuration file discovery

The dashboard reads the same config file as the runtime, using the same search order:

| Source | Priority |
|--------|----------|
| `CLIO_SERVER_CONF` environment variable (legacy `CHI_SERVER_CONF` also honored) | **1st** |
| `~/.chimaera/chimaera.yaml` | **2nd** |

See [Configuration](./configuration) for details on the config file format.

### Connection lifecycle

The dashboard connects to the runtime lazily — on the first request that needs live data. If the runtime is not yet running when the dashboard starts, it will show a disconnected state and retry on subsequent requests. Shutdown is handled automatically via `atexit` so the client is finalized cleanly when the server process exits.

### Docker / remote access

When running the runtime inside Docker or on a remote host, bind the dashboard to all interfaces and forward the port:

```bash
# On the host running the runtime
python -m context_visualizer --host 0.0.0.0 --port 5000
```

```yaml
# docker-compose.yml — expose the dashboard port alongside the runtime
services:
  iowarp:
    image: iowarp/deploy-cpu:latest
    ports:
      - "9413:9413"   # Clio runtime RPC
      - "5000:5000"   # Dashboard
    command: >
      bash -c "clio_run runtime start &
               python -m context_visualizer --host 0.0.0.0"
```

:::warning
The dashboard has no authentication. Do not expose it on a public network without a reverse proxy that enforces access control.
:::

### Try it: interactive Docker cluster {#interactive-cluster}

An interactive test environment is provided that spins up a **4-node Clio runtime cluster** with the dashboard so you can explore all features from your browser.

#### Location

```
context-runtime/test/integration/interactive/
├── docker-compose.yml   # 4-node runtime cluster
├── hostfile             # Node IP addresses (172.28.0.10-13)
├── clio_conf.yaml       # Runtime configuration
└── run.sh               # Launcher script
```

#### How it works

- **4 Docker containers** (`iowarp-interactive-node1` through `node4`) run the Clio runtime on a private `172.28.0.0/16` network, each with `sshd` for SSH-based shutdown/restart
- **Node 1** also runs the dashboard alongside its runtime
- The script connects the devcontainer to the Docker network and starts a local port-forward so that `localhost:5000` reaches the dashboard inside Docker — VS Code then auto-forwards this to your host browser
- SSH keys are distributed via a shared Docker volume so the dashboard can authenticate to all nodes

#### Running

```bash
cd context-runtime/test/integration/interactive

# Foreground (Ctrl-C to stop)
bash run.sh

# Or run in the background
bash run.sh start

# Follow runtime container logs
bash run.sh logs

# Stop everything (cluster + dashboard)
bash run.sh stop
```

Once the cluster is up (~15 seconds), open [http://localhost:5000](http://localhost:5000) to browse the topology, click into individual nodes, and use the Restart/Shutdown buttons.

If running from a devcontainer or a host where the workspace is at a different path, set `HOST_WORKSPACE`:

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

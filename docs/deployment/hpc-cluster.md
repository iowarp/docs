---
sidebar_position: 2
title: HPC Cluster
description: Deploying IOWarp manually on HPC clusters and bare-metal nodes.
---

# HPC Cluster Deployment

This guide covers manual deployment of the IOWarp runtime on bare-metal HPC clusters using the unified utility scripts included with the installation.

## Prerequisites

IOWarp must be installed on every node in the cluster. The recommended method is Jarvis:

```bash
# On each node: clone and install
git clone https://github.com/iowarp/runtime-deployment.git
cd runtime-deployment
pip install -e . -r requirements.txt
jarvis init
jarvis rg build
```

All nodes must share access to the same IOWarp binaries, either via:
- A shared filesystem (NFS, Lustre, GPFS)
- Identical per-node installations with the same paths

---

## Environment Variables

The following environment variables control runtime behavior. Set them before starting any IOWarp process.

### Configuration File

| Variable | Priority | Description |
|----------|----------|-------------|
| `CHI_SERVER_CONF` | **Primary** | Path to the Chimaera YAML configuration file. Checked first. |
| `WRP_RUNTIME_CONF` | Fallback | Used when `CHI_SERVER_CONF` is not set. |

```bash
export CHI_SERVER_CONF=/etc/iowarp/config.yaml
```

### Networking Overrides

| Variable | Default | Description |
|----------|---------|-------------|
| `CHI_PORT` | `9413` | Override the RPC port. Takes priority over the YAML `networking.port` setting. |
| `CHI_SERVER_ADDR` | `127.0.0.1` | Override the server address that clients connect to. |

### IPC Transport Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `CHI_IPC_MODE` | `TCP` | Transport used by clients to reach the runtime server. |

| Value | Mode | When to Use |
|-------|------|-------------|
| `SHM` | Shared Memory | Client and server on the same node. Lowest latency. |
| `TCP` | ZeroMQ TCP | Cross-node communication. **Default when unset.** |
| `IPC` | Unix Domain Socket | Same-node only, avoids TCP overhead. |

```bash
# Same-node, lowest latency
export CHI_IPC_MODE=SHM

# Cross-node (default)
export CHI_IPC_MODE=TCP
```

### Runtime Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `CHI_WITH_RUNTIME` | *(unset)* | When set to `1`, starts the runtime server in-process. When `0`, client-only mode. |

This variable is read by `CHIMAERA_INIT()`. If unset, the value of the `default_with_runtime` argument passed to `CHIMAERA_INIT()` is used instead.

---

## Single-Node Deployment

```bash
# 1. Set configuration
export CHI_SERVER_CONF=/etc/iowarp/config.yaml

# 2. Start the runtime in the background
chimaera runtime start &

# 4. (Optional) Create pools from the compose section
chimaera compose $CHI_SERVER_CONF

# 5. Run your application
my_iowarp_app
```

---

## Multi-Node Deployment

### Hostfile

Create a hostfile with one IP (or hostname) per line — in the order nodes should be addressed:

```
192.168.1.10
192.168.1.11
192.168.1.12
192.168.1.13
```

Reference it in your config:

```yaml
networking:
  port: 9413
  hostfile: /etc/iowarp/hostfile
```

### Starting the Runtime on All Nodes

Use `parallel-ssh` (pssh) to launch the runtime simultaneously across the cluster. Forwarding `PATH` and `CHI_SERVER_CONF` ensures each node picks up the right binary and config:

```bash
parallel-ssh -i -h hostfile \
  -x "-o SendEnv=PATH -o SendEnv=CHI_SERVER_CONF" \
  "chimaera runtime start &"
```

If your SSH environment does not forward variables reliably, inline them:

```bash
parallel-ssh -i -h hostfile \
  "export CHI_SERVER_CONF=/etc/iowarp/config.yaml && chimaera runtime start &"
```

### Verifying the Cluster

After startup, verify all nodes joined the cluster from any node:

```bash
chimaera_pool_list
```

### Stopping the Runtime

```bash
parallel-ssh -i -h hostfile "chimaera runtime stop"
```

---

## Jarvis-Based Deployment

Jarvis automates multi-node orchestration and is the recommended method for scripted deployments:

```bash
# Configure and deploy across the cluster
jarvis pipeline create my_deploy
jarvis pipeline append iowarp_runtime

# Start
jarvis pipeline run

# Stop
jarvis pipeline clean
```

See the [Jarvis runtime-deployment](https://github.com/iowarp/runtime-deployment) repository for pipeline configuration options.

---

## Containers

Container-based deployment on HPC clusters is under active development. See [Configuration](./configuration) for Docker Compose examples.

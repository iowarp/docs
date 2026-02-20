---
sidebar_position: 2
title: Quick Start
description: Get IOWarp running with Docker in 5 minutes.
---

# Quick Start Tutorial

Get IOWarp running with Docker in 5 minutes. This tutorial walks you through running the IOWarp runtime with buffering services.

## Prerequisites

- Docker and Docker Compose installed
- At least 8 GB of available RAM

## 1. Start the Runtime

The `docker/quickstart/` directory contains everything you need. From the repository root:

```bash
cd docker/quickstart
docker compose up -d
```

This starts a single-node Chimaera runtime using the pre-built `iowarp/deploy-cpu` image.

### Verify it's running

```bash
docker compose logs
```

You should see output indicating that worker threads have been spawned and modules loaded. Look for `SpawnWorkerThreads` in the output.

### Stop the runtime

```bash
docker compose down
```

## 2. Configuration

The quickstart ships with a ready-to-use `chimaera.yaml`. Here is a minimal configuration for reference:

```yaml
# IOWarp Runtime Configuration
networking:
  port: 5555

compose:
  # Block device (DRAM buffer)
  - mod_name: chimaera_bdev
    pool_name: "ram::chi_default_bdev"
    pool_query: local
    pool_id: "301.0"
    bdev_type: ram
    capacity: "512MB"

  # Context Transfer Engine (CTE)
  - mod_name: wrp_cte_core
    pool_name: cte_main
    pool_query: local
    pool_id: "512.0"
    storage:
      - path: "ram::cte_ram_tier1"
        bdev_type: "ram"
        capacity_limit: "512MB"
        score: 1.0
    dpe:
      dpe_type: "max_bw"
    targets:
      neighborhood: 1
      default_target_timeout_ms: 30000
      poll_period_ms: 5000

  # Context Assimilation Engine (CAE)
  - mod_name: wrp_cae_core
    pool_name: wrp_cae_core_pool
    pool_query: local
    pool_id: "400.0"
```

**Storage parameters:**

| Parameter | Description |
|-----------|-------------|
| `path` | `ram::<name>` for RAM, `/dev/<device>` for block devices |
| `bdev_type` | `ram`, `nvme`, or `aio` (async I/O) |
| `capacity_limit` | Max capacity (`KB`, `MB`, `GB`, `TB`) |
| `score` | Tier priority: `0.0` = lowest, `1.0` = highest |

### Docker Compose Details

The `docker-compose.yml` mounts the config at `/etc/iowarp/chimaera.yaml` and sets the `CHI_SERVER_CONF` environment variable so the runtime finds it:

```yaml
services:
  iowarp:
    image: iowarp/deploy-cpu:latest
    container_name: iowarp-quickstart
    hostname: iowarp
    volumes:
      - ./chimaera.yaml:/etc/iowarp/chimaera.yaml:ro
    environment:
      - CHI_SERVER_CONF=/etc/iowarp/chimaera.yaml
    ports:
      - "5555:5555"
    mem_limit: 8g
    command: ["chimaera", "runtime", "start"]
    restart: unless-stopped
```

## Next Steps

- [View Research Demos](https://iowarp.ai/research/demos/) — See IOWarp in action with real scientific workflows
- [Explore the Platform](https://iowarp.ai/platform/) — Learn about IOWarp's context engineering architecture
- [Try CLIO Kit](../clio-kit/mcp-servers) — Use 16 MCP servers for AI-powered scientific computing
- [Deployment Guide](../deployment/hpc-cluster) — Deploy IOWarp on HPC clusters
- [Configuration Reference](../deployment/configuration) — Deep dive into configuration options

## Support

- Open an issue on the [GitHub repository](https://github.com/iowarp/iowarp-install)
- Join the [Zulip Chat](https://iowarp.zulipchat.com)
- Visit the [IOWarp website](https://iowarp.ai)
- Email: grc@illinoistech.edu

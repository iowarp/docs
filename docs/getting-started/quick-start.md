---
sidebar_position: 2
title: Quick Start
description: Get IOWarp running with Docker in 5 minutes and run your first benchmarks.
---

# Quick Start Tutorial

Get IOWarp running with Docker in 5 minutes. This tutorial walks you through running the IOWarp runtime with buffering services.

## Prerequisites

- Docker and Docker Compose installed
- At least 8 GB of available RAM

## 1. Create Configuration

Create a `wrp_conf.yaml` file:

```yaml
# IOWarp Runtime Configuration
compose:
  - mod_name: wrp_cte_core
    pool_name: wrp_cte
    pool_query: local
    pool_id: 512.0
    storage:
      - path: "ram::cte_ram_tier1"
        bdev_type: "ram"
        capacity_limit: "16GB"
        score: 0.0
```

**Storage parameters:**

| Parameter | Description |
|-----------|-------------|
| `path` | `ram::<name>` for RAM, `/dev/<device>` for block devices |
| `bdev_type` | `ram`, `nvme`, or `aio` (async I/O) |
| `capacity_limit` | Max capacity (`KB`, `MB`, `GB`, `TB`) |
| `score` | Tier priority: `0.0` = lowest, `1.0` = highest |

## 2. Start the Runtime

Create a `docker-compose.yml`:

```yaml
services:
  iowarp-runtime:
    image: iowarp/iowarp:latest
    container_name: iowarp-runtime
    volumes:
      - ./wrp_conf.yaml:/etc/iowarp/wrp_conf.yaml:ro
    ports:
      - "5555:5555"
    shm_size: 8g
    mem_limit: 8g
    ipc: shareable
    stdin_open: true
    tty: true
    restart: "no"
```

Start it:

```bash
docker-compose up -d
```

## 3. Run Benchmarks

The `demos/benchmark/` directory contains a complete Docker Compose setup for running CTE benchmarks:

```bash
cd demos/benchmark

# Run default benchmark (Put test)
docker-compose up

# Run specific test with custom parameters
TEST_CASE=Get IO_SIZE=4m IO_COUNT=1000 docker-compose up
```

### Benchmark Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TEST_CASE` | `Put` | `Put`, `Get`, or `PutGet` |
| `NUM_PROCS` | `1` | Number of parallel processes |
| `DEPTH` | `4` | Queue depth for concurrent operations |
| `IO_SIZE` | `1m` | I/O operation size (`b`, `k`, `m`, `g`) |
| `IO_COUNT` | `100` | Number of operations |

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

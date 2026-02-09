---
sidebar_position: 3
title: Storage API
description: API reference for the IOWarp storage layer and Context Transfer Engine.
---

# Storage API

:::info Coming Soon
The Storage API documentation is being developed. This will cover:

- **CTE Client API** — Blob Put/Get/Delete operations
- **Multi-Tier Storage** — Programmatic tier management
- **Data Placement Engine** — Custom placement policies
- **Streaming API** — Chunked reads/writes for large datasets
:::

## Current Access Methods

Storage operations are currently available through:

1. **Python API** — High-level blob operations via [Python bindings](./python)
2. **C++ SDK** — Native CTE client for high-performance applications (see [Context Transfer Engine](../sdk/context-transfer))
3. **Docker Runtime** — Container-based deployment with YAML configuration (see [Configuration](../deployment/configuration))

## Configuration

Storage tiers are configured in `wrp_conf.yaml`. See the [Configuration Reference](../deployment/configuration) for details on:

- RAM, NVMe, SSD, and HDD tier setup
- Data placement engine (`max_bw`, `round_robin`, `random`)
- Capacity limits and scoring

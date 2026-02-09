---
sidebar_position: 4
title: Monitoring
description: Monitoring and debugging IOWarp deployments.
---

# Monitoring & Debugging

:::info Coming Soon
Monitoring documentation is being developed. This will cover:

- **Runtime Telemetry** — Real-time metrics and dashboards
- **CTE Performance Counters** — I/O bandwidth, latency, cache hit rates
- **Logging Configuration** — Log levels, output destinations, structured logging
- **Debugging Tools** — Common debugging workflows and tools
:::

## Current Capabilities

### Logging

Configure logging in your `wrp_conf.yaml`:

```yaml
logging:
  level: info          # debug, info, warn, error
  file: /tmp/chimaera.log
```

### Docker Health Checks

```bash
# Check container logs
docker logs iowarp-runtime

# List active pools
docker exec iowarp-runtime chimaera_pool_list
```

### Darshan Integration

For I/O performance analysis, use the [Darshan MCP server](../clio-kit/mcp-servers) from CLIO Kit:

```bash
uvx iowarp-agent-toolkit mcp-server darshan
```

This provides 10 tools for bandwidth analysis, access pattern detection, and bottleneck identification.

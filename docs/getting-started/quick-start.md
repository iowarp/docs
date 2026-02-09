# Quick Start Tutorial

Get IOWarp running with Docker in 5 minutes. This tutorial will have you running the IOWarp runtime with buffering services.

## Docker (Recommended)

Docker provides the easiest way to get started with IOWarp. The `iowarp/iowarp:latest` image includes the complete runtime with buffering services.

### Quick Start

Create a `docker-compose.yml` file:

```yaml
# IOWarp Runtime Docker Compose Configuration
#
# This compose file runs the IOWarp runtime service for user applications.
# The iowarp service provides the CTE runtime that applications can connect to.
#
# Usage:
#   docker-compose up                       # Run runtime service
#   docker-compose down                     # Stop service

services:
  # IOWarp Runtime Service
  # Provides the CTE runtime daemon that applications connect to
  iowarp-runtime:
    image: iowarp/iowarp:latest
    container_name: iowarp-runtime

    # Mount shared CTE configuration
    volumes:
      - ./wrp_conf.yaml:/etc/iowarp/wrp_conf.yaml:ro

    # Expose ZeroMQ port for client connections
    ports:
      - "5555:5555"

    # Resource limits
    # Large shared memory for CTE operations
    shm_size: 8g
    mem_limit: 8g

    # Make IPC namespace shareable so application containers can join
    ipc: shareable

    # Keep container running as a daemon
    stdin_open: true
    tty: true

    # Restart policy - no restart for manual runs
    restart: "no"
```

Run the container:
```bash
docker-compose up -d
```

Shared memory and shareable ipcs are required.

### Configuration (optional)

The default configuration provides up to 16GB buffer cache.
For more complexity, create a `wrp_conf.yaml` configuration file.
This is an example with some paramters, but not all:

```yaml
# IOWarp Runtime Configuration File
compose:
  # Compose parameters (do not change these)
  - mod_name: wrp_cte_core
    pool_name: wrp_cte
    pool_query: local
    pool_id: 512.0

    # Storage block device configuration
    # This is the most important section - defines where data is buffered
    storage:
      # RAM-based storage tier (fastest)
      - path: "ram::cte_ram_tier1"
        bdev_type: "ram"
        capacity_limit: "16GB"
        score: 0.0           # Manual score override (range 0 to 1), put all data here

      # Example: Add NVMe tier (uncomment to use)
      # - path: "/dev/nvme0n1"
      #   bdev_type: "file"
      #   capacity_limit: "500GB"
      #   score: 0.5

      # Example: Add SSD tier (uncomment to use)
      # - path: "/dev/sda1"
      #   bdev_type: "file"
      #   capacity_limit: "1TB"
      #   score: 1.0
```

**Storage Configuration:**
- `path` - Device path or RAM identifier (format: `ram::<name>` for RAM, `/dev/<device>` for block devices)
- `bdev_type` - Backend type: `"ram"` (memory), `"nvme"` (NVMe SSD), `"aio"` (async I/O for other block devices)
- `capacity_limit` - Maximum storage capacity (supports `KB`, `MB`, `GB`, `TB` suffixes)
- `score` - Tier priority (0.0 = lowest priority, 1.0 = highest). 0.0 means "anyone can put data here", 
while 1.0 means only put high priority data here.

Multiple storage tiers can be configured to create a hierarchical storage system. Data is automatically placed across tiers based on the data placement engine (DPE) strategy.

### Example: Running Benchmarks

The `demos/benchmark/` directory contains a complete Docker Compose setup for running CTE benchmarks:

```bash
cd demos/benchmark

# Run default benchmark (Put test)
docker-compose up

# Run specific test with custom parameters
TEST_CASE=Get IO_SIZE=4m IO_COUNT=1000 docker-compose up
```

Available benchmark parameters:
- `TEST_CASE` - Benchmark test: `Put`, `Get`, `PutGet` (default: `Put`)
- `NUM_PROCS` - Number of parallel processes (default: `1`)
- `DEPTH` - Queue depth for concurrent operations (default: `4`)
- `IO_SIZE` - Size of each I/O operation with suffix `b`, `k`, `m`, `g` (default: `1m`)
- `IO_COUNT` - Number of operations to perform (default: `100`)

The benchmark compose file demonstrates:
- Separate runtime and benchmark services
- Shared memory configuration (`shm_size: 8g`)
- IPC namespace sharing for shared memory access
- Custom CTE configuration via volume mounts
- Health checks to ensure runtime readiness

## License

Now that you have IOWarp running:

- **[View Research Demos](https://iowarp.ai/research/demos/#earthscope)** - See IOWarp in action with real scientific workflows
- **[Explore the Platform](https://iowarp.ai/platform/)** - Learn about IOWarp's context engineering architecture
- **[Try CLIO Kit](../agent-toolkit/mcp)** - Use 15+ MCP servers for AI-powered scientific computing
- **[Deployment Guide](../deployment/hpc-cluster.md)** - Deploy IOWarp on HPC clusters
- **[Configuration Reference](../deployment/configuration.md)** - Deep dive into configuration options

## Support

For issues, questions, or installation support:
- Open an issue on the [GitHub repository](https://github.com/iowarp/iowarp-install)
- Join the [Zulip Chat](https://iowarp.zulipchat.com)
- Visit the [IOWarp project homepage](https://iowarp.ai)
- Email: grc@illinoistech.edu

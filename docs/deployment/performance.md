---
sidebar_position: 3
title: Performance Tuning
description: Optimize IOWarp performance through worker threads, data placement, and storage tier configuration.
---

# Performance Tuning

## Overview

IOWarp performance can be optimized by tuning three main categories: worker threads, data placement engine (DPE), and storage tier configuration.

## Worker Threads

Worker threads handle task scheduling and execution in the IOWarp runtime.

```yaml
workers:
  sched_threads: 4    # Scheduling threads for task dispatch
  slow_threads: 4     # Threads for slow/blocking operations
```

**Tuning Guidelines:**
- `sched_threads`: Set to number of CPU cores for latency-sensitive work. Start with 4 and increase based on core count.
- `slow_threads`: Set to number of concurrent slow operations (e.g., synchronous I/O and network, compression). Typically 4-8 threads.
- Higher thread counts increase parallelism but add context-switching overhead.

## Data Placement Engine (DPE)

The DPE determines how data is placed across storage tiers.

```yaml
compose:
  - mod_name: wrp_cte_core
    pool_name: cte_main
    dpe:
      dpe_type: max_bw  # Options: max_bw, round_robin, random
```

**DPE Types:**
- `max_bw`: Maximize bandwidth by prioritizing faster tiers (recommended for most workloads)
- `round_robin`: Distribute data evenly across tiers
- `random`: Random placement across tiers

## Storage Tier Configuration

Storage tiers define the cache hierarchy with priority scores.

```yaml
compose:
  - mod_name: wrp_cte_core
    storage:
      # RAM tier (fastest, most precious)
      - path: "ram::cte_ram"
        bdev_type: ram
        capacity_limit: 16GB
        score: 1.0

      # NVMe tier (fast)
      - path: /dev/nvme0n1
        bdev_type: file
        capacity_limit: 500GB
        score: 0.5

      # HDD tier (overflow)
      - path: /mnt/hdd/cte_storage
        bdev_type: file
        capacity_limit: 2TB
        score: 0.0
```

**Score Guidelines:**
- `score: 0.0` - Low selectivity. Any data can be placed here (least restrictive).
- `score: 0.5` - Medium selectivity. Moderately selective about what data goes here.
- `score: 1.0` - High selectivity. Only high-priority data is placed here (most restrictive).
- Higher scores = higher selectivity. DPE is more selective about placing data on high-score tiers.

Scoring is typically set based on performance.

**Tuning Tips:**
- Use RAM tiers (`bdev_type: ram`) for critical high-priority data with `score: 1.0` (most selective, most precious)
- Add NVMe/SSD tiers for balanced selectivity with `score: 0.3-0.7`
- Use HDDs as overflow tiers with `score: 0.0` (least selective, accepts any data)
- Align `capacity_limit` with available hardware capacity
- Multiple tiers with the same score will be used with equal priority


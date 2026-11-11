---
title: SDK Reference
sidebar_label: Overview
sidebar_position: 1
---

# SDK Reference

IOWarp Core is a unified framework that integrates five high-performance components for context management, data transfer, and scientific computing. Built with a modular architecture, it enables efficient data processing pipelines for HPC, storage systems, and near-data computing applications.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Applications                            │
│          (Scientific Workflows, HPC, Storage Systems)        │
└──────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────────────┐   ┌──────────────────┐   ┌────────────────┐
│   Context     │   │    Context       │   │   Context      │
│  Exploration  │   │  Assimilation    │   │   Transfer     │
│    Engine     │   │     Engine       │   │    Engine      │
└───────────────┘   └──────────────────┘   └────────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────────────┐
                    │  Context        │
                    │  Runtime        │
                    │  (Module System)│
                    └─────────────────┘
                              │
                ┌─────────────────────────┐
                │  Context Transport      │
                │  Primitives             │
                │  (Shared Memory & IPC)  │
                └─────────────────────────┘
```

## Components

### Context Runtime

High-performance modular runtime for scientific computing and storage systems with coroutine-based task execution.

**Key Features:**
- Ultra-high performance task execution (< 10μs latency)
- Modular Module system for dynamic extensibility
- Coroutine-aware synchronization (CoMutex, CoRwLock)
- Distributed architecture with shared memory IPC
- Built-in storage backends (RAM, file-based, custom block devices)

### Context Transfer Engine

Heterogeneous-aware, multi-tiered, dynamic I/O buffering system designed to accelerate I/O for HPC and data-intensive workloads.

**Key Features:**
- Programmable buffering across memory/storage tiers
- Multiple I/O pathway adapters
- Integration with HPC runtimes and workflows
- Improved throughput, latency, and predictability

### Context Assimilation Engine

High-performance data ingestion and processing engine for heterogeneous storage systems and scientific workflows.

**Key Features:**
- OMNI format for YAML-based job orchestration
- MPI-based parallel data processing
- Binary format handlers (Parquet, CSV, custom formats)
- Repository and storage backend abstraction
- Integrity verification with hash validation

### Context Exploration Engine

Interactive tools and interfaces for exploring scientific data contents and metadata.

**Key Features:**
- Model Context Protocol (MCP) for HDF5 data
- HDF Compass viewer (wxPython-4 based)
- Interactive data exploration interfaces
- Metadata browsing capabilities

### Context Transport Primitives

High-performance shared memory library containing data structures and synchronization primitives compatible with shared memory, CUDA, and ROCm.

**Key Features:**
- Shared memory compatible data structures (vector, list, unordered_map, queues)
- GPU-aware allocators (CUDA, ROCm)
- Thread synchronization primitives
- Networking layer with ZMQ transport
- Compression and encryption utilities

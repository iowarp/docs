---
slug: /intro
sidebar_position: 1
title: Welcome
description: IOWarp is a context orchestration platform for agentic AI in scientific computing.
---

# Welcome to IOWarp Documentation

**IOWarp** is a context orchestration platform for agentic AI in scientific computing. It provides a high-performance runtime, SDK, and agent toolkit that bridges AI agents with HPC infrastructure, scientific data formats, and research workflows.

## Who is this for?

| Audience | Start here |
|----------|-----------|
| **Researchers** | [Installation Guide](./getting-started/installation) → [Quick Start](./getting-started/quick-start) |
| **HPC Practitioners** | [Deployment Guide](./deployment/hpc-cluster) → [Configuration](./deployment/configuration) |
| **Developers** | [SDK Reference](./sdk/interprocess) → [Python API](./api/python) |
| **AI Researchers** | [CLIO Kit MCP Servers](./clio-kit/mcp-servers) → [Platform Overview](https://iowarp.ai/platform/) |

## Architecture Overview

IOWarp consists of three layers:

1. **CLIO Agent** — The orchestration intelligence. Coordinates AI agents with scientific workflows through context engineering.
2. **CLIO Kit** — 16 MCP servers with 150+ tools for scientific computing (HDF5, Slurm, ParaView, Pandas, ArXiv, and more).
3. **IOWarp Runtime** (Chimaera) — High-performance distributed task execution framework with the Context Transfer Engine (CTE) and Context Assimilation Engine (CAE).

## Key Capabilities

- **Context Transfer Engine (CTE)** — Intelligent data buffering with multi-tier storage, automatic data placement, and zero-copy transfers
- **Context Assimilation Engine (CAE)** — Transform and adapt data across formats and domains
- **MCP Integration** — Model Context Protocol servers for seamless AI agent connectivity
- **HPC-Native** — Built for Slurm clusters, POSIX/MPI-IO, and distributed scientific workflows

## Quick Links

- [GitHub Organization](https://github.com/iowarp)
- [Zulip Chat](https://iowarp.zulipchat.com)
- [Research Publications](https://iowarp.ai/research/)
- [CLIO Kit (toolkit.iowarp.ai)](https://toolkit.iowarp.ai)
- [IOWarp Website (iowarp.ai)](https://iowarp.ai)

## Need Help?

- **Community** — [Zulip Chat](https://iowarp.zulipchat.com)
- **Bug Reports** — [GitHub Issues](https://github.com/iowarp/iowarp/issues)
- **Feature Requests** — [GitHub Discussions](https://github.com/orgs/iowarp/discussions)
- **Email** — grc@illinoistech.edu

---
sidebar_position: 1
title: MCP Servers
description: "16 specialized Model Context Protocol servers for scientific computing — 150+ tools for HDF5, Slurm, ParaView, ArXiv, and more."
---

# CLIO Kit — MCP Servers

**16 specialized MCP servers for scientific computing — 150+ tools**

CLIO Kit provides AI agents with direct access to HPC infrastructure, scientific data formats, and research workflows through [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) servers.

:::tip
For the interactive MCP showcase, visit [toolkit.iowarp.ai](https://toolkit.iowarp.ai).
:::

## Quick Start

```bash
# Install and run any MCP server
uvx iowarp-agent-toolkit mcp-server hdf5
uvx iowarp-agent-toolkit mcp-server pandas
uvx iowarp-agent-toolkit mcp-server slurm

# List all available servers
uvx iowarp-agent-toolkit mcp-servers
```

## Available Servers

### Data I/O & Visualization (5 servers, 56+ tools)

| Server | Tools | Description |
|--------|-------|-------------|
| **HDF5** | 27 | HDF5 file operations with AI-powered insights, LRU caching, streaming |
| **Pandas** | 15 | CSV data analysis, statistical summaries, data cleaning |
| **ADIOS** | 5 | Scientific data I/O for BP5 format |
| **Parquet** | 4 | High-performance columnar data processing |
| **ParaView** | 29 | 3D scientific visualization, isosurfaces, streamlines |

### HPC Integration (4 servers, 59+ tools)

| Server | Tools | Description |
|--------|-------|-------------|
| **Slurm** | 13 | Job submission, monitoring, cluster analytics |
| **Jarvis** | 25+ | HPC workflow orchestration, pipeline management |
| **Lmod** | 10 | HPC module system management |
| **Node Hardware** | 11 | CPU, GPU, memory, disk, network monitoring |

### Research Discovery (2 servers, 16+ tools)

| Server | Tools | Description |
|--------|-------|-------------|
| **ArXiv** | 13 | Paper search, metadata, BibTeX export, citation networks |
| **NDP** | 3 | National Data Platform dataset discovery |

### System Monitoring (2 servers, 14+ tools)

| Server | Tools | Description |
|--------|-------|-------------|
| **Darshan** | 10 | I/O performance analysis, bandwidth, bottleneck detection |
| **ChronoLog** | 4 | Session logging and context sharing |

### Utilities (3 servers, 20+ tools)

| Server | Tools | Description |
|--------|-------|-------------|
| **Plot** | 6 | Data visualization (line, bar, scatter, heatmap) |
| **Compression** | 1 | File compression utilities |
| **Parallel Sort** | 13 | Log processing, pattern detection, filtering |

## IDE Integration

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
<TabItem value="cursor" label="Cursor" default>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "hdf5-mcp": {
      "command": "uvx",
      "args": ["iowarp-agent-toolkit", "mcp-server", "hdf5"]
    },
    "pandas-mcp": {
      "command": "uvx",
      "args": ["iowarp-agent-toolkit", "mcp-server", "pandas"]
    },
    "slurm-mcp": {
      "command": "uvx",
      "args": ["iowarp-agent-toolkit", "mcp-server", "slurm"]
    }
  }
}
```

[Cursor MCP docs →](https://docs.cursor.com/context/model-context-protocol)

</TabItem>
<TabItem value="claude-code" label="Claude Code">

```bash
claude mcp add hdf5-mcp -- uvx iowarp-agent-toolkit mcp-server hdf5
claude mcp add pandas-mcp -- uvx iowarp-agent-toolkit mcp-server pandas
claude mcp add slurm-mcp -- uvx iowarp-agent-toolkit mcp-server slurm
```

[Claude Code MCP docs →](https://code.claude.com/docs/en/mcp)

</TabItem>
<TabItem value="vscode" label="VS Code">

Add to your VS Code MCP config:

```json
"mcp": {
  "servers": {
    "hdf5-mcp": {
      "type": "stdio",
      "command": "uvx",
      "args": ["iowarp-agent-toolkit", "mcp-server", "hdf5"]
    },
    "pandas-mcp": {
      "type": "stdio",
      "command": "uvx",
      "args": ["iowarp-agent-toolkit", "mcp-server", "pandas"]
    }
  }
}
```

[VS Code MCP docs →](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)

</TabItem>
<TabItem value="claude-desktop" label="Claude Desktop">

Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hdf5-mcp": {
      "command": "uvx",
      "args": ["iowarp-agent-toolkit", "mcp-server", "hdf5"]
    },
    "arxiv-mcp": {
      "command": "uvx",
      "args": ["iowarp-agent-toolkit", "mcp-server", "arxiv"]
    }
  }
}
```

[Claude Desktop MCP docs →](https://modelcontextprotocol.io/quickstart/user)

</TabItem>
</Tabs>

## Repository

- **GitHub**: [github.com/iowarp/clio-kit](https://github.com/iowarp/clio-kit)
- **PyPI**: [pypi.org/project/clio-kit](https://pypi.org/project/clio-kit/)
- **Interactive Showcase**: [toolkit.iowarp.ai](https://toolkit.iowarp.ai)

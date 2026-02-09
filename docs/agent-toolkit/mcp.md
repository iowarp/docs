---
title: MCP Servers
description: 15+ specialized Model Context Protocol servers for scientific computing - 150+ tools for HDF5, Slurm, ParaView, ArXiv, and more
---

# MCP Servers

**15+ specialized MCP servers for scientific computing - 150+ tools**

IOWarp's CLIO Kit provides AI agents with direct access to HPC infrastructure, scientific data formats, and research workflows through Model Context Protocol (MCP) servers.

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

<details>
<summary><img src="/img/logos/technologies/hdf5-logo.png" alt="HDF5" width="32" /> <strong>HDF5 MCP</strong> - 27 tools for HDF5 operations <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/hdf5" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- AI-Powered Features - LLM sampling for insights, progress reporting, user elicitation
- High Performance - 100-1000x speedup with LRU caching, 4-8x faster batch processing
- Streaming Support - Handle unlimited file sizes with chunked reading
- Resource URIs - Access HDF5 files via `hdf5://` scheme with wildcards
- Parallel Processing - Multi-threaded batch operations and directory scanning

**Tools:** `open_file`, `close_file`, `get_filename`, `get_mode`, `get_by_path`, `list_keys`, `visit`, `read_full_dataset`, `read_partial_dataset`, `get_shape`, `get_dtype`, `get_size`, `get_chunks`, `read_attribute`, `list_attributes`, `hdf5_parallel_scan`, `hdf5_batch_read`, `hdf5_stream_data`, `hdf5_aggregate_stats`, `analyze_dataset_structure`, `find_similar_datasets`, `suggest_next_exploration`, `identify_io_bottlenecks`, `optimize_access_pattern`, `refresh_hdf5_resources`, `list_available_hdf5_files`, `export_dataset`

**Installation:** `uvx iowarp-agent-toolkit mcp-server hdf5`

</details>

<details>
<summary><img src="/img/logos/technologies/pandas-logo.svg" alt="Pandas" width="32" /> <strong>Pandas MCP</strong> - 15 tools for CSV data analysis <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/pandas" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- Data Loading & Export - Multiple formats (CSV, Excel, JSON, Parquet, HDF5)
- Statistical Analysis - Descriptive statistics, correlation analysis, hypothesis testing
- Data Cleaning - Missing data handling, outlier detection, duplicate removal
- Advanced Analytics - Groupby operations, pivot tables, time series analysis

**Tools:** `load_data`, `save_data`, `statistical_summary`, `correlation_analysis`, `hypothesis_testing`, `handle_missing_data`, `clean_data`, `groupby_operations`, `merge_datasets`, `pivot_table`, `time_series_operations`, `validate_data`, `filter_data`, `optimize_memory`, `profile_data`

**Installation:** `uvx iowarp-agent-toolkit mcp-server pandas`

</details>

<details>
<summary><img src="/img/logos/technologies/adios-logo.png" alt="ADIOS" width="32" /> <strong>ADIOS MCP</strong> - 5 tools for scientific data I/O <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/adios" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- Read BP5 files
- Inspect variables and attributes
- Read data at specific timesteps
- Scientific data structure analysis

**Tools:** `list_bp5`, `inspect_variables`, `inspect_variables_at_step`, `inspect_attributes`, `read_variable_at_step`

**Installation:** `uvx iowarp-agent-toolkit mcp-server adios`

</details>

<details>
<summary><img src="/img/logos/technologies/parquet-logo.jpeg" alt="Parquet" width="32" /> <strong>Parquet MCP</strong> - 4 tools for columnar data <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/parquet" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- High-performance columnar data analysis
- Schema inspection
- Efficient data processing

**Tools:** `summarize_tool`, `read_slice_tool`, `get_column_preview_tool`, `aggregate_column_tool`

**Installation:** `uvx iowarp-agent-toolkit mcp-server parquet`

</details>

<details>
<summary><img src="/img/logos/technologies/paraview.jpeg" alt="ParaView" width="32" /> <strong>ParaView MCP</strong> - 29 tools for 3D scientific visualization <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/paraview" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- Data I/O - Read scientific data formats (VTK, VTU, ADIOS2/BP5)
- Visualization & Filtering - Generate isosurfaces, streamlines, glyphs, contours, clips, slices, thresholds
- Rendering & Display - Create publication-quality visualizations with camera control
- ADIOS2/BP5 Support - Native support for high-performance simulation data
- 3D Scientific Visualization - Complete pipeline from data loading to rendering

**Tools:** `load_scientific_data`, `export_data`, `get_data_info`, `list_arrays`, `get_array_range`, `generate_isosurface`, `create_data_slice`, `configure_volume_display`, `generate_flow_streamlines`, `apply_threshold_filter`, `apply_clip_filter`, `apply_calculator`, `apply_contour`, `apply_warp_by_vector`, `toggle_object_visibility`, `apply_field_coloring`, `set_color_map`, `set_color_map_preset`, `get_histogram`, `adjust_volume_opacity`, `take_viewport_screenshot`, `set_background_color`, `set_representation`, `rotate_camera`, `reset_camera`, `set_camera_position`, `adjust_camera_zoom`, `query_adios2_metadata`, `convert_bp5_to_vtk`

**Installation:** `uvx iowarp-agent-toolkit mcp-server paraview`

</details>

---

### HPC Integration (4 servers, 59+ tools)

<details>
<summary><img src="/img/logos/technologies/slurm-logo.png" alt="Slurm" width="32" /> <strong>Slurm MCP</strong> - 13 tools for workload management <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/slurm" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- Job Management - Submit, monitor, cancel jobs with intelligent resource allocation
- Array Jobs - High-throughput parallel computing with optimized task distribution
- Interactive Sessions - Node allocation/deallocation with performance monitoring
- Cluster Analytics - Queue analysis, resource utilization, performance insights
- AI-Powered Optimization - Intelligent scheduling, resource sizing, cost analysis

**Tools:** `submit_slurm_job`, `check_job_status`, `cancel_slurm_job`, `list_slurm_jobs`, `get_slurm_info`, `get_job_details`, `get_job_output`, `get_queue_info`, `submit_array_job`, `get_node_info`, `allocate_slurm_nodes`, `deallocate_slurm_nodes`, `get_allocation_status`

**Installation:** `uvx iowarp-agent-toolkit mcp-server slurm`

</details>

<details>
<summary><img src="/img/logos/technologies/jarvis.png" alt="Jarvis" width="32" /> <strong>Jarvis MCP</strong> - 25+ tools for HPC workflows <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/jarvis" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- Pipeline Management - Create, configure, build, and execute HPC workflows end-to-end
- Package Orchestration - Add, configure, update, and remove packages with dependency management
- Repository Management - Multi-repository support with prioritization and package discovery
- Resource Monitoring - Real-time resource graphs, performance tracking, system analytics
- Configuration Management - Bootstrap templates, configuration persistence, hostfile management

**Tools:** `update_pipeline`, `build_pipeline_env`, `create_pipeline`, `load_pipeline`, `get_pkg_config`, `append_pkg`, `configure_pkg`, `unlink_pkg`, `remove_pkg`, `run_pipeline`, `destroy_pipeline`, `jm_create_config`, `jm_load_config`, `jm_save_config`, `jm_set_hostfile`, `jm_bootstrap_from`, `jm_bootstrap_list`, `jm_reset`, `jm_list_pipelines`, `jm_cd`, `jm_list_repos`, `jm_add_repo`, `jm_remove_repo`, `jm_promote_repo`, `jm_get_repo`, `jm_construct_pkg`, `jm_graph_show`, `jm_graph_build`, `jm_graph_modify`

**Installation:** `uvx iowarp-agent-toolkit mcp-server jarvis`

</details>

<details>
<summary><img src="/img/logos/technologies/lmod-logo.png" alt="Lmod" width="32" /> <strong>Lmod MCP</strong> - 10 tools for module management <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/lmod" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- HPC module system management
- Environment setup and configuration
- Module discovery and analysis

**Tools:** `module_list`, `module_avail`, `module_show`, `module_load`, `module_unload`, `module_swap`, `module_spider`, `module_save`, `module_restore`, `module_savelist`

**Installation:** `uvx iowarp-agent-toolkit mcp-server lmod`

</details>

<details>
<summary><img src="/img/logos/technologies/node-hardware.png" alt="Node Hardware" width="32" /> <strong>Node Hardware MCP</strong> - 11 tools for system monitoring <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/node_hardware" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- Comprehensive local and remote system hardware monitoring
- CPU, GPU, memory, disk, network monitoring
- Thermal monitoring and health assessment

**Tools:** `get_cpu_info`, `get_memory_info`, `get_gpu_info`, `get_disk_info`, `get_network_info`, `get_thermal_info`, `get_system_summary`, `get_remote_system_info`, `monitor_resources`, `get_process_info`, `get_battery_info`

**Installation:** `uvx iowarp-agent-toolkit mcp-server node-hardware`

</details>

---

### Research Discovery (2 servers, 16+ tools)

<details>
<summary><img src="/img/logos/technologies/arxiv-logo.png" alt="ArXiv" width="32" /> <strong>ArXiv MCP</strong> - 13 tools for academic research <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/arxiv" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- Advanced Search - Multi-dimensional search by topic, author, title, abstract, subject, date range
- Paper Management - Detailed metadata extraction, PDF downloads, citation management
- Research Analytics - Similar paper discovery, citation network analysis, research trend monitoring
- Bibliography Support - BibTeX export, citation formatting, research package creation

**Tools:** `search_arxiv`, `get_recent_papers`, `get_paper_by_id`, `download_paper`, `get_paper_metadata`, `search_by_author`, `search_by_category`, `get_paper_abstract`, `get_paper_citations`, `export_bibtex`, `search_by_date_range`, `get_similar_papers`, `create_research_package`

**Installation:** `uvx iowarp-agent-toolkit mcp-server arxiv`

</details>

<details>
<summary><img src="/img/logos/partnerships/ndp-logo.png" alt="NDP" width="32" /> <strong>NDP MCP</strong> - 3 tools for dataset discovery <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/ndp" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- National Data Platform dataset discovery and management
- Search across multiple data sources
- Dataset metadata retrieval

**Tools:** `search_datasets`, `get_dataset_metadata`, `download_dataset`

**Installation:** `uvx iowarp-agent-toolkit mcp-server ndp`

</details>

---

### System Monitoring (2 servers, 14+ tools)

<details>
<summary><img src="/img/logos/technologies/darshan-logo.png" alt="Darshan" width="32" /> <strong>Darshan MCP</strong> - 10 tools for I/O analysis <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/darshan" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- Performance Analysis - Job-level statistics, bandwidth analysis, IOPS measurement
- Access Pattern Analysis - File access patterns, sequential vs random I/O analysis
- System Call Analysis - POSIX operations, MPI-IO collective operations, system-level bottlenecks
- Bottleneck Identification - Automated performance issue detection with optimization recommendations

**Tools:** `load_darshan_log`, `get_job_summary`, `get_file_operations`, `analyze_bandwidth`, `analyze_iops`, `get_access_patterns`, `identify_bottlenecks`, `compare_jobs`, `export_report`, `get_mpi_io_stats`

**Installation:** `uvx iowarp-agent-toolkit mcp-server darshan`

</details>

<details>
<summary><img src="/img/logos/technologies/chronolog-logo.png" alt="ChronoLog" width="32" /> <strong>ChronoLog MCP</strong> - 4 tools for session logging <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/chronolog" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- Conversation logging and session management
- Multi-session context sharing
- Structured event documentation

**Tools:** `start_chronolog`, `record_interaction`, `stop_chronolog`, `retrieve_interaction`

**Installation:** `uvx iowarp-agent-toolkit mcp-server compression`

</details>

---

### Utilities (3 servers, 20+ tools)

<details>
<summary><img src="/img/logos/technologies/plot.png" alt="Plot" width="32" /> <strong>Plot MCP</strong> - 6 tools for data visualization <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/plot" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- Advanced data visualization and plotting
- Multiple chart types (line, bar, scatter, histogram, heatmap)
- Publication-quality figures

**Tools:** `line_plot`, `bar_plot`, `scatter_plot`, `histogram_plot`, `heatmap_plot`, `data_info`

**Installation:** `uvx iowarp-agent-toolkit mcp-server plot`

</details>

<details>
<summary><img src="/img/logos/technologies/compression.png" alt="Compression" width="32" /> <strong>Compression MCP</strong> - 1 tool for file compression <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/compression" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- File compression utilities
- Multiple compression formats

**Tools:** `compress_file`

**Installation:** `uvx iowarp-agent-toolkit mcp-server chronolog`

</details>

<details>
<summary><img src="/img/logos/technologies/parallel.png" alt="Parallel Sort" width="32" /> <strong>Parallel Sort MCP</strong> - 13 tools for log processing <a href="https://github.com/iowarp/agent-toolkit/tree/main/agent-toolkit-mcp-servers/parallel_sort" class="button button--primary button--sm" onClick={(e) => e.stopPropagation()}>GitHub</a></summary>

**Capabilities:**
- High-performance log processing and analysis
- Parallel sorting algorithms
- Pattern detection and filtering

**Tools:** `sort_logs`, `filter_logs`, `merge_logs`, `split_logs`, `analyze_patterns`, `deduplicate_logs`, `compress_logs`, `extract_fields`, `aggregate_stats`, `search_logs`, `export_results`, `benchmark_performance`, `configure_workers`

**Installation:** `uvx iowarp-agent-toolkit mcp-server parallel-sort`

</details>

---

## IDE Integration

<details>
<summary><img src="/img/logos/platforms/cursor-logo.png" alt="Cursor" width="32" style={{verticalAlign: 'middle', marginRight: '8px'}} /><strong>Cursor</strong></summary>

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

**Documentation:** [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol)

</details>

<details>
<summary><img src="/img/logos/platforms/claude-code.jpg" alt="Claude Code" width="32" style={{verticalAlign: 'middle', marginRight: '8px'}} /><strong>Claude Code</strong></summary>

```bash
# Add HDF5 MCP
claude mcp add hdf5-mcp -- uvx iowarp-agent-toolkit mcp-server hdf5

# Add Pandas MCP
claude mcp add pandas-mcp -- uvx iowarp-agent-toolkit mcp-server pandas

# Add Slurm MCP
claude mcp add slurm-mcp -- uvx iowarp-agent-toolkit mcp-server slurm
```

**Documentation:** [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)

</details>

<details>
<summary><img src="/img/logos/platforms/vscode-logo.png" alt="VS Code" width="32" style={{verticalAlign: 'middle', marginRight: '8px'}} /><strong>VS Code</strong></summary>

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

**Documentation:** [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)

</details>

<details>
<summary><img src="/img/logos/platforms/claude-logo.png" alt="Claude Desktop" width="32" style={{verticalAlign: 'middle', marginRight: '8px'}} /><strong>Claude Desktop</strong></summary>

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

**Documentation:** [Claude Desktop MCP docs](https://modelcontextprotocol.io/quickstart/user)

</details>

---

## Repository

<a href="https://github.com/iowarp/agent-toolkit" target="_blank" rel="noopener noreferrer" class="button button--primary button--md">View on GitHub</a>

## Summary Table

| Category | Server | Tools | Description |
|----------|--------|-------|-------------|
| **Data I/O** | HDF5 | 27 | HDF5 file operations with AI features |
| | Pandas | 15 | CSV data analysis and transformation |
| | ADIOS | 5 | Scientific data I/O (BP5 format) |
| | Parquet | 4 | Columnar data processing |
| | ParaView | 29 | 3D scientific visualization |
| **HPC Integration** | Slurm | 13 | Workload management and scheduling |
| | Jarvis | 25+ | HPC workflow orchestration |
| | Lmod | 10 | Module system management |
| | Node Hardware | 11 | System hardware monitoring |
| **Research** | ArXiv | 13 | Academic paper discovery |
| | NDP | 3 | Dataset discovery (National Data Platform) |
| **Monitoring** | Darshan | 10 | I/O performance analysis |
| | ChronoLog | 4 | Session logging |
| **Utilities** | Plot | 6 | Data visualization |
| | Compression | 1 | File compression |
| | Parallel Sort | 13 | Log processing and analysis |

**Total:** 16 servers, 150+ tools

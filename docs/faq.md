---
sidebar_position: 100
title: FAQ
description: Frequently asked questions and troubleshooting for IOWarp.
---

# FAQ & Troubleshooting

## General

### What is IOWarp?

IOWarp is a context orchestration platform for agentic AI in scientific computing. It provides a high-performance runtime, SDK, and agent toolkit (CLIO Kit) for bridging AI agents with HPC infrastructure.

### What is the license?

IOWarp is released under the [BSD 3-Clause License](https://opensource.org/licenses/BSD-3-Clause).

### Where can I get help?

- **Zulip Chat**: [iowarp.zulipchat.com](https://iowarp.zulipchat.com)
- **GitHub Issues**: [github.com/iowarp/iowarp/issues](https://github.com/iowarp/iowarp/issues)
- **Discussions**: [github.com/orgs/iowarp/discussions](https://github.com/orgs/iowarp/discussions)
- **Email**: grc@illinoistech.edu

---

## Troubleshooting

### "Could not start TCP server on any host from hostfile"

This error occurs when another process is using the port Chimaera is trying to bind to:

```
chimaera_start_runtime
ERROR: Could not start TCP server on any host from hostfile
Port attempted: 9128
```

**Solution:**

1. Check which process is using the port:
   ```bash
   # Linux
   sudo lsof -i :9128 -P -n
   sudo netstat -tulpn | grep :9128

   # macOS
   sudo lsof -nP -iTCP:9128 | grep LISTEN
   ```

2. Stop the existing Chimaera runtime:
   ```bash
   chimaera_stop_runtime
   ```

3. Or kill the process directly:
   ```bash
   pkill -9 chimaera_start_runtime
   ```

:::warning
When using SSH/pssh in distributed environments, avoid wildcard patterns like `pkill chimaera_*`. Use the full executable name to prevent killing the SSH connection before the runtime.
:::

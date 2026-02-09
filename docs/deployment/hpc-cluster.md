# HPC Cluster Deployment

## Spack (Manual)
Spack is most common in HPC currently. Containers coming more prolific, 
but that will probably be a few years.

In baremetal, you can use pssh for deployment if your environment
is correct and iowarp is installed in it. Not all machines
forward environment variables correctly.

```bash
# Deploy chimaera_start_runtime to multiple nodes with LD_LIBRARY_PATH forwarding
parallel-ssh -i -h hostfile -x "-o SendEnv=PATH" \
  "chimaera_start_runtime"
```

## Containers

**coming soon**

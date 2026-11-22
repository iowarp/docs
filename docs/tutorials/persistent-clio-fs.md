---
sidebar_position: 1
title: Persistent clio-fs
description: On NCSA Delta, build a clio-fs filesystem whose volatile tiers are RAM and node-local NVMe and whose persistent tiers are the SSD and HDD Lustre filesystems, keep it after the Slurm job ends, and read it back on a single node.
---

# Persistent clio-fs on Delta: volatile + persistent CTE

This tutorial builds a **clio-fs** filesystem (the CTE's POSIX layer, mounted
with FUSE) on NCSA Delta (see also the
[DeltaAI guide](../deployment/deltaai.md)). It runs at RAM and
node-local NVMe speed during a job and still exists after the job ends,
because the CTE moves every byte onto Delta's shared SSD and HDD filesystems.
Then it covers how to keep the data past the allocation, and how to open it
again on a single node from your own analysis code, the way you would open a
file with an I/O library.

You will:

1. Lay out four CTE tiers: RAM and node-local NVMe as **volatile**, the SSD
   and HDD Lustre filesystems as **persistent**.
2. Compose the clio-fs chain on top, with every log it needs to restart.
3. Run it in a Slurm job and stop it cleanly before the walltime.
4. Keep it after the job: as plain files, or as the CTE store itself.
5. Reopen it on one node with FUSE, the POSIX adapter or the C++ API.

## Delta's storage, and which tier each one becomes

| Delta storage | Survives the job | CTE tier | `persistence_level` | `score` |
|---|---|---|---|---|
| Node memory | no | `ram::cte_ram` | `volatile` | 1.0 |
| `/tmp`: node-local NVMe, deleted after your job | no | `/tmp/$USER/clio/cte_nvme_tier.dat` | `volatile` | 0.7 |
| `/work/nvme/<project>`: SSD Lustre, shared | yes | `/work/nvme/.../node<id>/cte_ssd_tier.dat` | `long_term` | 0.4 |
| `/work/hdd/<project>`: HDD Lustre, shared | yes | `/work/hdd/.../node<id>/cte_hdd_tier.dat` | `long_term` | 0.1 |

Run `df -h /tmp` on a compute node of your partition to see how much local
NVMe it has, and `quota` to see your `/work` quotas. `/work/nvme` is usually
much smaller than `/work/hdd`. `/work` has no backups.

The score decides where data is placed: a blob goes to the highest-scoring
tier with room whose score is not above the blob's own score. New writes are
hot, so they land in RAM, then in the local NVMe once RAM is full. The
`persistence_level` decides what counts as durable. It is set per tier, not by
the device type, so a file tier on `/tmp` marked `volatile` is treated exactly
like RAM:

- **The periodic data flush** (every `flush_data_period_ms`) moves each blob
  whose primary copy sits on a volatile tier onto a persistent one (SSD or
  HDD) and frees the volatile blocks.
- **`fsync(2)`** with `fsync_mode: "durable"` returns only once the file's
  bytes are on a persistent tier and synced.
- **A graceful `clio_run stop`** moves whatever is still on the volatile tiers
  to a persistent one before the daemon exits.
- **On restart**, blocks on volatile tiers are dropped, so a blob that had not
  been flushed comes back without them.

Fast reads survive the flush. The cache layer keeps a raw copy of recently
used data on the fast tiers while the authoritative copy moves to the
SSD/HDD.

## How the pieces fit

```text
 application (POSIX I/O)
        │
  clio_cte_fuse  ── mount point /tmp/$USER/clio-fs (per node)
        │
 ┌──────▼───────────────────────────────────────────────────────────┐
 │ clio_cte_filesystem 560.0   namespace: directory blocks, inodes   │
 │ clio_cte_stream     565.0   file sizes, deferred appends          │
 │ clio_cte_cache      563.0   raw copy on the fast tiers            │
 │ clio_cte_indexer    564.0   search index                          │
 │ clio_cte_replication 561.0  durable copies                        │
 │ clio_cte_core       512.0   blob metadata (WAL) + placement       │
 └──┬──────────────┬─────────────────┬──────────────────┬───────────┘
    │ volatile     │ volatile        │ persistent       │ persistent
  RAM            /tmp NVMe        /work/nvme SSD     /work/hdd HDD
  score 1.0      score 0.7        score 0.4          score 0.1
        └─── periodic flush, fsync, graceful stop ───►
```

The bytes on the persistent tiers are only half of a filesystem. A restart
also needs the logs that say which bytes belong to which blob, file and size.
Every one of them must go to `/work`, not `/tmp`. This tutorial keeps them on
the SSD filesystem, next to the SSD tier:

| State | Where it is configured | Without it, after a restart |
|---|---|---|
| Blob/tag metadata WAL + snapshot | `clio_cte_core` → `performance.metadata_log_path` | bytes persist, but nothing knows which blob they belong to |
| Allocator logs of the SSD and HDD tiers | next to each tier file (`<path>.alloc_log`) | freed and live blocks are confused |
| File sizes, pending appends | `clio_cte_stream` → `log_path` | files come back with the wrong size |
| Stream log of clio-fs | `clio_cte_filesystem` → `metadata_log_path` | same as above |
| Search index | `clio_cte_indexer` → `index_log_path` | search returns nothing until a rescan |
| Pool log (durable pools) | `runtime.conf_dir` → `<conf_dir>/wal/pools.<node>.bin` | runtime-created pools are not re-created |

:::warning `runtime.conf_dir` defaults to `/tmp`
The default `conf_dir` is `/tmp/clio_$USER`, which Delta deletes when the job
ends. Set it explicitly, as the generator below does.
:::

The namespace itself (directories and inodes) is stored as CTE blobs, so it is
covered by the metadata WAL and the persistent tiers. There is no separate
metadata server to save.

## Node identity: the hostfile position

A CTE store is partitioned across nodes by hash. Each node's share is owned by
its **node id**, and the node id is the node's **line number in the hostfile**
(the first line is node 0), not its hostname. That has two consequences:

- **A saved store must be reopened with the same number of nodes.** The hash
  that placed each blob depends on the node count.
- **Each node's persistent directories are named by its hostfile position**
  (`node0`, `node1`, ...), not by its hostname. The next job can then run on
  different Delta nodes: node 2's state is whatever runtime sits on line 3 of
  the new hostfile.

## Step 1: Choose the paths

Set these in your job script. Replace `bekn` with your Delta project.

```bash
PROJ=bekn
RUN=run42
SSD_STORE=/work/nvme/$PROJ/$USER/clio-stores/$RUN   # SSD tier + all logs
HDD_STORE=/work/hdd/$PROJ/$USER/clio-stores/$RUN    # HDD tier

export RAM_TIER=64GB      # volatile, per node
export NVME_TIER=1TB      # volatile, per node, on /tmp
export SSD_TIER=200GB     # persistent, per node, on /work/nvme
export HDD_TIER=2TB       # persistent, per node, on /work/hdd
```

Keep `SSD_TIER × nodes` under your `/work/nvme` quota. The tier files grow
lazily in 1 GB units, so a capacity is a cap, not an upfront allocation.

Every node gets its own `node<id>` directory under both stores. Two nodes must
never share one log path.

## Step 2: Generate each node's configuration

Save this as `make_clio_conf.sh`. It writes a complete server configuration
for one node, with every path written out literally:

```bash
#!/bin/bash
# Usage: make_clio_conf.sh <hostfile> <node-id> <ssd-store> <hdd-store>
#                          <port> <volatile-dir> <out.yaml>
set -euo pipefail
HOSTFILE=$1; ID=$2; SSD=$3/node$2; HDD=$4/node$2; PORT=$5; VOL=$6; OUT=$7
mkdir -p "$SSD/conf" "$HDD" "$VOL"

cat > "$OUT" <<EOF
networking:
  port: $PORT
  hostfile: "$HOSTFILE"

runtime:
  num_threads: ${CLIO_THREADS:-32}
  conf_dir: "$SSD/conf"                # pool log; must outlive the job

compose:
  - mod_name: clio_bdev
    pool_name: "ram::chi_default_bdev"
    pool_query: local
    pool_id: "301.0"
    bdev_type: ram
    capacity: "${CLIO_SHM:-16GB}"

  - mod_name: clio_cte_core
    pool_name: cte_main
    pool_query: local
    pool_id: "512.0"
    # Keep this list in this order in every job that opens the store:
    # each tier's id is its position in the list.
    storage:
      - path: "ram::cte_ram"                 # volatile: memory
        bdev_type: ram
        capacity_limit: "${RAM_TIER:-64GB}"
        score: 1.0
        persistence_level: "volatile"
      - path: "$VOL/cte_nvme_tier.dat"       # volatile: node-local NVMe
        bdev_type: file
        capacity_limit: "${NVME_TIER:-1TB}"
        score: 0.7
        persistence_level: "volatile"
      - path: "$SSD/cte_ssd_tier.dat"        # persistent: /work/nvme
        bdev_type: file
        capacity_limit: "${SSD_TIER:-200GB}"
        score: 0.4
        persistence_level: "long_term"
      - path: "$HDD/cte_hdd_tier.dat"        # persistent: /work/hdd
        bdev_type: file
        capacity_limit: "${HDD_TIER:-2TB}"
        score: 0.1
        persistence_level: "long_term"
    dpe:
      dpe_type: max_bw
    targets:
      neighborhood: 1
    performance:
      metadata_log_path: "$SSD/cte_metadata_log"
      transaction_log_capacity: "32MB"
      flush_metadata_period_ms: 5000
      flush_data_period_ms: ${CLIO_FLUSH_MS:-10000}
      flush_data_min_persistence: 1          # volatile tiers never count
      fsync_mode: "durable"

  - mod_name: clio_cte_replication
    pool_name: clio_cte_replication
    pool_query: local
    pool_id: "561.0"
    next_pool_id: "512.0"
    replication_factor: 1
    cache_score: 1.0
    replica_score: 0.2

  - mod_name: clio_cte_indexer
    pool_name: clio_cte_indexer
    pool_query: local
    pool_id: "564.0"
    next_pool_id: "561.0"
    index_log_path: "$SSD/cte_indexer_index"

  - mod_name: clio_cte_cache
    pool_name: clio_cte_cache
    pool_query: local
    pool_id: "563.0"
    next_pool_id: "564.0"
    min_score: 0.5

  - mod_name: clio_cte_stream          # before the filesystem
    pool_name: clio_cte_stream
    pool_query: local
    pool_id: "565.0"
    next_pool_id: "563.0"
    staging_pool_id: "561.0"
    log_path: "$SSD/cte_stream_log"    # file sizes survive a restart

  - mod_name: clio_cte_filesystem
    pool_name: clio_cte_filesystem
    pool_query: local
    pool_id: "560.0"
    next_pool_id: "563.0"
    metadata_log_path: "$SSD/cfs_namespace_log"
EOF
```

Notes on the choices:

- **Two volatile tiers.** RAM absorbs the write bursts, and the local NVMe
  takes over when RAM is full. Neither is trusted to keep data: the periodic
  flush moves primaries off both, onto the SSD and HDD, and frees their
  blocks. Among the persistent tiers, a blob goes to the highest-scoring one
  whose score is not above the blob's own score: hot data lands on the SSD,
  data whose score has dropped below 0.4 on the HDD, and either spills to the
  other tier when its preferred one is full.
- **`flush_data_period_ms`** sets how long data may sit only on a volatile
  tier. Shorter is safer and keeps the stop short. Longer lets short-lived
  files (scratch, overwritten checkpoints) die on the fast tiers without ever
  reaching Lustre, but more data is lost if the job is killed before the
  graceful stop.
- **`replication_factor: 1`** keeps one durable copy per blob, the ext4
  contract. Use `2` or more (with `targets.failover_to_successor: true` on the
  core) if the filesystem must stay readable while a node is down. It
  multiplies the `/work` footprint.
- The order of the `compose` entries matters: each entry must come after the
  pool its `next_pool_id` names.
- Every parameter is described in
  [Configuration](../deployment/configuration.md).

## Step 3: Start it in a Slurm job

The job script writes the hostfile, generates each node's configuration from
that node's position in it, starts one runtime per node, and mounts clio-fs on
every node.

```bash
#!/bin/bash
#SBATCH --account=bekn-delta-cpu
#SBATCH --partition=cpu
#SBATCH --nodes=4
#SBATCH --ntasks-per-node=1
#SBATCH --exclusive
#SBATCH --time=02:00:00
#SBATCH --signal=B:USR1@900        # 15 min warning before the walltime
#SBATCH --output=logs/%j.out
set -euo pipefail

PROJ=bekn; RUN=run42
SSD_STORE=/work/nvme/$PROJ/$USER/clio-stores/$RUN
HDD_STORE=/work/hdd/$PROJ/$USER/clio-stores/$RUN
VOL=/tmp/$USER/clio                # volatile tier + local config
MNT=/tmp/$USER/clio-fs
PORT=9413
export RAM_TIER=64GB NVME_TIER=1TB SSD_TIER=200GB HDD_TIER=2TB

mkdir -p "$SSD_STORE" "$HDD_STORE"
HOSTFILE=$SSD_STORE/hostfile
# A later job writes its own hostnames here; only the line count must match.
scontrol show hostnames "$SLURM_JOB_NODELIST" > "$HOSTFILE"

# One runtime per node. Each node's id is its line in the hostfile.
srun --overlap --ntasks-per-node=1 bash -c '
  ID=$(( $(grep -nx "$(hostname -s)" '"$HOSTFILE"' | cut -d: -f1) - 1 ))
  ./make_clio_conf.sh '"$HOSTFILE"' $ID '"$SSD_STORE"' '"$HDD_STORE"' \
                      '"$PORT"' '"$VOL"' '"$VOL"'/clio.yaml
  CLIO_SERVER_CONF='"$VOL"'/clio.yaml exec clio_run start
' &
RUNTIMES=$!
sleep 20                           # wait for every node to come up

# Mount clio-fs on every node as a client of its local runtime. Keep the
# FUSE daemon in the foreground (-f): Slurm kills a step's leftover processes.
srun --overlap --ntasks-per-node=1 bash -c '
  mkdir -p '"$MNT"'
  CLIO_SERVER_CONF='"$VOL"'/clio.yaml CLIO_WITH_RUNTIME=0 \
    exec clio_cte_fuse '"$MNT"' -f
' &
MOUNTS=$!
sleep 5
```

`clio_run start` always recovers. If the stores already hold a filesystem
from an earlier job, this same script reopens it; if not, it starts empty.
Only `clio_run start --fresh` discards a node's state.

Mount with `CLIO_WITH_RUNTIME=0`. With `1`, the FUSE daemon would try to
become the runtime itself, and an in-process runtime starts fresh (see
[the warning below](#an-in-process-runtime-starts-fresh)).

## Step 4: Run the workload, then stop before the job ends

The volatile tiers hold everything written since the last flush. A
`scancel`, a node crash or the walltime kill skips the graceful stop and
keeps only what was flushed or fsync'd. Unmount and stop inside the job:

```bash
shutdown_clio() {
  # 1. Unmount, so no new writes arrive and open files are closed.
  srun --overlap --ntasks-per-node=1 fusermount3 -u "$MNT" || true
  wait "$MOUNTS" || true
  # 2. Graceful stop: RAM and /tmp NVMe data move to /work, logs are synced.
  srun --overlap --ntasks-per-node=1 bash -c \
    "CLIO_SERVER_CONF=$VOL/clio.yaml clio_run stop --grace-period 600000"
  wait "$RUNTIMES" || true
}
trap shutdown_clio USR1            # walltime warning from #SBATCH --signal

srun --overlap --ntasks-per-node=32 ./my_simulation --output "$MNT/out"

shutdown_clio
```

Size `--grace-period` (milliseconds) to the data that can be on the volatile
tiers when the stop starts, divided by the per-node write bandwidth to
`/work`. While the persistent tiers keep up, that is roughly one flush
period's worth of writes. When the application writes faster than Lustre
absorbs, the backlog grows into the NVMe tier, up to `RAM_TIER + NVME_TIER`
per node. A full 1 TB NVMe tier at 1 GB/s is about 17 minutes. Lower
`NVME_TIER` if that is more than the job can spend at its end. Set the
`--signal` lead time in the batch header larger than the grace period plus
the unmount.

If the workload calls `fsync` on its final outputs, those files are durable
without the stop. The stop still matters for everything else.

## Step 5: Keep it after the job

The local NVMe is gone when the job ends, so nothing to copy is left there.
After the graceful stop, the store is entirely on `/work`. Choose what to keep.

| | A. Stage out as plain files | B. Keep the CTE store |
|---|---|---|
| What is kept | ordinary files and directories | the CTE store itself, on `/work/nvme` + `/work/hdd` |
| End-of-job cost | copy every byte through the mount | the graceful stop only |
| Read later with | anything (`h5py`, `cat`, ...) | CLIO, with the same node count |
| Keeps CTE features (tiers, search index, tags) | no | yes |

### A. Stage out as plain files

Copy out of the mount before stopping. The copy is an ordinary POSIX
directory afterwards and needs no CLIO to read:

```bash
srun --overlap -N 1 -n 1 rsync -a "$MNT/out/" \
     "/work/hdd/$PROJ/$USER/results/$RUN/"
shutdown_clio
```

Every node's mount shows the same namespace, so for large outputs run one
rsync per subtree on several nodes. Use this when the results leave CLIO for
good, or are read by tools that do not know about it. If you will not reopen
the store, delete `$SSD_STORE` and `$HDD_STORE` afterwards to free the quota.

### B. Keep the CTE store

The graceful stop is all the end of the job needs. The two store directories
then hold:

```text
/work/nvme/bekn/$USER/clio-stores/run42/      # SSD
├── hostfile                     # its line count is the store's node count
├── node0/
│   ├── conf/wal/pools.0.bin     # pool log
│   ├── cte_ssd_tier.dat         # SSD tier bytes
│   ├── cte_ssd_tier.dat.alloc_log
│   ├── cte_metadata_log*        # blob/tag WAL + snapshot
│   ├── cte_stream_log.*         # file sizes
│   ├── cfs_namespace_log.stream
│   └── cte_indexer_index*
├── node1/ ...
└── node3/ ...

/work/hdd/bekn/$USER/clio-stores/run42/       # HDD
├── node0/
│   ├── cte_hdd_tier.dat         # HDD tier bytes
│   └── cte_hdd_tier.dat.alloc_log
└── node1/ ...
```

Reopen it in a later job by running the Step 3 script with the same `RUN`
and the same number of nodes. The nodes can be different ones.

Keep these the same in every job that opens the store:

- the number of nodes;
- the **order** of the `storage` list (a tier's id is its position in the
  list);
- the absolute paths of the SSD and HDD tiers and of the logs.

The volatile tiers' paths and sizes may change between jobs. Their contents
are dropped at every restart anyway.

## Step 6: Use the store on one node like an I/O library

For method A, the outputs are plain files; open them with anything. For
method B, the data is a CTE store. To open it on a single node, run the same
number of runtimes there, one per saved node, each on its own port. Then reach
the filesystem through any client interface.

Use a single-node interactive job, not a login node: the runtimes need a few
cores and some memory each.

```bash
srun --account=bekn-delta-cpu --partition=cpu-interactive \
     --nodes=1 --exclusive --time=01:00:00 --pty bash
```

### Start one runtime per saved node, on one host

A hostfile entry may be `host:port`; each runtime takes the line whose port
matches its own. Give each runtime a base port at least 4 apart (it binds
`port`, `port+1` and `port+3`):

```bash
PROJ=bekn; RUN=run42
SSD_STORE=/work/nvme/$PROJ/$USER/clio-stores/$RUN
HDD_STORE=/work/hdd/$PROJ/$USER/clio-stores/$RUN
N=$(wc -l < "$SSD_STORE/hostfile")       # node count of the saved store
H=/tmp/$USER/clio-reader
mkdir -p $H
: > $H/hostfile
for i in $(seq 0 $((N-1))); do
  echo "$(hostname -s):$((9413 + 10*i))" >> $H/hostfile
done

# Smaller volatile tiers: N runtimes share this node. The persistent tier
# sizes stay as they were in the job.
export RAM_TIER=4GB NVME_TIER=16GB CLIO_SHM=2GB CLIO_THREADS=4
export SSD_TIER=200GB HDD_TIER=2TB
for i in $(seq 0 $((N-1))); do
  ./make_clio_conf.sh $H/hostfile $i "$SSD_STORE" "$HDD_STORE" \
                      $((9413 + 10*i)) $H/vol$i $H/node$i.yaml
  CLIO_SERVER_CONF=$H/node$i.yaml nohup clio_run start > $H/node$i.log 2>&1 &
done
sleep 20
```

Runtime `i` recovers the state in `node$i` of both stores. Each runtime gets
its own volatile directory (`$H/vol$i`); the persistent paths are the same as
in the job.

Every client below talks to runtime 0 (its config file names port 9413) and
reaches the others through it.

### Mount it (any program)

```bash
mkdir -p $H/mnt
CLIO_SERVER_CONF=$H/node0.yaml CLIO_WITH_RUNTIME=0 clio_cte_fuse $H/mnt
ls $H/mnt/out
python analyze.py $H/mnt/out/step_100.h5
```

### Link it into your program (POSIX adapter)

Without a FUSE mount, preload the POSIX adapter. Paths that start with the
`clio::` marker go to clio-fs, everything else to the kernel. The marker is
stripped, so the file written at `$MNT/out/step_100.dat` during the job is
`clio::/out/step_100.dat`:

```bash
CLIO_SERVER_CONF=$H/node0.yaml CLIO_WITH_RUNTIME=0 \
LD_PRELOAD=libclio_cte_posix.so \
  ./my_reader clio::/out/step_100.dat
```

The STDIO adapter (`libclio_cte_stdio.so`) does the same for `fopen`/`fread`.
For HDF5 files, use the CLIO VOL or VFD connector; see
`context-transfer-engine/adapter/HDF5_QUICKSTART.md`.

### Call the CTE directly (C++)

Code that works with tags and blobs instead of files links
`clio::cte::core_client` and attaches to the runtime as a client. See
[CTE Core API](../sdk/context-transfer-engine/cte.md) for the full API.

```cpp
#include <clio_cte/core/core_client.h>

int main() {
  // Attach to the running runtimes (CLIO_WITH_RUNTIME=0).
  if (!clio::run::CLIO_INIT(clio::run::RuntimeMode::kClient, false)) {
    return 1;
  }
  clio::cte::core::Tag tag("my_dataset");
  for (const std::string &name : tag.GetContainedBlobs()) {
    std::vector<char> buf(tag.GetBlobSize(name));
    tag.GetBlob(name, buf.data(), buf.size());
    // ... analyze buf ...
  }
  clio::run::CLIO_RUNTIME_FINALIZE();
  return 0;
}
```

### An in-process runtime starts fresh

`CLIO_WITH_RUNTIME=1` (or `CLIO_INIT(kClient, true)`) makes the process
become the runtime if none is running. That in-process runtime starts with
`is_restart = false`, the same as `clio_run start --fresh`: **it clears the
pool log and does not recover the store.** Never point it at a saved store.

For a store saved from a **single-node** job, a program can embed the runtime
and still recover, so nothing else has to be started. Pass `is_restart = true`
explicitly:

```cpp
// Become the runtime (or attach to one already running) and recover the
// persistent state named by $CLIO_SERVER_CONF.
clio::run::CLIO_INIT(clio::run::RuntimeMode::kClient,
                     /*default_with_runtime=*/true,
                     /*is_restart=*/true);
```

A store from an N-node job needs all N runtimes, so use the daemons above.

### Shut down

```bash
fusermount3 -u $H/mnt
for i in $(seq 0 $((N-1))); do
  CLIO_SERVER_CONF=$H/node$i.yaml clio_run stop --grace-period 600000
done
```

Writes made here land in the same store, so the next multi-node job sees
them. Stop gracefully here too: this node's `/tmp` is deleted when the
interactive job ends.

## Check that the store survived

Write checksums from inside the job, and compare them after reopening:

```bash
# in the job, before shutdown_clio
(cd "$MNT" && find out -type f -print0 | xargs -0 sha256sum) \
  > "$SSD_STORE/manifest.sha256"

# after reopening
(cd $H/mnt && sha256sum -c "$SSD_STORE/manifest.sha256")
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Files come back with the right size but zeros or missing tails | Their data was still on RAM or `/tmp` when the job ended: the graceful stop did not finish. Raise the `--signal` lead time or `--grace-period`, shorten `flush_data_period_ms`, or lower `NVME_TIER`. |
| Files come back empty or truncated, directory listing intact | `clio_cte_stream` `log_path` was unset, so file sizes did not survive. |
| Directory listing is empty after a restart | `metadata_log_path` on the core was unset or on `/tmp`, or the store was opened with `--fresh` or an in-process runtime. |
| Some files read back, others fail | The store was reopened with a different node count, a node's directories were given to a different hostfile line, or the `storage` list was reordered. |
| Writes fail with no space while `/tmp` has room | The persistent tiers are full: the flush cannot move volatile data anywhere. Raise `SSD_TIER`/`HDD_TIER` or check your `/work` quota. |
| `clio_run start` fails for runtime 1, 2, ... on the reader node | Ports too close: each runtime needs `port`, `port+1` and `port+3` free. |

## See also

- [DeltaAI](../deployment/deltaai.md): accounts, partitions and filesystems on NCSA's systems.
- [Configuration](../deployment/configuration.md): every parameter used here,
  including durable pools, `fsync_mode` and replication.
- [FUSE adapter](../deployment/adapter.md): mount options and environment
  variables.
- [HPC Cluster](../deployment/hpc-cluster.md): hostfiles and multi-node startup.

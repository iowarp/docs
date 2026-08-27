---
sidebar_position: 2
title: Cache / Replication / Indexing / Summarizer ChiMods
description: The CTE interposition chain — node-local caching, persistent replication, the semantic-search index, and LLM summarization, stacked over the CTE core.
---

# The CTE Interposition Chain

The CTE core (`clio_cte_core`, pool `512.0`) stores blobs. Everything
*policy* — where a durable copy lives, which node keeps a hot copy, what is
searchable — is implemented by separate ChiMods that **interpose** on the
core's own task interface.

An interposer is a pool that:

1. speaks the CTE core's **method ids and task structs** verbatim,
2. **overrides** a handful of data verbs (`PutBlob`, `GetBlob`,
   `GetBlobSize`, `MultiPutBlob`, …), and
3. **forwards every other core method** to the pool named by its
   `next_pool_id` untouched.

The consequence is that interposition is completely transparent to callers.
A `clio::cte::core::Client` pointed at the *top* of the chain works
unchanged — no new API, no new client class. You choose your policy by
choosing which pool you address.

```
      clio::cte::core::Client  (or the CFS / FUSE / POSIX adapters)
                    │
                    ▼
          cache          563.0    node-local raw copies      (locality)
                    │
                    ▼
          indexer        564.0    BM25 term index            (search)
                    │
                    ▼
        [ compressor     562.0    transparent compression ]  (encoding, optional)
                    │
                    ▼
          replication    561.0    persistent replica set     (reliability)
                    │
                    ▼
          core           512.0    blobs, targets, DPE, organizer
```

The `clio_cte_filesystem` ChiMod (pool `560.0`, driven by the FUSE and POSIX
adapters) sits above the whole thing and points its own `next_pool_id` at
the chain top.

An interposer does not have to ship in the CTE package — it only has to speak
the CTE core's vocabulary. The **summarizer** (`clio_cae_summarizer`, pool
`401.0`) lives in the Context Assimilation Engine and slots into the same
chain; see [its section below](#summarizer-chimod-clio_cae_summarizer).

:::info Separation of concerns
Each layer owns exactly one axis: **replication** = reliability,
**cache** = locality, **compressor** = encoding, **indexer** = search,
**summarizer** = enrichment. They compose because they all speak the same
task vocabulary, and each is independently removable — delete its `compose`
entry and re-point the entry above it.
:::

---

## Addressing the chain

Three equivalent ways to make a client talk to an interposer instead of the
raw core:

```bash
# 1. Environment variable (no code changes at all)
export CLIO_CTE_POOL=563.0        # top of the standard chain
```

```cpp
// 2. Construct a core client on the interposer's pool id
#include <clio_cte/core/core_client.h>
#include <clio_cte/cache/cache_tasks.h>

clio::cte::core::Client client(clio::cte::cache::kCachePoolId);  // 563.0
```

```yaml
# 3. From another ChiMod's compose entry — next_pool_id names the chain
- mod_name: clio_cte_filesystem
  pool_id: "560.0"
  next_pool_id: "563.0"
```

`CLIO_CTE_POOL` is honored **only** by `ContentTransferEngine::ClientInit()`
(the process-wide CTE client singleton). It is deliberately *not* applied in
`Client::Init()` or the constructor: runtime-internal module clients build
`Client(next_pool_id)` to reach the pool below them, and redirecting those
would make an interposer forward to itself.

### Well-known pool ids

| ChiMod | Library | Pool id | Pool name constant |
|--------|---------|---------|--------------------|
| Filesystem | `clio_cte_filesystem` | `560.0` | `filesystem::kCfsPoolId` |
| Replication | `clio_cte_replication` | `561.0` | `replication::kReplicationPoolId` |
| Compressor | `clio_cte_compressor` | `562.0` | — |
| Cache | `clio_cte_cache` | `563.0` | `cache::kCachePoolId` |
| Indexer | `clio_cte_indexer` | `564.0` | `indexer::kIndexerPoolId` |
| Summarizer | `clio_cae_summarizer` | `401.0` | `summarizer::kSummarizerPoolId` |
| CTE core | `clio_cte_core` | `512.0` | `core::kCtePoolId` |

Each module's own verbs (`ReplicateBlob`, `FlushTag`, `ReindexScan`, …) are
numbered at **100 and above**, deliberately outside the core's method-id
space, so an interposer can carry both vocabularies without collision.

:::warning Compose ordering matters
The runtime creates `compose` entries in file order, and a pool cannot be
created before the pool its `next_pool_id` names. Put each entry **after**
its target: core → replication → compressor → indexer → cache → filesystem.
:::

---

## Replication ChiMod (`clio_cte_replication`)

**Reliability.** The CTE core already knows how to *store* replicas and
address them (`Context::replica_`). The replication module decides **what
gets copied where**.

### Behavior

- **Write-through to a fixed replica set.** Every default `PutBlob` through
  this pool also writes replicas `1..num_replicas`, each stamped
  `REPLICA_FIXED | REPLICA_PERSISTENT`. Those flags tell the CTE organizer
  two things: never migrate this copy, and never place it on a volatile
  tier. The replicas only move if a device is evacuated.
- **Asynchronous by default.** A put acks after the **primary** write;
  a periodic sweep (`ReplicateSweepTask`, `replicate_period_ms`) re-copies
  each dirty blob's *current* primary bytes, so rapid overwrites coalesce
  into a single replica write. Set `replicate_period_ms: 0` for synchronous
  write-through — the put then blocks until every replica is written.
- **Replica-served reads with primary re-cache.** Reads serve the primary
  when it is present. When the organizer (or a reboot) dropped the DRAM
  primary, the read is transparently served from a disk replica and the
  primary is re-created at `cache_score`.
- **`replica_score` doubles as the drop threshold.** When the primary's
  score sinks below the best persistent replica's score, the primary is
  *dropped* rather than migrated — the durable copy already exists, so
  there is nothing to move.

### Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `next_pool_id` | *(none)* | CTE core pool whose blobs this module replicates (e.g. `"512.0"`). |
| `num_replicas` | `1` | Persistent copies maintained per put. |
| `cache_score` | `1.0` | Score given to the primary on a replica → primary re-cache. High pins it to the fast tier. |
| `replica_score` | `0.2` | Score stamped on the persistent replicas, and the drop threshold for the primary. Should mirror the slow tier the durable copies live on. |
| `replicate_period_ms` | `50` | Async sweep cadence in ms. `0` = synchronous write-through. |

```yaml
- mod_name: clio_cte_replication
  pool_name: clio_cte_replication
  pool_query: local
  pool_id: "561.0"
  next_pool_id: "512.0"
  num_replicas: 1
  cache_score: 1.0
  replica_score: 0.2
  replicate_period_ms: 50
```

:::caution Persistent replicas need a persistent tier
`REPLICA_PERSISTENT` constrains placement to non-volatile storage. A CTE
`storage` entry left at the default `persistence_level: volatile` can never
satisfy that request. At least one tier must declare
`persistence_level: temporary` or `long_term` — see
[Configuration Reference](../../deployment/configuration#storage-tiers-storage).
:::

### Module verbs

Beyond the interposed data path, the replication client exposes two explicit
operations:

```cpp
#include <clio_cte/replication/replication_client.h>

clio::cte::replication::Client repl(clio::cte::replication::kReplicationPoolId,
                                    clio::cte::core::kCtePoolId);

// Bring replica 1 of one blob up to date with the primary.
auto f = repl.AsyncReplicateBlob(tag_id, "checkpoint_0", /*replica=*/1);

// "Make this dataset's RAM cache durable": ReplicateBlob every blob in the
// tag whose score is >= min_score (0 = all of them).
clio::cte::replication::Context ctx;
ctx.min_persistence_level_ = 1;          // pin replica blocks to persistent tiers
auto g = repl.AsyncFlushTag(tag_id, /*replica=*/1, /*min_score=*/0.0f, ctx);
```

`ReplicateBlobTask` reports `bytes_copied_`; `FlushTagTask` reports
`blobs_replicated_` and `bytes_copied_`. Both copy primary → replica in
chunks (one `GetBlob` + one replica-targeted `PutBlob` per chunk), so an
arbitrarily large blob never needs a full-size bounce buffer.

---

## Cache ChiMod (`clio_cte_cache`)

**Locality.** The cache module keeps a node-local, **untransformed** copy of
each blob in the CTE core's `REPLICA_CACHE` slot while pushing the
authoritative bytes down the chain. It is the standard **top** of the chain.

### Why the raw copy matters

The local copy is stored uncompressed and unencoded. That is what keeps the
**zero-IPC shared-memory read path alive** — a compressed primary alone
would force every read back through an RPC round trip, because the client
cannot decode it in place. The cache copy also serves raw task reads
directly.

### Behavior

- **Asynchronous write-through, not write-back.** A put lands below —
  authoritatively — *before* the ack. There is no dirty state and no flush
  period at this layer; the layers underneath keep their own async
  machinery. What is "asynchronous" here is the work those lower layers
  defer, not the durability of the put itself.
- **Writer-local routing.** Reads *and* writes route submitter-local, so the
  hot path (a rank touching its own data) is entirely `PoolQuery::Local()`.
  Only the authoritative hop crosses nodes.
- **Coherent by construction.** The node-local copy is written *first*, then
  the authoritative put carries `origin_node_` to the blob's owner. The
  owner atomically invalidates every *other* registered copy and registers
  this one under the write token. Because the local write strictly precedes
  registration, any later foreign write's invalidation always catches it.
- **Never a partial prefix.** A local copy is created only when the put
  demonstrably covers the whole blob. When that cannot be known up front,
  the copy is created speculatively and the owner verifies it
  (`REPLICA_VERIFY_COMPLETE`); if the blob pre-existed beyond this put, the
  owner refuses the registration and the speculative copy is dropped.
- **The owner node keeps no cache copy.** Its primary is already node-local
  and zero-IPC readable, and an owner-side copy would sit outside the
  register/invalidate protocol — it would never be invalidated and the node
  would serve its own stale bytes forever.
- **Misses fall through.** A read miss goes down the chain to the blob's
  owner and re-populates the local copy (in 4 MiB chunks), coherently.

### Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `next_pool_id` | *(none)* | Pool that receives the authoritative bytes — the indexer in the standard chain. |
| `min_score` | `0.5` | Score **floor** for cache copies (propagated as `Context::replica_min_score_`). The organizer never rescores a cache replica below it; only genuine capacity pressure on the tier evicts one. |

```yaml
- mod_name: clio_cte_cache
  pool_name: clio_cte_cache
  pool_query: local
  pool_id: "563.0"
  next_pool_id: "564.0"     # indexer
  min_score: 0.5
```

The cache module has **no data-path client wrappers** by design. Point a
`clio::cte::core::Client` at pool `563.0` and ordinary `PutBlob` / `GetBlob`
get the caching behavior. `clio::cte::cache::Client` exists only to create
the pool programmatically:

```cpp
#include <clio_cte/cache/cache_client.h>
#include <clio_cte/indexer/indexer_tasks.h>

clio::cte::cache::CacheConfig cfg;
cfg.next_pool_id_ = clio::cte::indexer::kIndexerPoolId;
cfg.min_score_ = 0.5f;

clio::cte::cache::Client cache;
auto f = cache.AsyncCreateCache(clio::run::PoolQuery::Local(),
                                clio::cte::cache::kCachePoolName,
                                clio::cte::cache::kCachePoolId, cfg);
```

---

## Indexer ChiMod (`clio_cte_indexer`)

**Search.** The indexer owns the reverse index that serves
`Method::kSemanticSearch`. **The CTE core no longer implements semantic
search** — without an indexer pool in the chain, there is nothing to answer
the query.

### Behavior

- **Indexing is off the ack path.** A `PutBlob` is forwarded down first,
  then costs only an **O(1) coalesced dirty-key enqueue**. N overwrites of a
  hot blob cost **one** re-tokenize, because the drain re-reads the blob's
  *current* bytes.
- **The drain.** A periodic `IndexSweepTask` (`index_sweep_period_ms`)
  tokenizes the dirty set. Setting the period to `0` disables the sweep
  entirely — the index is then updated only when a search runs (lazy
  indexing).
- **Read-your-writes.** `SemanticSearch` drains the pending set *before*
  evaluating the query, so every acked mutation is visible to the very next
  search regardless of sweep cadence.
- **Search reads no blobs.** BM25 (Okapi, `k1 = 1.5`, `b = 0.75`) is
  evaluated over the maintained term-frequency index. Corpus statistics
  (`avgdl`, `df`) are computed over the *matched* slice only — the query
  means "find the best matches within this regex slice", not "rank against
  everything CTE has ever seen".
- **Tokenization.** Lowercase alphanumeric runs of length ≥ 2, ASCII,
  C-locale semantics.
- **Which verbs are intercepted.** `PutBlob`, `MultiPutBlob`, `DelBlob`,
  `DelTag`, `TruncateBlob`, `RenameTag` maintain the index and are forwarded
  down unchanged. `SemanticSearch` is served locally. Everything else passes
  through.

### Placement in the chain

The indexer sits **above the compressor** so its read-backs see logical
(uncompressed) bytes, and **above the core** because the mutating verbs must
flow through it for the index to stay current. Search clients address it —
or any pool that forwards down into it.

### Persistence

The index is derived state, but rebuilding it from storage is expensive, so
the module persists its own snapshot plus an append-only WAL:

- `index_log_path` set → a restart **restores** the index and never rescans
  storage.
- `index_log_path` empty → in-memory only. A restart comes up **empty** and
  re-indexes incrementally: a tag's first insertion backfills that tag, and
  `ReindexScan` backfills the rest on demand.

The periodic sweep compacts (snapshot + truncate) once the WAL exceeds
`index_wal_compact_bytes`.

### Scope

Only blobs whose **full tag name** matches `tag_re` **and** whose blob name
matches `blob_re` are tokenized (`std::regex_match`, full-string — use
`.*pattern.*` for substring matching). Out-of-scope content costs nothing:
no scan, no index memory, no WAL.

### Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `next_pool_id` | *(none)* | Pool the non-search verbs are forwarded to (replication, or the compressor when enabled). |
| `index_sweep_period_ms` | `100` | Async drain cadence in ms. `0` = lazy (index updated only on search). |
| `tag_re` | `".*"` | Index scope: only matching tag names are tokenized. |
| `blob_re` | `".*"` | Index scope: only matching blob names are tokenized. |
| `index_log_path` | *(empty)* | Snapshot path; the WAL is `<path>.wal`. Empty = in-memory only. Supports `${HOME}` expansion. |
| `index_wal_compact_bytes` | `8MB` | WAL size that triggers snapshot + truncate compaction. |

```yaml
- mod_name: clio_cte_indexer
  pool_name: clio_cte_indexer
  pool_query: local
  pool_id: "564.0"
  next_pool_id: "561.0"                       # replication (562.0 with compressor)
  index_log_path: "${HOME}/.clio/cte_indexer_index"
  index_sweep_period_ms: 100
  index_wal_compact_bytes: "8MB"
  tag_re: ".*"
  blob_re: ".*"
```

### Searching

`SemanticSearch` is a core verb, so it is called through the ordinary core
client:

```cpp
#include <clio_cte/core/core_client.h>
#include <clio_cte/cache/cache_tasks.h>

// Address the chain top (or the indexer directly).
clio::cte::core::Client client(clio::cte::cache::kCachePoolId);

auto fut = client.AsyncSemanticSearch(/*tag_regex=*/".*\\.txt",
                                      /*blob_regex=*/".*",
                                      /*query_text=*/"turbulence simulation",
                                      /*k=*/10);
CLIO_CO_AWAIT(fut);
for (const auto &r : fut->results_) {
  // r.tag_name_, r.blob_name_, r.score_   (BM25; higher = better)
}
```

Both regexes use `std::regex_match` (full-string), matching `BlobQuery`
semantics.

### Backfilling existing data

Pre-existing cold data enters the index in exactly two ways: a tag's
first-insertion backfill, or an explicit scan.

```cpp
#include <clio_cte/indexer/indexer_client.h>

clio::cte::indexer::Client idx(clio::cte::indexer::kIndexerPoolId,
                               clio::cte::core::kCtePoolId);

// Enumerate matching blobs below and ENQUEUE them; the async drain indexes.
auto f = idx.AsyncReindexScan(/*tag_regex=*/".*", /*blob_regex=*/".*");
CLIO_CO_AWAIT(f);
// f->blobs_enqueued_
```

The requested regexes are **intersected** with the module's configured
`tag_re` / `blob_re` scope. The default `PoolQuery` is `Broadcast()`, so one
call covers every node.

### Triage

`CLIO_INDEXER_PASSIVE=1` turns the module into a pure forwarder: no index
maintenance at all. It is the production kill switch, and the measured
baseline that separates interposition cost from indexing cost.

---

## Compressor ChiMod (`clio_cte_compressor`)

**Encoding.** Optional; requires a build with `CLIO_CTE_ENABLE_COMPRESS=ON`.
Compresses transparently on the way down and decompresses on the way out.

| Key | Default | Description |
|-----|---------|-------------|
| `next_pool_id` | *(none)* | Pool below — replication in the standard chain. |
| `tracking_enabled` | `true` | Track per-tag consumer node sets from `Decompress` requests and route `Compress` placement toward the most recent consumer of the same tag. `false` falls back to pure hash routing. |

To enable it, uncomment its `compose` entry **and** re-point the indexer's
`next_pool_id` at `562.0`.

---

## Summarizer ChiMod (`clio_cae_summarizer`)

**Enrichment.** Ships in the Context Assimilation Engine, not CTE, but it is
an interposer like the rest: it speaks the CTE core's task interface and
slots anywhere in the chain. It overrides exactly **one** verb — `PutBlob` —
and forwards everything else untouched.

This logic used to live inside `clio_cae_core`'s `PutBlob` handler. It is now
its own pool so the assimilation entrypoint and the LLM enrichment can be
composed, scaled, and disabled independently.

### Behavior

On each `PutBlob` the module:

1. **Forwards down `next_pool_id` first**, so the user's write completes and
   acks with the same return code whatever the model does.
2. Resolves the blob's **tag name** (via `GetTagName` on the chain below;
   `PutBlobTask` carries only the id) and matches it plus the blob name
   against the configured rules, in order.
3. On a match, prompts `model` on `label_endpoint` with the rule's prompt
   template followed by the blob payload, chunking when the payload exceeds
   the context budget and concatenating the per-chunk responses.
4. Stores the result as **`{blob_name}_label`** in the same tag.

Everything after step 1 is best-effort: a bad regex, an unknown prompt name,
an unreachable endpoint, or an empty response is logged and swallowed. **A
summarization failure never changes a `PutBlob` return code**, and the
original blob is always stored.

Replica-addressed writes (`Context::replica_ != 0`) are skipped — the primary
write already flowed through here.

### Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `next_pool_id` | *(none)* | Pool below. Null falls back to the CTE core. |
| `label_endpoint` | `""` | Ollama-compatible server base URL. The handler POSTs to `{label_endpoint}/api/generate`. |
| `label_prompts` | *(empty)* | Named prompt templates, keyed by name. |
| `label_matches` | *(empty)* | Ordered rules. Empty makes the pool a pure forwarder. |

Each `label_matches` entry:

| Field | Default | Description |
|-------|---------|-------------|
| `tag_re` | — | Regex matched with `regex_search` against the tag name. |
| `blob_re` | — | Regex matched with `regex_search` against the blob name. |
| `model` | — | Model name sent to the inference server. |
| `prompt` | — | Key into `label_prompts`. |
| `context_length` | `4096` | Ollama `num_ctx`. Also drives chunking. `0` disables chunking and accepts Ollama's ~2048 default, which silently truncates. |
| `num_predict` | `0` | Cap on response tokens; `0` = uncapped. With chunking the final summary is roughly `num_predict` x (#chunks). |

```yaml
- mod_name: clio_cae_summarizer
  pool_name: clio_cae_summarizer
  pool_query: local
  pool_id: "401.0"
  next_pool_id: "512.0"
  label_endpoint: "http://127.0.0.1:11434"
  label_prompts:
    summarize: "Summarize the following text in one short sentence."
  label_matches:
    - tag_re: ".*\\.txt$"
      blob_re: ".*"
      model: "gemma3:1b"
      prompt: "summarize"
      context_length: 4096
```

### No summarize-the-summary loop

The `{blob_name}_label` blob is written through `next_pool_id` — *below* this
container — so it never re-enters the handler. A rule with `blob_re: ".*"` is
safe.

:::warning Inference is synchronous on the handling worker
The model call blocks the worker that owns the task (libcurl, easy interface).
A rule matching a hot write path serializes that path behind the model, so
scope `tag_re` / `blob_re` tightly. This is the one interposer whose overhead
is measured in seconds rather than microseconds.
:::

:::info Build flag
Summarization needs libcurl and nlohmann/json. Without them the module still
builds and forwards — the inference client compiles to a stub that always
fails, so every rule is a no-op.
:::

---

## Putting it together

The full standard chain as shipped in the default `~/.clio/clio.yaml`. Note
the ordering: every entry comes after the entry its `next_pool_id` names.

```yaml
compose:
  # ... clio_bdev and clio_cte_core (512.0) first ...

  - mod_name: clio_cte_replication
    pool_name: clio_cte_replication
    pool_query: local
    pool_id: "561.0"
    next_pool_id: "512.0"
    num_replicas: 1
    cache_score: 1.0
    replica_score: 0.2

  # - mod_name: clio_cte_compressor      # optional, needs CLIO_CTE_ENABLE_COMPRESS=ON
  #   pool_name: clio_cte_compressor
  #   pool_query: local
  #   pool_id: "562.0"
  #   next_pool_id: "561.0"

  - mod_name: clio_cte_indexer
    pool_name: clio_cte_indexer
    pool_query: local
    pool_id: "564.0"
    next_pool_id: "561.0"                # 562.0 with the compressor enabled
    index_log_path: "${HOME}/.clio/cte_indexer_index"

  - mod_name: clio_cte_cache
    pool_name: clio_cte_cache
    pool_query: local
    pool_id: "563.0"
    next_pool_id: "564.0"
    min_score: 0.5

  - mod_name: clio_cte_filesystem
    pool_name: clio_cte_filesystem
    pool_query: local
    pool_id: "560.0"
    next_pool_id: "563.0"                # chain top
```

What a put through the chain top now does:

1. **cache** writes the node-local raw copy, then sends the authoritative
   put down;
2. **indexer** forwards it and enqueues the dirty key;
3. **compressor** (if enabled) encodes it;
4. **replication** writes the primary, acks, and sweeps the persistent
   replicas up to date;
5. **core** places the blocks via the DPE and records the metadata.

And a read: **cache** serves the raw local copy — including over the
zero-IPC SHM fast path — or falls through to the owner and re-populates.

:::note The summarizer is not in the default chain
It is opt-in and commented out in the shipped config, because every rule it
matches costs an LLM round-trip on the write path. It normally sits on the
**assimilation** path rather than the filesystem one: point
`clio_cae_core`'s `next_pool_id` at `401.0` and the summarizer's at the CTE
chain. Nothing stops you putting it in the filesystem chain instead — it
speaks the same vocabulary — but then every FUSE write pays for it.
:::

### Trimming the chain

Every layer is optional. Remove the entry and re-point the one above it:

| You don't need | Remove | Re-point |
|----------------|--------|----------|
| Durable copies | `clio_cte_replication` | indexer's `next_pool_id` → `512.0` |
| Semantic search | `clio_cte_indexer` | cache's `next_pool_id` → `561.0` |
| Node-local caching | `clio_cte_cache` | filesystem's `next_pool_id` → `564.0` |
| The whole chain | all of the above | filesystem's `next_pool_id` → `512.0`, or address `512.0` directly |

---

## Related environment variables

| Variable | Description |
|----------|-------------|
| `CLIO_CTE_POOL` | `major.minor` — bind the process-wide CTE client singleton to an interposing pool. |
| `CLIO_INDEXER_PASSIVE` | Set to `1` to disable all index maintenance (forward-only). |
| `CLIO_CTE_SHM_TAG_CAPACITY` | Tag slots in the SHM metadata mirror (default `65536`, ~80 B each, resident). |
| `CLIO_CTE_SHM_BLOB_CAPACITY` | Blob slots in the SHM metadata mirror (default `262144`, ~376 B each, resident). |

See the [Configuration Reference](../../deployment/configuration#environment-variables)
for the full list.

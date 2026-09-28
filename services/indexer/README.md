# services/indexer

Tails Ethereum and Solana, records what happened, and tells core-ledger what
the chains hold.

It is the service that makes "on-chain truth" something the platform reads
rather than something it asks an RPC endpoint about in the middle of a
request. Three things downstream depend on it existing:

- **Reconciliation's Leg A** stops calling a chain from inside a 5-minute
  in-process ticker and reads `eth_supply_snapshot` / `sol_supply_snapshot`
  instead — the tables that had existed since core-ledger's first migration
  with no writer at all.
- **The saga's finality wait** stops blocking a goroutine on an RPC poll and
  asks `GET /finality/:chain/:txHash`. That also removes Sepolia's ~15 minute
  `finalized` latency from the mint path: the depth it answers against is a
  number this platform chose (`ETH_CONFIRMATIONS`), not one the consensus
  layer chose.
- **A reorged mint stops being invisible.** R9's whole mitigation is that
  somebody is watching block *hashes*, not just block numbers.

## Running it

```bash
cp .env.example .env     # then fill in the RPC URLs and contract addresses
make run-indexer         # or: cd services/indexer && go run ./cmd/server
```

It needs its own TimescaleDB, not core-ledger's Postgres:

```bash
docker compose up -d timescaledb
```

## How it works

```
   head ──────────────────────────────────────────────▶
        │◀── confirmations ──▶│
                              │◀── cursor
        ╰── not recorded ─────╯╰── canonical, recorded
```

One pass (`internal/tailer.Once`) does four things, and the order is not
interchangeable:

1. read the head, compute a safe height (`head − confirmations`);
2. check the *first* block of the new range against what we stored, and rewind
   before reading anything if it disagrees;
3. read events, write events, write headers;
4. **only then** move the cursor.

A crash anywhere re-runs the range, and every write in step 3 is an upsert
keyed by something the chain owns, so re-running is a no-op. Moving the cursor
first would make a crash skip a range silently — and for a mint event, that
means a ledger that never learns money was created.

### Reorgs

`internal/reorg` is pure functions over hashes and heights, with no database
and no RPC client, so a fork can be fabricated in a unit test rather than
needing an anvil and an `evm_revert`. `internal/tailer`'s tests do exactly
that: index a mint, rewrite the chain underneath it, and assert the mint is
un-believed.

A fork deeper than `REORG_DEPTH` is **refused**, not absorbed. Rewriting
history the platform has already minted against is an incident, not a
correction — the tailer stops, the cursor stops advancing, and the staleness
alert fires. See [docs/runbooks/chain-reorg.md](../../docs/runbooks/chain-reorg.md).

Nothing is ever deleted. An orphaned block or event is marked
`canonical = false` and kept: a consumer that acted on it needs to be able to
see what it acted on.

### Chains are not symmetric

| | Ethereum | Solana |
|---|---|---|
| height | block number | slot (skipped slots are normal) |
| events | `eth_getLogs`, decoded from the ABI | `getSignaturesForAddress` + Anchor `emit!` blobs |
| confirmations | 12 | 0 — already read at `finalized` commitment |
| reorgs | routine at the tip | not below `finalized` |

The Solana source walks signature history newest-first (the only direction the
RPC offers) and reverses into chain order before returning, so a consumer
reading a batch sees a burn before the mint that answers it.

### One writer

The cursor must advance monotonically, so exactly one replica may hold it.
`internal/leader` takes a Postgres **advisory lock**, not the k8s Lease the
plan called for — the lock lives in the same database as the cursor it
protects, so it cannot be held by a process that has lost its connection to
that state. A Lease is held in the API server, which a partitioned pod can
keep renewing while being unable to reach the database.

Standby replicas are healthy pods that serve the read surface. Only the
writers are single.

## Endpoints

| | |
|---|---|
| `GET /events` | `?chain=&event_type=&correlation_id=&tx_hash=&include_orphaned=` |
| `GET /finality/:chain/:txHash` | `UNSEEN` / `CONFIRMING` / `FINAL` / `ORPHANED` |
| `GET /cursors` | height, head and lag per chain |
| `GET /healthz` `/readyz` `/metrics` `/version` | the platform surface |

The three-valued finality answer is the point. A boolean would collapse
"orphaned" into "not seen yet", and a reorged mint would look identical to a
slow one — which is what the saga used to wait forever on.

## The ABI

`USDX_ABI_PATH` is read at runtime rather than embedded: `shared/abi/USDX.json`
lives outside this Go module and `go:embed` cannot cross a module boundary.
The Docker image bakes it to `/app/abi/USDX.json`. CI already diffs that file
against `forge build` output, so a drifted ABI fails the build rather than
producing an indexer that silently decodes nothing.

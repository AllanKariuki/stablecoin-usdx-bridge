# services/signer

The only process on this platform that can authorise a chain transaction.

P6's goal from `docs/building-plan.md`: *"no private key material in any
process env or on any disk."* This is where that becomes true. core-ledger
stops holding `ETH_RELAYER_PRIVATE_KEY`, sets `SIGNER_URL`, and asks a service
that holds the key in Vault or Fireblocks.

**The value is not in moving the key.** A key in Vault that signs whatever it
is handed has moved the risk, not removed it — an attacker who can reach the
service can still mint arbitrarily. The value is in what this refuses.

## What it refuses

`internal/policy` is pure functions over a decoded request. No database, no
clock, no network — because a policy engine that can only be tested by
standing up a service is one whose edge cases are untested, and its edge cases
are the whole point.

| | |
|---|---|
| **Default deny** | A method with no rule is refused. Forgetting to write a rule is not the same as deciding a method is unrestricted. |
| **Per-signature ceiling** | An amount over the limit is refused. `>=` at the boundary, so a ceiling of 100 allows exactly 100. |
| **Destination allowlist** | The control that matters most against a compromised caller: a forged but plausible request still cannot direct money anywhere the attacker holds. Case-insensitive, because an EIP-55 address is the same address either way. |
| **Caller allowlist** | core-ledger's worker signs mints; compliance pauses. Neither can do the other's job, even with a valid certificate. |
| **Daily limit** | The failure a per-signature ceiling cannot catch: a thousand signatures each individually under it. Midnight UTC, not a rolling window — "how much is left today" needs an answer a human can hold during an incident. |

Policy is a **mounted file**, not an API. It is a document somebody reviews,
in version control with a diff and an approver. An endpoint that could edit it
would give anyone who compromised this service a way to raise its own ceilings
before using them.

This is also why the P2 `Signer` seam passes whole transactions rather than
digests: **an amount ceiling against 32 bytes of hash is meaningless.**

## Idempotency

Keyed on `(chain, method, correlation_id)` for allowed signatures, and each
correlation id is **bound to one payload**: a hash of what the transaction
authorises (chain, method, contract/program, mint, amount, destination,
on-chain id) without its nonce, gas or blockhash.

| A request under an already-signed correlation id with… | |
|---|---|
| the **same bytes** | returns the *original* signature (`replayed: true`) |
| **rebuilt bytes, same payload** | is signed again, through policy as usual — up to `MAX_RESIGNS_PER_CORRELATION` (default 5) times |
| rebuilt bytes **past that cap** | is refused — `409 RESIGN_LIMIT_REACHED`, recorded |
| a **different payload** | is refused — `409 CORRELATION_REUSED`, recorded |

Same bytes replay because a saga retry after a timeout must not produce a
second valid signature for the same transaction. Rebuilt bytes are re-signed
because a retry *rebuilds* its transaction — on Solana a fresh blockhash alone
changes the bytes — and refusing them left a saga whose first signed attempt
never landed unable to get another. That is safe only because the on-chain id
is in the payload and is verified to *be* this correlation id (below): the
chain's replay guard on that id lets at most one of the transactions land. A
re-sign counts once towards the daily limit, not once per signature.

One payload per correlation id cannot be a unique index (re-signs share the
key), so it is checked inside the audit log's SERIALIZABLE append as well as
before signing: two replicas that both pass the first check cannot both bind.

"At most one lands" is not "the rest are free": on Ethereum each rebuilt
transaction has its own nonce, and every one mined behind the winner reverts
on the replay guard at the relayer's expense. So re-signs are capped per
correlation id, counted in the same SERIALIZABLE append (and pre-checked, so a
capped request never reaches the key backend). A byte-identical replay is not
a re-sign and is still answered past the cap. core-ledger treats
`RESIGN_LIMIT_REACHED`, `CORRELATION_REUSED` and `403 POLICY_DENIED` alike:
never retried, never unwound — the saga is dead-lettered with its money where
it is, because an earlier signature for the id may still land.

A *denial* does not consume the slot: a request refused for being over a
ceiling has to be retryable once the ceiling is raised. Rows from before
migration `00002` have no payload digest, so a correlation id signed then
accepts only its exact bytes.

## The audit log

Append-only and hash-chained. Every row carries its predecessor's hash, so
removing or altering one breaks every hash after it — detectably, by anyone
who can read the table, **without trusting the process that wrote it**.

That matters more here than anywhere else in the platform: this is the record
of every authorisation of every movement of money, which makes it the most
valuable thing for an attacker who reached this service to alter afterwards.
Append-only is a database trigger, not a code convention. The chain is
verified **at boot**, and a break is a refusal to start — a break discovered
later cannot be dated, because every row after it is equally suspect.

**Denials are recorded as carefully as approvals.** A burst of refusals is the
first sign of a compromised caller probing what it can get through, and a log
that only recorded successes would show that as silence.

## Backends

| | |
|---|---|
| `local` | Development only. `keystore.Resolve` **refuses** to build it unless `ENV=local`, so a deployment that forgot to set a backend cannot quietly fall back to holding the key itself. |
| `vault` | Transit signs ed25519 natively — the Solana key genuinely never leaves. Transit does *not* produce the recoverable `[R‖S‖V]` ECDSA signature Ethereum needs, so that key is read once from KV and signed with in-process. **That is a real weakness, and the reason this is labelled staging.** |
| `fireblocks` | Production, stubbed. Its `Sign` returns a distinct error rather than a plausible one, because Fireblocks signs *asynchronously* — submit, approval policy, poll — and pretending that fits a synchronous method would hide the mismatch until somebody tried to use it. |

**Why not AWS KMS:** it supports secp256k1 but **not ed25519**, so Solana
cannot use it. Splitting custody across two providers doubles the surface on
the one thing that must never be wrong.

There is no `Export` on `Backend`, and that is not an omission to be filled in
later: a backend that can export is a backend whose keys can leave.

## mTLS, and a note on gRPC

The plan specifies **gRPC + mTLS**. This is **HTTP/2 + mTLS** with a
hand-written typed client, and the deviation is deliberate.

The only caller is core-ledger's saga worker — Go to Go, four methods. gRPC
would add protoc, a plugin chain, a codegen step in CI and two Dockerfiles,
and a generated package to keep in sync, for a wire format carrying the same
bytes over the same mutually-authenticated connection. The security properties
this phase is actually about — mutual authentication, policy on a decoded
transaction, an append-only audit trail — are identical either way. What is
genuinely lost is codegen'd stubs and streaming, neither of which is used.

It is the same reasoning P0 used to delete `shared/proto/bridge.proto`.

The client certificate is the **only** identity this service trusts: not a
bearer token, which can be replayed by anyone who observes one. `ClientAuth`
is `RequireAndVerifyClientCert`, not `VerifyClientCertIfGiven` — the weaker
setting accepts a connection with no certificate and leaves it to the
application to notice, which is precisely the check somebody forgets.

Outside `ENV=local`, missing mTLS configuration is a **refusal to start**. A
signer reachable without a client certificate is a signer anybody on the
network can mint with.

## What the signer verifies (and what it no longer takes on trust)

Policy runs against what the **bytes say**, never against fields the caller
wrote next to them (`internal/decode`):

- **Ethereum** requests carry the unsigned transaction (`tx`). The signer
  decodes it, proves the digest is its hash under the transaction's own chain
  id, requires it to call `USDX_PROXY_ADDRESS`, and reads method, amount,
  destination and the `bytes32` correlation id from the calldata. Contract
  creation, ETH value, a missing chain id and unknown selectors are refused.
- **Solana** requests carry the serialised message as the digest. It must be a
  canonical legacy message containing only one `bridge_mint`/`bridge_burn` for
  `USDX_PROGRAM_ID`, acting on `USDX_MINT_ADDRESS` (plus an idempotent ATA
  create for that same token account), with the relayer as fee payer and all
  eight program accounts present. The claimed wallet is bound by deriving its
  associated token account and requiring it to be the account the instruction
  actually touches. The mint check matters on its own: `usdx_bridge` does not
  pin its mint, so a `bridge_mint` against a look-alike mint whose authority is
  the program's PDA would spend the correlation id's processed marker on
  worthless tokens and block the real mint.
- **The correlation id is bound to the bytes.** Both chains carry
  `sha256(correlation_id)` (core-ledger's `bridge.CorrelationIDHash`) — as the
  `bytes32` argument on Ethereum, and as the `[u8; 32]` argument and
  processed-marker seed on Solana. The signer requires the caller's
  correlation id to hash to it, and requires a bridge call to carry one.
  Without this an already-signed transaction presented under a fresh
  correlation id would find no idempotency record and be signed again.
- The caller's claimed method/amount/destination are cross-checked; any
  disagreement is a recorded denial.

Which contracts are ours is **deployment configuration, not policy**:
`USDX_PROXY_ADDRESS`, `USDX_PROGRAM_ID` and `USDX_MINT_ADDRESS`, the same
names and values core-ledger is given. All three are required at boot outside
`ENV=local`; under `ENV=local` a chain left unset signs nothing. A policy file
still carrying the old `targets:` section is refused at load, not ignored.

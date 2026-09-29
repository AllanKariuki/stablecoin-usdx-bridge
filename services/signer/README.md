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

Unique on `(chain, method, correlation_id)` for allowed signatures. A retried
mint returns the *original* signature.

Without it, a saga retry after a timeout produces a **second valid signature
for the same movement**. The chain's replay guard stops the second transaction
landing — but the platform has now authorised the same money twice, and which
signature is the real one is unanswerable.

A *denial* does not consume the slot: a request refused for being over a
ceiling has to be retryable once the ceiling is raised.

Same correlation id with a *different* digest is refused outright. Signing
both would put two different valid transactions on the chain under one
correlation id.

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

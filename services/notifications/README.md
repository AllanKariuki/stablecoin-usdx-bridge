# services/notifications

In-app, email and webhook notifications, plus the WebSocket fan-out at `/ws`.

**Port 3000 is not this service's choice.** `frontend/public/runtime-config.js`
declares `VITE_APP_WEBSOCKET_URL = ws://localhost:3000/ws` and
`frontend/src/services/websocketService.ts` connects to it — this service was
built to that contract, which is also why Grafana went on 53000 back in P3.

## Where events come from

Two doors, on purpose.

| | |
|---|---|
| `POST /internal/events` | The **immediate** path. payments calls it the moment a settlement lands, so the toast appears while the page is still open. Best-effort by design. |
| `POST /internal/outbox` | The **durable** path. core-ledger's transactional outbox relay posts here, which means the event was written inside the same `SERIALIZABLE` transaction that moved the money — "the journal was posted" and "somebody was told" cannot diverge. |

The second one is where a reconciliation break arrives. That is the last link
in making R7 — *"the one control catching an unbacked mint is decorative"* —
untrue: P3 gave `alert()` a metric and an outbox event instead of a
`log.Printf`, and this is the thing on the other end of it.

Both are cluster-internal and neither is in the gateway's route table (whose
default is deny).

## Delivery

```
write the delivery row  →  send  →  update the row with the outcome
```

The row is written **first**. A notification that was sent but not recorded is
one nobody can prove happened; one recorded but not sent is visibly PENDING
and recoverable. In a dispute, *"did they know"* is a different question from
*"did it happen"*, and this table is the only answer to the first.

Nothing in the delivery path throws at its caller. Every producer calls this
service best-effort, because a notification that fails to send must never fail
a settlement that already happened.

Other decisions worth knowing:

- **Absence of a preference means enabled.** A customer who has never opened
  their settings should still be told their money arrived, so only an explicit
  `enabled = false` suppresses anything.
- **Dedupe keys are per (producer key, channel).** The same event legitimately
  produces an in-app message *and* an email; they must not collide with each
  other while still colliding with their own replay. An outbox is at-least-once
  by design, so a replay is routine, and a customer told twice that their money
  arrived is a support ticket.
- **A delivered count of zero is still `SENT`.** It means the customer was
  offline; the stored row is how they find it when they come back.

## Templates

`{{placeholder}}` substitution. That is the whole language, and it cannot
throw: a missing key renders as `[missing: amount]` rather than raising,
because a notification that says that is recoverable and one that throws is a
notification nobody gets.

A template language here is a template language somebody eventually puts a
loop in, and then rendering can fail at runtime — on the path whose job is
telling a customer their money moved.

## The WebSocket

The socket is a **fan-out, not an API**. The only inbound message accepted is
a ping. A client that could *act* over the WebSocket would be acting over a
channel that bypasses the gateway's route table entirely — every permission
check this platform has lives in auth-proxy, which sees HTTP requests.

Authentication happens here rather than at Traefik for a reason that cannot be
designed around: a browser cannot set an `Authorization` header on
`new WebSocket(url)`. There is no header for ForwardAuth to inspect, so the
token travels as a query parameter and is verified in `src/ws/ws.auth.ts` —
the one place in the platform that verifies a JWT outside auth-proxy. It
establishes *who* is connecting and nothing else.

Sockets that stop answering pings are reaped every 30s. A laptop that went
into a tunnel leaves a TCP connection that looks open for a long time, and
every one of those is a party this service wrongly believes is online.

## Webhooks

Signed `t=<unix>,v1=<hmac-sha256>` over `"<t>.<body>"` — Stripe's shape,
because it is the one most subscribers already have code for.

Signing the timestamp **with** the body is what makes a captured request
unreplayable: a subscriber rejects anything whose `t` is too old, and an
attacker cannot move `t` forward without invalidating `v1`. Signing the body
alone would let one captured legitimate call be resent forever.

The secret is returned **once**, at creation. A signing secret that can be
re-read from an API proves nothing, because anyone who can read it can forge
the signature.

Deliveries are queued and retried with exponential backoff (8 attempts, then
DEAD). An endpoint that fails 20 times consecutively is deactivated — it is
gone, not busy, and draining against a URL nobody is listening at wastes the
budget of the ones that are.

# core-ledger ships three binaries out of one image: the API, the saga worker
# and the reconciler.
#
# They share a database, a chart of accounts and a fee schedule, and
# building them from one source tree is what keeps them from drifting apart —
# a worker posting against a different ledger version than the API accepted
# the request on is the kind of bug that only shows up as money in the wrong
# place.
#
# Build from the repository root, not from this directory: go.work spans
# core-ledger, shared/go/platform and the services, and a context rooted here
# cannot see them.
#
#   docker build -f core-ledger/Dockerfile -t usdx/core-ledger .

FROM golang:1.26-alpine AS build

WORKDIR /src

# Module files first so `go mod download` is cached against dependency
# changes rather than invalidated by every source edit.
COPY go.work go.work.sum ./
COPY core-ledger/go.mod core-ledger/go.sum ./core-ledger/
COPY shared/go/platform/go.mod shared/go/platform/go.sum ./shared/go/platform/
COPY shared/authz/go.mod shared/authz/go.sum ./shared/authz/
COPY services/auth-proxy/go.mod services/auth-proxy/go.sum ./services/auth-proxy/
COPY services/indexer/go.mod services/indexer/go.sum ./services/indexer/
RUN go mod download

COPY go.work go.work.sum ./
COPY core-ledger ./core-ledger
COPY shared ./shared
COPY services ./services

ARG VERSION=dev
ARG COMMIT=none

# CGO off so the result runs on a distroless-style base with no libc to match.
RUN CGO_ENABLED=0 GOOS=linux go build \
        -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
        -o /out/core-ledger ./core-ledger/cmd/server \
 && CGO_ENABLED=0 GOOS=linux go build \
        -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
        -o /out/core-ledger-worker ./core-ledger/cmd/worker \
 && CGO_ENABLED=0 GOOS=linux go build \
        -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
        -o /out/core-ledger-reconcile ./core-ledger/cmd/reconcile

FROM alpine:3.21

# TLS roots: both chain clients dial HTTPS RPC endpoints, and scratch has none.
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 -h /app app

COPY --from=build /out/core-ledger        /usr/local/bin/core-ledger
COPY --from=build /out/core-ledger-worker /usr/local/bin/core-ledger-worker
COPY --from=build /out/core-ledger-reconcile /usr/local/bin/core-ledger-reconcile

USER app
WORKDIR /app

EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/core-ledger"]

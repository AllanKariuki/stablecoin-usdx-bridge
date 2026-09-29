# services/signer, built from the repository root — go.work spans this module
# and shared/go/platform.
#
#   docker build -f services/signer/Dockerfile -t usdx/signer .

FROM golang:1.26-alpine AS build

WORKDIR /src

COPY go.work go.work.sum ./
COPY core-ledger/go.mod core-ledger/go.sum ./core-ledger/
COPY shared/go/platform/go.mod shared/go/platform/go.sum ./shared/go/platform/
COPY shared/authz/go.mod shared/authz/go.sum ./shared/authz/
COPY services/auth-proxy/go.mod services/auth-proxy/go.sum ./services/auth-proxy/
COPY services/indexer/go.mod services/indexer/go.sum ./services/indexer/
COPY services/signer/go.mod services/signer/go.sum ./services/signer/
RUN go mod download

COPY core-ledger ./core-ledger
COPY shared ./shared
COPY services ./services

ARG VERSION=dev
ARG COMMIT=none

RUN CGO_ENABLED=0 GOOS=linux go build \
        -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
        -o /out/signer ./services/signer/cmd/server

FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 -h /app app

COPY --from=build /out/signer /usr/local/bin/signer

USER app
WORKDIR /app

# The policy is mounted, not baked. It is a document somebody reviews — and
# baking it would mean raising a ceiling requires a rebuild, which is the
# pressure under which somebody instead disables the check.
#
# Key material is never in this image and never on its filesystem: the
# backends that matter (vault, fireblocks) hold it elsewhere, and the one that
# doesn't refuses to start outside ENV=local.

EXPOSE 8084
ENTRYPOINT ["/usr/local/bin/signer"]

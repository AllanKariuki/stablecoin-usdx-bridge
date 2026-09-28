# services/indexer, built from the repository root the same way core-ledger is
# — go.work spans this module and shared/go/platform, and a context rooted in
# this directory cannot see either.
#
#   docker build -f services/indexer/Dockerfile -t usdx/indexer .

FROM golang:1.26-alpine AS build

WORKDIR /src

COPY go.work go.work.sum ./
COPY core-ledger/go.mod core-ledger/go.sum ./core-ledger/
COPY shared/go/platform/go.mod shared/go/platform/go.sum ./shared/go/platform/
COPY shared/authz/go.mod shared/authz/go.sum ./shared/authz/
COPY services/auth-proxy/go.mod services/auth-proxy/go.sum ./services/auth-proxy/
COPY services/indexer/go.mod services/indexer/go.sum ./services/indexer/
RUN go mod download

COPY core-ledger ./core-ledger
COPY shared ./shared
COPY services ./services

ARG VERSION=dev
ARG COMMIT=none

RUN CGO_ENABLED=0 GOOS=linux go build \
        -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
        -o /out/indexer ./services/indexer/cmd/server

FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 -h /app app

COPY --from=build /out/indexer /usr/local/bin/indexer

# The USDX ABI is read at runtime (USDX_ABI_PATH), not embedded: it lives at
# shared/abi/USDX.json, outside this Go module, and go:embed cannot cross a
# module boundary. Baking it into the image at a fixed path keeps the
# container self-contained while leaving the file itself a single source of
# truth that CI diffs against `forge build` output.
COPY shared/abi/USDX.json /app/abi/USDX.json

USER app
WORKDIR /app

EXPOSE 8083
ENTRYPOINT ["/usr/local/bin/indexer"]

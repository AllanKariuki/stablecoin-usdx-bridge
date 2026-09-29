# services/audit-trail, built from the repository root — go.work spans this
# module and shared/go/platform.
#
#   docker build -f services/audit-trail/Dockerfile -t usdx/audit-trail .

FROM golang:1.26-alpine AS build

WORKDIR /src

COPY go.work go.work.sum ./
COPY core-ledger/go.mod core-ledger/go.sum ./core-ledger/
COPY shared/go/platform/go.mod shared/go/platform/go.sum ./shared/go/platform/
COPY shared/authz/go.mod shared/authz/go.sum ./shared/authz/
COPY services/auth-proxy/go.mod services/auth-proxy/go.sum ./services/auth-proxy/
COPY services/indexer/go.mod services/indexer/go.sum ./services/indexer/
COPY services/signer/go.mod services/signer/go.sum ./services/signer/
COPY services/audit-trail/go.mod services/audit-trail/go.sum ./services/audit-trail/
RUN go mod download

COPY core-ledger ./core-ledger
COPY shared ./shared
COPY services ./services

ARG VERSION=dev
ARG COMMIT=none

RUN CGO_ENABLED=0 GOOS=linux go build \
        -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
        -o /out/audit-trail ./services/audit-trail/cmd/server

FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 -h /app app

COPY --from=build /out/audit-trail /usr/local/bin/audit-trail

USER app
WORKDIR /app

EXPOSE 8085
ENTRYPOINT ["/usr/local/bin/audit-trail"]

/**
 * Checker reports whether a dependency (database, chain RPC, cache) is
 * currently usable by resolving (healthy) or rejecting/throwing (unhealthy).
 * Direct counterpart of shared/go/platform/health.go's
 * `type Checker func(ctx context.Context) error`. Should be fast and
 * side-effect-free — /readyz may be polled every few seconds by a load
 * balancer.
 */
export type Checker = (signal?: AbortSignal) => Promise<void>;

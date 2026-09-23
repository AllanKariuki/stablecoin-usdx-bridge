/**
 * Augments Express's Request with the fields the platform chain reads/writes:
 * `id` is assigned by pino-http's `genReqId` (configured in logging.module.ts
 * to read an inbound x-request-id or mint one — see RequestIdInterceptor's
 * doc comment for why pino-http, not a separate earlier middleware, owns
 * this), `traceId` by OtelInterceptor.
 *
 * Augmenting `express-serve-static-core` (not `express`) deliberately: as of
 * @types/express v5, `express`'s own Request/Response interfaces merely
 * `extends core.Request`/`core.Response` from express-serve-static-core
 * rather than re-exporting it, and only `express-serve-static-core` itself
 * — not `express` — actually exports `Request`/`Response` as named types at
 * all. Since interface augmentation only merges into the interface it
 * names, augmenting `express-serve-static-core` here is what actually flows
 * through to every `Request` this package imports (all from
 * `express-serve-static-core` directly, for the same reason).
 *
 * The `export {}` below is load-bearing: without at least one top-level
 * import/export, TS treats this file as a global ambient *script* rather
 * than a module, and a `declare module 'x' {}` written from script context
 * *replaces* module 'x' wholesale instead of merging into it — which
 * silently deletes every real property (including Response entirely) from
 * express-serve-static-core's actual types, leaving only the two fields
 * added below. Reproduced and confirmed in isolation before landing this.
 */
export {};

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
    traceId?: string;
  }
}

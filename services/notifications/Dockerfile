# services/notifications, built from the repository root: pnpm-workspace.yaml spans
# this package and @damp/nest-platform, and a context rooted in this directory
# cannot see the workspace root or the lockfile.
#
#   docker build -f services/notifications/Dockerfile -t usdx/notifications .

FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /src

# Manifests first, so `pnpm install` is cached against dependency changes
# rather than invalidated by every source edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/node/nest-platform/package.json ./shared/node/nest-platform/
COPY services/notifications/package.json ./services/notifications/
RUN pnpm install --frozen-lockfile --filter @damp/nest-platform... --filter @damp/notifications...

COPY shared/node/nest-platform ./shared/node/nest-platform
COPY services/notifications ./services/notifications

# nest-platform is a workspace dependency consumed from its `dist`, so it has
# to be built before the service that imports it.
RUN pnpm --filter @damp/nest-platform build \
 && pnpm --filter @damp/notifications build \
 && pnpm --filter @damp/notifications --prod deploy /out

FROM node:22-alpine

RUN adduser -D -u 10001 -h /app app
WORKDIR /app

COPY --from=build --chown=app:app /out/node_modules ./node_modules
COPY --from=build --chown=app:app /out/dist ./dist
# migrations/ is read at runtime from two directories above the compiled
# db.service.js, not bundled into dist — the same arrangement identity uses,
# and the reason DbService resolves its path relative to __dirname.
COPY --from=build --chown=app:app /src/services/notifications/migrations ./migrations

USER app
# 3000 carries both the REST surface and the WebSocket at /ws — the port
# frontend/public/runtime-config.js has always declared.
EXPOSE 3000
CMD ["node", "dist/main.js"]

# Multi-stage build for the Fastify backend.
# Stage 1 installs the pnpm workspace + builds @field-iq/schema and the
# backend's dist; stage 2 ships only the runtime artefacts + production deps.

FROM node:22-alpine AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /repo

# Copy the workspace manifest first so docker layer-cache stays warm across
# code-only edits.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY packages/mock-demo/package.json packages/mock-demo/
COPY services/backend/package.json services/backend/

RUN pnpm install --frozen-lockfile

# Now copy source for the packages backend depends on and build.
COPY packages/schema packages/schema
COPY services/backend services/backend

RUN pnpm --filter @field-iq/schema build \
 && pnpm --filter @field-iq/backend build

# ---- Runtime ----
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /repo

COPY --from=builder /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/package.json /repo/tsconfig.base.json ./
COPY --from=builder /repo/packages/schema/package.json packages/schema/package.json
COPY --from=builder /repo/packages/schema/dist packages/schema/dist
COPY --from=builder /repo/services/backend/package.json services/backend/package.json
COPY --from=builder /repo/services/backend/dist services/backend/dist
COPY --from=builder /repo/services/backend/drizzle services/backend/dist/drizzle
COPY --from=builder /repo/services/backend/seed services/backend/seed

# Production deps only (skips drizzle-kit, vitest, tsx, etc.).
RUN pnpm install --prod --frozen-lockfile --filter @field-iq/backend...

EXPOSE 3000

# Railway provides $PORT; entrypoint optionally runs migrations + seed on
# first boot when RUN_MIGRATIONS_ON_BOOT=true is set.
WORKDIR /repo/services/backend
CMD ["node", "dist/src/server.js"]

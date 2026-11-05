# syntax=docker/dockerfile:1
# HanaBrew API image. Build from the repo root:
#   docker build -f infrastructure/docker/api.Dockerfile -t hanabrew-api .
# Targets: `runner` (default, the API) and `migrate` (one-shot Prisma migration job).
# NOTE: written for this repo but NOT yet exercised in the authoring sandbox (no Docker there).

ARG NODE_IMAGE=node:22.22-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

# ---- full install + build -------------------------------------------------------------
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @hanabrew/contracts build \
 && pnpm --filter @hanabrew/ai-core build \
 && pnpm --filter @hanabrew/database build \
 && pnpm --filter @hanabrew/api build

# ---- migration job: has the Prisma CLI; run once per deploy, never per API replica -----
FROM build AS migrate
WORKDIR /repo/packages/database
USER node
CMD ["pnpm", "db:migrate:deploy"]

# ---- production dependencies only ------------------------------------------------------
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/ai-core/package.json packages/ai-core/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@hanabrew/api..."

# ---- runtime ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /repo/packages/ai-core/node_modules ./packages/ai-core/node_modules
COPY --from=prod-deps /repo/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=prod-deps /repo/packages/database/node_modules ./packages/database/node_modules
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/packages/ai-core/package.json ./packages/ai-core/package.json
COPY --from=build /repo/packages/ai-core/dist ./packages/ai-core/dist
COPY --from=build /repo/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /repo/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /repo/packages/database/package.json ./packages/database/package.json
COPY --from=build /repo/packages/database/dist ./packages/database/dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]

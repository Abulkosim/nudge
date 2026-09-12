FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/pnpm/corepack
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/miniapp/package.json apps/miniapp/package.json
COPY packages/shared packages/shared
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile
COPY apps/server apps/server
COPY apps/miniapp apps/miniapp
RUN pnpm build

FROM base AS production-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/miniapp/package.json apps/miniapp/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm --filter @nudge/server... install --prod --frozen-lockfile --ignore-scripts

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=production-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/packages/shared/dist packages/shared/dist
COPY --from=build --chown=node:node /app/apps/server/dist apps/server/dist
COPY --from=build --chown=node:node /app/apps/miniapp/dist apps/miniapp/dist
COPY --from=build --chown=node:node /app/apps/server/prisma apps/server/prisma
COPY --from=build --chown=node:node /app/apps/server/prisma.config.ts apps/server/prisma.config.ts
USER node
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate:deploy && exec node dist/index.js"]

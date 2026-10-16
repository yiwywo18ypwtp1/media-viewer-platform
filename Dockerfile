# syntax=docker/dockerfile:1.7
# One Dockerfile, several targets: web, worker, migrate (production) and dev.
# Stages: deps -> build -> runtime images that copy only build output.

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN chown node:node /app
USER node

# --- Dependencies: re-runs only when package*.json change. ---
FROM base AS deps
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm ci --no-audit --no-fund

# --- Build: Next standalone + bundled worker and migrate scripts. ---
FROM deps AS build
COPY --chown=node:node . .
RUN npm run build && npm run build:worker

# --- Dev: full sources are bind-mounted by docker-compose.dev.yml. ---
FROM deps AS dev
USER root
RUN apk add --no-cache ffmpeg
USER node
# Created here so the anonymous /app/.next volume inherits node ownership.
RUN mkdir .next

# --- Runtime: web ---
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
# /api/health also checks Postgres, Redis and S3, so "healthy" means "can serve".
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]

# --- Runtime: worker (ffmpeg + one bundled JS file, no node_modules) ---
FROM ${NODE_IMAGE} AS worker
RUN apk add --no-cache ffmpeg
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/worker.js ./
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
    CMD node -e "const age = Date.now() - require('fs').statSync('/tmp/worker-heartbeat').mtimeMs; process.exit(age < 20000 ? 0 : 1)"
CMD ["node", "worker.js"]

# --- Runtime: one-shot migrations (+ seed later) ---
FROM ${NODE_IMAGE} AS migrate
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/migrate.js ./
COPY --from=build --chown=node:node /app/drizzle ./drizzle
USER node
CMD ["node", "migrate.js"]

# --- e2e: Playwright tests in a container (compose profile "e2e") ---
# Microsoft's image has the browsers and their system libraries. Its version
# must match @playwright/test in package.json.
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS e2e
WORKDIR /e2e
RUN chown pwuser:pwuser /e2e
USER pwuser
# Only the test runner, not the app's dependencies.
RUN --mount=type=cache,target=/home/pwuser/.npm,uid=1001,gid=1001 \
    npm init -y >/dev/null && npm install --no-audit --no-fund @playwright/test@1.64.1
COPY --chown=pwuser:pwuser playwright.config.ts ./
COPY --chown=pwuser:pwuser e2e ./e2e
CMD ["npx", "playwright", "test"]

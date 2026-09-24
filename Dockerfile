# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat \
  && corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# El driver de Postgres lo usan solo los scripts de mantenimiento, nunca el
# servidor, así que el trace de Next no lo incluye en .next/standalone. Se
# instala aparte, plano, para poder fusionarlo con el node_modules del runner.
FROM base AS pgdriver
WORKDIR /tools
RUN npm init -y > /dev/null \
  && npm install --omit=dev --no-audit --no-fund pg@8.23.0

# drizzle-orm lo usa el servidor (bundleado por webpack dentro de .next/server,
# por eso no queda en node_modules del standalone) y también los scripts de
# job/mantenimiento que corren fuera del bundle de Next (E0:
# scripts/job-diagnostico.mjs). Sin esto esos scripts fallan con "Cannot find
# package 'drizzle-orm'" al correr con `docker exec`.
FROM base AS dbtools
WORKDIR /tools
RUN npm init -y > /dev/null \
  && npm install --omit=dev --no-audit --no-fund drizzle-orm@0.45.2

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache wget \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Herramientas de operación del espejo de datos (ge.sqlite) y jobs batch de
# infraestructura (E0: scripts/job-diagnostico.mjs, ejecución finita con lease
# e idempotencia sobre infra_job_run). El servidor no las usa: se ejecutan con
# `docker exec <contenedor> node scripts/job-diagnostico.mjs`. Sin esto,
# scripts/ y lib/ no existen en la imagen y ningún job puede correr.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
# El driver de Postgres va aparte: como ningún código de servidor lo importa,
# el trace de Next no lo deja en .next/standalone y el importador del padrón no
# arranca sin él.
COPY --from=pgdriver --chown=nextjs:nodejs /tools/node_modules/. ./node_modules/
COPY --from=dbtools --chown=nextjs:nodejs /tools/node_modules/. ./node_modules/

ENV DATA_DIR=/data
RUN mkdir -p /data/uploads && chown -R nextjs:nodejs /data
VOLUME ["/data"]

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]

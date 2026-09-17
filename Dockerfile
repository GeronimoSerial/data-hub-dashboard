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

# Herramientas de operación del espejo de datos (ge.sqlite). El servidor no las
# usa: se ejecutan con `docker exec` para poblar /data en una instalación nueva.
# Sin esto, scripts/ y lib/ no existen en la imagen y el espejo no se puede cargar.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
# El driver de Postgres va aparte: como ningún código de servidor lo importa,
# el trace de Next no lo deja en .next/standalone y el importador del padrón no
# arranca sin él.
COPY --from=pgdriver --chown=nextjs:nodejs /tools/node_modules/. ./node_modules/

ENV DATA_DIR=/data
RUN mkdir -p /data/uploads && chown -R nextjs:nodejs /data
VOLUME ["/data"]

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]

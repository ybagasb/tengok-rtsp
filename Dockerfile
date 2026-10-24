# Node 22 = sama dengan .nvmrc; maplibre-gl (via @mapbox/jsonlint-lines-primitives) mensyaratkan node >= 22.
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Jaringan di dalam Docker kadang putus (ECONNRESET) saat unduh paket.
# - Cache npm disimpan lewat BuildKit cache mount, jadi paket yang sudah terunduh
#   tidak diunduh ulang pada percobaan berikutnya (retry benar-benar membuat progres).
# - npm ci diulang sampai 5x; timeout & retry bawaan npm juga diperbesar.
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 300000 \
    && for i in 1 2 3 4 5; do \
         npm ci --no-audit --no-fund --prefer-offline && exit 0; \
         echo "npm ci gagal (percobaan $i/5), mencoba lagi dalam 10 detik..."; \
         sleep 10; \
       done; exit 1
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache ffmpeg

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public

RUN mkdir -p .next public/streams && chown -R nextjs:nodejs .next public/streams

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

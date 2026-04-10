# Çok aşamalı NestJS Dockerfile — tüm NestJS servisleri için
ARG SERVICE_NAME

FROM node:20-alpine AS base
# corepack, package.json'daki "packageManager" alanını okuyarak
# her ortamda (CI, Docker, local) aynı pnpm versiyonunu garantiler.
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# ── AŞAMA 1: Tüm iç paketleri derle (servis bağımsız) ───────────────────────
FROM base AS packages-builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
# Tüm paketlerin bağımlılıklarını yükle
RUN pnpm install --frozen-lockfile \
  --filter @enkap/shared-types \
  --filter @enkap/database \
  --filter @enkap/health \
  --filter @enkap/mailer \
  --filter @enkap/reporting
# Bağımlılık sırasına göre derle
RUN pnpm --filter @enkap/shared-types build
RUN pnpm --filter @enkap/database build
RUN pnpm --filter @enkap/health build
RUN pnpm --filter @enkap/mailer build
RUN pnpm --filter @enkap/reporting build

# ── AŞAMA 2: Servis bağımlılıklarını yükle ──────────────────────────────────
FROM base AS deps
ARG SERVICE_NAME
WORKDIR /app
# bcrypt ve diğer native addon'ları kaynak koddan derlemek için build araçları
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY tsconfig.base.json ./
# Derlenmiş dist/ dahil paketleri packages-builder'dan al
COPY --from=packages-builder /app/packages ./packages
COPY apps/${SERVICE_NAME}/package.json ./apps/${SERVICE_NAME}/
RUN pnpm install --frozen-lockfile --filter @enkap/${SERVICE_NAME}...

# ── AŞAMA 3: Servis kaynak kodunu derle ─────────────────────────────────────
FROM base AS builder
ARG SERVICE_NAME
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY tsconfig.base.json ./
COPY apps/${SERVICE_NAME}/ ./apps/${SERVICE_NAME}/
# @enkap/* paketleri packages/*/dist/'den çözümlenir (önceden derlenmiş)
# pnpm workspace resolution yerine tsc doğrudan çağrılır — lock dosyası gerektirmez
RUN cd apps/${SERVICE_NAME} && node ../../node_modules/typescript/bin/tsc -p tsconfig.json

# ── AŞAMA 4: Üretim imajı ────────────────────────────────────────────────────
FROM node:20-alpine AS runner
ARG SERVICE_NAME
WORKDIR /app
ENV NODE_ENV=production
# Türkçe karakter desteği için DejaVu fontları (PDF raporlama)
RUN apk add --no-cache ttf-dejavu
COPY --from=builder /app/apps/${SERVICE_NAME}/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
# Workspace paketlerinin dist/ dosyaları için gerekli (symlink çözümlemesi)
COPY --from=builder /app/packages ./packages
EXPOSE ${PORT:-3000}
CMD ["node", "dist/main"]

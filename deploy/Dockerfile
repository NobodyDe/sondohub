# syntax=docker/dockerfile:1

# Um Dockerfile, duas imagens (targets): "api" e "hub".
# As duas saem do mesmo estágio "build": o monorepo é instalado e compilado uma vez só.

# ── base: Node + openssl (o Prisma lê a versão do openssl para escolher o engine certo) ──
FROM node:24-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# ── build: instala o workspace inteiro e compila na ordem das dependências ──
FROM base AS build
RUN npm install -g pnpm@12.11.2
WORKDIR /repo

# Só o lockfile primeiro: enquanto ele não mudar, o download das dependências vem do cache.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --offline

# O contracts vem primeiro porque a api e o hub importam o dist/ dele.
RUN pnpm --filter @sondohub/contracts build \
 && pnpm --filter api exec prisma generate \
 && pnpm --filter api build \
 && pnpm --filter hub build

# Pasta enxuta só com a api: dist/ + node_modules de produção, sem devDependencies nem os outros apps.
# O deploy cria um node_modules novo, então o client do Prisma precisa ser gerado de novo lá dentro.
RUN pnpm --filter api deploy --prod /out/api \
 && cd /out/api && node_modules/.bin/prisma generate

# ── api ──
FROM base AS api
ENV NODE_ENV=production
WORKDIR /app
# Os arquivos ficam do root e o processo roda como "node": a api lê o próprio código, mas não consegue alterá-lo.
COPY --from=build /out/api ./
USER node
EXPOSE 3100
CMD ["node", "dist/main.js"]

# ── hub: o build do Vite servido pelo nginx, que também repassa /api para a api ──
FROM nginx:1.30-alpine AS hub
COPY deploy/nginx/hub.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/hub/dist /usr/share/nginx/html

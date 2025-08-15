# syntax=docker/dockerfile:1.6

############################
# Base + workspace deps
############################
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
# Pin pnpm version
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

# Copy workspace manifests first (better caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json

############################
# Install workspace deps
############################
FROM base AS deps
# Allow prisma/esbuild scripts (in case your root package.json didn't already set this)
RUN pnpm config set enable-pre-post-scripts true
RUN pnpm -w install --frozen-lockfile

############################
# Build API
############################
FROM deps AS build-api
WORKDIR /app/server
# Copy server source & prisma schema
COPY server/tsconfig.json ./tsconfig.json
COPY server/src ./src
COPY server/prisma ./prisma

# Generate Prisma client & compile TypeScript
RUN pnpm prisma:generate
RUN pnpm build

############################
# API runtime image
############################
FROM node:20-alpine AS api
WORKDIR /app/server
ENV NODE_ENV=production
# runtime deps
COPY --from=deps /app/server/node_modules ./node_modules
# compiled js + prisma schema
COPY --from=build-api /app/server/dist ./dist
COPY --from=build-api /app/server/prisma ./prisma
# ensure a package.json exists (helpful for some tools)
COPY server/package.json ./package.json
EXPOSE 4000
CMD ["node", "dist/index.js"]

############################
# Build Web
############################
FROM deps AS build-web
WORKDIR /app/web
# copy entire web app
COPY web/ ./
# Build with API url injected
ARG NEXT_PUBLIC_API
ENV NEXT_PUBLIC_API=${NEXT_PUBLIC_API}
RUN pnpm build

############################
# Web runtime image
############################
FROM node:20-alpine AS web
WORKDIR /app/web
ENV NODE_ENV=production
# runtime deps
COPY --from=deps /app/web/node_modules ./node_modules
# compiled Next.js output
COPY --from=build-web /app/web/.next ./.next
COPY web/public ./public
COPY web/next.config.mjs ./next.config.mjs
COPY web/package.json ./package.json
EXPOSE 3000
# expects "start": "next start -p 3000" in web/package.json
CMD ["pnpm", "start"]

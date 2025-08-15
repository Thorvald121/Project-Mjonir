# syntax=docker/dockerfile:1.6
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
RUN pnpm config set enable-pre-post-scripts true

# Install deps first (cacheable)
COPY server/package.json ./
RUN pnpm install --no-frozen-lockfile

# Copy source & prisma
COPY server/tsconfig.json ./tsconfig.json
COPY server/prisma ./prisma
COPY server/src ./src

# Build
RUN pnpm prisma:generate
RUN pnpm build

EXPOSE 4000
CMD ["node", "dist/index.js"]

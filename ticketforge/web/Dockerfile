# syntax=docker/dockerfile:1.6
FROM node:20-alpine

WORKDIR /app

# Pin pnpm
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

# Copy the whole app FIRST (safe because .dockerignore blocks node_modules/.next)
COPY web/ ./

# Install deps (no frozen lockfile in local dev)
RUN pnpm install --no-frozen-lockfile

# Build with API URL injected
ARG NEXT_PUBLIC_API=http://localhost:4000
ENV NEXT_PUBLIC_API=${NEXT_PUBLIC_API}
RUN pnpm build

EXPOSE 3000
# requires "start": "next start -p 3000"
CMD ["pnpm", "start"]

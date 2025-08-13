# Frostfall Desk (MVP)

- Frontend (Next.js): http://localhost:3000
- Backend (Express): http://localhost:4000
- MailHog (dev emails): http://localhost:8025
- Postgres: localhost:5432  (app/app, db: ticketing)
- Redis: localhost:6379

## Quick start
docker compose up -d

cd server
pnpm i
pnpm prisma:generate
pnpm prisma:push
pnpm dev

# In new terminal
cd web
pnpm i
pnpm dev

## Seed a first admin
POST http://localhost:4000/auth/register
{ "email":"admin@frostfall.local", "name":"Admin", "password":"admin123", "role":"ADMIN" }

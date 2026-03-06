# TicketForge Clean

A cleaned restart of TicketForge focused on a ticketing-first help desk MVP inspired by Atera's PSA/service desk direction.

## Stack

- Next.js App Router
- Prisma
- Supabase Postgres
- pnpm workspaces
- TypeScript

## Why this shape

This repo intentionally replaces the old split Express + Next + Docker-first setup with a simpler structure:

- `apps/web` = UI + API route handlers
- `packages/db` = Prisma schema, seed, shared client
- `docs` = architecture notes

That keeps the project portable across macOS and Linux and avoids a monolithic file layout.

## Quick start

1. Install Node.js 20+ and pnpm.
2. Copy `.env.example` to `.env.local` in `apps/web` and fill in your Supabase connection strings.
3. Copy `.env.example` to `.env` in `packages/db` and fill in the same database values.
4. Run `pnpm install`.
5. Run `pnpm db:generate`.
6. Run `pnpm db:migrate`.
7. Run `pnpm db:seed`.
8. Run `pnpm dev`.

## Demo login

This scaffold uses a lightweight cookie-based demo session for now.

- Seeded admin email: `admin@ticketforge.local`
- Seeded agent email: `agent@ticketforge.local`

Visit `/login`, enter one of those emails, and the app will create a demo session cookie.

## Notes

- No Docker is required for normal development.
- The schema is intentionally ticketing-first.
- Billing, RMM, and email ingestion are deferred.

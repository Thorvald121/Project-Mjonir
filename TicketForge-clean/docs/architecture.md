# Architecture

## Current phase

Ticketing-first MVP.

## Folder design

- `apps/web/app` route segments and API handlers
- `apps/web/components` small UI building blocks
- `apps/web/lib/server` server-only business logic
- `apps/web/lib/client` browser helpers
- `packages/db` Prisma schema, seed, shared client package

## Deliberate exclusions

- No separate API server
- No Docker requirement
- No giant utilities folder
- No multi-purpose mega components

## Next targets

1. Real auth
2. Attachment storage in Supabase
3. SLA policy editor
4. Automation rules
5. Requester portal

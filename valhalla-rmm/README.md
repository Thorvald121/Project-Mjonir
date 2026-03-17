# Valhalla RMM — Monorepo

Full-stack MSP platform. Web admin dashboard (Next.js) + iOS/Android technician app (Expo) sharing a single Supabase backend.

---

## Repository Structure

```
valhalla-rmm/
├── apps/
│   ├── web/          Next.js 14 — admin dashboard (deploys to Vercel)
│   └── mobile/       Expo SDK 51 — technician app (App Store + Google Play)
├── packages/
│   ├── db/           Supabase client + typed query helpers
│   ├── hooks/        Shared TanStack Query hooks
│   ├── types/        TypeScript interfaces for all entities
│   └── utils/        Pure shared utilities (dates, currency, SLA)
└── supabase/         SQL migrations + Edge Functions (see /supabase/README.md)
```

---

## Prerequisites

- Node.js 18+
- pnpm 9+ — `npm install -g pnpm`
- Supabase project (see `/supabase/README.md`)
- For mobile: Expo CLI — `npm install -g expo-cli`
- For iOS builds: Apple Developer account ($99/year)
- For Android builds: Google Play Console ($25 one-time)

---

## First-Time Setup

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_ORG/valhalla-rmm.git
cd valhalla-rmm

# 2. Install all dependencies across the monorepo
pnpm install

# 3. Set up environment variables
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env

# Fill in your Supabase URL and anon key in both files
```

---

## Running Locally

```bash
# Run the web dashboard only
pnpm --filter @valhalla/web dev
# → http://localhost:3000

# Run the mobile app only
pnpm --filter @valhalla/mobile start
# → Scan QR code with Expo Go app

# Run both simultaneously (Turborepo)
pnpm dev
```

---

## Web App (apps/web)

Built with Next.js 14 App Router.

**Environment variables** (`apps/web/.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Deploy to Vercel:**
1. Push to GitHub
2. Import repo at vercel.com/new
3. Set root directory to `apps/web`
4. Add environment variables in Vercel dashboard
5. Deploy — auto-deploys on every push to `main`

---

## Mobile App (apps/mobile)

Built with Expo SDK 51 + Expo Router.

**Environment variables** (`apps/mobile/.env`):
```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

**Run on device during development:**
```bash
# Install Expo Go on your phone, then:
pnpm --filter @valhalla/mobile start
# Scan the QR code
```

**Build for App Store / Google Play:**
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo account (create at expo.dev if needed)
eas login

# Configure project (first time only)
eas build:configure

# Build for iOS (requires Apple Developer account)
eas build --platform ios

# Build for Android
eas build --platform android
```

---

## Shared Packages

| Package | Import | Description |
|---|---|---|
| `@valhalla/types` | `import type { Ticket } from '@valhalla/types'` | All entity TypeScript interfaces |
| `@valhalla/utils` | `import { formatDate } from '@valhalla/utils'` | Date, currency, SLA, string helpers |
| `@valhalla/db` | `import { supabase } from '@valhalla/db'` | Supabase client + typed query functions |
| `@valhalla/hooks` | `import { useTickets } from '@valhalla/hooks'` | Shared TanStack Query hooks |

---

## Database & Functions

See `/supabase/README.md` for:
- Running migrations
- Deploying Edge Functions
- Setting secrets
- Configuring pg_cron schedules

---

## Adding a New Page (Web)

1. Create `apps/web/src/app/(admin)/your-page/page.tsx`
2. Add a nav item to `apps/web/src/app/(admin)/layout.tsx`
3. Add a query function to `packages/db/src/queries/your-entity.ts`
4. Add a hook to `packages/hooks/src/use-your-entity.ts`
5. Export from both package index files

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web | Next.js 14, Tailwind CSS, shadcn/ui |
| Mobile | Expo SDK 51, React Native, NativeWind |
| Database | Supabase (Postgres 15) with RLS |
| Auth | Supabase Auth (email, Google, Apple) |
| State | TanStack Query v5 |
| Functions | Supabase Edge Functions (Deno) |
| Email | Resend |
| AI | Anthropic Claude API |
| CI/CD | Vercel (web) + EAS Build (mobile) |

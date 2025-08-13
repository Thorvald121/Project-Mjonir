#!/usr/bin/env bash
set -euo pipefail

# ==========================================
# TicketForge — full-stack MVP bootstrapper
# ==========================================

# --- Basic checks ---
if ! command -v node >/dev/null 2>&1; then echo "Please install Node 18+."; exit 1; fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "Please enable pnpm (Node >=18 has Corepack):"
  echo "  corepack enable && corepack prepare pnpm@latest --activate"
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then echo "Please install Docker Desktop."; exit 1; fi

APP_NAME="ticketforge"
mkdir -p "$APP_NAME" && cd "$APP_NAME"

# --- .gitignore ---
cat <<'EOF' > .gitignore
node_modules
pnpm-lock.yaml
.env
.env.local
/server/.env
/web/.env.local
/prisma-data
.DS_Store
EOF

# --- docker-compose.yml ---
cat <<'EOF' > docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: ticketing
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
  redis:
    image: redis:7
    ports: ["6379:6379"]
  mailhog:
    image: mailhog/mailhog
    ports: ["1025:1025", "8025:8025"]
volumes:
  pgdata:
EOF

# --- Root README ---
cat <<'EOF' > README.md
# TicketForge (MVP)

- Frontend (Next.js): http://localhost:3000
- Backend (Express): http://localhost:4000
- MailHog (dev emails): http://localhost:8025
- Postgres: localhost:5432  (app/app, db: ticketing)
- Redis: localhost:6379

## Quick start
docker compose up -d

cd server
cp .env.example .env
pnpm i
pnpm prisma:generate
pnpm prisma:push
pnpm dev

# In new terminal
cd web
pnpm i
pnpm dev

## Seed a first org and admin
POST http://localhost:4000/dev/seed-org
POST http://localhost:4000/auth/register
{ "email":"admin@ticketforge.local", "name":"Admin", "password":"admin123", "role":"ADMIN" }
EOF

# --- workspace root package.json ---
cat <<'EOF' > package.json
{
  "name": "ticketforge",
  "private": true,
  "workspaces": [
    "server",
    "web"
  ]
}
EOF

# ================================
# SERVER
# ================================
mkdir -p server/src/{routes,services,lib} server/prisma

cat <<'EOF' > server/package.json
{
  "name": "server",
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=18" },
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "prisma:generate": "prisma generate",
    "prisma:push": "prisma db push"
  },
  "dependencies": {
    "@prisma/client": "^5.17.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "nodemailer": "^6.9.13",
    "socket.io": "^4.7.5",
    "zod": "^3.23.8",
    "ioredis": "^5.4.1"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.2",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.14.11",
    "prisma": "^5.17.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.5.4"
  }
}
EOF

cat <<'EOF' > server/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
EOF

cat <<'EOF' > server/.env.example
DATABASE_URL="postgresql://app:app@localhost:5432/ticketing?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="dev_secret_change_me"
MAIL_HOST="localhost"
MAIL_PORT="1025"
MAIL_FROM="desk@ticketforge.local"
OPENAI_API_KEY=""
EOF

cat <<'EOF' > server/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role { ADMIN AGENT CLIENT }
enum TicketStatus { OPEN IN_PROGRESS RESOLVED CLOSED }
enum TicketPriority { LOW MEDIUM HIGH URGENT }
enum InvoiceStatus { DRAFT SENT PAID VOID }

model Organization {
  id        String   @id @default(cuid())
  name      String
  domain    String?  @unique
  clients   Client[]
  users     User[]
  tickets   Ticket[]
  assets    Asset[]
  invoices  Invoice[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String
  passwordHash  String
  role          Role     @default(AGENT)
  organization  Organization? @relation(fields: [organizationId], references: [id])
  organizationId String?
  ticketsAssigned Ticket[] @relation("assignedTickets")
  ticketsRequested Ticket[] @relation("requestedTickets")
  comments      TicketComment[]
  timeEntries   TimeEntry[]
  notifications Notification[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Client {
  id            String   @id @default(cuid())
  name          String
  email         String?
  organization  Organization @relation(fields: [organizationId], references: [id])
  organizationId String
  tickets       Ticket[]
  assets        Asset[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Ticket {
  id           String   @id @default(cuid())
  title        String
  description  String
  status       TicketStatus @default(OPEN)
  priority     TicketPriority @default(MEDIUM)
  requester    User?    @relation("requestedTickets", fields: [requesterId], references: [id])
  requesterId  String?
  assignee     User?    @relation("assignedTickets", fields: [assigneeId], references: [id])
  assigneeId   String?
  client       Client?  @relation(fields: [clientId], references: [id])
  clientId     String?
  organization Organization @relation(fields: [organizationId], references: [id])
  organizationId String
  dueAt        DateTime?
  comments     TicketComment[]
  timeEntries  TimeEntry[]
  remoteSessions RemoteSession[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model TicketComment {
  id        String   @id @default(cuid())
  ticket    Ticket   @relation(fields: [ticketId], references: [id])
  ticketId  String
  author    User?    @relation(fields: [authorId], references: [id])
  authorId  String?
  body      String
  isPublic  Boolean  @default(true)
  createdAt DateTime @default(now())
}

model TimeEntry {
  id        String   @id @default(cuid())
  ticket    Ticket   @relation(fields: [ticketId], references: [id])
  ticketId  String
  user      User     @relation(fields: [userId], references: [id])
  userId    String
  minutes   Int
  notes     String?
  billableRate Int?  // cents per minute (captures historical rate)
  createdAt DateTime @default(now())
}

model Invoice {
  id         String   @id @default(cuid())
  organization Organization @relation(fields: [organizationId], references: [id])
  organizationId String
  status     InvoiceStatus @default(DRAFT)
  periodStart DateTime
  periodEnd   DateTime
  totalCents  Int @default(0)
  currency    String @default("USD")
  lines       InvoiceLine[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model InvoiceLine {
  id         String   @id @default(cuid())
  invoice    Invoice  @relation(fields: [invoiceId], references: [id])
  invoiceId  String
  description String
  quantity   Int     @default(1)
  unitCents  Int     @default(0)
  totalCents Int     @default(0)
  ticketId   String?
  timeEntryId String?
}

model Asset {
  id            String   @id @default(cuid())
  organization  Organization @relation(fields: [organizationId], references: [id])
  organizationId String
  client        Client? @relation(fields: [clientId], references: [id])
  clientId      String?
  name          String
  type          String
  serialNumber  String?
  software      SoftwareAsset[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model SoftwareAsset {
  id         String   @id @default(cuid())
  asset      Asset    @relation(fields: [assetId], references: [id])
  assetId    String
  name       String
  version    String?
  licenseKey String?
  seats      Int? 
  expiry     DateTime?
}

model Notification {
  id        String   @id @default(cuid())
  user      User     @relation(fields: [userId], references: [id])
  userId    String
  type      String
  payload   Json
  readAt    DateTime?
  createdAt DateTime @default(now())
}

model RemoteSession {
  id        String   @id @default(cuid())
  ticket    Ticket   @relation(fields: [ticketId], references: [id])
  ticketId  String
  code      String   @unique
  status    String   @default("PENDING") // PENDING | ACTIVE | ENDED
  startedAt DateTime?
  endedAt   DateTime?
  createdAt DateTime @default(now())
}
EOF

# --- server/src/lib/prisma.ts ---
cat <<'EOF' > server/src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();
EOF

# --- server/src/services/auth.ts ---
cat <<'EOF' > server/src/services/auth.ts
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

export function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as any;
}

export async function validateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return user;
}
EOF

# --- server/src/services/mailer.ts ---
cat <<'EOF' > server/src/services/mailer.ts
import nodemailer from "nodemailer";

const host = process.env.MAIL_HOST || "localhost";
const port = parseInt(process.env.MAIL_PORT || "1025", 10);
const from = process.env.MAIL_FROM || "desk@example.com";

export const mailer = nodemailer.createTransport({ host, port });

export async function sendMail(to: string, subject: string, html: string) {
  await mailer.sendMail({ from, to, subject, html });
}
EOF

# --- server/src/services/ai.ts ---
cat <<'EOF' > server/src/services/ai.ts
export async function aiSuggest(input: { title: string; description: string }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // Offline/dev fallback
    return {
      triage: "Categorize: Workstation • Impact: Single user • Priority: MEDIUM",
      steps: [
        "Confirm repro and collect basic facts (OS, device, recent changes).",
        "Check recent incidents for similar symptoms.",
        "Run quick health checks (disk, memory, network).",
        "Apply known fix or escalate with logs."
      ],
      notes: "Set due date based on client SLA; notify requester."
    };
  }
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an IT helpdesk triage assistant. Output concise triage, step-by-step resolution, and notes." },
        { role: "user", content: `Title: ${input.title}\nDescription: ${input.description}` }
      ],
      temperature: 0.2
    })
  });
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content ?? "No suggestion.";
  return { raw: text };
}
EOF

# --- server/src/services/realtime.ts ---
cat <<'EOF' > server/src/services/realtime.ts
import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";

export function initRealtime(httpServer: HTTPServer) {
  const io = new Server(httpServer, { cors: { origin: "http://localhost:3000", credentials: true } });
  io.on("connection", (socket) => {
    socket.on("subscribe", (room: string) => socket.join(room));
  });
  return io;
}
EOF

# --- server/src/routes/auth.ts ---
cat <<'EOF' > server/src/routes/auth.ts
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { signToken, validateUser } from "../services/auth.js";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const auth = Router();

auth.post("/register", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string(),
    password: z.string().min(6),
    role: z.enum(["ADMIN","AGENT","CLIENT"]).optional().default("ADMIN")
  });
  const body = schema.parse(req.body);
  const hash = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: { email: body.email, name: body.name, passwordHash: hash, role: body.role }
  });
  return res.json({ id: user.id, email: user.email });
});

auth.post("/login", async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string() });
  const { email, password } = schema.parse(req.body);
  const user = await validateUser(email, password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const token = signToken({ uid: user.id, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});
EOF

# --- server/src/routes/tickets.ts ---
cat <<'EOF' > server/src/routes/tickets.ts
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const tickets = Router();

const ticketCreate = z.object({
  title: z.string().min(3),
  description: z.string(),
  priority: z.enum(["LOW","MEDIUM","HIGH","URGENT"]).default("MEDIUM"),
  organizationId: z.string(),
  clientId: z.string().optional()
});

tickets.post("/", async (req, res) => {
  const body = ticketCreate.parse(req.body);
  const t = await prisma.ticket.create({
    data: {
      title: body.title,
      description: body.description,
      priority: body.priority,
      organizationId: body.organizationId,
      clientId: body.clientId
    }
  });
  res.json(t);
});

tickets.get("/", async (_req, res) => {
  const list = await prisma.ticket.findMany({
    orderBy: { createdAt: "desc" },
    include: { client: true }
  });
  res.json(list);
});

tickets.get("/:id", async (req, res) => {
  const t = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: { comments: { orderBy: { createdAt: "asc" } }, timeEntries: true, client: true }
  });
  if (!t) return res.status(404).json({ error: "Not found" });
  res.json(t);
});

tickets.post("/:id/comments", async (req, res) => {
  const schema = z.object({ body: z.string().min(1), isPublic: z.boolean().default(true), authorId: z.string().optional() });
  const data = schema.parse(req.body);
  const comment = await prisma.ticketComment.create({
    data: { ticketId: req.params.id, body: data.body, isPublic: data.isPublic, authorId: data.authorId }
  });
  res.json(comment);
});

tickets.post("/:id/time-entries", async (req, res) => {
  const schema = z.object({ userId: z.string(), minutes: z.number().int().positive(), notes: z.string().optional(), billableRate: z.number().int().optional() });
  const body = schema.parse(req.body);
  const te = await prisma.timeEntry.create({
    data: { ticketId: req.params.id, userId: body.userId, minutes: body.minutes, notes: body.notes, billableRate: body.billableRate ?? null }
  });
  res.json(te);
});
EOF

# --- server/src/routes/invoices.ts ---
cat <<'EOF' > server/src/routes/invoices.ts
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const invoices = Router();

invoices.post("/generate", async (req, res) => {
  const schema = z.object({
    organizationId: z.string(),
    periodStart: z.string(), // ISO
    periodEnd: z.string(),
    defaultRateCentsPerMinute: z.number().int().default(200) // $120/hr
  });
  const { organizationId, periodStart, periodEnd, defaultRateCentsPerMinute } = schema.parse(req.body);

  const entries = await prisma.timeEntry.findMany({
    where: {
      ticket: { organizationId },
      createdAt: { gte: new Date(periodStart), lte: new Date(periodEnd) }
    },
    include: { ticket: true }
  });

  let total = 0;
  const invoice = await prisma.invoice.create({
    data: {
      organizationId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      status: "DRAFT"
    }
  });

  for (const e of entries) {
    const rate = e.billableRate ?? defaultRateCentsPerMinute;
    const lineTotal = rate * e.minutes;
    total += lineTotal;
    await prisma.invoiceLine.create({
      data: {
        invoiceId: invoice.id,
        description: `Ticket ${e.ticket.title} — ${e.minutes} min`,
        quantity: e.minutes,
        unitCents: rate,
        totalCents: lineTotal,
        ticketId: e.ticketId,
        timeEntryId: e.id
      }
    });
  }

  await prisma.invoice.update({ where: { id: invoice.id }, data: { totalCents: total } });
  const full = await prisma.invoice.findUnique({ where: { id: invoice.id }, include: { lines: true } });
  res.json(full);
});
EOF

# --- server/src/routes/ai.ts ---
cat <<'EOF' > server/src/routes/ai.ts
import { Router } from "express";
import { z } from "zod";
import { aiSuggest } from "../services/ai.js";

export const ai = Router();

ai.post("/suggest", async (req, res) => {
  const schema = z.object({ title: z.string(), description: z.string() });
  const body = schema.parse(req.body);
  const suggestion = await aiSuggest(body);
  res.json(suggestion);
});
EOF

# --- server/src/routes/orgs-clients-assets.ts ---
cat <<'EOF' > server/src/routes/orgs-clients-assets.ts
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const orgs = Router();
export const clients = Router();
export const assets = Router();

// Orgs
orgs.post("/", async (req, res) => {
  const schema = z.object({ name: z.string(), domain: z.string().optional() });
  const data = schema.parse(req.body);
  res.json(await prisma.organization.create({ data }));
});
orgs.get("/", async (_req, res) => res.json(await prisma.organization.findMany({ orderBy: { name: "asc" } })));

// Clients
clients.post("/", async (req, res) => {
  const schema = z.object({ name: z.string(), email: z.string().email().optional(), organizationId: z.string() });
  const data = schema.parse(req.body);
  res.json(await prisma.client.create({ data }));
});
clients.get("/", async (_req, res) => res.json(await prisma.client.findMany({ include: { organization: true } })));

// Assets
assets.post("/", async (req, res) => {
  const schema = z.object({
    organizationId: z.string(),
    clientId: z.string().optional(),
    name: z.string(),
    type: z.string(),
    serialNumber: z.string().optional()
  });
  const data = schema.parse(req.body);
  res.json(await prisma.asset.create({ data }));
});
assets.get("/", async (_req, res) => res.json(await prisma.asset.findMany({ include: { organization: true, client: true, software: true } })));
EOF

# --- server/src/index.ts ---
cat <<'EOF' > server/src/index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { prisma } from "./lib/prisma.js";
import { auth } from "./routes/auth.js";
import { tickets } from "./routes/tickets.js";
import { invoices } from "./routes/invoices.js";
import { ai } from "./routes/ai.js";
import { orgs, clients, assets } from "./routes/orgs-clients-assets.js";
import { initRealtime } from "./services/realtime.js";

const app = express();
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", auth);
app.use("/tickets", tickets);
app.use("/invoices", invoices);
app.use("/ai", ai);
app.use("/orgs", orgs);
app.use("/clients", clients);
app.use("/assets", assets);

// Minimal seed org if none exists
app.post("/dev/seed-org", async (_req, res) => {
  const count = await prisma.organization.count();
  if (count > 0) return res.json({ skipped: true });
  const org = await prisma.organization.create({ data: { name: "TicketForge Demo", domain: "ticketforge.local" } });
  res.json({ created: org });
});

const server = http.createServer(app);
const io = initRealtime(server); // eslint-disable-line @typescript-eslint/no-unused-vars

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`API on :${PORT}`));
EOF

# ================================
# WEB (Next.js)
# ================================
mkdir -p web/app/{dashboard,tickets,portal,auth/login} web/app/tickets/'[id]' web/components web/lib web/public

cat <<'EOF' > web/package.json
{
  "name": "web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "@types/node": "^20.14.11",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.5.4"
  }
}
EOF

cat <<'EOF' > web/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "es2020"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": "."
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"]
}
EOF

cat <<'EOF' > web/next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
EOF

cat <<'EOF' > web/app/globals.css
:root { color-scheme: dark; }
html,body { margin:0; padding:0; font-family: ui-sans-serif,system-ui; background:#0b0b11; color:#e8e8f0; }
a { color:#b79cff; text-decoration:none; }
input,select,textarea { background:#12121a; border:1px solid #2a2a38; color:#e8e8f0; padding:.5rem .6rem; border-radius:.5rem; }
button { background:#6b5bd9; border:none; color:white; padding:.55rem .8rem; border-radius:.5rem; cursor:pointer; }
.card { background:#12121a; border:1px solid #1f1f2b; border-radius:1rem; padding:1rem; }
.grid { display:grid; gap:1rem; }
.row { display:flex; gap:.5rem; align-items:center; }
EOF

cat <<'EOF' > web/app/layout.tsx
import "./globals.css";
import Link from "next/link";

export const metadata = { title: "TicketForge" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body>
      <header style={{borderBottom:"1px solid #1f1f2b", padding: "0.75rem 1rem"}}>
        <div className="row" style={{justifyContent:"space-between"}}>
          <div className="row" style={{gap:"1rem"}}>
            <Link href="/">TicketForge</Link>
            <Link href="/tickets">Tickets</Link>
            <Link href="/portal">Client Portal</Link>
          </div>
          <div><Link href="/auth/login">Login</Link></div>
        </div>
      </header>
      <main style={{padding:"1rem"}}>{children}</main>
    </body></html>
  );
}
EOF

cat <<'EOF' > web/app/page.tsx
export default function Home() {
  return (
    <div className="grid" style={{maxWidth:900, margin:"0 auto"}}>
      <h1>TicketForge</h1>
      <div className="card">
        <p>Welcome. Use Tickets to create and track. Client Portal shows a client-only view.</p>
        <p>Backend expected at <code>http://localhost:4000</code>. Configure <code>NEXT_PUBLIC_API</code> if different.</p>
      </div>
    </div>
  );
}
EOF

cat <<'EOF' > web/app/auth/login/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API || "http://localhost:4000";

export default function LoginPage() {
  const [email,setEmail] = useState("admin@ticketforge.local");
  const [password,setPassword] = useState("admin123");
  const [error,setError] = useState<string|undefined>();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const r = await fetch(`${API}/auth/login`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ email, password }) });
    if(!r.ok){ setError("Login failed"); return; }
    const data = await r.json();
    localStorage.setItem("token", data.token);
    router.push("/tickets");
  }

  return (
    <div className="grid" style={{maxWidth:420, margin:"2rem auto"}}>
      <h2>Log in</h2>
      <form className="grid" onSubmit={onSubmit}>
        <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        {error && <div style={{color:"#ff7694"}}>{error}</div>}
        <button>Login</button>
      </form>
    </div>
  );
}
EOF

cat <<'EOF' > web/lib/api.ts
const API = process.env.NEXT_PUBLIC_API || "http://localhost:4000";

function authHeaders() {
  const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type":"application/json", ...(init?.headers||{}), ...authHeaders() },
    cache: "no-store"
  });
  if(!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
EOF

cat <<'EOF' > web/app/tickets/page.tsx
"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Ticket = {
  id: string; title: string; status: string; priority: string; createdAt: string;
  client?: { name: string | null }
};

export default function TicketsPage(){
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [title,setTitle] = useState("");
  const [description,setDescription] = useState("");
  const [orgId,setOrgId] = useState<string>("");
  const [ai,setAi] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const list = await api<Ticket[]>("/tickets");
      setTickets(list);
      const orgs = await api<any[]>("/orgs");
      if (orgs[0]?.id) setOrgId(orgs[0].id);
    })();
  },[]);

  async function create() {
    const t = await api<any>("/tickets", { method:"POST", body: JSON.stringify({ title, description, organizationId: orgId }) });
    setTickets([t, ...tickets]);
    setTitle(""); setDescription("");
  }
  async function suggest() {
    const data = await api<any>("/ai/suggest", { method:"POST", body: JSON.stringify({ title, description }) });
    setAi(data);
  }

  return (
  <div className="grid" style={{maxWidth:1000, margin:"0 auto"}}>
    <h2>Tickets</h2>
    <div className="card grid">
      <div className="grid" style={{gridTemplateColumns:"1fr 1fr", gap:"1rem"}}>
        <div className="grid">
          <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
          <textarea placeholder="Description" value={description} onChange={e=>setDescription(e.target.value)} rows={5} />
          <div className="row">
            <button onClick={create} disabled={!title || !orgId}>Create Ticket</button>
            <button onClick={suggest} disabled={!title && !description}>AI Suggest</button>
          </div>
        </div>
        <div className="card">
          <b>AI Suggestion</b>
          <pre style={{whiteSpace:"pre-wrap"}}>{ai ? JSON.stringify(ai, null, 2) : "—"}</pre>
        </div>
      </div>
    </div>

    <div className="grid">
      {tickets.map(t => (
        <a key={t.id} href={`/tickets/${t.id}`} className="card">
          <div className="row" style={{justifyContent:"space-between"}}>
            <div>
              <b>{t.title}</b>
              <div style={{opacity:.7, fontSize:12}}>{new Date(t.createdAt).toLocaleString()}</div>
            </div>
            <div className="row" style={{gap:".5rem"}}>
              <span>{t.priority}</span>
              <span>{t.status}</span>
              <span>{t.client?.name ?? ""}</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  </div>);
}
EOF

cat <<'EOF' > web/app/tickets/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

export default function TicketDetail() {
  const params = useParams<{ id: string }>();
  const [ticket,setTicket] = useState<any>(null);
  const [comment,setComment] = useState("");
  const [minutes,setMinutes] = useState(15);
  const [notes,setNotes] = useState("");

  async function load() {
    const t = await api<any>(`/tickets/${params.id}`);
    setTicket(t);
  }
  useEffect(() => { load(); },[]);

  async function addComment() {
    await api(`/tickets/${params.id}/comments`, { method:"POST", body: JSON.stringify({ body: comment, isPublic: true }) });
    setComment(""); await load();
  }

  async function addTime() {
    const userId = ticket?.requesterId ?? ticket?.assigneeId ?? null;
    if(!userId) { alert("No user to attach time to (seed a user and assign)."); return; }
    await api(`/tickets/${params.id}/time-entries`, { method:"POST", body: JSON.stringify({ userId, minutes: Number(minutes), notes }) });
    setNotes(""); await load();
  }

  if(!ticket) return <div>Loading…</div>;

  return (
    <div className="grid" style={{maxWidth:900, margin:"0 auto"}}>
      <h2>{ticket.title}</h2>
      <div className="card">
        <p>{ticket.description}</p>
        <div className="row" style={{gap:"1rem"}}>
          <span>Status: <b>{ticket.status}</b></span>
          <span>Priority: <b>{ticket.priority}</b></span>
        </div>
      </div>

      <div className="grid" style={{gridTemplateColumns:"1fr 1fr", gap:"1rem"}}>
        <div className="card">
          <b>Comments</b>
          <div className="grid">
            {ticket.comments.map((c: any) => (
              <div key={c.id} className="card"><div>{c.body}</div><div style={{opacity:.6, fontSize:12}}>{new Date(c.createdAt).toLocaleString()}</div></div>
            ))}
          </div>
          <div className="row" style={{marginTop:".5rem"}}>
            <input placeholder="Add a comment…" value={comment} onChange={e=>setComment(e.target.value)} />
            <button onClick={addComment} disabled={!comment}>Post</button>
          </div>
        </div>
        <div className="card">
          <b>Time Entries</b>
          <div className="grid">
            {ticket.timeEntries.map((te: any) => (
              <div key={te.id} className="card"><div>{te.minutes} min — {te.notes ?? "no notes"}</div><div style={{opacity:.6, fontSize:12}}>{new Date(te.createdAt).toLocaleString()}</div></div>
            ))}
          </div>
          <div className="row" style={{marginTop:".5rem"}}>
            <input type="number" min={1} value={minutes} onChange={e=>setMinutes(Number(e.target.value))} />
            <input placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)} />
            <button onClick={addTime}>Add Time</button>
          </div>
        </div>
      </div>
    </div>
  );
}
EOF

cat <<'EOF' > web/app/portal/page.tsx
export default function Portal() {
  return (
    <div className="grid" style={{maxWidth:900, margin:"0 auto"}}>
      <h2>Client Portal</h2>
      <div className="card">
        This is a placeholder for a client-scoped view (their tickets only, public comments, SLA status, invoice history).
        Reuses the same API with a restricted token.
      </div>
    </div>
  );
}
EOF

echo "✅ Project scaffolded in $(pwd)"
echo ""
echo "Next steps:"
echo "  docker compose up -d"
echo "  cd server && cp .env.example .env && pnpm i && pnpm prisma:generate && pnpm prisma:push && pnpm dev"
echo "  (new terminal) cd web && pnpm i && pnpm dev"
echo "Open http://localhost:3000 and http://localhost:8025 (MailHog)."

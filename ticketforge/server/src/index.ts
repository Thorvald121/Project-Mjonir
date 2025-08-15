import { canned } from "./routes/canned.js";
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { createServer } from "http";

import { prisma } from "./lib/prisma.js";

// Routers (these paths should already exist in your repo)
import { auth } from "./routes/auth.js";
import { tickets } from "./routes/tickets.js";
import { invoices } from "./routes/invoices.js";
import { attachments } from "./routes/attachments.js";
import { orgs } from "./routes/orgs.js";

// Optional: real-time (only if you have services/realtime.ts)
import { attachRealtime } from "./services/realtime.js";

// ----------------------------------------------------------------------------
// App setup
// ----------------------------------------------------------------------------
const app = express();

// Trust proxy when running behind Traefik/Nginx (harmless locally)
app.set("trust proxy", 1);

// Basic hardening + JSON/cookies
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS
const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000";
app.use(
  cors({
    origin: WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-CSRF-Token",
    ],
  })
);

// Logging (skip noisy health checks)
app.use(
  morgan("dev", {
    skip: (req) => req.path === "/health",
  })
);

// Light rate limit globally (very permissive, just to prevent accidental storms)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 100, // 100 attempts / 10 min per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
app.use("/auth", authLimiter);

// ----------------------------------------------------------------------------
// Health & root
// ----------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "api",
    time: new Date().toISOString(),
  });
});

app.get("/", (_req, res) => {
  res.json({ ok: true, message: "TicketForge API" });
});

// ----------------------------------------------------------------------------
// Mount routers
// ----------------------------------------------------------------------------
app.use("/auth", auth);
app.use("/tickets", tickets);
app.use("/invoices", invoices);
app.use("/files", attachments);
app.use("/orgs", orgs);
app.use("/canned", canned);

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler (basic)
app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
);

// ----------------------------------------------------------------------------
// Start HTTP server (and optional realtime attach)
// ----------------------------------------------------------------------------
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";

const httpServer = createServer(app);

// If you have a Socket.IO setup in services/realtime.ts, this will activate it.
// Otherwise, it's a no-op import and you can delete these two lines.
try {
  attachRealtime(httpServer);
} catch {
  // No realtime service present — safe to ignore
}

httpServer.listen(PORT, HOST, () => {
  console.log(`API listening on http://${HOST}:${PORT}`);
});

// Optional: tidy shutdown
process.on("SIGTERM", async () => {
  try {
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
});

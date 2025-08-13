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

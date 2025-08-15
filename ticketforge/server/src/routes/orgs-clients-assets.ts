import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { getAuthUser } from "../services/auth.js";
import { z } from "zod";

export const orgs = Router();
export const clients = Router();
export const assets = Router();

// ORGS
orgs.get("/", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (user.role === "ADMIN") {
    const list = await prisma.organization.findMany({ orderBy: { createdAt: "desc" } });
    return res.json(list);
  }
  if (user.role === "AGENT" && user.organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
    return res.json(org ? [org] : []);
  }
  return res.json([]);
});

// CLIENTS (list is scoped)
clients.get("/", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const where: any = {};
  if (user.role === "AGENT") {
    if (!user.organizationId) return res.json([]);
    where.organizationId = user.organizationId;
  } else if (user.role === "ADMIN") {
    if (typeof req.query.organizationId === "string") where.organizationId = req.query.organizationId;
  }
  const list = await prisma.client.findMany({ where, orderBy: { createdAt: "desc" } });
  res.json(list);
});

clients.post("/", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const schema = z.object({ name: z.string().min(2), email: z.string().email().optional(), organizationId: z.string().optional() });
  const body = schema.parse(req.body);
  let organizationId = body.organizationId;
  if (user.role === "AGENT") {
    if (!user.organizationId) return res.status(403).json({ error: "Agent missing organization" });
    organizationId = user.organizationId;
  }
  if (!organizationId) return res.status(400).json({ error: "organizationId required" });
  const c = await prisma.client.create({ data: { name: body.name, email: body.email ?? null, organizationId } });
  res.json(c);
});

// ASSETS (list scoped)
assets.get("/", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const where: any = {};
  if (user.role === "AGENT") {
    if (!user.organizationId) return res.json([]);
    where.organizationId = user.organizationId;
  } else if (user.role === "ADMIN" && typeof req.query.organizationId === "string") {
    where.organizationId = req.query.organizationId;
  }
  const list = await prisma.asset.findMany({ where, orderBy: { createdAt: "desc" } });
  res.json(list);
});

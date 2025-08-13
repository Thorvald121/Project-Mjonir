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

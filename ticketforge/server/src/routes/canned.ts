import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getAuthUser } from "../services/auth.js";

export const canned = Router();

const upsertSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  isPublic: z.boolean().default(true),
});

canned.get("/", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  // Agents/Admins: see all for org; Clients: only public for their org
  if (!user.organizationId) return res.json([]);

  const where: any = { organizationId: user.organizationId };
  if (user.role === "CLIENT") where.isPublic = true;

  const rows = await prisma.cannedReply.findMany({
    where,
    orderBy: [{ isPublic: "desc" }, { title: "asc" }],
    select: { id: true, title: true, body: true, isPublic: true, updatedAt: true },
  });
  res.json(rows);
});

canned.post("/", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || (user.role !== "ADMIN" && user.role !== "AGENT"))
    return res.status(403).json({ error: "Forbidden" });

  if (!user.organizationId) return res.status(400).json({ error: "No org" });

  const data = upsertSchema.parse(req.body ?? {});
  const row = await prisma.cannedReply.create({
    data: {
      ...data,
      organizationId: user.organizationId,
      createdById: user.id,
    },
    select: { id: true, title: true, body: true, isPublic: true, updatedAt: true },
  });
  res.status(201).json(row);
});

canned.patch("/:id", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || (user.role !== "ADMIN" && user.role !== "AGENT"))
    return res.status(403).json({ error: "Forbidden" });

  if (!user.organizationId) return res.status(400).json({ error: "No org" });

  const data = upsertSchema.partial().parse(req.body ?? {});
  const row = await prisma.cannedReply.update({
    where: { id: req.params.id },
    data,
    select: { id: true, title: true, body: true, isPublic: true, updatedAt: true },
  });
  res.json(row);
});

canned.delete("/:id", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || (user.role !== "ADMIN" && user.role !== "AGENT"))
    return res.status(403).json({ error: "Forbidden" });

  await prisma.cannedReply.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

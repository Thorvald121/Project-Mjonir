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

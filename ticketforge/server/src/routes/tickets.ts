import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import { getAuthUser, getAuthUserId } from "../services/auth.js";

export const tickets = Router();

const ticketCreate = z.object({
  title: z.string().min(3),
  description: z.string(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  organizationId: z.string().optional(),
  clientId: z.string().optional(),
});

function computeSla(t: any) {
  const now = Date.now();
  const toMs = (d?: Date | null) => (d ? new Date(d).getTime() - now : null);

  const firstMs = t.firstResponseAt ? 0 : toMs(t.firstResponseDueAt);
  const resMs = t.resolutionAt ? 0 : toMs(t.resolutionDueAt);
  return {
    first: {
      msRemaining: firstMs,
      breached: firstMs != null ? firstMs < 0 : false,
    },
    resolution: {
      msRemaining: resMs,
      breached: resMs != null ? resMs < 0 : false,
    },
  };
}

async function scopeWhereForUser(user: any) {
  const where: any = {};
  if (user.role === "AGENT") {
    if (!user.organizationId) return { id: "_none_" }; // safely returns empty
    where.organizationId = user.organizationId;
  }
  if (user.role === "CLIENT") where.requesterId = user.id;
  return where;
}

/* Create */
tickets.post("/", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const body = ticketCreate.parse(req.body ?? {});
  let organizationId = body.organizationId ?? undefined;
  if (user.role === "AGENT") organizationId = user.organizationId || organizationId;
  if (!organizationId) return res.status(400).json({ error: "organizationId is required" });

  const t = await prisma.ticket.create({
    data: {
      title: body.title,
      description: body.description,
      priority: body.priority,
      organizationId,
      clientId: body.clientId ?? null,
    },
  });
  res.status(201).json(t);
});

/* List with saved filters */
tickets.get("/", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const filter = String(req.query.filter ?? "");
  const where = await scopeWhereForUser(user);

  if (filter === "my") where.assigneeId = user.id;
  if (filter === "unassigned") where.assigneeId = null;
  if (filter === "breachingSoon") {
    where.resolutionAt = null;
    where.resolutionDueAt = { gt: new Date(), lt: new Date(Date.now() + 60 * 60 * 1000) }; // next 60m
  }
  if (filter === "overdue") {
    where.resolutionAt = null;
    where.resolutionDueAt = { lt: new Date() };
  }

  const rows = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, status: true, priority: true, createdAt: true,
      requester: { select: { name: true, email: true } },
      assignee: { select: { name: true } },
      firstResponseDueAt: true, firstResponseAt: true,
      resolutionDueAt: true, resolutionAt: true,
    },
  });

  const enriched = rows.map((t) => ({ ...t, computedSla: computeSla(t) }));
  res.json(enriched);
});

/* Get one */
tickets.get("/:id", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const whereScope = await scopeWhereForUser(user);
  const t = await prisma.ticket.findFirst({
    where: { ...whereScope, id: req.params.id },
    include: {
      comments: { orderBy: { createdAt: "asc" } },
      timeEntries: { orderBy: { createdAt: "desc" } },
      attachments: {
        orderBy: { createdAt: "desc" },
        select: { id: true, filename: true, mime: true, size: true, createdAt: true },
      },
      client: true,
      assignee: { select: { id: true, name: true, email: true } },
      requester: { select: { id: true, name: true, email: true } },
      organization: true,
    },
  });
  if (!t) return res.status(404).json({ error: "Not found" });
  res.json({ ...t, computedSla: computeSla(t) });
});

/* Comment */
tickets.post("/:id/comments", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const schema = z.object({
    body: z.string().min(1),
    isPublic: z.boolean().default(true),
  });
  const body = schema.parse(req.body ?? {});
  const authorId = user.id;

  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!t) return res.status(404).json({ error: "Not found" });

  const c = await prisma.ticketComment.create({
    data: { ticketId: t.id, body: body.body, isPublic: body.isPublic, authorId },
  });
  res.status(201).json(c);
});

/* Time entry */
tickets.post("/:id/time-entries", async (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const schema = z.object({
    minutes: z.number().int().positive(),
    notes: z.string().optional(),
    billableRate: z.number().int().optional(),
  });
  const body = schema.parse(req.body ?? {});
  const te = await prisma.timeEntry.create({
    data: {
      ticketId: req.params.id,
      userId,
      minutes: body.minutes,
      notes: body.notes ?? null,
      billableRate: body.billableRate ?? null,
    },
  });
  res.status(201).json(te);
});

/* Patch meta */
tickets.patch("/:id", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const schema = z.object({
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    assigneeId: z.string().nullable().optional(),
  });
  const data = schema.parse(req.body ?? {});
  const t = await prisma.ticket.update({ where: { id: req.params.id }, data });
  res.json(t);
});

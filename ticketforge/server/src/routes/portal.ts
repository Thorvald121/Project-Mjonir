import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import { getAuthUser } from "../services/auth.js";
import { sendTemplated, replyToForTicket } from "../services/mailer.js";

export const portal = Router();

async function ensureClientOrg(userId: string) {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) throw new Error("User not found");
  if (me.organizationId) return me.organizationId;

  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "TicketForge Client Org", domain: null },
    });
  }
  await prisma.user.update({ where: { id: me.id }, data: { organizationId: org.id } });
  return org.id;
}

portal.get("/tickets", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me) return res.status(401).json({ error: "Unauthorized" });
  if (me.role !== "CLIENT") return res.status(403).json({ error: "Forbidden" });

  const list = await prisma.ticket.findMany({
    where: { requesterId: me.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, status: true, priority: true, createdAt: true,
      firstResponseDueAt: true, resolutionDueAt: true,
    },
  });

  res.json(list);
});

portal.post("/tickets", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me) return res.status(401).json({ error: "Unauthorized" });
  if (me.role !== "CLIENT") return res.status(403).json({ error: "Forbidden" });

  const schema = z.object({
    title: z.string().min(3),
    description: z.string().min(1),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  });
  const body = schema.parse(req.body ?? {});

  const orgId = await ensureClientOrg(me.id);
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return res.status(400).json({ error: "Organization missing" });

  const now = new Date();
  const firstDue = new Date(now.getTime() + org.slaFirstResponseMins * 60_000);
  const resDue = new Date(now.getTime() + org.slaResolutionMins * 60_000);

  const t = await prisma.ticket.create({
    data: {
      title: body.title,
      description: body.description,
      priority: body.priority,
      organizationId: orgId,
      requesterId: me.id,
      firstResponseDueAt: firstDue,
      resolutionDueAt: resDue,
    },
    select: { id: true, title: true, status: true, priority: true, createdAt: true },
  });

  res.status(201).json(t);
});

portal.get("/tickets/:id", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me) return res.status(401).json({ error: "Unauthorized" });
  if (me.role !== "CLIENT") return res.status(403).json({ error: "Forbidden" });

  const t = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: {
      comments: { orderBy: { createdAt: "asc" }, select: { id: true, body: true, isPublic: true, createdAt: true, authorId: true } },
      assignee: { select: { id: true, name: true, email: true } },
      attachments: { orderBy: { createdAt: "desc" }, select: { id: true, filename: true, mime: true, size: true, createdAt: true } },
    },
  });
  if (!t || t.requesterId !== me.id) return res.status(404).json({ error: "Not found" });

  res.json(t);
});

portal.post("/tickets/:id/comments", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me) return res.status(401).json({ error: "Unauthorized" });
  if (me.role !== "CLIENT") return res.status(403).json({ error: "Forbidden" });

  const schema = z.object({ body: z.string().min(1) });
  const { body } = schema.parse(req.body ?? {});

  const t = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: { assignee: { select: { email: true } }, requester: true }
  });
  if (!t || t.requesterId !== me.id) return res.status(404).json({ error: "Not found" });

  const comment = await prisma.ticketComment.create({
    data: { ticketId: t.id, body, isPublic: true, authorId: me.id },
    select: { id: true, body: true, createdAt: true },
  });

  // Notify assignee (if any)
  if (t.assignee?.email) {
    const link = `${process.env.WEB_ORIGIN || "http://localhost:3000"}/tickets/${t.id}`;
    try {
      await sendTemplated("ticket_comment", t.assignee.email, {
        title: t.title,
        comment: body,
        link
      }, { replyTo: replyToForTicket(t.id) });
    } catch {}
  }

  res.status(201).json(comment);
});

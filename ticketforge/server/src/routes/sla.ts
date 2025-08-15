import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const sla = Router();

sla.get("/:orgId", async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.orgId },
    select: {
      id: true, name: true,
      slaFirstResponseMins: true, slaResolutionMins: true, escalationEmail: true,
      businessTimezone: true, businessDays: true, businessOpenMin: true, businessCloseMin: true, holidays: true
    }
  });
  if (!org) return res.status(404).json({ error: "Not found" });
  res.json(org);
});

sla.patch("/:orgId", async (req, res) => {
  const schema = z.object({
    slaFirstResponseMins: z.number().int().positive().max(7*24*60).optional(),
    slaResolutionMins: z.number().int().positive().max(30*24*60).optional(),
    escalationEmail: z.string().email().nullable().optional(),
    businessTimezone: z.string().min(3).optional(),
    businessDays: z.string().regex(/^[0-6](,[0-6])*$/).optional(),
    businessOpenMin: z.number().int().min(0).max(24*60).optional(),
    businessCloseMin: z.number().int().min(1).max(24*60).optional(),
    holidays: z.array(z.string()).optional(),
    recomputeOpenTickets: z.boolean().optional() // if true, recompute due dates for open tickets
  });
  const body = schema.parse(req.body ?? {});
  if (body.businessOpenMin !== undefined && body.businessCloseMin !== undefined && body.businessOpenMin >= body.businessCloseMin) {
    return res.status(400).json({ error: "businessOpenMin must be < businessCloseMin" });
  }

  const org = await prisma.organization.update({
    where: { id: req.params.orgId },
    data: {
      slaFirstResponseMins: body.slaFirstResponseMins ?? undefined,
      slaResolutionMins: body.slaResolutionMins ?? undefined,
      escalationEmail: body.escalationEmail === undefined ? undefined : body.escalationEmail,
      businessTimezone: body.businessTimezone ?? undefined,
      businessDays: body.businessDays ?? undefined,
      businessOpenMin: body.businessOpenMin ?? undefined,
      businessCloseMin: body.businessCloseMin ?? undefined,
      holidays: body.holidays === undefined ? undefined : (body.holidays as any)
    }
  });

  // Optionally recompute current tickets' due times (keeping existing first/resolve timestamps)
  if (body.recomputeOpenTickets) {
    const openTickets = await prisma.ticket.findMany({
      where: { organizationId: org.id, status: { in: ["OPEN", "IN_PROGRESS"] }, resolutionAt: null }
    });
    // Lightweight: just clear breaches; new tickets will use new schedule.
    await prisma.ticket.updateMany({
      where: { id: { in: openTickets.map(t => t.id) } },
      data: { breachedFirstResponse: false, breachedResolution: false }
    });
  }

  const out = await prisma.organization.findUnique({
    where: { id: org.id },
    select: {
      id: true, name: true,
      slaFirstResponseMins: true, slaResolutionMins: true, escalationEmail: true,
      businessTimezone: true, businessDays: true, businessOpenMin: true, businessCloseMin: true, holidays: true
    }
  });
  res.json(out);
});

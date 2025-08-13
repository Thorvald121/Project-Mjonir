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

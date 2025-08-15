import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const invoices = Router();

invoices.get("/", async (req, res) => {
  const organizationId = typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
  const where = organizationId ? { organizationId } : {};
  const list = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { lines: true }
  });
  res.json(list);
});

invoices.get("/:id", async (req, res) => {
  const inv = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { lines: true, organization: true }
  });
  if (!inv) return res.status(404).json({ error: "Not found" });
  res.json(inv);
});

invoices.post("/generate", async (req, res) => {
  const schema = z.object({
    organizationId: z.string(),
    periodStart: z.string(),
    periodEnd: z.string(),
    defaultRateCentsPerMinute: z.number().int().default(200)
  });
  const { organizationId, periodStart, periodEnd, defaultRateCentsPerMinute } = schema.parse(req.body);

  const entries = await prisma.timeEntry.findMany({
    where: { ticket: { organizationId }, createdAt: { gte: new Date(periodStart), lte: new Date(periodEnd) } },
    include: { ticket: true }
  });

  let total = 0;
  const invoice = await prisma.invoice.create({
    data: { organizationId, periodStart: new Date(periodStart), periodEnd: new Date(periodEnd), status: "DRAFT" }
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
  const full = await prisma.invoice.findUnique({ where: { id: invoice.id }, include: { lines: true, organization: true } });
  res.json(full);
});

invoices.get("/:id/pdf", async (req, res) => {
  const inv = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { lines: true, organization: true }
  });
  if (!inv) return res.status(404).json({ error: "Not found" });
  const PDFDocument = (await import("pdfkit")).default as any;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=invoice-${inv.id}.pdf`);

  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  doc.pipe(res);
  doc.fontSize(20).text(inv.organization?.name ?? "TicketForge Client");
  doc.moveDown(0.5).fontSize(10).fillColor("#666")
    .text(`Invoice ID: ${inv.id}`)
    .text(`Period: ${new Date(inv.periodStart).toLocaleDateString()} – ${new Date(inv.periodEnd).toLocaleDateString()}`)
    .text(`Status: ${inv.status}`);
  doc.moveDown().fillColor("#000").fontSize(12)
    .text("Description", 50, doc.y, { width: 320 })
    .text("Qty (min)", 370, doc.y, { width: 80, align: "right" })
    .text("Rate", 450, doc.y, { width: 80, align: "right" })
    .text("Total", 530, doc.y, { width: 60, align: "right" });
  doc.moveDown(0.3).moveTo(50, doc.y).lineTo(560, doc.y).stroke();

  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  doc.moveDown(0.5);
  for (const line of inv.lines) {
    doc.fontSize(11).text(line.description, 50, doc.y, { width: 320 });
    doc.text(String(line.quantity), 370, doc.y, { width: 80, align: "right" });
    doc.text(fmt(line.unitCents), 450, doc.y, { width: 80, align: "right" });
    doc.text(fmt(line.totalCents), 530, doc.y, { width: 60, align: "right" });
    doc.moveDown(0.3);
  }
  doc.moveDown().moveTo(400, doc.y).lineTo(560, doc.y).stroke();
  doc.fontSize(12).text("Total:", 450, doc.y + 6, { width: 80, align: "right" });
  doc.fontSize(14).text(fmt(inv.totalCents), 530, doc.y + 4, { width: 60, align: "right" });
  doc.end();
});

// Status + sync stubs
invoices.post("/:id/mark-sent", async (req, res) => {
  const inv = await prisma.invoice.update({ where: { id: req.params.id }, data: { status: "SENT" } });
  res.json(inv);
});

invoices.post("/:id/sync/stripe", async (req, res) => {
  // stub — in prod, call Stripe Invoices API here
  const inv = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { lines: true, organization: true } });
  if (!inv) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true, provider: "stripe", simulated: true, invoiceId: inv.id, amount: inv.totalCents });
});

invoices.post("/:id/sync/xero", async (req, res) => {
  // stub — in prod, call Xero Invoices API here
  const inv = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { lines: true, organization: true } });
  if (!inv) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true, provider: "xero", simulated: true, invoiceId: inv.id, amount: inv.totalCents });
});

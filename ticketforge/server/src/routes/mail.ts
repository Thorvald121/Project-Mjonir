import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import crypto from "crypto";

export const mail = Router();

function verifySignature(req: any): boolean {
  const secret = process.env.INBOUND_SIGNING_SECRET;
  if (!secret) return true; // dev mode: unsigned allowed
  const sig = req.get("X-TicketForge-Signature");
  if (!sig) return false;
  // we assume body has been parsed; re-stringify for canonical form
  const raw = JSON.stringify(req.body ?? {});
  const mac = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mac));
}

/** Core handler: normalize and create a public comment on a ticket by email. */
async function handleInbound(toList: string[], from: string, subject?: string, text?: string, html?: string) {
  const tos = toList.map((t) => String(t));
  let ticketId: string | null = null;
  for (const addr of tos) {
    const m = addr.match(/ticket\+([a-z0-9]+)@/i);
    if (m) { ticketId = m[1]; break; }
  }
  if (!ticketId) throw new Error("No ticket id found in recipient");

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("Ticket not found");

  const senderEmail = String(from).toLowerCase().trim().replace(/^.*<([^>]+)>.*/, "$1");
  const author = await prisma.user.findUnique({ where: { email: senderEmail } });

  const body =
    (text && text.trim()) ||
    (html && html.replace(/<[^>]+>/g, "").trim()) ||
    subject ||
    "(no content)";

  const comment = await prisma.ticketComment.create({
    data: { ticketId, body, isPublic: true, authorId: author?.id ?? null }
  });
  return { ticketId, commentId: comment.id };
}

mail.post("/inbound", async (req, res) => {
  try {
    if (!verifySignature(req)) return res.status(401).json({ error: "bad signature" });
    const { to, from, subject, text, html } = req.body ?? {};
    const toList = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
    if (!toList.length || !from) return res.status(400).json({ error: "Missing to/from" });
    const result = await handleInbound(toList, from, subject, text, html);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "inbound failed" });
  }
});

mail.post("/sendgrid", async (req, res) => {
  try {
    if (!verifySignature(req)) return res.status(401).json({ error: "bad signature" });
    const toRaw = req.body?.to ?? req.body?.envelope?.to;
    const fromRaw = req.body?.from ?? req.body?.envelope?.from ?? req.body?.sender;
    const text = req.body?.text;
    const html = req.body?.html;
    const subject = req.body?.subject;
    const toList = Array.isArray(toRaw) ? toRaw : typeof toRaw === "string" ? [toRaw] : [];
    if (!toList.length || !fromRaw) return res.status(400).json({ error: "Missing to/from" });
    const result = await handleInbound(toList, String(fromRaw), subject, text, html);
    res.json({ ok: true, provider: "sendgrid", ...result });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "sendgrid inbound failed" });
  }
});

mail.post("/mailgun", async (req, res) => {
  try {
    if (!verifySignature(req)) return res.status(401).json({ error: "bad signature" });
    const recipient = req.body?.recipient || req.body?.to;
    const from = req.body?.from;
    const subject = req.body?.subject;
    const text = (req.body && req.body["body-plain"]) || req.body?.text;
    const html = (req.body && req.body["body-html"]) || req.body?.html;
    const toList = Array.isArray(recipient) ? recipient : typeof recipient === "string" ? [recipient] : [];
    if (!toList.length || !from) return res.status(400).json({ error: "Missing to/from" });
    const result = await handleInbound(toList, from, subject, text, html);
    res.json({ ok: true, provider: "mailgun", ...result });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "mailgun inbound failed" });
  }
});

mail.post("/postmark", async (req, res) => {
  try {
    if (!verifySignature(req)) return res.status(401).json({ error: "bad signature" });
    const to =
      (Array.isArray(req.body?.ToFull) && req.body.ToFull.map((x: any) => x.Email)) ||
      (typeof req.body?.To === "string" ? req.body.To.split(",") : []);
    const from = (req.body?.FromFull && req.body.FromFull.Email) || req.body?.From;
    const subject = req.body?.Subject;
    const text = req.body?.TextBody;
    const html = req.body?.HtmlBody;
    if (!to?.length || !from) return res.status(400).json({ error: "Missing to/from" });
    const result = await handleInbound(to, from, subject, text, html);
    res.json({ ok: true, provider: "postmark", ...result });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "postmark inbound failed" });
  }
});

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { upload, multerErrorHandler } from "../services/uploads.js";
import { getAuthUser } from "../services/auth.js";

export const attachments = Router();

type GateOk = {
  ok: true;
  user: { id: string; role: "ADMIN" | "AGENT" | "CLIENT"; organizationId: string | null };
  orgId: string;
};
type GateErr = { ok: false; code: number; msg: "Unauthorized" | "Forbidden" | "Not found" };

async function requireTicketAccess(req: any, ticketId: string): Promise<GateOk | GateErr> {
  const user = await getAuthUser(req);
  if (!user) return { ok: false, code: 401, msg: "Unauthorized" };
  const t = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { organizationId: true, requesterId: true } });
  if (!t) return { ok: false, code: 404, msg: "Not found" };
  if (user.role === "ADMIN") return { ok: true, user, orgId: t.organizationId };
  if (user.role === "AGENT" && user.organizationId && user.organizationId === t.organizationId) return { ok: true, user, orgId: t.organizationId };
  if (user.role === "CLIENT" && t.requesterId === user.id) return { ok: true, user, orgId: t.organizationId };
  return { ok: false, code: 403, msg: "Forbidden" };
}

attachments.post("/tickets/:id", upload.single("file"), async (req, res) => {
  const gate = await requireTicketAccess(req, req.params.id);
  if (!gate.ok) return res.status(gate.code).json({ error: gate.msg });
  if (!req.file) return res.status(400).json({ error: "file is required" });

  const a = await prisma.attachment.create({
    data: {
      ticketId: req.params.id,
      filename: req.file.originalname || "file",
      mime: req.file.mimetype || "application/octet-stream",
      size: Number(req.file.size ?? 0),
      storagePath: req.file.filename,
      uploadedById: gate.user.id,
    },
    select: { id: true, filename: true, mime: true, size: true, createdAt: true },
  });

  res.status(201).json(a);
});

attachments.use(multerErrorHandler);

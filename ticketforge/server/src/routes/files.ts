import { Router } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma.js";
import { getAuthUser } from "../services/auth.js";
import { UPLOAD_DIR } from "../services/uploads.js";

export const files = Router();

files.get("/:id", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me) return res.status(401).json({ error: "Unauthorized" });

  const a = await prisma.attachment.findUnique({
    where: { id: req.params.id },
    include: { ticket: { select: { organizationId: true, requesterId: true } } },
  });
  if (!a) return res.status(404).json({ error: "Not found" });

  if (me.role === "ADMIN") {
    // ok
  } else if (me.role === "AGENT") {
    if (!me.organizationId || me.organizationId !== a.ticket.organizationId) {
      return res.status(403).json({ error: "Forbidden" });
    }
  } else if (me.role === "CLIENT") {
    if (a.ticket.requesterId !== me.id) return res.status(403).json({ error: "Forbidden" });
  } else {
    return res.status(403).json({ error: "Forbidden" });
  }

  const filePath = path.resolve(UPLOAD_DIR, a.storagePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing" });

  const asDownload = req.query.download === "1";
  res.setHeader("Content-Type", a.mime || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `${asDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(a.filename)}"`
  );
  res.sendFile(filePath);
});

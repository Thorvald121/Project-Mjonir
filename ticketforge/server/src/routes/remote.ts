import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const remote = Router();

function code6() {
  return Math.random().toString().slice(2, 8); // 6 digits
}

// Create a remote session for a ticket; returns a short code
remote.post("/:ticketId/create", async (req, res) => {
  const { ticketId } = req.params;
  const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!t) return res.status(404).json({ error: "Ticket not found" });

  const session = await prisma.remoteSession.create({
    data: {
      ticketId,
      code: code6(),
      status: "PENDING"
    }
  });

  res.json(session);
});

// Look up by code
remote.get("/:code", async (req, res) => {
  const s = await prisma.remoteSession.findUnique({ where: { code: req.params.code } });
  if (!s) return res.status(404).json({ error: "Not found" });
  res.json(s);
});

// Start and end
remote.post("/:code/start", async (req, res) => {
  const s = await prisma.remoteSession.update({
    where: { code: req.params.code },
    data: { status: "ACTIVE", startedAt: new Date() }
  });
  res.json(s);
});
remote.post("/:code/end", async (req, res) => {
  const s = await prisma.remoteSession.update({
    where: { code: req.params.code },
    data: { status: "ENDED", endedAt: new Date() }
  });
  res.json(s);
});

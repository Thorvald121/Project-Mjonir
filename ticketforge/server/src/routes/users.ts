import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { getAuthUser } from "../services/auth.js";

export const users = Router();

// GET /users?role=AGENT&organizationId=...
users.get("/", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me) return res.status(401).json({ error: "Unauthorized" });

  const role = typeof req.query.role === "string" ? req.query.role : undefined;
  const orgIdQ = typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;

  const where: any = {};
  if (role) where.role = role;

  if (me.role === "ADMIN") {
    if (orgIdQ) where.organizationId = orgIdQ;
  } else if (me.role === "AGENT") {
    if (!me.organizationId) return res.json([]);
    where.organizationId = me.organizationId;
  } else {
    return res.status(403).json({ error: "Forbidden" });
  }

  const list = await prisma.user.findMany({
    where,
    select: { id: true, email: true, name: true, role: true, organizationId: true },
    orderBy: { createdAt: "desc" }
  });
  res.json(list);
});

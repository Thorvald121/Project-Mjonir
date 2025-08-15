import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import bcrypt from "bcryptjs";
import { z } from "zod";

// These come from the Step-3 update to services/auth.ts
import { AUTH_COOKIE, getAuthUser, getAuthUserId, signJwt } from "../services/auth.js";

export const auth = Router();

/**
 * POST /auth/register
 * Simple self-registration endpoint (preserved from your existing file).
 * You can lock this down later (admin-only invites, etc.).
 */
auth.post("/register", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string(),
    password: z.string().min(6),
    role: z.enum(["ADMIN", "AGENT", "CLIENT"]).optional().default("ADMIN"),
    organizationId: z.string().optional(),
  });
  const body = schema.parse(req.body ?? {});

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) return res.status(409).json({ error: "Email already in use" });

  let orgId = body.organizationId ?? null;
  if (!orgId) {
    // attach to an existing org if any, else create a default one
    const firstOrg = await prisma.organization.findFirst();
    if (firstOrg) orgId = firstOrg.id;
    else {
      const org = await prisma.organization.create({
        data: { name: "TicketForge Demo", domain: null },
      });
      orgId = org.id;
    }
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: {
      email: body.email,
      name: body.name,
      passwordHash,
      role: body.role,
      organizationId: orgId,
    },
    select: { id: true, email: true, name: true, role: true, organizationId: true },
  });

  res.status(201).json(user);
});

/**
 * POST /auth/login
 * Sets an HttpOnly cookie (so <a href> downloads work) and also returns the token in JSON.
 */
auth.post("/login", async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const { email, password } = schema.parse(req.body ?? {});

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  // JWT and HttpOnly cookie
  const token = signJwt(user.id, process.env.JWT_TTL || "7d");
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: !!process.env.COOKIE_SECURE, // set COOKIE_SECURE=1 under HTTPS
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId },
  });
});

/**
 * GET /auth/me
 * Reads identity via Authorization header OR HttpOnly cookie (handled in services/auth.ts).
 */
auth.get("/me", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me) return res.status(401).json({ error: "Unauthorized" });
  res.json(me);
});

/**
 * POST /auth/logout
 * Clears the HttpOnly cookie; frontend should also clear its localStorage token.
 */
auth.post("/logout", async (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
  res.json({ ok: true });
});

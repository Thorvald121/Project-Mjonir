import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";

const JWT_SECRET: Secret = (process.env.JWT_SECRET || "dev-secret-change-me") as Secret;
export const AUTH_COOKIE = process.env.AUTH_COOKIE || "token";

type JwtPayload = { sub: string; iat?: number; exp?: number };

function extractBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? m[1] : null;
}
function extractCookie(req: Request): string | null {
  const c = (req as any).cookies?.[AUTH_COOKIE];
  return c || null;
}

/** Accepts numbers or strings like "7d", "12h", etc. */
export function signJwt(userId: string, expiresIn: string | number = "7d") {
  const opts: SignOptions = {};
  // cast to keep TS calm across jsonwebtoken v9 types
  (opts as any).expiresIn = expiresIn as any;
  return jwt.sign({ sub: userId }, JWT_SECRET, opts);
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function getAuthUser(req: Request) {
  const token = extractBearer(req) ?? extractCookie(req);
  if (!token) return null;
  const payload = verifyJwt(token);
  if (!payload?.sub) return null;
  return prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true, organizationId: true },
  });
}

export function getAuthUserId(req: Request): string | null {
  const token = extractBearer(req) ?? extractCookie(req);
  if (!token) return null;
  const payload = verifyJwt(token);
  return payload?.sub ?? null;
}

export function requireAnyRole<T extends string>(...roles: T[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(user.role as T)) return res.status(403).json({ error: "Forbidden" });
    (req as any).user = user;
    next();
  };
}

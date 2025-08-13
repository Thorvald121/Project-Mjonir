import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { signToken, validateUser } from "../services/auth.js";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const auth = Router();

auth.post("/register", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string(),
    password: z.string().min(6),
    role: z.enum(["ADMIN","AGENT","CLIENT"]).optional().default("ADMIN")
  });
  const body = schema.parse(req.body);
  const hash = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: { email: body.email, name: body.name, passwordHash: hash, role: body.role }
  });
  return res.json({ id: user.id, email: user.email });
});

auth.post("/login", async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string() });
  const { email, password } = schema.parse(req.body);
  const user = await validateUser(email, password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const token = signToken({ uid: user.id, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

import { Router } from "express";
import { z } from "zod";
import { aiSuggest } from "../services/ai.js";

export const ai = Router();

ai.post("/suggest", async (req, res) => {
  const schema = z.object({ title: z.string(), description: z.string() });
  const body = schema.parse(req.body);
  const suggestion = await aiSuggest(body);
  res.json(suggestion);
});

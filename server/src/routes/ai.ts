import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";
import { analyzeSuppliers, chatGuide, planEvent } from "../services/ai.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        message: z.string().min(1),
        language: z.enum(["ar", "en"]).default("en"),
        persona: z
          .enum(["Saud", "Noura", "Ops Manager", "Supply Chain AI"])
          .default("Noura"),
        context: z.unknown().optional()
      })
      .parse(req.body);

    const reply = await chatGuide(body);
    res.json({ reply });
  })
);

router.post(
  "/plan-event",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        eventBrief: z.string().min(10)
      })
      .parse(req.body);

    const plan = await planEvent(body.eventBrief);
    res.json({ plan });
  })
);

router.post(
  "/analyze-suppliers",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        offers: z.unknown()
      })
      .parse(req.body);

    const analysis = await analyzeSuppliers(body.offers);
    res.json({ analysis });
  })
);

export default router;

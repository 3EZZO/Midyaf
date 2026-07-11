import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";
import {
  analyzeSuppliers,
  chatGuide,
  generatePostEventReport,
  getCommandCenterInsights,
  planEvent,
  verifyDocument
} from "../services/ai.js";

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
  "/verify-document",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        fileName: z.string().optional(),
        documentType: z.string().optional(),
        eventEndDate: z.string().optional(),
        content: z.string().optional()
      })
      .parse(req.body ?? {});

    const verification = await verifyDocument(body);
    res.json({ verification });
  })
);

router.post(
  "/command-center/insights",
  asyncHandler(async (req, res) => {
    const insights = await getCommandCenterInsights(req.body);
    res.json({ insights });
  })
);

router.post(
  "/post-event-report",
  asyncHandler(async (req, res) => {
    const report = await generatePostEventReport(req.body);
    res.json({ report });
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

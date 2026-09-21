import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";
import {
  analyzeSuppliers,
  chatGuide,
  executeSmartAction,
  generatePostEventReport,
  getCommandCenterInsights,
  planEvent,
  verifyDocument,
  smartAssistant,
  streamChatCompletion
} from "../services/ai.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/assistant",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        query: z.string().min(1),
        language: z.string().default("en"),
        context: z.unknown().optional()
      })
      .parse(req.body);

    const reply = await smartAssistant(body.query, body.language, body.context);
    res.json({ reply });
  })
);

const chatBody = z.object({
  message: z.string().min(1),
  language: z.string().default("en"),
  persona: z
    .enum(["Saud", "Noura", "Saif & Munirah", "Ops Manager", "Supply Chain AI"])
    .default("Saif & Munirah"),
  context: z.unknown().optional()
});

router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const body = chatBody.parse(req.body);

    const reply = await chatGuide(body);
    res.json({ reply });
  })
);

/**
 * Server-sent events twin of POST /chat. Frames:
 *   event: meta   data: {persona, toolIntent, actions, data, source}
 *   data: {"delta": "..."}                        (repeated)
 *   event: done   data: {"content": "<full text>"}
 * Headers are flushed before the first token so proxies (Render, nginx)
 * cannot buffer the stream; a client disconnect aborts the upstream call.
 */
router.post(
  "/chat/stream",
  asyncHandler(async (req, res) => {
    const body = chatBody.parse(req.body);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // `res` closes when the client goes away; `req` "close" fires as soon as
    // the JSON body has been read, which would abort every stream at once.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    const send = (event: string | null, payload: unknown) => {
      if (res.writableEnded || controller.signal.aborted) return;
      if (event) res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      for await (const evt of streamChatCompletion(body, controller.signal)) {
        if (evt.type === "meta") send("meta", evt.meta);
        else if (evt.type === "delta") send(null, { delta: evt.delta });
        else send("done", { content: evt.content });
      }
    } catch (error) {
      send("error", {
        message: error instanceof Error ? error.message : "stream_failed"
      });
    } finally {
      if (!res.writableEnded) res.end();
    }
  })
);

router.post(
  "/execute-action",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        actionId: z.string().min(1),
        params: z.unknown().optional()
      })
      .parse(req.body);

    const execution = await executeSmartAction(body.actionId, body.params);
    res.json({ execution });
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

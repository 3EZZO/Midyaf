import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { AuthRequest, AuthenticatedUser } from "../types/auth.js";
import { HttpError, asyncHandler } from "../utils/http.js";
import {
  EVENT_OPERATOR_ROLES,
  authorizeRecordReferences,
  canReadEvent,
  collectRecordReferences
} from "../utils/routeAuthorization.js";
import {
  analyzeSuppliers,
  chatGuide,
  executeSmartAction,
  generatePostEventReport,
  getCommandCenterInsights,
  planEvent,
  verifyDocument,
  smartAssistant,
  streamChatCompletion,
  type ChatInput
} from "../services/ai.js";

const router = Router();

// T-08: operational AI (planning, actions, supplier analysis, reporting,
// operational personas and aggregate context) is limited to LM/SA/ORG. Every
// other authenticated role keeps personal chat with a minimal, ownership-
// validated context. A persona is presentation, never authorization.
const operationalAiRoles: Role[] = EVENT_OPERATOR_ROLES;
const reportingRoles: Role[] = [...operationalAiRoles, Role.COMPANY_ORGANIZER];
const operationalPersonas = new Set(["Ops Manager", "Supply Chain AI"]);

// Action IDs the AI service and its canned replies know about. Unknown IDs
// are rejected rather than "executed" by the service's default branch.
const operationalActionIds = new Set([
  "divert_fleet",
  "command_center_divert_vans",
  "send_vendor_sms",
  "send_vendor_message",
  "confirm_dispatch_staff",
  "track_driver",
  "track_driver_khaled",
  "notify_butler",
  "reserve_dining",
  "view_vendor_map",
  "scroll_to_vault",
  "view_vault_audit",
  "view_airport",
  "inspect_riders",
  "call_chauffeur",
  "view_shuttle_gps",
  "sync_calendar",
  "notify_catering",
  "generate_report",
  "copy_wifi"
]);
const personalActionIds = new Set([
  "notify_butler",
  "reserve_dining",
  "track_driver"
]);

/** What a provider sees for an authorized scripted-showcase request. */
const SYNTHETIC_DEMO_CONTEXT = {
  demo: true,
  note: "Scripted showcase simulation. All figures are synthetic."
};

function isOperationalAiUser(user: AuthenticatedUser) {
  return operationalAiRoles.includes(user.role);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Validated references only, for roles that may not forward aggregates. */
function minimalReferences(
  refs: Awaited<ReturnType<typeof authorizeRecordReferences>>
) {
  const minimal = {
    ...(refs.eventId ? { eventId: refs.eventId } : {}),
    ...(refs.guestIds.length ? { guestIds: refs.guestIds } : {}),
    ...(refs.driverIds.length ? { driverIds: refs.driverIds } : {}),
    ...(refs.taskIds.length ? { taskIds: refs.taskIds } : {})
  };
  return Object.keys(minimal).length ? minimal : undefined;
}

/**
 * Validates every record reference in client context before any AI call.
 * Operators keep their aggregate briefing context once its references check
 * out; an operator's `demo: true` swaps the context for a server-controlled
 * synthetic one. Other roles forward only the validated references, and a
 * demo marker grants them nothing.
 */
async function authorizeAiContext(user: AuthenticatedUser, context: unknown) {
  if (context === undefined || context === null) {
    return undefined;
  }

  const operational = isOperationalAiUser(user);
  if (operational && isPlainObject(context) && context.demo === true) {
    return SYNTHETIC_DEMO_CONTEXT;
  }

  const refs = await authorizeRecordReferences(
    user,
    collectRecordReferences(context)
  );
  return operational ? context : minimalReferences(refs);
}

async function authorizeChat<T extends ChatInput>(
  user: AuthenticatedUser,
  body: T
): Promise<T> {
  if (
    body.persona &&
    operationalPersonas.has(body.persona) &&
    !isOperationalAiUser(user)
  ) {
    throw new HttpError(403, "This assistant persona requires an operations role");
  }

  return { ...body, context: await authorizeAiContext(user, body.context) };
}

router.use(requireAuth);

router.post(
  "/assistant",
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        query: z.string().min(1),
        language: z.string().default("en"),
        context: z.unknown().optional()
      })
      .parse(req.body);

    const context = await authorizeAiContext(req.user!, body.context);
    const reply = await smartAssistant(body.query, body.language, context);
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
  asyncHandler(async (req: AuthRequest, res) => {
    const body = await authorizeChat(req.user!, chatBody.parse(req.body));

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
 * Authorization runs first, so a denial is a plain JSON error, not a stream.
 */
router.post(
  "/chat/stream",
  asyncHandler(async (req: AuthRequest, res) => {
    const body = await authorizeChat(req.user!, chatBody.parse(req.body));

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
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const body = z
      .object({
        actionId: z.string().min(1),
        params: z.unknown().optional()
      })
      .parse(req.body);

    if (!operationalActionIds.has(body.actionId)) {
      throw new HttpError(400, "Unknown action");
    }
    if (!isOperationalAiUser(user) && !personalActionIds.has(body.actionId)) {
      throw new HttpError(403, "This action requires an operations role");
    }

    // Params never carry role or ownership; only validated references pass.
    const refs = await authorizeRecordReferences(
      user,
      collectRecordReferences(body.params)
    );
    const execution = await executeSmartAction(
      body.actionId,
      minimalReferences(refs)
    );
    res.json({ execution });
  })
);

router.post(
  "/verify-document",
  asyncHandler(async (req: AuthRequest, res) => {
    // The caller's own text only; no stored asset, guest or event lookup.
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
  requireRole(operationalAiRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    // Unrecognized body content is discarded, never treated as a grant.
    const refs = await authorizeRecordReferences(
      req.user!,
      collectRecordReferences(req.body)
    );
    const insights = await getCommandCenterInsights(minimalReferences(refs));
    res.json({ insights });
  })
);

router.post(
  "/post-event-report",
  requireRole(reportingRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z.object({ eventId: z.string().min(1) }).parse(req.body);

    if (!(await canReadEvent(req.user!, body.eventId))) {
      throw new HttpError(403, "Event access denied");
    }

    const report = await generatePostEventReport({ eventId: body.eventId });
    res.json({ report });
  })
);

router.post(
  "/plan-event",
  requireRole(reportingRoles),
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
  requireRole(operationalAiRoles),
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

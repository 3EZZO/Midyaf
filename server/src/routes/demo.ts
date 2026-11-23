import { Router } from "express";
import { Role } from "@prisma/client";
import {
  DEMO_PERSONA_KEYS,
  DEMO_PERSONA_META,
  demoResetSchema,
  demoSwitchSchema,
  type DemoBaselineResponse,
  type DemoPersonaDto,
  type DemoPersonaKey,
  type DemoResetResponse,
  type DemoStatusDto
} from "../../../shared/demo.js";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { requireAuth, signTokens } from "../middleware/auth.js";
import { captureBaseline, DEMO_TRANSACTION, readBaselineInfo, restoreBaseline } from "../services/demoBaseline.js";
import { prepareInvestorDemo } from "../services/investorDemoPrep.js";
import type { AuthenticatedUser, AuthRequest } from "../types/auth.js";
import { DEMO_ACCOUNTS } from "../utils/demoProvisioning.js";
import { asyncHandler, HttpError } from "../utils/http.js";

/**
 * SIX-TASKS #6 one-click investor demo. See shared/demo.ts for the contract.
 *
 * - 404 for everything unless DEMO_MODE_ENABLED=true.
 * - Switch/reset/baseline need a "demo origin": the signed-in Super Admin, or
 *   a switched session whose origin is re-checked to still be SUPER_ADMIN.
 * - Switching only ever issues tokens for the certified synthetic accounts in
 *   DEMO_ACCOUNTS, found by email AND matching stored role.
 */

const router = Router();
router.use(requireAuth);
router.use((_req, _res, next) => {
  if (!env.DEMO_MODE_ENABLED) throw new HttpError(404, "Route not found");
  next();
});

const sessionUserSelect = {
  onboardingPending: true,
  onboardingKind: true,
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  language: true,
  avatar: true,
  createdAt: true
} as const;

const ACCOUNT_BY_KEY = new Map<string, (typeof DEMO_ACCOUNTS)[number]>(DEMO_ACCOUNTS.map((account) => [account.key, account]));

/** The Super Admin behind this session, or null when it may not drive the demo. */
async function demoOrigin(actor: AuthenticatedUser) {
  const originId = actor.demoOriginId ?? (actor.role === Role.SUPER_ADMIN ? actor.id : null);
  if (!originId) return null;
  const origin = await prisma.user.findUnique({ where: { id: originId }, select: { id: true, name: true, role: true } });
  return origin?.role === Role.SUPER_ADMIN ? origin : null;
}

async function requireOrigin(actor: AuthenticatedUser) {
  const origin = await demoOrigin(actor);
  if (!origin) throw new HttpError(403, "Only the Super Admin can run the investor demo");
  return origin;
}

async function personaUsers() {
  const emails = DEMO_PERSONA_KEYS.map((key) => ACCOUNT_BY_KEY.get(key)!.email);
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, role: true, name: true } });
  const byEmail = new Map(users.map((user) => [user.email, user]));
  return new Map(
    DEMO_PERSONA_KEYS.map((key) => {
      const account = ACCOUNT_BY_KEY.get(key)!;
      const user = byEmail.get(account.email);
      return [key, user && user.role === account.role ? user : null] as const;
    })
  );
}

async function lastResetAt(): Promise<string | null> {
  const row = await prisma.auditLog.findFirst({
    where: { action: "demo.reset" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });
  return row ? row.createdAt.toISOString() : null;
}

router.get(
  "/status",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = req.user!;
    const origin = await demoOrigin(actor);
    if (!origin) {
      const status: DemoStatusDto = {
        enabled: true,
        canSwitch: false,
        canReset: false,
        activePersona: null,
        origin: null,
        personas: [],
        lastResetAt: null,
        baselineCapturedAt: null
      };
      res.json(status);
      return;
    }
    const users = await personaUsers();
    const personas: DemoPersonaDto[] = DEMO_PERSONA_KEYS.map((key) => {
      const user = users.get(key);
      return {
        key,
        role: ACCOUNT_BY_KEY.get(key)!.role,
        name: user?.name ?? ACCOUNT_BY_KEY.get(key)!.name,
        available: Boolean(user),
        ...DEMO_PERSONA_META[key]
      };
    });
    const active = DEMO_PERSONA_KEYS.find((key) => users.get(key)?.id === actor.id) ?? null;
    const baseline = await readBaselineInfo(prisma).catch(() => null);
    const status: DemoStatusDto = {
      enabled: true,
      canSwitch: true,
      canReset: Boolean(baseline),
      activePersona: active,
      origin: { id: origin.id, name: origin.name },
      personas,
      lastResetAt: await lastResetAt(),
      baselineCapturedAt: baseline?.capturedAt ?? null
    };
    res.json(status);
  })
);

router.post(
  "/switch",
  asyncHandler(async (req: AuthRequest, res) => {
    const origin = await requireOrigin(req.user!);
    const { persona } = demoSwitchSchema.parse(req.body);
    const account = ACCOUNT_BY_KEY.get(persona as DemoPersonaKey)!;
    const found = await prisma.user.findUnique({ where: { email: account.email }, select: { ...sessionUserSelect, tokenVersion: true } });
    if (!found || found.role !== account.role) {
      throw new HttpError(409, "This demo persona is not available in this database");
    }
    const { tokenVersion, ...user } = found;
    await prisma.auditLog.create({
      data: {
        actorUserId: origin.id,
        actorRole: Role.SUPER_ADMIN,
        action: "demo.switch",
        entityType: "USER",
        entityId: user.id,
        metadata: { persona }
      }
    });
    res.json({ user, ...signTokens({ ...user, tokenVersion }, { demoOrigin: origin.id }) });
  })
);

router.post(
  "/reset",
  asyncHandler(async (req: AuthRequest, res) => {
    const origin = await requireOrigin(req.user!);
    demoResetSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const restored = await restoreBaseline(tx);
      // The audit table itself was restored; record this reset after it. The
      // origin admin existed at capture time or the FK fails and nothing commits.
      const row = await tx.auditLog.create({
        data: {
          actorUserId: origin.id,
          actorRole: Role.SUPER_ADMIN,
          action: "demo.reset",
          entityType: "DEMO",
          entityId: "baseline",
          metadata: { removed: restored.removed, restored: restored.restored, baselineCapturedAt: restored.baseline.capturedAt }
        },
        select: { createdAt: true }
      });
      return { ...restored, resetAt: row.createdAt.toISOString() };
    }, DEMO_TRANSACTION);
    req.app.get("io")?.emit?.("demo:reset", { resetAt: result.resetAt });
    const body: DemoResetResponse = { ok: true, resetAt: result.resetAt, removed: result.removed, restored: result.restored };
    res.json(body);
  })
);

router.post(
  "/prepare",
  asyncHandler(async (req: AuthRequest, res) => {
    const origin = await requireOrigin(req.user!);
    demoResetSchema.parse(req.body);
    const changes = await prisma.$transaction(async (tx) => {
      const made = await prepareInvestorDemo(tx, origin.id);
      await tx.auditLog.create({
        data: {
          actorUserId: origin.id,
          actorRole: Role.SUPER_ADMIN,
          action: "demo.prepare",
          entityType: "DEMO",
          entityId: "prepare",
          metadata: { changes: made.join(",") }
        }
      });
      return made;
    }, DEMO_TRANSACTION);
    res.json({ ok: true, changes });
  })
);

router.post(
  "/baseline",
  asyncHandler(async (req: AuthRequest, res) => {
    const origin = await requireOrigin(req.user!);
    demoResetSchema.parse(req.body);
    const info = await prisma.$transaction(async (tx) => {
      const captured = await captureBaseline(tx);
      await tx.auditLog.create({
        data: {
          actorUserId: origin.id,
          actorRole: Role.SUPER_ADMIN,
          action: "demo.baseline",
          entityType: "DEMO",
          entityId: "baseline",
          metadata: { tables: captured.tables, rows: captured.rows }
        }
      });
      return captured;
    }, DEMO_TRANSACTION);
    const body: DemoBaselineResponse = { ok: true, ...info };
    res.json(body);
  })
);

export default router;

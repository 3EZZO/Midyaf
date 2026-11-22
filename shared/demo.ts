import { z } from "zod";
import type { PortalKey, Role, Session } from "./domain.js";

/**
 * SIX-TASKS #6: one-click Investor Demo.
 *
 * Security model: the presenter signs in ONCE as the Super Admin. From that
 * session (or any demo session it started) they may switch instantly to any
 * certified synthetic demo persona, and back, without credentials. Every
 * switched session carries the originating Super Admin id; the server re-checks
 * that this admin still exists and is still SUPER_ADMIN on every switch/reset.
 * Disabled unless the server runs with DEMO_MODE_ENABLED=true.
 *
 * GET  /api/demo/status            -> DemoStatusDto   (any signed-in user)
 * POST /api/demo/switch {persona}  -> Session JSON    ({ user, accessToken, refreshToken })
 * POST /api/demo/reset  {confirm:true} -> DemoResetResponse
 * POST /api/demo/prepare {confirm:true} -> DemoPrepareResponse
 *   Idempotent readiness: makes the client persona a viewer of the planning
 *   event (its "Plans awaiting approval" queue) and the company persona an
 *   admin of the demo organizing company. Run once, then save the baseline.
 * POST /api/demo/baseline {confirm:true} -> DemoBaselineResponse
 *   Saves the CURRENT data as the state every reset returns to. Do this once
 *   when the demo looks exactly right before a pitch.
 *
 * Errors: 404 when demo mode is disabled; 403 when the session is neither a
 * Super Admin nor a demo session started by one; 409 when a persona account is
 * missing from the database, or on reset when no baseline was saved yet.
 */
export const DEMO_PERSONA_KEYS = [
  "admin",
  "company",
  "eventLead",
  "logistics",
  "client",
  "supplier",
  "coordinator",
  "driver",
  "guestVip"
] as const;

export type DemoPersonaKey = (typeof DEMO_PERSONA_KEYS)[number];

export type DemoPersonaDto = {
  key: DemoPersonaKey;
  role: Role;
  /** Synthetic display name of the stored account. */
  name: string;
  /** The portal the shell should open after switching. */
  portal: PortalKey;
  labelEn: string;
  labelAr: string;
  available: boolean;
};

export type DemoStatusDto = {
  enabled: boolean;
  /** The current session may switch persona / reset the demo. */
  canSwitch: boolean;
  canReset: boolean;
  /** Persona of the current session, when it is one of the demo personas. */
  activePersona: DemoPersonaKey | null;
  /** The Super Admin who started this demo session, if it is a switched one. */
  origin: { id: string; name: string } | null;
  personas: DemoPersonaDto[];
  /** ISO time of the last reset, if any is recorded. */
  lastResetAt: string | null;
  /** ISO time the reset baseline was saved; null = nothing to reset to yet. */
  baselineCapturedAt: string | null;
};

export const demoSwitchSchema = z.object({ persona: z.enum(DEMO_PERSONA_KEYS) }).strict();
export const demoResetSchema = z.object({ confirm: z.literal(true) }).strict();

export type DemoSwitchResponse = Session;

export type DemoPrepareResponse = { ok: true; changes: Array<"client-planning-membership" | "company-org-admin"> };

export type DemoBaselineResponse = { ok: true; capturedAt: string; tables: number; rows: number };

export type DemoResetResponse = {
  ok: true;
  resetAt: string;
  /** Rows removed and restored, per area (for the confirmation toast). */
  removed: number;
  restored: number;
};

export const DEMO_PERSONA_META: Record<DemoPersonaKey, { portal: PortalKey; labelEn: string; labelAr: string }> = {
  admin: { portal: "admin", labelEn: "Midyaf Owner (Super Admin)", labelAr: "مالك مضياف (المشرف العام)" },
  company: { portal: "company", labelEn: "Organizing Company", labelAr: "الشركة المنظمة" },
  eventLead: { portal: "company", labelEn: "Event Manager (Organizer)", labelAr: "مدير الفعالية (المنظم)" },
  logistics: { portal: "sila_operations", labelEn: "Logistics Manager", labelAr: "مدير اللوجستيات" },
  client: { portal: "client", labelEn: "Client", labelAr: "العميل" },
  supplier: { portal: "supplier", labelEn: "Supplier", labelAr: "المورد" },
  coordinator: { portal: "coordinator", labelEn: "Field Coordinator", labelAr: "المنسق الميداني" },
  driver: { portal: "captain", labelEn: "Captain (Driver)", labelAr: "الكابتن (السائق)" },
  guestVip: { portal: "guest", labelEn: "VIP Guest", labelAr: "ضيف كبار الشخصيات" }
};

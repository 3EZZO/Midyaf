import { z } from "zod";
import {
  EVENT_SUBTEAMS,
  WORKSPACE_LIMITS,
  manualPlanItemSchema,
  plainText,
  storedManualPlanItemSchema,
  type EventPlanDto
} from "./overhaul.js";

/**
 * SIX-TASKS #4: inline editing of a generated (AI / rules-based) or manual
 * event plan. The editor works on one normalized shape, whatever produced the
 * plan, and the server merges it back into the stored content, keeping the
 * provenance (generator, disclaimer, guests, warnings) and marking the plan
 * as edited ("AI-Generated (Edited)").
 *
 * PATCH /api/workspace/events/:eventId/plans/:planId  body: EditablePlan
 * - DRAFT plan: updated in place (same id and version).
 * - APPROVED / SUPERSEDED plan: a new DRAFT version is created from it; the
 *   approved plan stays operational until the new draft is approved.
 * Response: { plan: EventPlanDto, created: boolean }
 */

const count = z.number().int().min(0).max(WORKSPACE_LIMITS.maxEventCount);
const subteam = z.enum(EVENT_SUBTEAMS);
const isoOrNull = z.string().datetime({ offset: true }).nullable();

export const planScheduleEntrySchema = z
  .object({ subteam, name: plainText(1, 160), startsAt: isoOrNull })
  .strict();

export const editablePlanSchema = z
  .object({
    summary: plainText(2, 2000, true),
    hotelDistribution: z
      .object({ zone: plainText(1, 120).nullable(), vipSingleRooms: count, regularTwinRooms: count })
      .strict(),
    vehicleRequirements: z.object({ vip: count, shuttle: count }).strict(),
    teamRequirements: z
      .array(z.object({ subteam, minimumPeople: count }).strict())
      .max(EVENT_SUBTEAMS.length)
      .refine((rows) => new Set(rows.map((row) => row.subteam)).size === rows.length, "Each team appears once"),
    schedule: z.array(planScheduleEntrySchema).max(30),
    scopeOfWork: z.array(plainText(1, 300)).max(40),
    items: z.array(manualPlanItemSchema).max(40)
  })
  .strict();

export type EditablePlan = z.infer<typeof editablePlanSchema>;
/** The JSON the client sends (dates stay ISO strings). */
export type EditablePlanInput = z.input<typeof editablePlanSchema>;

export type PlanEditResponse = { plan: EventPlanDto; created: boolean };

export type PlanEditMeta = {
  at: string;
  byUserId: string;
  fromPlanId: string;
  fromVersion: number;
  originalSource: EventPlanDto["source"];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isoOrNullValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function asSubteam(value: unknown): (typeof EVENT_SUBTEAMS)[number] | null {
  return typeof value === "string" && (EVENT_SUBTEAMS as readonly string[]).includes(value)
    ? (value as (typeof EVENT_SUBTEAMS)[number])
    : null;
}

/**
 * Normalizes any stored plan (deterministic rules, AI provider, manual or a
 * previously edited plan) into the editor shape. Unknown or malformed parts
 * become empty/zero, so the editor always opens prefilled, never blank.
 */
export function editablePlanFromContent(summary: string, content: unknown): EditablePlan {
  const c = record(content);
  const hotel = record(c.hotelDistribution);
  const vehicles = record(c.vehicleRequirements);
  const logistics = record(c.logistics);
  const items = z.array(storedManualPlanItemSchema).safeParse(c.items);
  const manualItems = items.success
    ? items.data.map((item) => ({ category: item.category, quantity: item.quantity, ...(item.note ? { note: item.note } : {}) }))
    : [];

  // Manual plans store their rooms / cars as items; reflect them in the totals.
  const itemTotal = (category: string) => manualItems.filter((item) => item.category === category).reduce((sum, item) => sum + item.quantity, 0);

  const scheduleSource = Array.isArray(c.schedule) ? c.schedule : Array.isArray(c.phases) ? c.phases : Array.isArray(logistics.phases) ? logistics.phases : [];
  const schedule = scheduleSource
    .map((entry) => {
      const row = record(entry);
      const team = asSubteam(row.subteam);
      const name = str(row.name);
      return team && name ? { subteam: team, name: name.slice(0, 160), startsAt: isoOrNullValue(row.startsAt) } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .slice(0, 30);

  const seen = new Set<string>();
  const teamRequirements = (Array.isArray(c.teamRequirements) ? c.teamRequirements : [])
    .map((entry) => {
      const row = record(entry);
      const team = asSubteam(row.subteam);
      if (!team || seen.has(team)) return null;
      seen.add(team);
      return { subteam: team, minimumPeople: num(row.minimumPeople ?? row.people) };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const scopeOfWork = (Array.isArray(c.scopeOfWork) ? c.scopeOfWork : [])
    .map((entry) => str(entry))
    .filter((entry): entry is string => entry !== null)
    .map((entry) => entry.slice(0, 300))
    .slice(0, 40);

  const hasRules = Object.keys(hotel).length > 0 || Object.keys(vehicles).length > 0;
  return {
    summary: (summary.trim() || "Event plan").slice(0, 2000),
    hotelDistribution: {
      zone: str(hotel.zone)?.slice(0, 120) ?? null,
      vipSingleRooms: hasRules ? num(hotel.vipSingleRooms) : 0,
      regularTwinRooms: hasRules ? num(hotel.regularTwinRooms) : itemTotal("HOTEL_ROOMS")
    },
    vehicleRequirements: {
      vip: hasRules ? num(vehicles.vip) : 0,
      shuttle: hasRules ? num(vehicles.shuttle) : itemTotal("VEHICLES")
    },
    teamRequirements,
    schedule,
    scopeOfWork,
    items: manualItems
  };
}

/**
 * Merges a validated edit into the stored content. Provenance fields are kept;
 * the edited sections replace the old ones; `edited` records who/when/from.
 * The caller re-derives `rfqDraft` afterwards.
 */
export function applyPlanEdit(content: unknown, edit: EditablePlan, meta: PlanEditMeta): Record<string, unknown> {
  const { rfqDraft: _stale, ...base } = record(content);
  const previous = record(base.edited);
  const schedule = edit.schedule.map((row) => ({
    subteam: row.subteam,
    name: row.name,
    startsAt: row.startsAt ? new Date(row.startsAt).toISOString() : null
  }));
  const totalRooms = edit.hotelDistribution.vipSingleRooms + edit.hotelDistribution.regularTwinRooms;
  const totalVehicles = edit.vehicleRequirements.vip + edit.vehicleRequirements.shuttle;
  return {
    ...base,
    hotelRooms: totalRooms,
    hotelDistribution: { ...edit.hotelDistribution, totalRooms },
    vehicleRequirements: { ...edit.vehicleRequirements, total: totalVehicles },
    vehicles: { ...record(base.vehicles), vip: edit.vehicleRequirements.vip, shuttle: edit.vehicleRequirements.shuttle, recommended: totalVehicles },
    teamRequirements: edit.teamRequirements,
    schedule,
    phases: schedule,
    logistics: { ...record(base.logistics), phases: schedule },
    scopeOfWork: edit.scopeOfWork,
    items: edit.items.map((item) => ({ ...item, note: item.note ?? null })),
    edited: {
      at: meta.at,
      byUserId: meta.byUserId,
      fromPlanId: typeof previous.fromPlanId === "string" ? previous.fromPlanId : meta.fromPlanId,
      fromVersion: typeof previous.fromVersion === "number" ? previous.fromVersion : meta.fromVersion,
      originalSource: typeof previous.originalSource === "string" ? previous.originalSource : meta.originalSource,
      count: num(previous.count) + 1
    }
  };
}

export function isEditedPlanContent(content: unknown): boolean {
  return Object.keys(record(record(content).edited)).length > 0;
}

/** Bilingual provenance label, e.g. "AI-Generated (Edited)". */
export function planProvenanceLabel(plan: Pick<EventPlanDto, "source"> & { edited?: boolean }, ar: boolean): string {
  const base =
    plan.source === "MANUAL"
      ? ar ? "خطة يدوية" : "Manual plan"
      : plan.source === "AI_PROVIDER"
        ? ar ? "مولدة بالذكاء الاصطناعي" : "AI-Generated"
        : ar ? "مقترح آلي بالقواعد" : "Rules-based advisory";
  return plan.edited ? (ar ? `${base} (معدّلة)` : `${base} (Edited)`) : base;
}

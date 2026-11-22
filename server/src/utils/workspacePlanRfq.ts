import type { Prisma } from "@prisma/client";
import { buildRfqDraft, rfqRequirementsFromPlan, type RfqDraftDto } from "../../../shared/overhaul.js";
import { buildAdvisoryPlan, type EventPlanRow, type OrgEventRow } from "./workspacePolicy.js";

/** Plain JSON copy (Dates become ISO strings) for a Json column. */
export function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  const copy: unknown = JSON.parse(JSON.stringify(value));
  if (!copy || typeof copy !== "object" || Array.isArray(copy)) return {};
  return copy as Prisma.InputJsonObject;
}

/**
 * Server-side, deterministic: quantities come from the plan's validated items
 * (manual / stored rules) or from the rules over the current event counts
 * (AI plans). Nothing from the request body is used.
 */
export function rfqForPlan(
  event: OrgEventRow,
  plan: { id: string; version: number; source: EventPlanRow["source"]; content: unknown },
  now: Date
): RfqDraftDto {
  return buildRfqDraft({
    eventId: event.id,
    planId: plan.id,
    planVersion: plan.version,
    planSource: plan.source,
    event: {
      locationLabel: event.locationLabel,
      venue: event.venue,
      hotelZone: event.hotelZone,
      vipGuestCount: event.vipGuestCount,
      regularGuestCount: event.regularGuestCount,
      carCount: event.carCount,
      startAt: event.startAt,
      endAt: event.endAt,
      arrivalStartAt: event.arrivalStartAt,
      departureEndAt: event.departureEndAt
    },
    requirements: rfqRequirementsFromPlan(plan.source, plan.content, buildAdvisoryPlan(event).content),
    generatedAt: now
  });
}

export function contentWithRfq(content: unknown, rfq: RfqDraftDto): Prisma.InputJsonObject {
  const base = content && typeof content === "object" && !Array.isArray(content) ? content : {};
  return toJsonObject({ ...base, rfqDraft: rfq });
}

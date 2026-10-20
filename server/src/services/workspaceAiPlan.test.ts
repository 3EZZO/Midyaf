import { expect, it } from "vitest";
import { buildRfqDraft, rfqRequirementsFromPlan } from "../../../shared/overhaul.js";
import { buildAdvisoryPlan } from "../utils/workspacePolicy.js";
import { generateWorkspacePlan } from "./workspacePlanning.js";

/**
 * RADAR-ORGANIZER-001: an AI-provider plan stays advisory, and its RFQ draft
 * takes quantities only from the deterministic rules over the event counts.
 * Numbers, prices or suppliers in AI text are never parsed into the draft.
 */

const event = {
  vipGuestCount: 3,
  regularGuestCount: 20,
  carCount: 5,
  hotelZone: "Synthetic zone",
  locationLabel: "Synthetic district",
  venue: "Synthetic Hall",
  startAt: new Date("2026-11-01T06:00:00Z"),
  endAt: new Date("2026-11-03T06:00:00Z"),
  arrivalStartAt: null,
  departureEndAt: null
};

const aiText = {
  summary: "Advisory estimate, subject to approval",
  logistics: ["Coordinate arrivals"],
  hotelDistribution: ["Book 999 rooms at Supplier X for SAR 1,200 per night"],
  vehicleRequirements: ["Rent 777 cars from supplier sup_123 at 450 SAR"],
  teamRequirements: ["Hire 555 staff"],
  scopeOfWork: ["Confirm approved scope"]
};

it("drafts an AI plan's RFQ from the rules, ignoring every number, price and supplier in the AI text", async () => {
  const plan = await generateWorkspacePlan(event, async () => JSON.stringify(aiText));
  expect(plan.source).toBe("AI_PROVIDER");
  expect(plan.advisory).toBe(true);

  const rules = buildAdvisoryPlan(event).content;
  const rfq = buildRfqDraft({
    eventId: "evt_ai",
    planId: "plan_ai",
    planVersion: 1,
    planSource: plan.source,
    event,
    requirements: rfqRequirementsFromPlan(plan.source, plan.content, rules),
    generatedAt: new Date("2026-10-20T00:00:00Z")
  });

  expect(rfq.quantitiesFrom).toBe("DETERMINISTIC_RULES");
  const quantities = rfq.lines.map((line) => line.quantity);
  for (const invented of [999, 777, 555]) expect(quantities).not.toContain(invented);
  const sum = (category: string) => rfq.lines.filter((l) => l.category === category).reduce((s, l) => s + l.quantity, 0);
  expect(sum("HOTEL_ROOMS")).toBe(rules.hotelDistribution.totalRooms);
  expect(sum("VEHICLES")).toBe(rules.vehicleRequirements.total);

  const text = JSON.stringify(rfq);
  for (const leaked of ["Supplier X", "sup_123", "SAR 1,200", "450 SAR", "1,200"]) expect(text).not.toContain(leaked);
  expect(rfq.notes.join(" ")).toContain("not from AI text");
});

it("falls back to the rules-based plan, labelled as such, when the provider is unavailable", async () => {
  const plan = await generateWorkspacePlan(event, async () => null);
  expect(plan.source).toBe("DETERMINISTIC_ADVISORY");
  expect(plan.content).toHaveProperty("disclaimer");
  const rfq = buildRfqDraft({
    eventId: "evt_ai",
    planId: "plan_rules",
    planVersion: 2,
    planSource: plan.source,
    event,
    requirements: rfqRequirementsFromPlan(plan.source, plan.content, buildAdvisoryPlan(event).content),
    generatedAt: new Date("2026-10-20T00:00:00Z")
  });
  expect(rfq.quantitiesFrom).toBe("PLAN_ITEMS");
  expect(rfq.scope.serviceDays).toBe(2);
});

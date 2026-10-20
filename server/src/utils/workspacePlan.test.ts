import { describe, expect, it } from "vitest";
import {
  RFQ_LIMITS,
  buildRfqDraft,
  planGenerateSchema,
  rfqDraftFromPlanContent,
  rfqDraftSchema,
  rfqDraftText,
  rfqRequirementsFromPlan,
  type RfqEventInput
} from "../../../shared/overhaul.js";
import { buildAdvisoryPlan } from "./workspacePolicy.js";

/**
 * RADAR-ORGANIZER-001: the RFQ draft is a deterministic, bounded function of
 * the plan's authoritative items and the event counts. Same input, same
 * draft; no prices, suppliers or guest data; quantities never invented.
 */

const event = {
  vipGuestCount: 4,
  regularGuestCount: 20,
  carCount: 6,
  hotelZone: "Synthetic north",
  locationLabel: "Synthetic district",
  venue: "Synthetic Hall",
  startAt: new Date("2026-12-01T06:00:00Z"),
  endAt: new Date("2026-12-02T18:00:00Z"),
  arrivalStartAt: new Date("2026-11-30T06:00:00Z"),
  departureEndAt: new Date("2026-12-03T18:00:00Z")
};
const rfqEvent: RfqEventInput = event;
const at = new Date("2026-10-20T00:00:00Z");
const advisory = buildAdvisoryPlan(event);

function draft(source: "DETERMINISTIC_ADVISORY" | "MANUAL" | "AI_PROVIDER", content: unknown, version = 1) {
  return buildRfqDraft({
    eventId: "evt_syn01",
    planId: "plan_synthetic",
    planVersion: version,
    planSource: source,
    event: rfqEvent,
    requirements: rfqRequirementsFromPlan(source, content, advisory.content),
    generatedAt: at
  });
}

describe("buildRfqDraft", () => {
  it("copies a deterministic plan's hotel, vehicle and team quantities", () => {
    const rfq = draft("DETERMINISTIC_ADVISORY", advisory.content);
    expect(rfq.quantitiesFrom).toBe("PLAN_ITEMS");
    const qty = (category: string) => rfq.lines.filter((l) => l.category === category).reduce((s, l) => s + l.quantity, 0);
    expect(qty("HOTEL_ROOMS")).toBe(advisory.content.hotelDistribution.totalRooms);
    expect(qty("VEHICLES")).toBe(advisory.content.vehicleRequirements.total);
    expect(qty("STAFF")).toBe(advisory.content.teamRequirements.reduce((s, t) => s + t.minimumPeople, 0));
    expect(rfq.lines.every((l) => l.serviceDays === 4)).toBe(true);
  });

  it("is deterministic and bounded by its schema", () => {
    expect(draft("DETERMINISTIC_ADVISORY", advisory.content)).toEqual(draft("DETERMINISTIC_ADVISORY", advisory.content));
    const rfq = draft("DETERMINISTIC_ADVISORY", advisory.content);
    expect(rfqDraftSchema.parse(rfq)).toEqual(rfq);
    expect(rfq).toMatchObject({ status: "DRAFT", sent: false, reference: "RFQ-EVTSYN01-P1" });
    expect(draft("DETERMINISTIC_ADVISORY", advisory.content, 3).reference).toBe("RFQ-EVTSYN01-P3");
  });

  it("uses a manual plan's validated items, skipping zero quantities", () => {
    const rfq = draft("MANUAL", {
      items: [
        { category: "HOTEL_ROOMS", quantity: 12, note: "Hotels: four-star" },
        { category: "TICKETS", quantity: 30, note: "Tickets: arrivals" },
        { category: "STAFF", quantity: 0, note: "Teams: later" }
      ]
    });
    expect(rfq.quantitiesFrom).toBe("PLAN_ITEMS");
    expect(rfq.lines).toEqual([
      { category: "HOTEL_ROOMS", description: "Hotels: four-star", quantity: 12, unit: "rooms", serviceDays: 4 },
      { category: "TICKETS", description: "Tickets: arrivals", quantity: 30, unit: "tickets", serviceDays: null }
    ]);
  });

  it("keeps a stored manual plan's quantities when its notes were absent (persisted as null)", () => {
    const rfq = draft("MANUAL", {
      items: [
        { category: "HOTEL_ROOMS", quantity: 7, note: null },
        { category: "VEHICLES", quantity: 3 },
        { category: "STAFF", quantity: 9, note: null }
      ]
    });
    expect(rfq.quantitiesFrom).toBe("PLAN_ITEMS");
    expect(rfq.lines.map((l) => [l.category, l.quantity])).toEqual([["HOTEL_ROOMS", 7], ["VEHICLES", 3], ["STAFF", 9]]);
    expect(rfqDraftSchema.parse(rfq)).toEqual(rfq);
    // Null is accepted only on the stored read; the request schema still rejects it.
    expect(planGenerateSchema.safeParse({ mode: "MANUAL", summary: "Synthetic", items: [{ category: "VEHICLES", quantity: 3, note: null }] }).success).toBe(false);
  });

  it("falls back to the rules for malformed or tampered stored content, never to its numbers", () => {
    for (const content of [null, [], { items: [{ category: "HOTEL_ROOMS", quantity: -5 }] }, { items: [{ category: "HOTEL_ROOMS", quantity: 2, unitPrice: 900 }] }]) {
      expect(draft("MANUAL", content).quantitiesFrom).toBe("DETERMINISTIC_RULES");
    }
    const tampered = { ...advisory.content, hotelDistribution: { vipSingleRooms: 1e9, regularTwinRooms: 1 } };
    const rfq = draft("DETERMINISTIC_ADVISORY", tampered);
    expect(rfq.quantitiesFrom).toBe("DETERMINISTIC_RULES");
    expect(Math.max(...rfq.lines.map((l) => l.quantity))).toBeLessThanOrEqual(advisory.content.hotelDistribution.totalRooms);
  });

  it("caps line count and text length", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ category: "OTHER", quantity: i + 1, note: "x".repeat(300) }));
    const rfq = draft("MANUAL", { items });
    expect(rfq.lines.length).toBeLessThanOrEqual(RFQ_LIMITS.maxLines);
    expect(rfq.lines.every((l) => l.description.length <= RFQ_LIMITS.maxText)).toBe(true);
  });

  it("carries no prices, supplier ids or guest data, and its text says it was not sent", () => {
    const rfq = draft("DETERMINISTIC_ADVISORY", advisory.content);
    const keys = JSON.stringify(rfq).match(/"[A-Za-z]+":/g) ?? [];
    for (const forbidden of ['"price":', '"unitPrice":', '"supplierId":', '"guestName":', '"fullName":', '"lat":', '"lng":']) {
      expect(keys).not.toContain(forbidden);
    }
    const text = rfqDraftText(rfq);
    expect(text).toContain("DRAFT (not sent)");
    expect(text).toContain("Unit price: to be quoted by the vendor.");
  });

  it("reads back only a valid stored draft", () => {
    const rfq = draft("DETERMINISTIC_ADVISORY", advisory.content);
    expect(rfqDraftFromPlanContent({ ...advisory.content, rfqDraft: rfq })).toEqual(rfq);
    expect(rfqDraftFromPlanContent({ rfqDraft: { ...rfq, sent: true } })).toBeNull();
    expect(rfqDraftFromPlanContent({ rfqDraft: { ...rfq, lines: [{ ...rfq.lines[0], unitPrice: 5 }] } })).toBeNull();
    expect(rfqDraftFromPlanContent(null)).toBeNull();
  });
});

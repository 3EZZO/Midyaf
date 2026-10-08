import { describe, expect, it } from "vitest";
import type { MidyafData } from "@shared/domain";
import { buildBriefingContext } from "./aiBriefs";
import { localAiReply } from "./localAiReply";

/** Just enough workspace for the briefing selectors. */
function workspace(event: {
  id: string;
  name: string;
  venue: string;
  date: string;
  driverStatuses: string[];
  taskStatuses: string[];
  guests: number;
}): MidyafData {
  return {
    events: [
      {
        id: event.id,
        name: event.name,
        venue: event.venue,
        date: event.date,
        status: "LIVE",
        tasks: event.taskStatuses.map((status, i) => ({
          id: `${event.id}-t${i}`,
          status
        })),
        guests: Array.from({ length: event.guests }, (_, i) => ({
          id: `${event.id}-g${i}`,
          isVIP: i === 0,
          rsvpStatus: i < 2 ? "ARRIVED" : "CONFIRMED"
        })),
        bookings: []
      }
    ],
    drivers: event.driverStatuses.map((status, i) => ({
      id: `${event.id}-d${i}`,
      status,
      currentLat: null,
      currentLng: null
    })),
    vendorQuotes: [],
    contracts: [],
    commission: [{ defaultPercent: 12, minPercent: 10, maxPercent: 15 }]
  } as unknown as MidyafData;
}

const lakeside = workspace({
  id: "evt-lake",
  name: "Lakeside Leaders Retreat",
  venue: "Najran Valley Lodge",
  date: "2027-06-12T08:00:00.000Z",
  driverStatuses: ["EN_ROUTE", "AVAILABLE", "OFFLINE"],
  taskStatuses: ["PENDING", "EN_ROUTE", "COMPLETED", "DELAYED"],
  guests: 5
});
const capital = workspace({
  id: "evt-cap",
  name: "Capital Design Biennale",
  venue: "Riyadh Arts Quarter",
  date: "2027-10-30T08:00:00.000Z",
  driverStatuses: ["BUSY", "BUSY", "ASSIGNED", "AVAILABLE"],
  taskStatuses: ["COMPLETED", "COMPLETED", "COMPLETED"],
  guests: 3
});

describe("buildBriefingContext → contextual narration", () => {
  it("names each workspace's own event in both languages", () => {
    for (const language of ["en", "ar"]) {
      const a = localAiReply("Track the chauffeur", language, "Noura", buildBriefingContext(lakeside, []));
      const b = localAiReply("Track the chauffeur", language, "Noura", buildBriefingContext(capital, []));
      expect(a.body).toContain("Lakeside Leaders Retreat");
      expect(a.body).toContain("Najran Valley Lodge");
      expect(a.body).toContain("2027-06-12");
      expect(a.body).not.toContain("Capital Design Biennale");
      expect(b.body).toContain("Capital Design Biennale");
      expect(b.body).toContain("Riyadh Arts Quarter");
      expect(b.body).not.toContain("Lakeside Leaders Retreat");
    }
  });

  it("reports the selector numbers and follows a changed snapshot", () => {
    const before = localAiReply("Post-event analytics", "en", "Ops Manager", buildBriefingContext(lakeside, []));
    expect(before.body).toContain("On-time rate: 50% across 2 measured tasks.");
    expect(before.body).toContain("Transport tasks: 4 total — 1 completed, 1 in progress, 1 delayed, 1 pending.");
    expect(before.body).toContain("Guests: 2 of 5 arrived, 1 VIP.");

    // The delayed task completes: the same question now reports the change.
    const next: MidyafData = {
      ...lakeside,
      events: [
        {
          ...lakeside.events[0],
          tasks: lakeside.events[0].tasks.map((t) =>
            t.status === "DELAYED" ? { ...t, status: "COMPLETED" as const } : t
          )
        }
      ]
    };
    const after = localAiReply("Post-event analytics", "en", "Ops Manager", buildBriefingContext(next, []));
    expect(after.body).toContain("On-time rate: 100% across 2 measured tasks.");
    expect(after.body).toContain("2 completed, 1 in progress, 0 delayed");
    expect(after.actions).toEqual(before.actions);
  });

  it("is honest for a workspace without an event", () => {
    const empty = { ...lakeside, events: [], drivers: [] } as MidyafData;
    const context = buildBriefingContext(empty, []);
    expect(context.event).toBeNull();
    const reply = localAiReply("Show the agenda", "en", "Noura", context);
    expect(reply.body).toContain("event details are not available");
    expect(reply.body).toContain("Transport tasks: 0 total");
    expect(reply.body).not.toMatch(/FII|Ritz|KAICC/);
  });

  it("marks the rehearsal so the stream narrates it locally", () => {
    expect(buildBriefingContext(lakeside, [], true).demo).toBe(true);
    expect(buildBriefingContext(lakeside, []).demo).toBe(false);
  });
});

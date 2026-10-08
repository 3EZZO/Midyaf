import { describe, expect, it, vi } from "vitest";

// Deterministic replies must not depend on a provider key being configured.
vi.mock("../env.js", () => ({
  env: { OPENAI_API_KEY: undefined, OPENAI_MODEL: "test-model" }
}));

import { chatGuide, resolveSmartQuery, streamChatCompletion } from "./ai.js";

const FABRICATED =
  /FII|Future Investment|مستقبل الاستثمار|Ritz|الريتز|SV102|Maybach|مايباخ|Al-Faisal|الفيصل|SaudiVision2030|NPS 88|145,000/;

/** An operator's briefing snapshot, as `buildBriefingContext` sends it. */
function briefing(name: string, venue: string, date: string, active: number) {
  return {
    demo: false,
    event: { id: `evt-${name}`, name, venue, date, status: "LIVE" },
    fleet: { total: 6, active, idle: 6 - active, offline: 0, utilisationPercent: 50 },
    sla: { onTimePercent: 75, completed: 3, delayed: 1, totalTasks: 8 },
    tasks: { PENDING: 2, ASSIGNED: 1, EN_ROUTE: 1, COMPLETED: 3, DELAYED: 1 },
    guests: { total: 20, vip: 4, arrived: 9 },
    finance: { commissionSAR: 1200, contractedSpendSAR: 10000, marginPercent: 12 },
    geofences: [],
    recentEvents: []
  };
}

const coast = briefing("Red Sea Summit", "Jeddah Superdome", "2027-02-10", 3);
const north = briefing("Northern Lights Expo", "Tabuk Exhibition Centre", "2027-09-21", 5);

async function collect(input: Parameters<typeof streamChatCompletion>[0]) {
  const events = [];
  for await (const evt of streamChatCompletion(input)) events.push(evt);
  return events;
}

describe("resolveSmartQuery event narration", () => {
  it("narrates the authorized event and follows a changed snapshot", () => {
    const a = resolveSmartQuery("Where is the chauffeur?", "en", "Noura", coast);
    const b = resolveSmartQuery("Where is the chauffeur?", "en", "Noura", north);

    expect(a.matched).toBe(true);
    expect(a.toolIntent).toBe("driver_touchdown_match");
    expect(a.actions?.map((x) => x.actionId)).toEqual(["track_driver", "call_chauffeur"]);
    expect(a.content).toContain("Red Sea Summit, Jeddah Superdome, 2027-02-10");
    expect(a.content).toContain("3 active");
    expect(a.content).not.toContain("Northern Lights Expo");
    expect(b.content).toContain("Northern Lights Expo");
    expect(b.content).toContain("5 active");
    expect(b.content).not.toContain("Red Sea Summit");
    expect(b.actions).toEqual(a.actions);
  });

  it("answers in readable Arabic for the same scenario and actions", () => {
    const en = resolveSmartQuery("Triple-Key Vault status", "en", "Noura", coast);
    const ar = resolveSmartQuery("Triple-Key Vault status", "ar", "Noura", coast);
    expect(ar.content).toMatch(/[ء-ي]/);
    expect(ar.content).toContain("Red Sea Summit");
    expect(ar.content).toContain("خزنة العروض");
    expect(ar.actions).toEqual(en.actions);
    expect(ar.toolIntent).toBe(en.toolIntent);
  });

  it("never falls back to another event or fabricated facts without context", () => {
    for (const message of [
      "missing vendors",
      "vault",
      "flight surge",
      "hotel suite",
      "chauffeur",
      "agenda",
      "coffee",
      "report",
      "wifi",
      "restaurant",
      "hello"
    ]) {
      for (const language of ["en", "ar"]) {
        const reply = resolveSmartQuery(message, language, "Noura");
        expect(reply.content).not.toMatch(FABRICATED);
        expect(reply.content).toMatch(
          language === "ar" ? /تفاصيل الفعالية غير متوفرة/ : /event details are not available/
        );
      }
    }
  });

  it("answers the situation briefing with the snapshot summary in both languages", () => {
    const en = resolveSmartQuery(
      "Give me a 5-line situation briefing for the operation right now: fleet, on-time SLA, guests, and anything that needs a decision.",
      "en",
      "Noura",
      coast
    );
    const ar = resolveSmartQuery(
      "أعطني إحاطة من خمسة أسطر عن وضع العملية الآن: الأسطول، الالتزام بالمواعيد، الضيوف، وأي أمر يحتاج إلى قرار.",
      "ar",
      "Noura",
      coast
    );
    // Unmatched, like any open question: a configured model may still answer.
    expect(en.matched).toBe(false);
    expect(ar.matched).toBe(false);
    expect(en.content).toContain("Fleet: 3 active");
    expect(en.content).toContain("Guests: 9 of 20 arrived");
    expect(ar.content).toContain("الأسطول: 3 نشط");
    expect(ar.actions).toEqual(en.actions);
  });

  it("gives personal minimal context no aggregate data", () => {
    // What the route forwards for non-operational roles: validated ids only.
    const reply = resolveSmartQuery("Today's schedule", "en", "Saif & Munirah", {
      eventId: "evt_1",
      guestIds: ["guest_1"]
    });
    expect(reply.content).toContain("event details are not available");
    expect(reply.content).toContain("Task data is not available");
    expect(reply.content).not.toMatch(/\d/);
  });

  it("tells the synthetic demo context apart from real event details", () => {
    const reply = resolveSmartQuery("Chauffeur status", "en", "Noura", {
      demo: true,
      note: "Scripted showcase simulation. All figures are synthetic."
    });
    expect(reply.content).toContain("event details are not available");
    expect(reply.content).toContain("Fleet data is not available");
  });
});

describe("chatGuide without an API key", () => {
  it("returns the contextual deterministic reply", async () => {
    const reply = await chatGuide({
      message: "Post-event analytics",
      language: "en",
      persona: "Ops Manager",
      context: north
    });
    expect(reply.persona).toBe("Ops Manager");
    expect(reply.content.startsWith("Ops Manager: ")).toBe(true);
    expect(reply.content).toContain("Northern Lights Expo");
    expect(reply.content).toContain("On-time rate: 75% across 4 measured tasks.");
    expect(reply.content).toContain("contracted spend SAR 10,000");
    expect(reply.toolIntent).toBe("post_event_analytics");
    expect(reply.actions?.map((a) => a.actionId)).toEqual(["generate_report"]);
  });

  it("is honest for an unmatched message with no context", async () => {
    const reply = await chatGuide({ message: "hello", language: "ar" });
    expect(reply.content).toContain("تفاصيل الفعالية غير متوفرة");
    expect(reply.content).not.toMatch(FABRICATED);
    expect(reply.actions?.map((a) => a.actionId)).toEqual([
      "send_vendor_sms",
      "scroll_to_vault",
      "divert_fleet",
      "track_driver"
    ]);
  });
});

describe("streamChatCompletion without an API key", () => {
  it("replays the contextual reply with meta first and matching deltas", async () => {
    const events = await collect({
      message: "Terminal 2 flight surge",
      language: "ar",
      persona: "Noura",
      context: coast
    });
    expect(events[0]).toMatchObject({
      type: "meta",
      meta: { source: "local", toolIntent: "airport_flight_surge" }
    });
    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    const content = last.type === "done" ? last.content : "";
    const deltas = events
      .map((e) => (e.type === "delta" ? e.delta : ""))
      .join("");
    expect(deltas).toBe(content);
    expect(content).toContain("Red Sea Summit");
    expect(content).toContain("وصل 9 من أصل 20");
    expect(content).not.toMatch(FABRICATED);
  });

  it("keeps the welcome actions and is honest for a minimal context", async () => {
    const events = await collect({
      message: "hello",
      language: "en",
      persona: "Saif & Munirah",
      context: { eventId: "evt_1" }
    });
    const meta = events[0].type === "meta" ? events[0].meta : null;
    expect(meta?.actions?.map((a) => a.actionId)).toEqual([
      "send_vendor_sms",
      "scroll_to_vault",
      "divert_fleet",
      "track_driver"
    ]);
    const last = events[events.length - 1];
    expect(last.type === "done" && last.content).toContain(
      "event details are not available"
    );
  });
});

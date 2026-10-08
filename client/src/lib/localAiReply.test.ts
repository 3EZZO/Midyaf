import { describe, expect, it } from "vitest";
import { localAiReply } from "./localAiReply";

/**
 * VIS-01: the offline/failed-stream fallback must match real Arabic input and
 * answer in readable Arabic, with the same scenario order and action IDs.
 * VIS-04: the body is narrated from the caller's snapshot, never fixed
 * sample content from another event.
 */

// Characters that only appear when UTF-8 Arabic was decoded as Windows-1252.
const MOJIBAKE = /[ØÙÃÂ]|â€/;
const ARABIC_LETTER = /[ء-ي]/;
const FABRICATED =
  /FII|Future Investment|مستقبل الاستثمار|Ritz|الريتز|SV102|Maybach|مايباخ|Al-Faisal|الفيصل|SaudiVision2030|NPS 88|145,000|Bujairi|البجيري/;

function expectReadableArabic(text: string) {
  expect(text).not.toMatch(MOJIBAKE);
  expect(text).toMatch(ARABIC_LETTER);
}

const SCENARIOS: Array<{
  name: string;
  arabicMessage: string;
  englishMessage: string;
  arabicPhrase: string;
  actionIds: string[];
}> = [
  {
    name: "missing vendors",
    arabicMessage: "من هم الموردين الغائبين؟",
    englishMessage: "Which vendor is missing?",
    arabicPhrase: "فحص الموردين —",
    actionIds: ["send_vendor_sms", "view_vendor_map"]
  },
  {
    name: "security vault",
    arabicMessage: "افتح الخزنة",
    englishMessage: "Open the vault",
    arabicPhrase: "خزنة العروض —",
    actionIds: ["scroll_to_vault"]
  },
  {
    name: "airport surge",
    arabicMessage: "وصلت رحلات كثيرة",
    englishMessage: "Flight surge",
    arabicPhrase: "الوصول —",
    actionIds: ["divert_fleet"]
  },
  {
    name: "hospitality riders",
    arabicMessage: "تجهيزات الفندق",
    englishMessage: "Hotel suite amenities",
    arabicPhrase: "الضيافة —",
    actionIds: ["inspect_riders"]
  },
  {
    name: "chauffeur",
    arabicMessage: "أين السائق؟",
    // "driver" contains "rider", which the hospitality branch matches first.
    englishMessage: "Track the chauffeur",
    arabicPhrase: "الكباتن —",
    actionIds: ["track_driver"]
  },
  {
    name: "schedule",
    arabicMessage: "ما هو جدول اليوم",
    englishMessage: "Show the agenda",
    arabicPhrase: "الجدول —",
    actionIds: ["view_shuttle_gps"]
  },
  {
    name: "catering",
    arabicMessage: "نحتاج تموين",
    englishMessage: "Coffee restock",
    arabicPhrase: "التموين —",
    actionIds: ["confirm_dispatch_staff"]
  },
  {
    name: "post-event report",
    arabicMessage: "أرسل تقرير",
    englishMessage: "Post-event analytics",
    arabicPhrase: "ملخص الأداء —",
    actionIds: ["generate_report"]
  },
  {
    name: "network",
    arabicMessage: "ما هي شبكة الضيوف",
    englishMessage: "Wifi details",
    arabicPhrase: "الشبكة —",
    actionIds: []
  },
  {
    name: "dining",
    arabicMessage: "احجز مطعم",
    englishMessage: "Diriyah restaurant",
    arabicPhrase: "المطاعم —",
    actionIds: []
  }
];

/** Two unrelated briefing snapshots, shaped like `buildBriefingContext`. */
const springGala = {
  demo: false,
  event: {
    id: "evt-spring",
    name: "Spring Gala Dinner",
    venue: "Abha Mountain Pavilion",
    date: "2027-04-05T18:00:00.000Z",
    status: "PUBLISHED"
  },
  fleet: { total: 3, active: 1, idle: 2, offline: 0, utilisationPercent: 33.3 },
  sla: { onTimePercent: 100, completed: 2, delayed: 0, totalTasks: 4 },
  tasks: { PENDING: 1, ASSIGNED: 1, COMPLETED: 2 },
  guests: { total: 8, vip: 2, arrived: 1 },
  finance: { commissionSAR: 0, contractedSpendSAR: 0, marginPercent: 12 },
  geofences: [],
  recentEvents: []
};
const portWeek = {
  ...springGala,
  demo: true,
  event: {
    id: "evt-port",
    name: "Dammam Port Week",
    venue: "King Abdulaziz Port Hall",
    date: "2027-12-01",
    status: "LIVE"
  },
  fleet: { total: 10, active: 8, idle: 1, offline: 1, utilisationPercent: 88.9 },
  guests: { total: 60, vip: 12, arrived: 44 }
};

describe("localAiReply", () => {
  for (const scenario of SCENARIOS) {
    it(`matches Arabic input and replies in readable Arabic: ${scenario.name}`, () => {
      const reply = localAiReply(scenario.arabicMessage, "ar", "Noura");

      expect(reply.body.startsWith("Noura: ")).toBe(true);
      expect(reply.body).toContain(scenario.arabicPhrase);
      expectReadableArabic(reply.body);
      expect((reply.actions ?? []).map((a) => a.actionId)).toEqual(scenario.actionIds);
      for (const action of reply.actions ?? []) {
        expectReadableArabic(action.labelAr);
        expect(action.label).not.toMatch(MOJIBAKE);
      }
    });

    it(`routes the English keyword to the same scenario: ${scenario.name}`, () => {
      const english = localAiReply(scenario.englishMessage, "en", "Noura");
      const arabic = localAiReply(scenario.englishMessage, "ar", "Noura");

      expect(english.body).not.toMatch(MOJIBAKE);
      expect(english.body).not.toMatch(ARABIC_LETTER);
      expect((english.actions ?? []).map((a) => a.actionId)).toEqual(scenario.actionIds);
      // Language changes only the body text, never the scenario or actions.
      expect(arabic.actions).toEqual(english.actions);
      expect(arabic.body).toContain(scenario.arabicPhrase);
    });

    it(`narrates the current event, not a fixed one: ${scenario.name}`, () => {
      for (const language of ["en", "ar"]) {
        const spring = localAiReply(scenario.englishMessage, language, "Noura", springGala);
        const port = localAiReply(scenario.englishMessage, language, "Noura", portWeek);

        expect(spring.body).toContain("Spring Gala Dinner");
        expect(spring.body).toContain("Abha Mountain Pavilion");
        expect(spring.body).toContain("2027-04-05");
        expect(spring.body).not.toContain("Dammam Port Week");
        expect(port.body).toContain("Dammam Port Week");
        expect(port.body).not.toContain("Spring Gala Dinner");
        expect(spring.body).not.toMatch(FABRICATED);
        expect(port.body).not.toMatch(FABRICATED);
        // The snapshot changes the words, never the scenario or its actions.
        expect(port.actions).toEqual(spring.actions);
        expect(spring.actions).toEqual(
          localAiReply(scenario.englishMessage, language, "Noura").actions
        );
      }
    });
  }

  it("keeps the original matching order (dinner is answered by the schedule first)", () => {
    const reply = localAiReply("موعد العشاء", "ar", "Noura");
    expect(reply.actions?.map((a) => a.actionId)).toEqual(["view_shuttle_gps"]);
  });

  it("returns the readable Arabic welcome and its four actions for unmatched input", () => {
    const reply = localAiReply("مرحبا", "ar", "Saud");

    expect(reply.body).toContain("أهلاً بك في منصة مِضياف الذكية");
    expectReadableArabic(reply.body);
    expect(reply.actions?.map((a) => a.actionId)).toEqual([
      "send_vendor_sms",
      "scroll_to_vault",
      "divert_fleet",
      "track_driver"
    ]);
    expect(reply.actions?.map((a) => a.labelAr)).toEqual([
      "فحص الموردين المتأخرين",
      "فحص الخزنة الثلاثية",
      "تنبيه وصول المطار",
      "أين سائقي؟"
    ]);
  });

  it("is deterministic for the same input", () => {
    expect(localAiReply("أين السائق؟", "ar-SA", "Noura", portWeek)).toEqual(
      localAiReply("أين السائق؟", "ar-SA", "Noura", portWeek)
    );
  });

  it("reports the snapshot's numbers and follows a changed snapshot", () => {
    expect(localAiReply("Track the chauffeur", "en", "Noura", springGala).body).toContain(
      "Fleet: 1 active, 2 idle and 0 offline of 3 captains"
    );
    expect(localAiReply("Track the chauffeur", "en", "Noura", portWeek).body).toContain(
      "Fleet: 8 active, 1 idle and 1 offline of 10 captains"
    );
    expect(localAiReply("Flight surge", "ar", "Noura", portWeek).body).toContain(
      "وصل 44 من أصل 60"
    );
  });

  it("answers the situation briefing with the snapshot summary in both languages", () => {
    const en = localAiReply(
      "Give me a 5-line situation briefing for the operation right now: fleet, on-time SLA, guests, and anything that needs a decision.",
      "en",
      "Noura",
      portWeek
    );
    const ar = localAiReply(
      "أعطني إحاطة من خمسة أسطر عن وضع العملية الآن: الأسطول، الالتزام بالمواعيد، الضيوف، وأي أمر يحتاج إلى قرار.",
      "ar",
      "Noura",
      portWeek
    );
    expect(en.body).toContain("Dammam Port Week");
    expect(en.body).toContain("Fleet: 8 active");
    expect(en.body).toContain("Guests: 44 of 60 arrived");
    expect(ar.body).toContain("الأسطول: 8 نشط");
    expect(ar.actions).toEqual(en.actions);
  });

  it("says what is unavailable instead of inventing it when there is no snapshot", () => {
    const en = localAiReply("Track the chauffeur", "en", "Noura");
    expect(en.body).toContain("event details are not available");
    expect(en.body).toContain("Fleet data is not available");
    expect(en.body).toContain("Vehicle, plate and pickup-point assignments are not available");
    expect(en.body).not.toMatch(FABRICATED);
    const ar = localAiReply("مرحبا", "ar", "Noura", {});
    expect(ar.body).toContain("تفاصيل الفعالية غير متوفرة");
    expect(ar.body).not.toMatch(FABRICATED);
  });
});

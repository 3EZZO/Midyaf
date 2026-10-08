import { describe, expect, it } from "vitest";
import { localAiReply } from "./localAiReply";

/**
 * VIS-01: the offline/failed-stream fallback must match real Arabic input and
 * answer in readable Arabic, with the same scenario order and action IDs as
 * before the encoding repair.
 */

// Characters that only appear when UTF-8 Arabic was decoded as Windows-1252.
const MOJIBAKE = /[ØÙÃÂ]|â€/;
const ARABIC_LETTER = /[ء-ي]/;

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
    arabicPhrase: "تنبيه فحص التواجد الجغرافي للموردين",
    actionIds: ["send_vendor_sms", "view_vendor_map"]
  },
  {
    name: "security vault",
    arabicMessage: "افتح الخزنة",
    englishMessage: "Open the vault",
    arabicPhrase: "خزنة مِضياف الأمنية الثلاثية",
    actionIds: ["scroll_to_vault"]
  },
  {
    name: "airport surge",
    arabicMessage: "وصلت رحلات كثيرة",
    englishMessage: "Flight surge",
    arabicPhrase: "تنبيه غرفة العمليات المباشرة",
    actionIds: ["divert_fleet"]
  },
  {
    name: "hospitality riders",
    arabicMessage: "تجهيزات الفندق",
    englishMessage: "Hotel suite amenities",
    arabicPhrase: "مذكرات الضيافة الملكية",
    actionIds: ["inspect_riders"]
  },
  {
    name: "chauffeur",
    arabicMessage: "أين السائق؟",
    // "driver" contains "rider", which the hospitality branch matches first.
    englishMessage: "Track the chauffeur",
    arabicPhrase: "الكابتن سلطان العتيبي",
    actionIds: ["track_driver"]
  },
  {
    name: "schedule",
    arabicMessage: "ما هو جدول اليوم",
    englishMessage: "Show the agenda",
    arabicPhrase: "جدول مبادرة مستقبل الاستثمار 2027 اليوم",
    actionIds: ["view_shuttle_gps"]
  },
  {
    name: "catering",
    arabicMessage: "نحتاج تموين",
    englishMessage: "Coffee restock",
    arabicPhrase: "تنبيه تموين عاجل",
    actionIds: ["confirm_dispatch_staff"]
  },
  {
    name: "post-event report",
    arabicMessage: "أرسل تقرير",
    englishMessage: "Post-event analytics",
    arabicPhrase: "ملخص تقرير ما بعد الفعالية الذكي",
    actionIds: ["generate_report"]
  },
  {
    name: "network",
    arabicMessage: "ما هي شبكة الضيوف",
    englishMessage: "Wifi details",
    arabicPhrase: "بيانات شبكة كبار الشخصيات المشفرة",
    actionIds: []
  },
  {
    name: "dining",
    arabicMessage: "احجز مطعم",
    englishMessage: "Diriyah restaurant",
    arabicPhrase: "توصية العشاء الفاخر",
    actionIds: []
  }
];

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
    expect(localAiReply("أين السائق؟", "ar-SA", "Noura")).toEqual(
      localAiReply("أين السائق؟", "ar-SA", "Noura")
    );
  });

  it("restores the English punctuation that was also corrupted", () => {
    expect(localAiReply("missing", "en", "Noura").body).toContain("~10–12 minutes");
    expect(localAiReply("chauffeur", "en", "Noura").body).toContain("20°C");
    expect(localAiReply("agenda", "en", "Noura").body).toContain("\n• 08:30");
  });
});

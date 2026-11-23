import { describe, expect, it } from "vitest";
import { localizeDemoText } from "./localizeDemo";

describe("localizeDemoText", () => {
  it("localizes seeded Arabic client persona and entity into English without changing Arabic", () => {
    expect(localizeDemoText("الأستاذ / عبد الرحمن المهيدب", false)).toBe("Mr. Abdulrahman Al-Muhaidib");
    expect(localizeDemoText("الأستاذ / عبد الرحمن المهيدب", true)).toBe("الأستاذ / عبد الرحمن المهيدب");
    expect(localizeDemoText("وزارة السياحة والضيافة", false)).toBe("Ministry of Tourism & Hospitality");
    expect(localizeDemoText("وزارة السياحة والضيافة", true)).toBe("وزارة السياحة والضيافة");
  });

  it("localizes seeded synthetic demo event titles in both EN and AR", () => {
    expect(localizeDemoText("Overhaul Demo Expo (Synthetic)", false)).toBe("Riyadh Global Hospitality Expo");
    expect(localizeDemoText("Overhaul Demo Expo (Synthetic)", true)).toBe("معرض الرياض العالمي للضيافة");
    expect(localizeDemoText("Global Investment Summit", true)).toBe("القمة العالمية للاستثمار");
    expect(localizeDemoText("Global Investment Summit", false)).toBe("Global Investment Summit");
  });

  it("leaves unknown real user names and test fixtures completely untouched", () => {
    expect(localizeDemoText("Synthetic summit", false)).toBe("Synthetic summit");
    expect(localizeDemoText("Synthetic summit", true)).toBe("Synthetic summit");
    expect(localizeDemoText("Custom Event 2027", false)).toBe("Custom Event 2027");
    expect(localizeDemoText("", false)).toBe("");
    expect(localizeDemoText(null, true)).toBe("");
  });
});

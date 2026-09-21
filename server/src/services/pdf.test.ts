import { describe, expect, it } from "vitest";
import { generateReportPdf, hasArabic, splitRuns } from "./pdf.js";

describe("splitRuns", () => {
  it("keeps a Latin plate and its digits as one LTR run inside an Arabic line", () => {
    const runs = splitRuns("الموكب ألفا · KSA 9119 · وصل");
    expect(runs.map((r) => [r.text, r.rtl])).toEqual([
      ["الموكب ألفا · ", true],
      ["KSA 9119", false],
      [" · وصل", true]
    ]);
  });

  it("never reverses digits: a year inside Arabic text is its own LTR run", () => {
    const runs = splitRuns("قمة الرياض 2027");
    expect(runs).toEqual([
      { text: "قمة الرياض ", rtl: true },
      { text: "2027", rtl: false }
    ]);
  });

  it("resolves neutrals between two LTR pieces as LTR (N1), else base direction", () => {
    expect(splitRuns("42 من 45")).toEqual([
      { text: "42", rtl: false },
      { text: " من ", rtl: true },
      { text: "45", rtl: false }
    ]);
    expect(splitRuns("5 / 5", true)).toEqual([{ text: "5 / 5", rtl: false }]);
    expect(splitRuns("98.5%", true)).toEqual([{ text: "98.5%", rtl: false }]);
    expect(splitRuns("14:20:21 م", true)).toEqual([
      { text: "14:20:21", rtl: false },
      { text: " م", rtl: true }
    ]);
  });

  it("treats a pure Latin line as one run", () => {
    expect(splitRuns("On-time SLA 98.5%")).toEqual([
      { text: "On-time SLA 98.5%", rtl: false }
    ]);
  });
});

describe("generateReportPdf", () => {
  it("renders an Arabic report with the embedded Plex font", async () => {
    const pdf = await generateReportPdf({
      title: "تقرير الوصول السيادي — القمة 2027",
      status: "CONFIRMED",
      language: "ar",
      kpis: [
        { label: "الالتزام بالمواعيد", value: "98.5%" },
        { label: "المواكب الراسية", value: "5 / 5" },
        { label: "لوحة الموكب", value: "KSA 9119" }
      ]
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = pdf.toString("latin1");
    // The font is embedded (not a base-14 fallback) and every glyph run went through it.
    expect(text).toContain("IBMPlexSansArabic");
    expect(text).not.toMatch(/\/BaseFont \/Helvetica/);
  });

  it("renders an English report", async () => {
    const pdf = await generateReportPdf({
      title: "Sovereign Arrival Report",
      status: "DRAFT",
      language: "en",
      kpis: [{ label: "On-time SLA", value: "98.5%" }]
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(20_000); // the font subset is in there
  });

  it("detects Arabic script", () => {
    expect(hasArabic("مرحبا")).toBe(true);
    expect(hasArabic("Riyadh")).toBe(false);
  });
});

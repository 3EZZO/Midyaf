import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DemoStatusDto } from "@shared/demo";
import { ApiError } from "../lib/api";
import {
  INVESTOR_DEMO_ADMIN_EMAIL,
  activePersonaForStatus,
  fetchDemoStatus,
  formatDemoTimestamp
} from "../lib/investorDemoApi";
import { InvestorDemoSwitcher } from "./InvestorDemoSwitcher";

const sampleStatus = (over: Partial<DemoStatusDto> = {}): DemoStatusDto => ({
  enabled: true,
  canSwitch: true,
  canReset: true,
  activePersona: "admin",
  origin: { id: "u-admin", name: "Midyaf Admin" },
  personas: [
    { key: "admin", role: "SUPER_ADMIN", name: "Midyaf Admin", portal: "admin", labelEn: "Midyaf Owner (Super Admin)", labelAr: "مالك مضياف (المشرف العام)", available: true },
    { key: "client", role: "CLIENT", name: "Summit Client", portal: "client", labelEn: "Client", labelAr: "العميل", available: true },
    { key: "supplier", role: "SUPPLIER", name: "VIP Supplier", portal: "supplier", labelEn: "Supplier", labelAr: "المورد", available: false }
  ],
  lastResetAt: "2026-11-21T20:00:00.000Z",
  baselineCapturedAt: "2026-11-21T19:00:00.000Z",
  ...over
});

describe("investorDemoApi helpers", () => {
  it("hides demo gracefully when /demo/status responds 404", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Not found" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      })
    );
    const result = await fetchDemoStatus("synthetic-token");
    fetchSpy.mockRestore();
    expect(result).toBeNull();
    expect(INVESTOR_DEMO_ADMIN_EMAIL).toBe("admin@midyaf.local");
  });

  it("rethrows non-404 errors from /demo/status", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Server error" } }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    );
    await expect(fetchDemoStatus("synthetic-token")).rejects.toBeInstanceOf(ApiError);
    fetchSpy.mockRestore();
  });

  it("resolves active persona and formats timestamps safely", () => {
    expect(activePersonaForStatus(sampleStatus())?.key).toBe("admin");
    expect(activePersonaForStatus(null)).toBeNull();
    expect(formatDemoTimestamp(null, false)).toBeNull();
    expect(formatDemoTimestamp("not-a-date", false)).toBeNull();
    expect(formatDemoTimestamp("2026-11-21T20:00:00.000Z", false)).toBeTruthy();
    expect(formatDemoTimestamp("2026-11-21T20:00:00.000Z", true)).toBeTruthy();
  });
});

describe("InvestorDemoSwitcher SSR", () => {
  const noop = () => undefined;

  it("hides completely when disabled, null, or canSwitch is false", () => {
    expect(
      renderToStaticMarkup(
        <InvestorDemoSwitcher status={null} isArabic={false} onSwitchPersona={noop} onCaptureBaseline={noop} onResetDemo={noop} />
      )
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <InvestorDemoSwitcher status={sampleStatus({ enabled: false })} isArabic={false} onSwitchPersona={noop} onCaptureBaseline={noop} onResetDemo={noop} />
      )
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <InvestorDemoSwitcher status={sampleStatus({ canSwitch: false })} isArabic={false} onSwitchPersona={noop} onCaptureBaseline={noop} onResetDemo={noop} />
      )
    ).toBe("");
  });

  it("renders active persona, available & unavailable personas, baseline save, Reset and lastResetAt in EN", () => {
    const html = renderToStaticMarkup(
      <InvestorDemoSwitcher
        status={sampleStatus()}
        isArabic={false}
        defaultOpen
        onSwitchPersona={noop}
        onCaptureBaseline={noop}
        onResetDemo={noop}
      />
    );

    expect(html).toContain("data-investor-demo-switcher");
    expect(html).toContain("Midyaf Owner (Super Admin)");
    expect(html).toContain('data-demo-persona="client"');
    expect(html).toContain('aria-checked="true"');
    // Unavailable persona is disabled
    expect(html).toMatch(/disabled=""[^>]*data-demo-persona="supplier"|data-demo-persona="supplier"[^>]*disabled=""/);
    expect(html).toContain("Save current state as demo start point");
    expect(html).toContain("Reset Demo Data");
    expect(html).toContain("data-demo-last-reset");
    expect(html).toContain("data-demo-baseline-at");
    expect(html).toContain("end-0");
    expect(html).toContain("max-w-[calc(100vw-1.5rem)]");
  });

  it("shows unavailable reset hint instead of Reset when baselineCapturedAt is null (EN & AR)", () => {
    const enHtml = renderToStaticMarkup(
      <InvestorDemoSwitcher
        status={sampleStatus({ baselineCapturedAt: null, canReset: false })}
        isArabic={false}
        defaultOpen
        onSwitchPersona={noop}
        onCaptureBaseline={noop}
        onResetDemo={noop}
      />
    );
    expect(enHtml).toContain("Reset unavailable: save a start point first");
    expect(enHtml).not.toContain("data-demo-reset-trigger");

    const arHtml = renderToStaticMarkup(
      <InvestorDemoSwitcher
        status={sampleStatus({ baselineCapturedAt: null, canReset: false })}
        isArabic
        defaultOpen
        onSwitchPersona={noop}
        onCaptureBaseline={noop}
        onResetDemo={noop}
      />
    );
    expect(arHtml).toContain("مالك مضياف (المشرف العام)");
    expect(arHtml).toContain("حفظ الحالة الحالية كنقطة العرض");
    expect(arHtml).toContain("إعادة الضبط غير متاحة: احفظ نقطة البداية أولاً");
    expect(arHtml).not.toContain("data-demo-reset-trigger");
  });
});

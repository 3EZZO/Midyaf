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
import {
  InvestorDemoSwitcher,
  demoPersonaScopeCopy,
  isEditableEventTarget,
  resolvePersonaHotkey,
  shouldShowRemoteResetToast
} from "./InvestorDemoSwitcher";

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
    expect(html).toContain("sm:end-0");
    expect(html).toContain("fixed inset-x-3 top-16");
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
    // Qasr P2: 2-column grid, 1-9 hotkey hints, and >= 12px floor (no text-[11px])
    expect(enHtml).toContain("data-demo-persona-grid");
    expect(enHtml).toContain("sm:grid-cols-2");
    expect(enHtml).toContain('data-demo-hotkey="2"');
    expect(enHtml).not.toContain("text-[11px]");
    expect(arHtml).not.toContain("text-[11px]");
  });

  it("resolves 1–9 persona hotkeys safely and ignores inputs, modifiers, busy/disabled, unavailable, and active", () => {
    const personas = sampleStatus().personas;
    const bodyTarget = { tagName: "DIV" } as unknown as EventTarget;
    const inputTarget = { tagName: "INPUT" } as unknown as EventTarget;
    const textareaTarget = { tagName: "TEXTAREA" } as unknown as EventTarget;
    const editableTarget = { tagName: "DIV", isContentEditable: true } as unknown as EventTarget;

    // Key "2" maps to client (available, not active)
    expect(resolvePersonaHotkey({ key: "2", target: bodyTarget }, personas, "admin")?.key).toBe("client");
    // Key "1" is already active ("admin")
    expect(resolvePersonaHotkey({ key: "1", target: bodyTarget }, personas, "admin")).toBeNull();
    // Key "3" is unavailable ("supplier")
    expect(resolvePersonaHotkey({ key: "3", target: bodyTarget }, personas, "admin")).toBeNull();
    // Ignored while typing in inputs, textareas, or contentEditable
    expect(isEditableEventTarget(inputTarget)).toBe(true);
    expect(resolvePersonaHotkey({ key: "2", target: inputTarget }, personas, "admin")).toBeNull();
    expect(resolvePersonaHotkey({ key: "2", target: textareaTarget }, personas, "admin")).toBeNull();
    expect(resolvePersonaHotkey({ key: "2", target: editableTarget }, personas, "admin")).toBeNull();
    // Ignored with modifier keys or when busy / disabled
    expect(resolvePersonaHotkey({ key: "2", ctrlKey: true, target: bodyTarget }, personas, "admin")).toBeNull();
    expect(resolvePersonaHotkey({ key: "2", metaKey: true, target: bodyTarget }, personas, "admin")).toBeNull();
    expect(resolvePersonaHotkey({ key: "2", target: bodyTarget }, personas, "admin", { busy: true })).toBeNull();
    expect(resolvePersonaHotkey({ key: "2", target: bodyTarget }, personas, "admin", { disabled: true })).toBeNull();
    // Scope copy is bilingual
    expect(demoPersonaScopeCopy("client", false)).toContain("Client-scoped");
    expect(demoPersonaScopeCopy("client", true)).toContain("فعاليات العميل");
    // Remote reset broadcast toast suppressed on originating window, kept for other open windows
    expect(shouldShowRemoteResetToast(true, null, "2026-11-22T18:00:00Z")).toBe(false);
    expect(shouldShowRemoteResetToast(false, "2026-11-22T18:00:00Z", "2026-11-22T18:00:00Z")).toBe(false);
    expect(shouldShowRemoteResetToast(false, null, "2026-11-22T18:00:00Z")).toBe(true);
    expect(shouldShowRemoteResetToast(false, "2026-11-22T17:00:00Z", "2026-11-22T18:00:00Z")).toBe(true);
  });
});

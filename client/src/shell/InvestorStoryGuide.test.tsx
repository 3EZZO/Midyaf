import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DemoStatusDto } from "@shared/demo";
import { InvestorStoryGuide, activeStoryStep } from "./InvestorStoryGuide";

const demoStatus: DemoStatusDto = {
  enabled: true,
  canSwitch: true,
  canReset: true,
  activePersona: "admin",
  origin: { id: "u-admin", name: "Admin" },
  personas: [
    { key: "admin", role: "SUPER_ADMIN", name: "Admin", portal: "admin", labelEn: "Owner", labelAr: "المالك", available: true },
    { key: "company", role: "ORGANIZER", name: "Org", portal: "company", labelEn: "Organizer", labelAr: "المنظم", available: true },
    { key: "client", role: "CLIENT", name: "Client", portal: "client", labelEn: "Client", labelAr: "العميل", available: true },
    { key: "logistics", role: "LOGISTICS_MANAGER", name: "Ops", portal: "sila_operations", labelEn: "Ops", labelAr: "العمليات", available: true }
  ],
  lastResetAt: null,
  baselineCapturedAt: "2026-11-22T06:00:00.000Z"
};

describe("InvestorStoryGuide", () => {
  it("resolves the active walkthrough chapter from portal and War Room state", () => {
    expect(activeStoryStep("company", false)).toBe("plan");
    expect(activeStoryStep("client", false)).toBe("approve");
    expect(activeStoryStep("admin", false)).toBe("vault");
    expect(activeStoryStep("supplier", false)).toBe("vault");
    expect(activeStoryStep("sila_operations", false)).toBe("warroom");
    expect(activeStoryStep("admin", true)).toBe("warroom");
  });

  it("renders collapsed by default and expands into 4 bilingual chapters with 390px-safe grid", () => {
    const collapsed = renderToStaticMarkup(
      <InvestorStoryGuide
        status={demoStatus}
        portal="admin"
        isArabic={false}
        onSwitchPersona={() => undefined}
        onSelectPortal={() => undefined}
        onOpenShortcuts={() => undefined}
      />
    );
    expect(collapsed).toContain('data-story-open="false"');
    expect(collapsed).toContain("Investor Story Guide");
    expect(collapsed).toContain("data-open-presenter-shortcuts");
    expect(collapsed).not.toContain('data-story-step="plan"');

    const expandedAr = renderToStaticMarkup(
      <InvestorStoryGuide
        status={demoStatus}
        portal="client"
        isArabic={true}
        defaultOpen={true}
        onSwitchPersona={() => undefined}
        onSelectPortal={() => undefined}
      />
    );
    expect(expandedAr).toContain('data-story-open="true"');
    expect(expandedAr).toContain("grid-cols-1");
    expect(expandedAr).toContain("دليل عرض المستثمرين");
    expect(expandedAr).toContain("اعتماد العميل بنقرة");
    expect(expandedAr).toContain('aria-current="step"');
  });
});

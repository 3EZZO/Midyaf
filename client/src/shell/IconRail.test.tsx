import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PortalKey, Session } from "@shared/domain";
import { TooltipProvider } from "../components/ui/Tooltip";

const translations: Record<string, string> = {
  brand: "Midyaf",
  brandArabic: "مضياف",
  switchLanguage: "العربية",
  logout: "Logout",
  "portals.admin": "Admin & Owners Dashboard",
  "portals.sila_operations": "Sila Operations Command",
  "portals.company": "Sila Organizing Company",
  "portals.client": "Client Portal"
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
    i18n: { language: "en" }
  })
}));
vi.mock("../components/warroom", () => ({
  SovereignCommandBridge: () => null
}));

import { IconRail, PORTAL_RAIL_ID, PORTAL_RAIL_LIST_ID, railToggleCopy } from "./IconRail";
import { ShellFrame } from "./ShellFrame";
import { BottomTabBar } from "./BottomTabBar";

const portals: PortalKey[] = ["admin", "sila_operations", "company", "client"];

const session: Session = {
  accessToken: "synthetic",
  refreshToken: "synthetic",
  user: {
    id: "u1",
    role: "SUPER_ADMIN",
    name: "Synthetic Admin",
    email: "admin@example.test",
    phone: "",
    language: "en"
  }
} as Session;

describe("IconRail collapsible desktop sidebar", () => {
  it("renders expanded icon+label rail with accessible collapse controls and motion-reduce support", () => {
    const html = renderToStaticMarkup(
      <IconRail
        allowedPortals={portals}
        portal="sila_operations"
        setPortal={() => undefined}
        isArabic={false}
        collapsed={false}
        onToggleCollapse={() => undefined}
      />
    );

    expect(html).toContain(`id="${PORTAL_RAIL_ID}"`);
    expect(html).toContain('data-rail-collapsed="false"');
    expect(html).toContain("w-64");
    expect(html).toContain("start-0");
    expect(html).toContain("border-e");
    expect(html).toContain("motion-reduce:transition-none");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain(`aria-controls="${PORTAL_RAIL_LIST_ID}"`);
    expect(html).toContain('aria-label="Collapse sidebar"');
    expect(html).toContain("Sila Operations Command");
    expect(html).toContain("Admin &amp; Owners Dashboard");
  });

  it("renders collapsed icon-only rail with title and aria-label tooltips on every portal button", () => {
    const html = renderToStaticMarkup(
      <IconRail
        allowedPortals={portals}
        portal="admin"
        setPortal={() => undefined}
        isArabic={false}
        collapsed={true}
        onToggleCollapse={() => undefined}
      />
    );

    expect(html).toContain('data-rail-collapsed="true"');
    expect(html).toContain("w-[72px]");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Expand sidebar"');
    expect(html).toContain('title="Expand sidebar"');
    // Every portal icon gets both title and aria-label when collapsed, plus inline-end tooltip
    expect(html).toContain('title="Admin &amp; Owners Dashboard — Owners"');
    expect(html).toContain('aria-label="Admin &amp; Owners Dashboard — Owners"');
    expect(html).toContain('title="Sila Operations Command — Operations"');
    expect(html).toContain('aria-label="Sila Operations Command — Operations"');
    expect(html).toContain('title="Client Portal — Client"');
    expect(html).toContain("start-full");
  });

  it("renders Arabic RTL labels and tooltips cleanly", () => {
    expect(railToggleCopy(false, true).label).toBe("طي القائمة الجانبية");
    expect(railToggleCopy(true, true).label).toBe("توسيع القائمة الجانبية");

    const html = renderToStaticMarkup(
      <IconRail
        allowedPortals={portals}
        portal="company"
        setPortal={() => undefined}
        isArabic={true}
        collapsed={true}
        onToggleCollapse={() => undefined}
      />
    );

    expect(html).toContain('aria-label="البوابات"');
    expect(html).toContain('aria-label="توسيع القائمة الجانبية"');
    expect(html).toContain('title="توسيع القائمة الجانبية"');
    expect(html).toContain("الملاك");
    expect(html).toContain("العمليات");
  });
});

describe("ShellFrame & BottomTabBar integration", () => {
  it("synchronizes main content logical padding with desktop rail collapsed state and preserves BottomTabBar", () => {
    const expandedHtml = renderToStaticMarkup(
      <TooltipProvider>
        <ShellFrame
          isArabic={false}
          session={session}
          allowedPortals={portals}
          portal="admin"
          setPortal={() => undefined}
          isQuickNavOpen={false}
          setIsQuickNavOpen={() => undefined}
          onLanguageToggle={() => undefined}
          onLogout={() => undefined}
          defaultRailCollapsed={false}
        >
          <div>Portal body</div>
        </ShellFrame>
      </TooltipProvider>
    );

    expect(expandedHtml).toContain("lg:ps-64");
    expect(expandedHtml).toContain("data-topbar-rail-toggle");
    expect(expandedHtml).toContain('aria-expanded="true"');
    expect(expandedHtml).toContain(`aria-controls="${PORTAL_RAIL_ID}"`);

    const collapsedHtml = renderToStaticMarkup(
      <TooltipProvider>
        <ShellFrame
          isArabic={true}
          session={session}
          allowedPortals={portals}
          portal="admin"
          setPortal={() => undefined}
          isQuickNavOpen={false}
          setIsQuickNavOpen={() => undefined}
          onLanguageToggle={() => undefined}
          onLogout={() => undefined}
          defaultRailCollapsed={true}
        >
          <div>Portal body</div>
        </ShellFrame>
      </TooltipProvider>
    );

    expect(collapsedHtml).toContain("lg:ps-[72px]");
    expect(collapsedHtml).toContain('aria-label="توسيع القائمة الجانبية"');

    // Mobile BottomTabBar stays intact
    const bottomHtml = renderToStaticMarkup(
      <BottomTabBar
        allowedPortals={portals}
        portal="admin"
        setPortal={() => undefined}
        isArabic={false}
      />
    );
    expect(bottomHtml).toContain("lg:hidden");
    expect(bottomHtml).toContain("Admin &amp; Owners Dashboard");
  });
});

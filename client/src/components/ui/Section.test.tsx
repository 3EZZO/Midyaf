import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CarFront, ClipboardList, FileText } from "lucide-react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));

import { Section } from "./Section";
import { IconTabNav, type IconTab } from "./IconTabNav";
import { DashboardJumpDock } from "../DashboardJumpDock";

const sampleTabs: IconTab<"intake" | "fleet" | "contracts">[] = [
  { id: "intake", icon: ClipboardList, labelEn: "Intake", labelAr: "الإدخال" },
  { id: "fleet", icon: CarFront, labelEn: "Fleet", labelAr: "الأسطول" },
  { id: "contracts", icon: FileText, labelEn: "Contracts", labelAr: "العقود" }
];

describe("Section collapsible container", () => {
  it("renders expanded by default with accessible toggle button, aria-controls and reduced-motion classes", () => {
    const html = renderToStaticMarkup(
      <Section id="section-kpi-demo" title="Financial overview" description="Live numbers" isArabic={false}>
        <p>Section content</p>
      </Section>
    );

    expect(html).toContain('id="section-kpi-demo"');
    expect(html).toContain('data-section-collapsed="false"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="section-kpi-demo-body"');
    expect(html).toContain('title="Collapse section"');
    expect(html).toContain('id="section-kpi-demo-body"');
    expect(html).toContain("grid-rows-[1fr]");
    expect(html).toContain("motion-reduce:transition-none");
    expect(html).toContain("Section content");
  });

  it("collapses body cleanly with aria-expanded=false, aria-hidden=true and invisible when collapsed", () => {
    const html = renderToStaticMarkup(
      <Section id="section-collapsed" title="نظرة عامة" defaultCollapsed isArabic>
        <p>المحتوى المخفي</p>
      </Section>
    );

    expect(html).toContain('data-section-collapsed="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="section-collapsed-body"');
    expect(html).toContain('title="توسيع القسم"');
    expect(html).toContain('aria-label="توسيع القسم: نظرة عامة"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("grid-rows-[0fr]");
    expect(html).toContain("invisible");
    expect(html).toContain("-rotate-90 rtl:rotate-90");
  });

  it("omits collapse toggle when collapsible={false}", () => {
    const html = renderToStaticMarkup(
      <Section id="section-static" title="Static section" collapsible={false} isArabic={false}>
        <p>Always visible</p>
      </Section>
    );

    expect(html).not.toContain("data-section-toggle");
    expect(html).not.toContain("aria-expanded");
    expect(html).toContain("Always visible");
  });
});

describe("IconTabNav collapsible tab group", () => {
  it("renders expanded tab strip with accessible collapse toggle and bilingual labels", () => {
    const enHtml = renderToStaticMarkup(
      <IconTabNav
        tabs={sampleTabs}
        value="fleet"
        onChange={() => undefined}
        layoutId="test-tabs"
        isArabic={false}
        ariaLabel="Operations sections"
      />
    );

    expect(enHtml).toContain('data-tabnav-collapsed="false"');
    expect(enHtml).toContain('aria-expanded="true"');
    expect(enHtml).toContain('aria-label="Collapse section tabs"');
    expect(enHtml).toContain('role="tablist"');
    expect(enHtml).toContain('aria-selected="true"');
    expect(enHtml).toContain("motion-reduce:transition-none");

    const arCollapsedHtml = renderToStaticMarkup(
      <IconTabNav
        tabs={sampleTabs}
        value="fleet"
        onChange={() => undefined}
        layoutId="test-tabs-ar"
        defaultCollapsed
        isArabic
        ariaLabel="أقسام العمليات"
      />
    );

    expect(arCollapsedHtml).toContain('data-tabnav-collapsed="true"');
    expect(arCollapsedHtml).toContain('aria-expanded="false"');
    expect(arCollapsedHtml).toContain('aria-label="توسيع شريط الأقسام"');
    expect(arCollapsedHtml).toContain("الأسطول");
    expect(arCollapsedHtml).toContain("3 أقسام");
    expect(arCollapsedHtml).toContain("grid-rows-[0fr]");
    expect(arCollapsedHtml).toContain("invisible");
  });
});

describe("DashboardJumpDock collapsible icon bar", () => {
  it("renders collapsible jump chips in both English and Arabic", () => {
    const enHtml = renderToStaticMarkup(<DashboardJumpDock isArabic={false} isDemoMode />);
    expect(enHtml).toContain('aria-expanded="true"');
    expect(enHtml).toContain('aria-label="Collapse quick jump bar"');
    expect(enHtml).toContain("Live Radar");
    expect(enHtml).toContain("motion-reduce:transition-none");

    const arHtml = renderToStaticMarkup(<DashboardJumpDock isArabic />);
    expect(arHtml).toContain('aria-label="طي شريط الانتقال السريع"');
    expect(arHtml).toContain("انتقال سريع");
  });
});

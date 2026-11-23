import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DirectorState } from "../../lib/demo/director";
import { BoardingPass } from "./BoardingPass";
import { SaduRibbon } from "./SaduRibbon";
import { PanelFrame } from "../warroom/PanelFrame";
import { resolvePanelSpotlight } from "../warroom/usePanelHighlight";
import { ActTitleCard } from "../warroom/ActTitleCard";

const sampleDirectorState = (over: Partial<DirectorState> = {}): DirectorState => ({
  scriptId: "sovereign-arrival",
  running: true,
  actIndex: 1,
  actCount: 4,
  actEntryToken: 2,
  actTitle: { en: "Royal Terminal Handshake", ar: "الاستقبال في الصالة الملكية" },
  actSubtitle: { en: "Convoy Alpha entering curbside gate", ar: "الموكب ألفا يدخل بوابة الرصيف" },
  caption: null,
  landingAt: null,
  scorecardVisible: false,
  flights: {},
  convoys: {},
  ...over
} as DirectorState);

describe("Qasr Obsidian P4 signature components", () => {
  it("renders SaduRibbon static SVG in hairline and crest variants", () => {
    const hairline = renderToStaticMarkup(<SaduRibbon variant="hairline" />);
    const crest = renderToStaticMarkup(<SaduRibbon variant="crest" />);

    expect(hairline).toContain('data-sadu-ribbon="hairline"');
    expect(hairline).toContain('aria-hidden="true"');
    expect(hairline).toContain("<svg");
    expect(crest).toContain('data-sadu-ribbon="crest"');
    expect(crest).toContain("qasr-sadu-crest");
  });

  it("renders BoardingPass in vertical wallet layout with ivory QR pod and Sadu crest (EN & AR)", () => {
    const en = renderToStaticMarkup(
      <BoardingPass
        isArabic={false}
        eventName="Riyadh Global Summit"
        guestName="H.E. Tariq Al-Mansour"
        guestTitle="VVIP Delegation"
        captainName="Fahad Al-Otaibi"
        vehicle="Mercedes-Maybach S680"
        plate="KSA 901"
        ring="CURBSIDE_GATE"
        siteName="KKIA Royal Terminal"
        code="midyaf:guest:vip-01"
        reveal
      />
    );
    expect(en).toContain('data-boarding-pass-layout="vertical"');
    expect(en).toContain("data-boarding-pass-qr-pod");
    expect(en).toContain("qasr-ivory-qr-pod");
    expect(en).toContain('data-sadu-ribbon="crest"');
    expect(en).toContain("H.E. Tariq Al-Mansour");
    expect(en).toContain("KSA 901");
    expect(en).toContain("At the curb");
    expect(en).toContain("Scan at the curb");

    const ar = renderToStaticMarkup(
      <BoardingPass
        isArabic
        eventName="قمة الرياض العالمية"
        guestName="معالي طارق المنصور"
        captainName="فهد العتيبي"
        vehicle="مايباخ S680"
        ring="DOCKED_BAY"
        code="midyaf:guest:vip-01"
      />
    );
    expect(ar).toContain("بطاقة الوصول");
    expect(ar).toContain("راسٍ");
    expect(ar).toContain("امسح عند الرصيف");
  });

  it("computes War Room panel spotlight states and dims non-focused panels", () => {
    expect(resolvePanelSpotlight("radar", null)).toBe("idle");
    expect(resolvePanelSpotlight("radar", "radar")).toBe("focused");
    expect(resolvePanelSpotlight("flights", "radar")).toBe("dimmed");

    const focusedHtml = renderToStaticMarkup(
      <PanelFrame panelId="radar" title="Ring radar" spotlightOverride="focused">
        <div>Radar body</div>
      </PanelFrame>
    );
    const dimmedHtml = renderToStaticMarkup(
      <PanelFrame panelId="flights" title="Flights" spotlightOverride="dimmed">
        <div>Flights body</div>
      </PanelFrame>
    );

    expect(focusedHtml).toContain('data-panel-spotlight="focused"');
    expect(focusedHtml).toContain("via-gold-500");
    expect(dimmedHtml).toContain('data-panel-spotlight="dimmed"');
    expect(dimmedHtml).toContain("qasr-warroom-panel");
  });

  it("renders War Room ActTitleCard with Sadu crest and brass rule sweep in EN & AR", () => {
    const en = renderToStaticMarkup(
      <ActTitleCard isArabic={false} state={sampleDirectorState()} forceVisible />
    );
    const ar = renderToStaticMarkup(
      <ActTitleCard isArabic state={sampleDirectorState()} forceVisible />
    );

    expect(en).toContain("data-warroom-act-card");
    expect(en).toContain('data-sadu-ribbon="crest"');
    expect(en).toContain("qasr-act-rule");
    expect(en).toContain("Royal Terminal Handshake");
    expect(en).toContain("2/4");
    expect(ar).toContain("الاستقبال في الصالة الملكية");
    expect(ar).toContain("وصول الفعالية");
  });
});

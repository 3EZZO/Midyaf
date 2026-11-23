import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

vi.mock("../../components/map", () => ({
  RiyadhMap: () => null
}));

import { BoardingPass } from "../../components/ui/BoardingPass";
import { briefingTickerPreview } from "../../components/ai/AiBriefingCard";
import { buildCaptainMapsUrl, sunlitStepActionLabel } from "./CaptainsApp";

describe("Field & VIP Mobile UX upgrades (Section 3)", () => {
  it("builds sunlit captain action labels and external maps links cleanly", () => {
    expect(sunlitStepActionLabel("ARRIVED", false)).toBe("Confirm Arrival");
    expect(sunlitStepActionLabel("PICKED_UP", false)).toBe("Guest On Board");
    expect(sunlitStepActionLabel("COMPLETED", false)).toBe("Trip Complete");
    expect(sunlitStepActionLabel("ARRIVED", true)).toBe("تأكيد الوصول للبوابة");
    expect(sunlitStepActionLabel("PICKED_UP", true)).toBe("الضيف على متن المركبة");
    expect(sunlitStepActionLabel("COMPLETED", true)).toBe("إنهاء الرحلة");

    const enRouteUrl = buildCaptainMapsUrl({
      status: "EN_ROUTE",
      pickupLocation: "KKIA Royal Terminal",
      dropoffLocation: "The Ritz-Carlton Riyadh"
    });
    expect(enRouteUrl).toContain("https://www.google.com/maps/search/?api=1&query=");
    expect(enRouteUrl).toContain("KKIA%20Royal%20Terminal");

    const pickedUpUrl = buildCaptainMapsUrl({
      status: "PICKED_UP",
      pickupLocation: "KKIA Royal Terminal",
      dropoffLocation: "The Ritz-Carlton Riyadh"
    });
    expect(pickedUpUrl).toContain("Ritz-Carlton%20Riyadh");
  });

  it("exposes a full-screen bright QR trigger on BoardingPass in EN and AR", () => {
    const enHtml = renderToStaticMarkup(
      <BoardingPass
        isArabic={false}
        eventName="Riyadh Global Hospitality Expo"
        guestName="H.E. Tariq Al-Mansour"
        code="midyaf:guest:vip-01"
      />
    );
    expect(enHtml).toContain("data-boarding-pass-fullscreen-qr");
    expect(enHtml).toContain("Full-screen bright QR");

    const arHtml = renderToStaticMarkup(
      <BoardingPass
        isArabic
        eventName="معرض الرياض العالمي للضيافة"
        guestName="معالي طارق المنصور"
        code="midyaf:guest:vip-01"
      />
    );
    expect(arHtml).toContain("عرض الرمز بسطوع كامل للشمس");
  });

  it("formats War Room Noura briefing ticker previews cleanly for the collapsed pill", () => {
    expect(briefingTickerPreview("", false)).toBe("Updating live briefing…");
    expect(briefingTickerPreview("", true)).toBe("جارٍ تحديث الإحاطة المباشرة…");
    expect(briefingTickerPreview("## **Convoy Alpha** on schedule at KKIA", false)).toBe(
      "Convoy Alpha on schedule at KKIA"
    );
    const longText = "A".repeat(120);
    const preview = briefingTickerPreview(longText, false);
    expect(preview.length).toBeLessThanOrEqual(92);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("pins the captain sunlit action bar above the mobile dock (Plan Ready 1 polish)", () => {
    const source = readFileSync(new URL("./CaptainsApp.tsx", import.meta.url), "utf8");
    const bar = source.slice(source.indexOf("data-captain-sunlit-bar"));
    const className = /className="([^"]+)"/.exec(bar)?.[1] ?? "";
    expect(className).toContain("sticky");
    expect(className).toContain("bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)]");
    expect(className).toContain("lg:static");
  });

  it("publishes an absolute og:image so link previews resolve off-site", () => {
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/[^"]+\/icons\/pwa-512x512-v2\.png"/);
  });
});

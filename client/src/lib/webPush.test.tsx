import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Session } from "@shared/domain";
import { urlBase64ToUint8Array } from "./webPush";
import { PushNotificationToggle } from "../components/PushNotificationToggle";
import { TooltipProvider } from "../components/ui/Tooltip";

const session = {
  accessToken: "synthetic-token",
  refreshToken: "synthetic-refresh",
  user: {
    id: "u_cap",
    name: "Captain Fahad",
    email: "cap@midyaf.local",
    phone: "+966500000001",
    role: "DRIVER",
    language: "en"
  }
} as unknown as Session;

describe("client Web Push helpers & PushNotificationToggle (PLAN_READY_1 Sprint 3)", () => {
  it("decodes URL-safe base64 VAPID keys into Uint8Array", () => {
    const bytes = urlBase64ToUint8Array("SGVsbG8tV29ybGRf");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(bytes).toString("utf8")).toBe("Hello-World_");
  });

  it("stays hidden when disabled and renders bilingual accessible toggle when enabled", () => {
    expect(
      renderToStaticMarkup(
        <PushNotificationToggle session={session} isArabic={false} initialEnabled={false} />
      )
    ).toBe("");

    const en = renderToStaticMarkup(
      <TooltipProvider>
        <PushNotificationToggle session={session} isArabic={false} initialEnabled={true} />
      </TooltipProvider>
    );
    expect(en).toContain("data-web-push-toggle");
    expect(en).toContain("Enable lock-screen alerts");

    const ar = renderToStaticMarkup(
      <TooltipProvider>
        <PushNotificationToggle session={session} isArabic={true} initialEnabled={true} />
      </TooltipProvider>
    );
    expect(ar).toContain("تفعيل إشعارات الجهاز");
  });
});

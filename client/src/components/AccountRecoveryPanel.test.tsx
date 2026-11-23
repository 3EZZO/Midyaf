import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Session, User } from "@shared/domain";
import { AccountRecoveryPanel, buildResetWhatsAppUrl } from "./AccountRecoveryPanel";

const sampleUsers = [
  {
    id: "u_cap_1",
    name: "Captain Fahad",
    email: "fahad@midyaf.local",
    phone: "+966501112222",
    role: "DRIVER",
    language: "ar"
  },
  {
    id: "u_sup_1",
    name: "Al-Riyadh Fleet",
    email: "fleet@supplier.sa",
    phone: "+966503334444",
    role: "SUPPLIER",
    language: "en"
  }
] as unknown as User[];

const superAdminSession = {
  accessToken: "synthetic-sa",
  refreshToken: "synthetic-ref",
  user: { id: "u_sa", name: "Owner", email: "admin@midyaf.local", role: "SUPER_ADMIN", phone: "", language: "en" }
} as unknown as Session;

const nonAdminSession = {
  accessToken: "synthetic-lm",
  refreshToken: "synthetic-ref",
  user: { id: "u_lm", name: "Ops", email: "ops@midyaf.local", role: "LOGISTICS_MANAGER", phone: "", language: "en" }
} as unknown as Session;

describe("AccountRecoveryPanel (PLAN_READY_1 Sprint 1)", () => {
  it("renders only for SUPER_ADMIN and lists platform accounts with reset-link controls", () => {
    expect(
      renderToStaticMarkup(<AccountRecoveryPanel users={sampleUsers} session={nonAdminSession} isArabic={false} />)
    ).toBe("");

    const en = renderToStaticMarkup(
      <AccountRecoveryPanel users={sampleUsers} session={superAdminSession} isArabic={false} />
    );
    expect(en).toContain("data-account-recovery-panel");
    expect(en).toContain("Account Access Recovery");
    expect(en).toContain("Captain Fahad");
    expect(en).toContain("Reset link");

    const ar = renderToStaticMarkup(
      <AccountRecoveryPanel users={sampleUsers} session={superAdminSession} isArabic={true} />
    );
    expect(ar).toContain("استعادة وصول الحسابات");
    expect(ar).toContain("رابط استعادة");
  });

  it("builds a zero-cost wa.me handoff link with bilingual message", () => {
    const url = buildResetWhatsAppUrl("+966 50-111-2222", "Captain Fahad", "https://midyaf.onrender.com/#resetToken=abc", false);
    expect(url).toContain("https://wa.me/966501112222?text=");
    expect(decodeURIComponent(url!)).toContain("https://midyaf.onrender.com/#resetToken=abc");
    expect(buildResetWhatsAppUrl("", "No Phone", "https://midyaf.onrender.com/#resetToken=abc", false)).toBeNull();
  });
});

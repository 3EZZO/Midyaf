import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "@shared/domain";

const state = vi.hoisted(() => ({ applications: [] as unknown[] }));
vi.mock("../lib/workspaceApi", () => ({
  useWorkspaceResource: () => ({ data: state }),
  workspaceRequest: vi.fn(),
  workspaceDownload: vi.fn()
}));

import {
  ApplicantRegistration,
  OnboardingWorkspace,
  StandaloneOnboardingFrame,
  onboardingRegisterError,
  registrationKindFromPath,
  registrationPathForKind
} from "./OnboardingWorkspace";

const session = {
  accessToken: "synthetic",
  refreshToken: "synthetic",
  user: {
    id: "applicant",
    role: "GUEST",
    name: "Applicant",
    email: "applicant@example.test",
    phone: "",
    language: "en",
    onboardingPending: true,
    onboardingKind: "VENDOR"
  }
} satisfies Session;

describe("standalone registration routing & errors", () => {
  it("resolves /register/supplier and /register/client paths cleanly", () => {
    expect(registrationKindFromPath("/register/supplier")).toBe("VENDOR");
    expect(registrationKindFromPath("/register/supplier/")).toBe("VENDOR");
    expect(registrationKindFromPath("/register/client")).toBe("CLIENT");
    expect(registrationKindFromPath("/register/client/")).toBe("CLIENT");
    expect(registrationKindFromPath("/")).toBeNull();
    expect(registrationKindFromPath("/register")).toBeNull();
    expect(registrationPathForKind("VENDOR")).toBe("/register/supplier");
    expect(registrationPathForKind("CLIENT")).toBe("/register/client");
  });

  it("maps 409 and 429 registration errors in Arabic and English", () => {
    expect(onboardingRegisterError(409, undefined, false)).toContain("already registered");
    expect(onboardingRegisterError(409, undefined, true)).toContain("مسجل مسبقاً");
    expect(onboardingRegisterError(429, undefined, false)).toContain("Too many");
    expect(onboardingRegisterError(429, undefined, true)).toContain("محاولات كثيرة");
  });
});

describe("OnboardingWorkspace & ApplicantRegistration", () => {
  it("lets unauthenticated applicants choose their own password and applicant type", () => {
    const html = renderToStaticMarkup(
      <ApplicantRegistration isArabic={false} onLogin={async () => {}} onBack={() => {}} />
    );
    expect(html).toContain("Vendor &amp; client registration");
    expect(html).toContain("new-password");
    expect(html).toContain('minLength="12"');
    expect(html).toContain("CLIENT");
    expect(html).not.toContain("SUPER_ADMIN");
  });

  it("renders dedicated standalone supplier and client registration pages in EN and AR", () => {
    const supplierEn = renderToStaticMarkup(
      <ApplicantRegistration
        fixedKind="VENDOR"
        isArabic={false}
        onLogin={async () => {}}
        onBack={() => {}}
        onLanguageToggle={() => {}}
      />
    );
    expect(supplierEn).toContain('data-registration-page="VENDOR"');
    expect(supplierEn).toContain("Register as a supplier");
    expect(supplierEn).toContain('type="hidden" name="kind" value="VENDOR"');
    expect(supplierEn).not.toContain("<select");

    const clientAr = renderToStaticMarkup(
      <ApplicantRegistration
        fixedKind="CLIENT"
        isArabic
        onLogin={async () => {}}
        onBack={() => {}}
        onLanguageToggle={() => {}}
      />
    );
    expect(clientAr).toContain('data-registration-page="CLIENT"');
    expect(clientAr).toContain('dir="rtl"');
    expect(clientAr).toContain("تسجيل عميل جديد");
    expect(clientAr).toContain('type="hidden" name="kind" value="CLIENT"');
  });

  it("renders StandaloneOnboardingFrame with brand, language toggle and sign out", () => {
    const html = renderToStaticMarkup(
      <StandaloneOnboardingFrame
        session={session}
        isArabic={false}
        onLanguageToggle={() => {}}
        onLogout={() => {}}
        onRefresh={async () => {}}
      />
    );
    expect(html).toContain("data-standalone-onboarding");
    expect(html).toContain("Complete supplier registration");
    expect(html).toContain("Sign out");
    expect(html).toContain("العربية");
    expect(html).toContain("Submit an official request");
  });

  it("restricts the pending applicant form to its enrolled organization kind", () => {
    const html = renderToStaticMarkup(<OnboardingWorkspace session={session} isArabic={false} />);
    expect(html).toContain("Submit an official request");
    expect(html).toContain('value="VENDOR"');
    expect(html).not.toContain('value="CLIENT"');
    expect(html).not.toContain("Activate account");
  });

  it("shows Arabic registration without a staff-session prerequisite", () => {
    expect(
      renderToStaticMarkup(<ApplicantRegistration isArabic onLogin={async () => {}} onBack={() => {}} />)
    ).toContain("نظام تسجيل الموردين والعملاء");
  });
});

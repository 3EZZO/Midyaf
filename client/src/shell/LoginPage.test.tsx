import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginPage, shouldAutoFocusEmailInput } from "./LoginPage";
import { DEMO_PERSONAS } from "./demoPersonas";

/**
 * T-02 LoginPage boundary. There is no DOM test environment in this repo
 * (no jsdom/happy-dom/testing-library, and none may be installed), so:
 * - the real component is rendered to HTML with react-dom/server, and
 * - its wiring is checked in source: a persona click goes through
 *   selectPersona (tested in demoPersonas.test.ts) and onLogin is only
 *   reachable from the form submit.
 * No browser click-through was performed.
 */

const source = fs.readFileSync(path.join(process.cwd(), "client/src/shell/LoginPage.tsx"), "utf8");

function render(isArabic = false) {
  const onLogin = vi.fn(async () => undefined);
  const html = renderToStaticMarkup(
    <LoginPage
      isArabic={isArabic}
      error={null}
      isLoading={false}
      onLanguageToggle={() => undefined}
      onLogin={onLogin}
    />
  );
  return { html, onLogin };
}

describe("LoginPage render", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders persona shortcuts as non-submitting buttons with password guidance", () => {
    vi.stubEnv("VITE_DEMO_PERSONAS", "true");
    const { html, onLogin } = render();

    for (const persona of DEMO_PERSONAS) {
      expect(html).toContain(persona.titleEn);
    }
    const personaButtons = html.match(/<button type="button"[^>]*>/g) ?? [];
    expect(personaButtons.length).toBeGreaterThanOrEqual(DEMO_PERSONAS.length);
    expect(html).toContain("Choosing an account fills its email only. Enter the password, then sign in.");
    expect(html).not.toContain("Executive Fast Access");
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("starts with empty email and password fields", () => {
    vi.stubEnv("VITE_DEMO_PERSONAS", "true");
    const { html } = render();
    const passwordInput = html.match(/<input[^>]*type="password"[^>]*>/)?.[0] ?? "";

    expect(passwordInput).toContain('value=""');
    expect(html).toMatch(/<input[^>]*type="email"[^>]*value=""[^>]*>|<input[^>]*value=""[^>]*type="email"[^>]*>/);
  });

  it("shows the Arabic guidance", () => {
    vi.stubEnv("VITE_DEMO_PERSONAS", "true");
    const { html } = render(true);

    expect(html).toContain("اختيار الحساب يملأ البريد الإلكتروني فقط");
  });

  it("hides the shortcuts without the opt-in", () => {
    vi.stubEnv("VITE_DEMO_PERSONAS", "");
    const { html } = render();

    expect(html).not.toContain(DEMO_PERSONAS[0].titleEn);
  });

  it("renders separate standalone supplier and client registration buttons in EN and AR", () => {
    const { html: en } = render(false);
    expect(en).toContain("Register as a supplier");
    expect(en).toContain("Register as a client");
    expect(en).not.toContain("Register a vendor / event organizer");

    const { html: ar } = render(true);
    expect(ar).toContain("تسجيل كمورد");
    expect(ar).toContain("تسجيل كعميل");
    expect(ar).not.toContain("تسجيل مورد / عميل منظم فعاليات");
  });

  it("renders a prominent Launch Live Demo button in EN and AR without signing in directly", () => {
    const { html: en, onLogin } = render(false);
    expect(en).toContain('data-login-arrival="qasr-dusk"');
    expect(en).toContain("data-brass-horizon");
    expect(en).toContain('data-sadu-ribbon="hairline"');
    expect(en).toContain("data-launch-live-demo");
    expect(en).toContain("Launch Live Demo");
    expect(onLogin).not.toHaveBeenCalled();

    const { html: ar } = render(true);
    expect(ar).toContain("تشغيل العرض المباشر");
  });

  it("renders the single-use password recovery card when a resetToken is present without calling onLogin", () => {
    const onLogin = vi.fn(async () => undefined);
    const en = renderToStaticMarkup(
      <LoginPage
        isArabic={false}
        error={null}
        isLoading={false}
        onLanguageToggle={() => undefined}
        onLogin={onLogin}
        initialResetToken="aud_1.syntheticSecretTokenValue0123456789"
      />
    );
    expect(en).toContain("data-password-reset-form");
    expect(en).toContain("Set a new password");
    expect(en).toContain("Save new password");
    expect(onLogin).not.toHaveBeenCalled();

    const ar = renderToStaticMarkup(
      <LoginPage
        isArabic={true}
        error={null}
        isLoading={false}
        onLanguageToggle={() => undefined}
        onLogin={onLogin}
        initialResetToken="aud_1.syntheticSecretTokenValue0123456789"
      />
    );
    expect(ar).toContain("تعيين كلمة مرور جديدة");
  });
});

describe("LoginPage wiring (source)", () => {
  it("persona buttons call selectPersona with the form setters, never onLogin", () => {
    expect(source).toMatch(/onClick=\{\(\) => selectPersona\(persona, \{ setEmail, setPassword \}\)\}/);
    expect(source).not.toMatch(/persona\.password/);
  });

  it("onLogin is called only from the form submit handler", () => {
    const calls = source.match(/onLogin\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(source).toMatch(/async function handleSubmit[\s\S]*?await onLogin\(email, password\);/);
  });

  it("gates email autofocus to desktop fine-pointer devices so mobile loads at scrollY 0", () => {
    const { html } = render();
    const emailInput = html.match(/<input[^>]*type="email"[^>]*>/)?.[0] ?? "";
    expect(emailInput).not.toMatch(/\bautofocus\b/i);
    expect(source).not.toMatch(/<[A-Za-z][^>]*\bautoFocus\b/);
    expect(source).toContain("shouldAutoFocusEmailInput()");

    expect(shouldAutoFocusEmailInput(undefined)).toBe(false);
    expect(
      shouldAutoFocusEmailInput({
        matchMedia: (query) =>
          ({ matches: query === "(hover: hover) and (pointer: fine)" && false }) as MediaQueryList
      })
    ).toBe(false);
    expect(
      shouldAutoFocusEmailInput({
        matchMedia: (query) =>
          ({ matches: query === "(hover: hover) and (pointer: fine)" }) as MediaQueryList
      })
    ).toBe(true);
  });
});

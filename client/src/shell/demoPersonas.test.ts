import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_PERSONAS, demoPersonasEnabled, selectPersona } from "./demoPersonas";

/**
 * T-02: demo personas are email shortcuts only. They carry no password or
 * other credential, and selecting one cannot sign anybody in.
 */

const ALLOWED_KEYS = ["email", "icon", "id", "subtitleAr", "subtitleEn", "titleAr", "titleEn"];

describe("DEMO_PERSONAS", () => {
  it("carries only identity and label fields", () => {
    expect(DEMO_PERSONAS.length).toBeGreaterThan(0);
    for (const persona of DEMO_PERSONAS) {
      expect(Object.keys(persona).sort()).toEqual(ALLOWED_KEYS);
      expect(persona).not.toHaveProperty("password");
      expect(persona.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    }
  });

  it("keeps the persona identities and bilingual labels", () => {
    expect(DEMO_PERSONAS.map((persona) => persona.id)).toEqual([
      "admin",
      "company",
      "logistics",
      "event",
      "client",
      "captain",
      "guest"
    ]);
    for (const persona of DEMO_PERSONAS) {
      expect(persona.titleEn.length).toBeGreaterThan(0);
      expect(persona.titleAr.length).toBeGreaterThan(0);
    }
  });

  it("contains no value other than the email that could be a secret", () => {
    for (const persona of DEMO_PERSONAS) {
      const strings = Object.entries(persona)
        .filter(([key, value]) => key !== "email" && typeof value === "string")
        .map(([, value]) => value as string);
      for (const value of strings) {
        // Labels are words; nothing looks like an email:password or token.
        expect(value).not.toMatch(/@|\d{4}/);
      }
    }
  });
});

describe("selectPersona", () => {
  it("fills the email and clears a previously typed password", () => {
    let email = "someone@else.test";
    let password = "previously typed";
    selectPersona(DEMO_PERSONAS[0], {
      setEmail: (value) => {
        email = value;
      },
      setPassword: (value) => {
        password = value;
      }
    });

    expect(email).toBe(DEMO_PERSONAS[0].email);
    expect(password).toBe("");
  });

  it("only touches the two form setters and returns nothing (no login path)", () => {
    const form = { setEmail: vi.fn(), setPassword: vi.fn() };
    const result = selectPersona(DEMO_PERSONAS[1], form);

    expect(result).toBeUndefined();
    expect(form.setEmail).toHaveBeenCalledTimes(1);
    expect(form.setPassword).toHaveBeenCalledWith("");
    expect(selectPersona.length).toBe(2);
  });
});

describe("demoPersonasEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays off without the explicit opt-in (no window in this environment)", () => {
    vi.stubEnv("VITE_DEMO_PERSONAS", "");
    expect(demoPersonasEnabled()).toBe(false);
  });

  it("turns on only for VITE_DEMO_PERSONAS=true", () => {
    vi.stubEnv("VITE_DEMO_PERSONAS", "true");
    expect(demoPersonasEnabled()).toBe(true);
  });
});

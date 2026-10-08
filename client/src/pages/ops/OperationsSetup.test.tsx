import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MIN_ACCOUNT_PASSWORD_LENGTH,
  OperationsSetup,
  buildUserCreatePayload,
  canSubmitUserDraft,
  isAccountPasswordReady
} from "./OperationsSetup";
import type { UserCreateInput } from "../types";

// Translation is not initialised in tests; use a fixed English language.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));

/**
 * T-02 OperationsSetup boundary: no bundled shared password in the user draft
 * or the guest hint, and a user can only be created with an explicitly typed
 * password of the API's minimum length. There is no DOM test environment in
 * this repo, so the component is rendered with react-dom/server and the
 * post-success reset is checked in source; no browser click-through was done.
 */

const source = fs.readFileSync(
  path.join(process.cwd(), "client/src/pages/ops/OperationsSetup.tsx"),
  "utf8"
);

const draft = (overrides: Partial<UserCreateInput> = {}): UserCreateInput => ({
  name: "Coordinator One",
  email: "coordinator@example.test",
  phone: "+966500000001",
  role: "COORDINATOR",
  language: "ar",
  password: "typed-by-admin",
  ...overrides
});

describe("account password rules", () => {
  it("matches the API minimum of 8 characters, counted as entered", () => {
    expect(MIN_ACCOUNT_PASSWORD_LENGTH).toBe(8);
    expect(isAccountPasswordReady(undefined)).toBe(false);
    expect(isAccountPasswordReady("")).toBe(false);
    expect(isAccountPasswordReady("1234567")).toBe(false);
    expect(isAccountPasswordReady("12345678")).toBe(true);
    // Not trimmed, exactly like the server's zod min(8).
    expect(isAccountPasswordReady(" 123456 ")).toBe(true);
  });

  it("blocks submission without a name, an email or a ready password", () => {
    expect(canSubmitUserDraft(draft())).toBe(true);
    expect(canSubmitUserDraft(draft({ password: "" }))).toBe(false);
    expect(canSubmitUserDraft(draft({ password: undefined }))).toBe(false);
    expect(canSubmitUserDraft(draft({ password: "short" }))).toBe(false);
    expect(canSubmitUserDraft(draft({ name: "  " }))).toBe(false);
    expect(canSubmitUserDraft(draft({ email: "" }))).toBe(false);
  });

  it("always sends the entered password explicitly (never omitted)", () => {
    expect(buildUserCreatePayload(draft())).toMatchObject({ password: "typed-by-admin" });
    const withoutPassword = buildUserCreatePayload(draft({ password: undefined }));
    expect(withoutPassword).toHaveProperty("password", "");
  });
});

describe("OperationsSetup render", () => {
  const event = {
    id: "evt_1",
    name: "Synthetic Summit",
    venue: "Synthetic Venue",
    venueLat: 24.7,
    venueLng: 46.6,
    guests: []
  };
  const noop = vi.fn(async () => undefined);

  function render() {
    const props = {
      data: { drivers: [] },
      event,
      session: undefined,
      inviteGuests: noop,
      importGuests: noop,
      createDriver: noop,
      createSupplier: noop,
      createUser: noop,
      createTask: noop
    } as unknown as Parameters<typeof OperationsSetup>[0];
    return renderToStaticMarkup(<OperationsSetup {...props} />);
  }

  it("renders an empty, masked user password field", () => {
    const html = render();
    const passwordInputs = html.match(/<input[^>]*type="password"[^>]*>/g) ?? [];

    expect(passwordInputs).toHaveLength(1);
    expect(passwordInputs[0]).toContain('value=""');
    expect(passwordInputs[0]).toContain('autoComplete="new-password"');
    expect(html).toContain(`Enter a password of at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters`);
  });

  it("starts with the create-user button disabled", () => {
    const html = render();
    const button = html.match(/<button[^>]*>(?:(?!<\/button>).)*Create user<\/button>/)?.[0] ?? "";

    expect(button).toContain('disabled=""');
  });

  it("shows neutral guest guidance and no credential hint", () => {
    const html = render();

    expect(html).toContain("Arrange the guest&#x27;s sign-in details with the administrator.");
    expect(html).not.toMatch(/Temporary password<\/span>?\s*:|Temporary password: /);
    expect(noop).not.toHaveBeenCalled();
  });
});

describe("OperationsSetup wiring (source)", () => {
  it("starts and resets the user draft with an empty password", () => {
    expect(source).toMatch(/language: "ar",\r?\n    password: ""\r?\n  \}\);/);
    expect(source).toMatch(
      /await createUser\(buildUserCreatePayload\(userDraft\)\);\s*setUserDraft\(\(current\) => \(\{[\s\S]*?password: ""\s*\}\)\);/
    );
  });

  it("gates the submit button on the password rule", () => {
    expect(source).toMatch(/pendingAction !== null \|\| !canSubmitUserDraft\(userDraft\)/);
  });
});

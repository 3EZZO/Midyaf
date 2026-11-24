import { describe, expect, it, vi } from "vitest";
import { emailConfigured, invitationEmail, passwordResetEmail, publicAppUrl, sendEmail } from "./mailer.js";

const configured = {
  BREVO_API_KEY: "test-brevo-key",
  MAIL_FROM_EMAIL: "ops@example.test",
  MAIL_FROM_NAME: "Midyaf",
  CLIENT_ORIGIN: "https://midyaf.example.test,http://localhost:5173",
  PUBLIC_APP_URL: undefined
} as never;

const unconfigured = { ...(configured as object), BREVO_API_KEY: undefined } as never;

describe("mailer (PLAN_READY_1 Sprint 2, Brevo over HTTPS)", () => {
  it("is inert without BREVO_API_KEY + MAIL_FROM_EMAIL and never calls the network", async () => {
    const fetcher = vi.fn();
    expect(emailConfigured(unconfigured)).toBe(false);
    const result = await sendEmail(passwordResetEmail("a@example.test", "A", "https://x/#resetToken=t"), unconfigured, fetcher as never);
    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts one Brevo transactional email with the api-key header", async () => {
    const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response("{}", { status: 201 }));
    const result = await sendEmail(invitationEmail("guest@example.test", "Riyadh Summit", "https://x/#workspace-invite=abc"), configured, fetcher as never);
    expect(result).toEqual({ sent: true, provider: "brevo" });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init!.headers as Record<string, string>)["api-key"]).toBe("test-brevo-key");
    const body = JSON.parse(String(init!.body));
    expect(body.sender).toEqual({ email: "ops@example.test", name: "Midyaf" });
    expect(body.to).toEqual([{ email: "guest@example.test" }]);
    expect(body.htmlContent).toContain("https://x/#workspace-invite=abc");
  });

  it("reports provider errors and timeouts without throwing or logging the link", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const rejected = await sendEmail(
        passwordResetEmail("a@example.test", "A", "https://x/#resetToken=secret-token"),
        configured,
        (async () => new Response("bad", { status: 401 })) as never
      );
      expect(rejected).toEqual({ sent: false, reason: "provider_error" });
      const aborted = await sendEmail(
        passwordResetEmail("a@example.test", "A", "https://x/#resetToken=secret-token"),
        configured,
        (async () => {
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }) as never
      );
      expect(aborted).toEqual({ sent: false, reason: "timeout" });
      expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-token");
    } finally {
      warn.mockRestore();
    }
  });

  it("escapes HTML in names and builds links from the first CLIENT_ORIGIN", () => {
    const message = passwordResetEmail("a@example.test", "<img src=x onerror=alert(1)>", "https://x/#resetToken=t");
    expect(message.html).not.toContain("<img src=x");
    expect(message.html).toContain("&lt;img");
    expect(publicAppUrl(configured)).toBe("https://midyaf.example.test");
    expect(publicAppUrl({ ...(configured as object), PUBLIC_APP_URL: "https://app.example.test/" } as never)).toBe("https://app.example.test");
  });
});

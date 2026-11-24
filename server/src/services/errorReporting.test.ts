import { beforeEach, describe, expect, it, vi } from "vitest";

const sentryMock = vi.hoisted(() => {
  const scope = {
    setTag: vi.fn(),
    setUser: vi.fn()
  };
  return {
    scope,
    init: vi.fn(),
    withScope: vi.fn((cb: (s: typeof scope) => void) => cb(scope)),
    captureException: vi.fn(),
    flush: vi.fn(async () => true)
  };
});

vi.mock("@sentry/node", () => ({
  init: sentryMock.init,
  withScope: sentryMock.withScope,
  captureException: sentryMock.captureException,
  flush: sentryMock.flush
}));

import {
  errorReportingEnabled,
  flushErrorReporting,
  initErrorReporting,
  redactText,
  reportError,
  resetErrorReportingForTest,
  scrubEvent
} from "./errorReporting.js";

beforeEach(() => {
  resetErrorReportingForTest();
  vi.clearAllMocks();
});

describe("errorReporting / Sentry Free (PLAN_READY_1 Sprint 4)", () => {
  it("stays completely inert when SENTRY_DSN is unset", async () => {
    expect(initErrorReporting({ SENTRY_DSN: undefined, NODE_ENV: "production" } as any)).toBe(false);
    expect(errorReportingEnabled()).toBe(false);
    expect(sentryMock.init).not.toHaveBeenCalled();

    reportError(new Error("boom"), { method: "GET", path: "/api/test", userId: "u_1" });
    expect(sentryMock.captureException).not.toHaveBeenCalled();

    await flushErrorReporting();
    expect(sentryMock.flush).not.toHaveBeenCalled();
  });

  it("initializes with sendDefaultPii=false and reports unexpected errors with opaque user id", async () => {
    expect(
      initErrorReporting({ SENTRY_DSN: "https://key@o1.ingest.sentry.io/123", NODE_ENV: "production" } as any)
    ).toBe(true);
    expect(errorReportingEnabled()).toBe(true);
    expect(sentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://key@o1.ingest.sentry.io/123",
        tracesSampleRate: 0,
        maxBreadcrumbs: 20
      })
    );

    const err = new Error("Unexpected database error");
    reportError(err, { method: "POST", path: "/api/uploads?token=secret123", userId: "usr_42" });
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith("route", "POST /api/uploads?token=[redacted]");
    expect(sentryMock.scope.setUser).toHaveBeenCalledWith({ id: "usr_42" });
    expect(sentryMock.captureException).toHaveBeenCalledWith(err);

    await flushErrorReporting(1000);
    expect(sentryMock.flush).toHaveBeenCalledWith(1000);
  });

  it("redacts JWTs, Bearer tokens, reset/invite params, connection URIs, and hex64 hashes", () => {
    const sample = [
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.signaturepart12345",
      "Bearer tok_secret_abc.123",
      "https://midyaf.onrender.com/#resetToken=aud1.secretvalue",
      "postgresql://admin:supersecret@ep-demo.neon.tech/neondb",
      "cloudinary://12345:mysecret@vshaqdxu",
      "a".repeat(64)
    ].join(" | ");

    const cleaned = redactText(sample);
    expect(cleaned).not.toContain("eyJhbGci");
    expect(cleaned).not.toContain("tok_secret_abc");
    expect(cleaned).not.toContain("aud1.secretvalue");
    expect(cleaned).not.toContain("supersecret");
    expect(cleaned).not.toContain("mysecret");
    expect(cleaned).not.toContain("a".repeat(64));
    expect(cleaned).toContain("[jwt]");
    expect(cleaned).toContain("Bearer [redacted]");
    expect(cleaned).toContain("resetToken=[redacted]");
    expect(cleaned).toContain("postgresql://[redacted]");
    expect(cleaned).toContain("cloudinary://[redacted]");
    expect(cleaned).toContain("[hex64]");
  });

  it("scrubs request query strings, auth/cookie headers, PII user fields, extra, and breadcrumb data", () => {
    const scrubbed = scrubEvent({
      message: "Failed with Bearer secret_token_xyz",
      request: {
        method: "GET",
        url: "https://midyaf.onrender.com/api/file-assets/fa1/content?exp=123&sig=abcdef",
        headers: {
          authorization: "Bearer secret_token_xyz",
          cookie: "session=topsecret",
          "user-agent": "Mozilla/5.0",
          "content-type": "application/json"
        },
        data: { password: "secret" }
      },
      user: {
        id: "u_99",
        email: "vip@example.sa",
        username: "VIP Guest",
        ip_address: "1.2.3.4"
      },
      exception: {
        values: [{ type: "Error", value: "postgres://user:pass@host/db failed" }]
      },
      breadcrumbs: [
        { message: "calling /auth?token=abc", data: { url: "https://secret.test?sig=123" } }
      ],
      extra: { rawBody: "sensitive" }
    } as any);

    expect(scrubbed.request?.url).toBe("https://midyaf.onrender.com/api/file-assets/fa1/content");
    expect(scrubbed.request?.headers).toEqual({
      "user-agent": "Mozilla/5.0",
      "content-type": "application/json"
    });
    expect(scrubbed.request).not.toHaveProperty("data");
    expect(scrubbed.user).toEqual({ id: "u_99" });
    expect(scrubbed.message).toBe("Failed with Bearer [redacted]");
    expect(scrubbed.exception?.values?.[0].value).toBe("postgres://[redacted] failed");
    expect(scrubbed.breadcrumbs?.[0].message).toBe("calling /auth?token=[redacted]");
    expect(scrubbed.breadcrumbs?.[0].data).toBeUndefined();
    expect(scrubbed.extra).toBeUndefined();
  });
});

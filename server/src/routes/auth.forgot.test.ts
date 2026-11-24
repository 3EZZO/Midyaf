import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));
const mail = vi.hoisted(() => ({ configured: true, sent: [] as Array<{ to: string; text: string }> }));

vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});

vi.mock("../services/mailer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/mailer.js")>();
  return {
    ...actual,
    emailConfigured: () => mail.configured,
    publicAppUrl: () => "https://midyaf.example.test",
    sendEmail: vi.fn(async (message: { to: string; text: string }) => {
      mail.sent.push({ to: message.to, text: message.text });
      return { sent: true, provider: "brevo" };
    })
  };
});

const { startHarness } = await import("../testing/httpHarness.js");
const authModule = await import("./auth.js");
const { resetAuthRateLimits } = authModule;

let http: Harness;
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

beforeAll(async () => {
  http = await startHarness([["/auth", authModule.default]]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(async () => {
  resetAuthRateLimits();
  mail.configured = true;
  mail.sent.length = 0;
  const now = new Date();
  memory.current.seed({
    user: [
      { id: "u_cap", name: "Captain Fahad", email: "cap@example.test", phone: "+966500000004", role: Role.DRIVER, language: "ar", avatar: null, passwordHash: await bcrypt.hash("old-password-1234", 4), onboardingPending: false, onboardingKind: null, createdAt: now, updatedAt: now }
    ],
    auditLog: []
  });
});

describe("Self-service password recovery (PLAN_READY_1 Sprint 2 email)", () => {
  it("advertises email recovery only when email delivery is configured", async () => {
    expect((await http.get("/auth/recovery-options")).body).toEqual({ emailRecovery: true });
    mail.configured = false;
    expect((await http.get("/auth/recovery-options")).body).toEqual({ emailRecovery: false });
  });

  it("answers identically for known and unknown emails and only emails real accounts", async () => {
    const known = await http.post("/auth/forgot-password", undefined, { email: "CAP@example.test" });
    const unknown = await http.post("/auth/forgot-password", undefined, { email: "nobody@example.test" });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    await settle();

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("cap@example.test");
    expect(mail.sent[0].text).toContain("https://midyaf.example.test/#resetToken=");
    // A real single-use reset link was issued (hash only in the audit row).
    const issued = memory.current.rows("auditLog").filter((row) => row.action === "auth.password_reset.issued");
    expect(issued).toHaveLength(1);
  });

  it("sends nothing and issues no link when email is not configured", async () => {
    mail.configured = false;
    const res = await http.post("/auth/forgot-password", undefined, { email: "cap@example.test" });
    expect(res.status).toBe(202);
    await settle();
    expect(mail.sent).toHaveLength(0);
    expect(memory.current.rows("auditLog")).toHaveLength(0);
  });

  it("caps emails per address (3/hour) and requests per IP (10/15 min)", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await http.post("/auth/forgot-password", undefined, { email: "cap@example.test" })).status).toBe(202);
    }
    await settle();
    expect(mail.sent).toHaveLength(3);

    for (let i = 0; i < 5; i += 1) {
      await http.post("/auth/forgot-password", undefined, { email: `other${i}@example.test` });
    }
    const throttled = await http.post("/auth/forgot-password", undefined, { email: "cap@example.test" });
    expect(throttled.status).toBe(429);
  });
});

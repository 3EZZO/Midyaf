import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";
import { stripSensitiveFields } from "../utils/safeResponse.js";

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));
vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});

const { startHarness } = await import("../testing/httpHarness.js");
const authModule = await import("./auth.js");
const authRouter = authModule.default;
const { resetAuthRateLimits } = authModule;
const usersRouter = (await import("./users.js")).default;

const actors = {
  sa: { id: "u_sa", email: "sa@example.test", role: Role.SUPER_ADMIN },
  lm: { id: "u_lm", email: "lm@example.test", role: Role.LOGISTICS_MANAGER },
  org: { id: "u_org", email: "org@example.test", role: Role.ORGANIZER },
  cap: { id: "u_cap", email: "cap@example.test", role: Role.DRIVER }
};

let http: Harness;

async function seedUsers() {
  const oldHash = await bcrypt.hash("old-password-1234", 4);
  const now = new Date();
  memory.current.seed({
    user: [
      { id: "u_sa", name: "Super Admin", email: "sa@example.test", phone: "+966500000001", role: Role.SUPER_ADMIN, language: "en", avatar: null, passwordHash: oldHash, onboardingPending: false, onboardingKind: null, createdAt: now, updatedAt: now },
      { id: "u_lm", name: "Logistics Mgr", email: "lm@example.test", phone: "+966500000002", role: Role.LOGISTICS_MANAGER, language: "en", avatar: null, passwordHash: oldHash, onboardingPending: false, onboardingKind: null, createdAt: now, updatedAt: now },
      { id: "u_org", name: "Organizer", email: "org@example.test", phone: "+966500000003", role: Role.ORGANIZER, language: "en", avatar: null, passwordHash: oldHash, onboardingPending: false, onboardingKind: null, createdAt: now, updatedAt: now },
      { id: "u_cap", name: "Captain Fahad", email: "cap@example.test", phone: "+966500000004", role: Role.DRIVER, language: "ar", avatar: null, passwordHash: oldHash, onboardingPending: false, onboardingKind: null, createdAt: now, updatedAt: now }
    ],
    auditLog: []
  });
}

beforeAll(async () => {
  http = await startHarness([
    ["/auth", authRouter],
    ["/users", usersRouter]
  ]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(async () => {
  resetAuthRateLimits();
  await seedUsers();
});

describe("Password recovery (PLAN_READY_1 Sprint 1)", () => {
  it("allows only SUPER_ADMIN to issue a reset link and stores only a SHA-256 hash", async () => {
    for (const actor of [actors.lm, actors.org, actors.cap]) {
      const denied = await http.post("/users/u_cap/reset-link", actor, {});
      expect(denied.status).toBe(403);
    }

    const issued = await http.post("/users/u_cap/reset-link", actors.sa, {});
    expect(issued.status).toBe(201);
    expect(issued.body.userId).toBe("u_cap");
    expect(issued.body.resetPath).toContain("/#resetToken=");
    expect(issued.body.resetPath).not.toContain("?resetToken=");
    expect(typeof issued.body.token).toBe("string");
    const [, rawSecret] = String(issued.body.token).split(".");

    // Super Admin cannot self-issue a reset link
    const selfDenied = await http.post("/users/u_sa/reset-link", actors.sa, {});
    expect(selfDenied.status).toBe(400);

    const auditRows = memory.current.rows("auditLog");
    expect(auditRows).toHaveLength(1);
    const meta = auditRows[0].metadata as Record<string, unknown>;
    expect(typeof meta.tokenHash).toBe("string");
    expect(meta.tokenHash).not.toBe(rawSecret);
    expect(JSON.stringify(auditRows[0])).not.toContain(rawSecret);
    // Defense-in-depth: stripSensitiveFields strips tokenHash from audit API responses.
    expect(stripSensitiveFields(meta)).not.toHaveProperty("tokenHash");
  });

  it("redeems a valid token once, rotates the password, and rejects replay", async () => {
    const issued = await http.post("/users/u_cap/reset-link", actors.sa, {});
    const token = issued.body.token as string;

    // Tampered secret fails generically
    const tampered = await http.post("/auth/reset-password", undefined, {
      token: `${token.split(".")[0]}.${"A".repeat(43)}`,
      password: "new-strong-password-2026"
    });
    expect(tampered.status).toBe(400);

    // Valid redemption updates password
    const reset = await http.post("/auth/reset-password", undefined, {
      token,
      password: "new-strong-password-2026"
    });
    expect(reset.status).toBe(200);
    expect(reset.body.ok).toBe(true);

    // Old password no longer works; new password signs in
    expect((await http.post("/auth/login", undefined, { email: "cap@example.test", password: "old-password-1234" })).status).toBe(401);
    expect((await http.post("/auth/login", undefined, { email: "cap@example.test", password: "new-strong-password-2026" })).status).toBe(200);

    // Replaying the same single-use token is rejected
    const replay = await http.post("/auth/reset-password", undefined, {
      token,
      password: "another-strong-password-2026"
    });
    expect(replay.status).toBe(400);
  });

  it("rejects expired tokens and supersedes older unused tokens when a newer link is issued", async () => {
    const first = await http.post("/users/u_cap/reset-link", actors.sa, {});
    const firstToken = first.body.token as string;

    // Backdate first token's createdAt so the second token is strictly newer
    memory.current.rows("auditLog")[0].createdAt = new Date(Date.now() - 5000);

    const second = await http.post("/users/u_cap/reset-link", actors.sa, {});
    const secondToken = second.body.token as string;

    // Old link is superseded
    expect(
      (await http.post("/auth/reset-password", undefined, { token: firstToken, password: "brand-new-password-2026" })).status
    ).toBe(400);

    // Expire second token
    const secondRow = memory.current.rows("auditLog")[1];
    (secondRow.metadata as Record<string, unknown>).expiresAt = new Date(Date.now() - 1000).toISOString();
    expect(
      (await http.post("/auth/reset-password", undefined, { token: secondToken, password: "brand-new-password-2026" })).status
    ).toBe(400);
  });

  it("enforces minimum password length and rate limits reset attempts", async () => {
    const issued = await http.post("/users/u_cap/reset-link", actors.sa, {});
    const token = issued.body.token as string;

    const tooShort = await http.post("/auth/reset-password", undefined, { token, password: "short" });
    expect(tooShort.status).toBe(400);

    // Exhaust the 10-attempt reset IP window (1 already used above)
    for (let i = 0; i < 9; i++) {
      await http.post("/auth/reset-password", undefined, { token: "bad.token.here.invalid.0123456789", password: "valid-length-password" });
    }
    const throttled = await http.post("/auth/reset-password", undefined, { token, password: "valid-length-password" });
    expect(throttled.status).toBe(429);
  });
});

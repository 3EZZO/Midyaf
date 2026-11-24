import httpNode from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

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

let http: Harness;

async function seedUsers() {
  const hash = await bcrypt.hash("strong-password-2026", 4);
  const now = new Date();
  memory.current.seed({
    user: [
      {
        id: "u_ops",
        name: "Ops Lead",
        email: "ops@example.test",
        phone: "+966500000010",
        role: Role.LOGISTICS_MANAGER,
        language: "ar",
        avatar: null,
        passwordHash: hash,
        tokenVersion: 0,
        onboardingPending: false,
        onboardingKind: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "u_pending",
        name: "Pending Vendor",
        email: "vendor@example.test",
        phone: "+966500000011",
        role: Role.GUEST,
        language: "ar",
        avatar: null,
        passwordHash: hash,
        tokenVersion: 0,
        onboardingPending: true,
        onboardingKind: "VENDOR",
        createdAt: now,
        updatedAt: now
      }
    ]
  });
}

beforeAll(async () => {
  http = await startHarness([["/auth", authRouter]]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(async () => {
  resetAuthRateLimits();
  await seedUsers();
});

describe("POST /auth/logout (Audit Batch A2)", () => {
  it("requires authentication", async () => {
    const res = await http.post("/auth/logout", undefined, {});
    expect(res.status).toBe(401);
  });

  it("bumps tokenVersion so prior refresh tokens are immediately rejected, while re-login works", async () => {
    const loginRes = await http.post("/auth/login", undefined, {
      email: "ops@example.test",
      password: "strong-password-2026"
    });
    expect(loginRes.status).toBe(200);
    const oldRefresh = String(loginRes.body.refreshToken);

    // Refresh works before logout.
    const preRefresh = await http.post("/auth/refresh", undefined, {
      refreshToken: oldRefresh
    });
    expect(preRefresh.status).toBe(200);

    // Server logout bumps tokenVersion.
    const logoutRes = await http.post(
      "/auth/logout",
      { id: "u_ops", role: Role.LOGISTICS_MANAGER },
      {}
    );
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toEqual({ ok: true });
    expect(memory.current.rows("user")[0].tokenVersion).toBe(1);

    // Old refresh token is now rejected with 401.
    const postRefresh = await http.post("/auth/refresh", undefined, {
      refreshToken: oldRefresh
    });
    expect(postRefresh.status).toBe(401);

    // Signing in again yields a fresh refresh token (tv=1) that refreshes cleanly.
    const reloginRes = await http.post("/auth/login", undefined, {
      email: "ops@example.test",
      password: "strong-password-2026"
    });
    expect(reloginRes.status).toBe(200);
    const freshRefresh = await http.post("/auth/refresh", undefined, {
      refreshToken: String(reloginRes.body.refreshToken)
    });
    expect(freshRefresh.status).toBe(200);
  });

  it("allows onboarding-pending applicants to log out", async () => {
    const pendingActor = {
      id: "u_pending",
      role: Role.GUEST,
      onboardingPending: true
    } as { id: string; role: Role };

    const res = await http.post("/auth/logout", pendingActor, {});
    expect(res.status).toBe(200);
    const pendingRow = memory.current.rows("user").find((u) => u.id === "u_pending");
    expect(pendingRow?.tokenVersion).toBe(1);
  });

  it("revokes via valid refreshToken even when the access token is expired/garbage, and ignores stale refresh tokens", async () => {
    const loginRes = await http.post("/auth/login", undefined, {
      email: "ops@example.test",
      password: "strong-password-2026"
    });
    expect(loginRes.status).toBe(200);
    const oldRefresh = String(loginRes.body.refreshToken);

    // Mount authRouter directly so we can send an actual garbage/expired Bearer header
    // alongside the valid refreshToken in the JSON body (simulating >15m idle logout).
    const app = express();
    app.use(express.json());
    app.use("/auth", authRouter);
    const rawServer = await new Promise<httpNode.Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const port = (rawServer.address() as AddressInfo).port;
    try {
      const logoutWithExpiredAccess = await fetch(`http://127.0.0.1:${port}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: "Bearer expired.or.garbage.jwt",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ refreshToken: oldRefresh })
      });
      expect(logoutWithExpiredAccess.status).toBe(200);
      expect(await logoutWithExpiredAccess.json()).toEqual({ ok: true });
      expect(memory.current.rows("user")[0].tokenVersion).toBe(1);
    } finally {
      await new Promise<void>((resolve) => rawServer.close(() => resolve()));
    }

    // Old refresh token is now rejected by /auth/refresh.
    const postRefresh = await http.post("/auth/refresh", undefined, {
      refreshToken: oldRefresh
    });
    expect(postRefresh.status).toBe(401);

    // Re-login creates a fresh session at tokenVersion=1; replaying the stale
    // tv=0 refresh token at /auth/logout must NOT bump tokenVersion to 2.
    const relogin = await http.post("/auth/login", undefined, {
      email: "ops@example.test",
      password: "strong-password-2026"
    });
    expect(relogin.status).toBe(200);
    const freshRefresh = String(relogin.body.refreshToken);

    const staleReplay = await http.post("/auth/logout", undefined, {
      refreshToken: oldRefresh
    });
    expect(staleReplay.status).toBe(200);
    expect(memory.current.rows("user")[0].tokenVersion).toBe(1);

    // Fresh session remains valid because the stale token could not force-logout it.
    const stillValid = await http.post("/auth/refresh", undefined, {
      refreshToken: freshRefresh
    });
    expect(stillValid.status).toBe(200);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { ZodError } from "zod";

/**
 * T-02: POST /auth/login accepts only a stored user whose bcrypt hash matches
 * the submitted password. The two values below are the former bypass
 * passwords, kept here only as fixtures proving they are now ordinary wrong
 * passwords. All other credentials and hashes are synthetic. Persistence is
 * mocked; no database is contacted.
 */
const FORMER_BYPASS_VALUES = ["adminalmas", "Midyaf@2026"];

/** Emails the removed fallback mapped to privileged/demo identities. */
const FORMER_FALLBACK_EMAILS: Array<[string, Role]> = [
  ["admin@midyaf.local", Role.SUPER_ADMIN],
  ["organizer@midyaf.local", Role.LOGISTICS_MANAGER],
  ["company@midyaf.local", Role.COMPANY_ORGANIZER],
  ["khalid.ops@sila.com", Role.COMPANY_ORGANIZER],
  ["event.lead@sila.com", Role.ORGANIZER],
  ["client.vip@tourism.gov.sa", Role.COMPANY_ORGANIZER],
  ["driver@midyaf.local", Role.DRIVER],
  ["guest.vip@midyaf.local", Role.GUEST]
];

const db = vi.hoisted(() => {
  type StoredUser = {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    language: string;
    avatar: string | null;
    passwordHash: string;
    createdAt: Date;
    updatedAt: Date;
  };
  const users = new Map<string, StoredUser>();

  const pick = (user: StoredUser, select?: Record<string, boolean>) =>
    select
      ? Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, user[key as keyof StoredUser]]))
      : { ...user };

  return {
    users,
    user: {
      findUnique: vi.fn(async ({ where, select }: { where: { email?: string; id?: string }; select?: Record<string, boolean> }) => {
        const found = [...users.values()].find((user) =>
          where.email !== undefined ? user.email === where.email : user.id === where.id
        );
        return found ? pick(found, select) : null;
      }),
      create: vi.fn(async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
        const now = new Date();
        const user = {
          id: `usr_${users.size + 1}`,
          avatar: null,
          createdAt: now,
          updatedAt: now,
          ...data
        } as StoredUser;
        users.set(user.id, user);
        return pick(user, select);
      })
    }
  };
});

vi.mock("../db.js", () => ({ prisma: db }));

const { signTokens, verifyAccessToken } = await import("../middleware/auth.js");
const { HttpError } = await import("../utils/http.js");
const authRouter = (await import("./auth.js")).default;

let server: Server;
let base = "";

async function storeUser(id: string, email: string, role: Role, password: string) {
  const now = new Date();
  db.users.set(id, {
    id,
    name: `Synthetic ${id}`,
    email,
    phone: "+966500000000",
    role,
    language: "en",
    avatar: null,
    // Low cost keeps the suite fast; bcrypt.compare handles any cost.
    passwordHash: await bcrypt.hash(password, 4),
    createdAt: now,
    updatedAt: now
  });
}

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

function expectNoSession(json: Record<string, any>) {
  expect(json.accessToken).toBeUndefined();
  expect(json.refreshToken).toBeUndefined();
  expect(json.user).toBeUndefined();
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  // Mirrors the production error handler in server/src/index.ts.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) return res.status(400).json({ error: { message: "Validation failed" } });
    if (error instanceof HttpError) return res.status(error.status).json({ error: { message: error.message } });
    return res.status(500).json({ error: { message: "Internal server error" } });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  db.users.clear();
  vi.clearAllMocks();
});

describe("POST /auth/login: former bypass values", () => {
  it.each(FORMER_FALLBACK_EMAILS)(
    "rejects both former values for %s when the stored password differs",
    async (email, role) => {
      await storeUser("usr_mapped", email, role, "synthetic-correct-password");

      for (const password of FORMER_BYPASS_VALUES) {
        const { status, json } = await post("/auth/login", { email, password });
        expect(status).toBe(401);
        expect(json.error.message).toBe("Invalid email or password");
        expectNoSession(json);
      }
      expect(db.user.create).not.toHaveBeenCalled();
    }
  );

  it.each(FORMER_FALLBACK_EMAILS)(
    "rejects both former values for %s when no account exists, inventing none",
    async (email) => {
      for (const password of FORMER_BYPASS_VALUES) {
        const { status, json } = await post("/auth/login", { email, password });
        expect(status).toBe(401);
        expectNoSession(json);
      }
      expect(db.user.findUnique).toHaveBeenCalled();
      expect(db.user.create).not.toHaveBeenCalled();
    }
  );

  it("does not authenticate when the user lookup fails", async () => {
    db.user.findUnique.mockRejectedValueOnce(new Error("database unavailable"));
    db.user.findUnique.mockRejectedValueOnce(new Error("database unavailable"));

    for (const password of FORMER_BYPASS_VALUES) {
      const { status, json } = await post("/auth/login", { email: "admin@midyaf.local", password });
      expect(status).toBe(500);
      expectNoSession(json);
    }
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("only succeeds with a former value when the stored hash genuinely matches it (no blacklist; rotation is separate)", async () => {
    await storeUser("usr_legacy", "legacy@example.test", Role.COORDINATOR, FORMER_BYPASS_VALUES[1]);

    const { status, json } = await post("/auth/login", {
      email: "legacy@example.test",
      password: FORMER_BYPASS_VALUES[1]
    });
    expect(status).toBe(200);
    expect(json.user.id).toBe("usr_legacy");
  });
});

describe("POST /auth/login: normal verification", () => {
  it("signs in a stored user with the right password and returns no hash", async () => {
    await storeUser("usr_ops", "ops@example.test", Role.LOGISTICS_MANAGER, "correct horse battery");

    const { status, json } = await post("/auth/login", {
      email: "ops@example.test",
      password: "correct horse battery"
    });

    expect(status).toBe(200);
    expect(json.user).toMatchObject({ id: "usr_ops", email: "ops@example.test", role: Role.LOGISTICS_MANAGER });
    expect(json.user).not.toHaveProperty("passwordHash");
    expect(json.user).not.toHaveProperty("password");
    expect(verifyAccessToken(json.accessToken)).toEqual({
      id: "usr_ops",
      email: "ops@example.test",
      role: Role.LOGISTICS_MANAGER
    });
    expect(typeof json.refreshToken).toBe("string");
  });

  it("rejects a wrong password and an unknown email with the generic 401", async () => {
    await storeUser("usr_ops", "ops@example.test", Role.LOGISTICS_MANAGER, "correct horse battery");

    for (const body of [
      { email: "ops@example.test", password: "wrong password" },
      { email: "nobody@example.test", password: "correct horse battery" }
    ]) {
      const { status, json } = await post("/auth/login", body);
      expect(status).toBe(401);
      expect(json.error.message).toBe("Invalid email or password");
      expectNoSession(json);
    }
  });

  it("lowercases the email but never trims or rewrites the password", async () => {
    await storeUser("usr_case", "case@example.test", Role.GUEST, "exact-password");
    await storeUser("usr_space", "space@example.test", Role.GUEST, " padded password ");

    expect((await post("/auth/login", { email: "Case@Example.TEST", password: "exact-password" })).status).toBe(200);
    expect((await post("/auth/login", { email: "case@example.test", password: "exact-password " })).status).toBe(401);
    expect((await post("/auth/login", { email: "case@example.test", password: " exact-password" })).status).toBe(401);
    expect((await post("/auth/login", { email: "space@example.test", password: " padded password " })).status).toBe(200);
    expect((await post("/auth/login", { email: "space@example.test", password: "padded password" })).status).toBe(401);
  });

  it("keeps request validation: malformed email or empty password is a 400 without a session", async () => {
    for (const body of [
      { email: "not-an-email", password: "x" },
      { email: "ops@example.test", password: "" },
      { email: "ops@example.test" }
    ]) {
      const { status, json } = await post("/auth/login", body);
      expect(status).toBe(400);
      expectNoSession(json);
    }
  });
});

describe("other auth endpoints are unchanged", () => {
  it("register still creates guests only", async () => {
    const created = await post("/auth/register", {
      name: "New Guest",
      email: "new.guest@example.test",
      phone: "+966500000123",
      password: "guest-password"
    });
    expect(created.status).toBe(201);
    expect(created.json.user.role).toBe(Role.GUEST);
    expect(created.json.user).not.toHaveProperty("passwordHash");
    expect(typeof created.json.accessToken).toBe("string");

    const elevated = await post("/auth/register", {
      name: "Not Allowed",
      email: "elevated@example.test",
      phone: "+966500000124",
      password: "guest-password",
      role: Role.SUPER_ADMIN
    });
    expect(elevated.status).toBe(403);
  });

  it("refresh and me still work for a stored user", async () => {
    await storeUser("usr_me", "me@example.test", Role.COORDINATOR, "me-password-1");
    const tokens = signTokens({ id: "usr_me", email: "me@example.test", role: Role.COORDINATOR });

    const refreshed = await post("/auth/refresh", { refreshToken: tokens.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.json.user).toMatchObject({ id: "usr_me" });
    expect(refreshed.json.user).not.toHaveProperty("passwordHash");

    const me = await fetch(`${base}/auth/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { id: string } }).user.id).toBe("usr_me");
  });
});

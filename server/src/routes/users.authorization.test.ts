import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Role } from "@prisma/client";

/**
 * T-05: HTTP-level checks that `PUT /users/:id` authorizes against the stored
 * target account and the actor before any password hashing, update or audit
 * write. Persistence and bcrypt are mocked; the real router and JWT
 * middleware are used. All accounts and passwords are synthetic.
 */

const fake = vi.hoisted(() => {
  const HASH = "$2a$12$T05.SENTINEL.HASH.synthetic.not.a.credential";
  const createdAt = new Date("2026-10-01T09:00:00Z");

  type Args = {
    where?: { id?: string };
    select?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };

  const user = (id: string, role: string) => ({
    id,
    name: `Synthetic ${id}`,
    email: `${id}@example.test`,
    phone: "+966500000000",
    role,
    language: "ar",
    avatar: null,
    passwordHash: HASH,
    createdAt,
    updatedAt: createdAt
  });

  const seed = () =>
    [
      user("usr_sa", "SUPER_ADMIN"),
      user("usr_sa2", "SUPER_ADMIN"),
      user("usr_lm", "LOGISTICS_MANAGER"),
      user("usr_lm2", "LOGISTICS_MANAGER"),
      user("usr_org", "ORGANIZER"),
      user("usr_org2", "ORGANIZER"),
      user("usr_guest", "GUEST"),
      user("usr_driver", "DRIVER")
    ];

  let users = seed();

  function project(source: Record<string, unknown>, select?: Record<string, unknown>) {
    if (!select) return { ...source };
    const selected: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(select)) {
      if (value && key in source) selected[key] = source[key];
    }
    return selected;
  }

  const calls: Array<{ model: string; method: string; args: Args }> = [];

  const userClient = {
    findUnique: async (args: Args) => {
      calls.push({ model: "user", method: "findUnique", args });
      const found = users.find((item) => item.id === args.where?.id);
      return found ? project(found, args.select) : null;
    },
    findMany: async (args: Args = {}) => {
      calls.push({ model: "user", method: "findMany", args });
      return users.map((item) => project(item, args.select));
    },
    create: async (args: Args) => {
      calls.push({ model: "user", method: "create", args });
      const created = { id: "usr_new", createdAt, updatedAt: createdAt, avatar: null, ...args.data };
      return project(created, args.select);
    },
    update: async (args: Args) => {
      calls.push({ model: "user", method: "update", args });
      const index = users.findIndex((item) => item.id === args.where?.id);
      const defined = Object.fromEntries(
        Object.entries(args.data ?? {}).filter(([, value]) => value !== undefined)
      );
      users[index] = { ...users[index], ...defined } as (typeof users)[number];
      return project(users[index], args.select);
    }
  };

  const auditLogClient = {
    create: async (args: Args) => {
      calls.push({ model: "auditLog", method: "create", args });
      return { id: "aud_new" };
    }
  };

  const prisma = { user: userClient, auditLog: auditLogClient };

  const hash = vi.fn(async (value: string, _rounds: number) => `hashed(${value.length})`);

  return {
    prisma,
    calls,
    hash,
    HASH,
    reset: () => {
      users = seed();
      calls.length = 0;
    }
  };
});

vi.mock("../db.js", () => ({ prisma: fake.prisma }));

vi.mock("bcryptjs", () => ({ default: { hash: fake.hash }, hash: fake.hash }));

const hashSpy = { fn: fake.hash };

const { signTokens } = await import("../middleware/auth.js");
const usersRouter = (await import("./users.js")).default;

const NEW_PASSWORD = "Synthetic-T05-Pass!";

let server: Server;
let base = "";

const actorIds: Partial<Record<Role, string>> = {
  [Role.SUPER_ADMIN]: "usr_sa",
  [Role.LOGISTICS_MANAGER]: "usr_lm",
  [Role.ORGANIZER]: "usr_org",
  [Role.GUEST]: "usr_guest",
  [Role.DRIVER]: "usr_driver"
};

async function call(
  method: string,
  path: string,
  role: Role,
  body?: unknown
): Promise<{ status: number; json: Record<string, any> }> {
  const id = actorIds[role] ?? `usr_${role.toLowerCase()}`;
  const token = signTokens({ id, email: `${id}@example.test`, role }).accessToken;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

const put = (role: Role, targetId: string, body: unknown) =>
  call("PUT", `/api/users/${targetId}`, role, body);

function mutations() {
  return fake.calls.filter((entry) => entry.method !== "findUnique" && entry.method !== "findMany");
}

function expectDeniedWithoutSideEffects(status: number) {
  expect(status).toBe(403);
  expect(hashSpy.fn).not.toHaveBeenCalled();
  expect(mutations()).toEqual([]);
}

function auditWrite() {
  const audits = fake.calls.filter((entry) => entry.model === "auditLog");
  expect(audits).toHaveLength(1);
  return audits[0].args.data as Record<string, any>;
}

function expectNoPasswordMaterial(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(NEW_PASSWORD);
  expect(serialized).not.toContain("hashed(");
  expect(serialized).not.toContain(fake.HASH);
  expect(serialized).not.toContain("passwordHash");
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/users", usersRouter);
  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error.status ?? 500).json({ error: error.message });
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
  fake.reset();
  hashSpy.fn.mockClear();
});

describe("PUT /api/users/:id denies non-super-admin edits of privileged targets", () => {
  it.each([
    [Role.ORGANIZER, "usr_sa"],
    [Role.ORGANIZER, "usr_lm"],
    [Role.LOGISTICS_MANAGER, "usr_sa"],
    [Role.LOGISTICS_MANAGER, "usr_lm2"]
  ])("%s cannot edit %s with role omitted", async (actor, target) => {
    const { status, json } = await put(actor, target, {
      name: "Renamed Account",
      email: "takeover@example.test",
      phone: "+966500000001"
    });

    expectDeniedWithoutSideEffects(status);
    expect(json.error).toBe("Only a super admin can edit this account");
    expect(json.user).toBeUndefined();
  });

  it.each([
    [Role.ORGANIZER, "usr_sa"],
    [Role.ORGANIZER, "usr_lm"],
    [Role.LOGISTICS_MANAGER, "usr_sa"],
    [Role.LOGISTICS_MANAGER, "usr_lm2"]
  ])("%s cannot reset the password of %s", async (actor, target) => {
    const { status } = await put(actor, target, { password: NEW_PASSWORD });

    expectDeniedWithoutSideEffects(status);
  });

  it("an organizer cannot demote a super admin", async () => {
    const { status } = await put(Role.ORGANIZER, "usr_sa", { role: Role.GUEST });

    expectDeniedWithoutSideEffects(status);
  });
});

describe("PUT /api/users/:id denies non-super-admin password changes for other users", () => {
  it.each([
    [Role.ORGANIZER, "usr_org2"],
    [Role.ORGANIZER, "usr_guest"],
    [Role.ORGANIZER, "usr_driver"],
    [Role.LOGISTICS_MANAGER, "usr_org"],
    [Role.LOGISTICS_MANAGER, "usr_guest"]
  ])("%s cannot set the password of %s", async (actor, target) => {
    const { status, json } = await put(actor, target, { password: NEW_PASSWORD });

    expectDeniedWithoutSideEffects(status);
    expect(json.error).toBe("Only a super admin can change another user's password");
  });

  it("an allowed profile field does not carry a password change through", async () => {
    const { status } = await put(Role.ORGANIZER, "usr_guest", {
      name: "Guest Renamed",
      password: NEW_PASSWORD
    });

    expectDeniedWithoutSideEffects(status);
  });
});

describe("PUT /api/users/:id blocks role escalation", () => {
  it.each([
    [Role.ORGANIZER, "usr_guest", Role.SUPER_ADMIN],
    [Role.ORGANIZER, "usr_guest", Role.LOGISTICS_MANAGER],
    [Role.LOGISTICS_MANAGER, "usr_driver", Role.SUPER_ADMIN],
    [Role.ORGANIZER, "usr_org", Role.SUPER_ADMIN],
    [Role.ORGANIZER, "usr_org", Role.LOGISTICS_MANAGER],
    [Role.LOGISTICS_MANAGER, "usr_lm", Role.SUPER_ADMIN]
  ])("%s editing %s cannot assign %s", async (actor, target, role) => {
    const { status, json } = await put(actor, target, { role });

    expectDeniedWithoutSideEffects(status);
    expect(json.error).toBe("Only a super admin can assign this role");
  });
});

describe("PUT /api/users/:id keeps authorized edits", () => {
  it("a super admin can reset another super admin's password and role", async () => {
    const { status, json } = await put(Role.SUPER_ADMIN, "usr_sa2", {
      password: NEW_PASSWORD,
      role: Role.LOGISTICS_MANAGER
    });

    expect(status).toBe(200);
    expect(hashSpy.fn).toHaveBeenCalledTimes(1);
    expect(hashSpy.fn).toHaveBeenCalledWith(NEW_PASSWORD, 12);
    const update = fake.calls.find((entry) => entry.method === "update");
    expect(update?.args.data?.passwordHash).toBe(`hashed(${NEW_PASSWORD.length})`);
    expect(json.user).toMatchObject({ id: "usr_sa2", role: Role.LOGISTICS_MANAGER });
    expectNoPasswordMaterial(json);

    const audit = auditWrite();
    expect(audit).toMatchObject({
      actorUserId: "usr_sa",
      actorRole: Role.SUPER_ADMIN,
      action: "user.update",
      entityType: "USER",
      entityId: "usr_sa2",
      beforeData: { id: "usr_sa2", role: Role.SUPER_ADMIN },
      afterData: { id: "usr_sa2", role: Role.LOGISTICS_MANAGER },
      metadata: { roleChanged: true, passwordChanged: true, selfEdit: false }
    });
    expectNoPasswordMaterial(audit);
  });

  it("a super admin can edit a logistics manager's profile and promote a guest", async () => {
    const profile = await put(Role.SUPER_ADMIN, "usr_lm", { phone: "+966500000002" });
    expect(profile.status).toBe(200);
    expect(profile.json.user.phone).toBe("+966500000002");

    const promote = await put(Role.SUPER_ADMIN, "usr_guest", { role: Role.SUPER_ADMIN });
    expect(promote.status).toBe(200);
    expect(promote.json.user.role).toBe(Role.SUPER_ADMIN);
  });

  it("an organizer can edit their own profile", async () => {
    const { status, json } = await put(Role.ORGANIZER, "usr_org", {
      name: "Organizer Renamed",
      language: "en",
      role: Role.ORGANIZER
    });

    expect(status).toBe(200);
    expect(hashSpy.fn).not.toHaveBeenCalled();
    expect(json.user).toMatchObject({ id: "usr_org", name: "Organizer Renamed", language: "en" });
    expect(auditWrite().metadata).toMatchObject({
      roleChanged: false,
      passwordChanged: false,
      selfEdit: true
    });
  });

  it("an organizer can change their own password", async () => {
    const { status, json } = await put(Role.ORGANIZER, "usr_org", { password: NEW_PASSWORD });

    expect(status).toBe(200);
    expect(hashSpy.fn).toHaveBeenCalledTimes(1);
    expectNoPasswordMaterial(json);
    const audit = auditWrite();
    expect(audit.metadata).toMatchObject({ passwordChanged: true, selfEdit: true });
    expectNoPasswordMaterial(audit);
  });

  it("a logistics manager can edit their own profile and password", async () => {
    const { status, json } = await put(Role.LOGISTICS_MANAGER, "usr_lm", {
      phone: "+966500000003",
      password: NEW_PASSWORD,
      role: Role.LOGISTICS_MANAGER
    });

    expect(status).toBe(200);
    expect(hashSpy.fn).toHaveBeenCalledTimes(1);
    expect(json.user).toMatchObject({ id: "usr_lm", role: Role.LOGISTICS_MANAGER, phone: "+966500000003" });
    expectNoPasswordMaterial(json);
    const audit = auditWrite();
    expect(audit.metadata).toMatchObject({ roleChanged: false, passwordChanged: true, selfEdit: true });
    expectNoPasswordMaterial(audit);
  });

  it.each([
    [Role.ORGANIZER, "usr_guest"],
    [Role.ORGANIZER, "usr_org2"],
    [Role.LOGISTICS_MANAGER, "usr_driver"],
    [Role.LOGISTICS_MANAGER, "usr_org"]
  ])("%s keeps lower-role profile edits on %s", async (actor, target) => {
    const { status, json } = await put(actor, target, { phone: "+966500000004", avatar: null });

    expect(status).toBe(200);
    expect(hashSpy.fn).not.toHaveBeenCalled();
    expect(json.user).toMatchObject({ id: target, phone: "+966500000004" });
    const audit = auditWrite();
    expect(audit.entityId).toBe(target);
    expect(audit.metadata).toMatchObject({ passwordChanged: false, selfEdit: false });
  });

  it("an organizer can still change a guest's role to an assignable role", async () => {
    const { status, json } = await put(Role.ORGANIZER, "usr_guest", { role: Role.DRIVER });

    expect(status).toBe(200);
    expect(json.user.role).toBe(Role.DRIVER);
    expect(auditWrite().metadata).toMatchObject({ roleChanged: true });
  });
});

describe("PUT /api/users/:id edge cases", () => {
  it("returns 404 for an unknown user without side effects", async () => {
    const { status } = await put(Role.ORGANIZER, "usr_missing", { password: NEW_PASSWORD });

    expect(status).toBe(404);
    expect(hashSpy.fn).not.toHaveBeenCalled();
    expect(mutations()).toEqual([]);
  });

  it.each([Role.GUEST, Role.DRIVER])("still rejects %s at the route guard", async (role) => {
    const { status } = await put(role, actorIds[role]!, { name: "Self Service" });

    expect(status).toBe(403);
    expect(fake.calls).toEqual([]);
    expect(hashSpy.fn).not.toHaveBeenCalled();
  });
});

describe("POST /api/users keeps its role-assignment restriction", () => {
  it.each([Role.SUPER_ADMIN, Role.LOGISTICS_MANAGER])(
    "an organizer cannot create a %s account",
    async (role) => {
      const { status } = await call("POST", "/api/users", Role.ORGANIZER, {
        name: "New Account",
        email: "new.account@example.test",
        phone: "+966500000005",
        role,
        password: NEW_PASSWORD
      });

      expectDeniedWithoutSideEffects(status);
    }
  );
});

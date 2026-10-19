import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

/**
 * FULL-OVERHAUL-M2: the real workspace router (both mount points) with JWT
 * middleware over the in-memory Prisma double. Organizations and their
 * memberships: provisioning, member management rules and tenant isolation.
 */

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));

vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});

const { startHarness } = await import("../testing/httpHarness.js");
const { buildWorkspaceTestWorld } = await import("../testing/memoryPrisma.js");
const workspaceRouter = (await import("./workspace.js")).default;

const { actors, seed } = buildWorkspaceTestWorld();
let http: Harness;

beforeAll(async () => {
  http = await startHarness([
    ["/api/workspace", workspaceRouter],
    ["/workspace", workspaceRouter]
  ]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(() => {
  memory.current.seed(structuredClone(seed));
});

const audits = (action: string) => memory.current.rows("auditLog").filter((row) => row.action === action);

describe("mounting and authentication", () => {
  it("serves the same router at /api/workspace and /workspace", async () => {
    const a = await http.get("/api/workspace/organizations", actors.owner);
    const b = await http.get("/workspace/organizations", actors.owner);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body).toEqual(b.body);
  });

  it("rejects requests without a valid token on every sub-router", async () => {
    for (const path of [
      "/api/workspace/organizations",
      "/api/workspace/events",
      "/api/workspace/events/evt_a/guests",
      "/api/workspace/inbox",
      "/api/workspace/events/evt_a/telemetry",
      "/api/workspace/onboarding/applications"
    ]) {
      expect((await http.get(path)).status).toBe(401);
    }
  });
});

describe("GET /organizations", () => {
  it("lists only the caller's active organizations with its role", async () => {
    const { body } = await http.get("/api/workspace/organizations", actors.admin2);
    expect(body.organizations).toEqual([
      expect.objectContaining({ id: "org_a", myRole: "ADMIN" })
    ]);
  });

  it("gives a global LOGISTICS_MANAGER login nothing without a membership", async () => {
    const { body } = await http.get("/api/workspace/organizations", actors.lmOutsider);
    expect(body.organizations).toEqual([]);
  });

  it("lets SUPER_ADMIN list every organization as audited support access", async () => {
    const { body } = await http.get("/api/workspace/organizations", actors.sa);
    expect(body.organizations.map((org: { id: string }) => org.id).sort()).toEqual(["org_a", "org_b", "org_vc", "org_vh"]);
    expect(audits("workspace.support_access")).toHaveLength(1);
  });
});

describe("POST /organizations", () => {
  const valid = { name: "Synthetic New Co", slug: "synthetic-new", kind: "ORGANIZER_COMPANY", ownerUserId: "u_pm" };

  it("is reserved to SUPER_ADMIN and creates the owner membership with an audit", async () => {
    expect((await http.post("/api/workspace/organizations", actors.owner, valid)).status).toBe(403);
    const { status, body } = await http.post("/api/workspace/organizations", actors.sa, valid);
    expect(status).toBe(201);
    const membership = memory.current.rows("organizationMembership").find((row) => row.organizationId === body.organization.id);
    expect(membership).toMatchObject({ userId: "u_pm", role: "OWNER", status: "ACTIVE", grantedById: "u_sa" });
    expect(audits("organization.create")).toHaveLength(1);
  });

  it("refuses a self-owned organization, unknown owners, duplicate slugs and extra fields", async () => {
    expect((await http.post("/api/workspace/organizations", actors.sa, { ...valid, ownerUserId: "u_sa" })).status).toBe(403);
    expect((await http.post("/api/workspace/organizations", actors.sa, { ...valid, ownerUserId: "u_nobody" })).status).toBe(400);
    expect((await http.post("/api/workspace/organizations", actors.sa, { ...valid, slug: "synthetic-a" })).status).toBe(409);
    expect((await http.post("/api/workspace/organizations", actors.sa, { ...valid, id: "forced" })).status).toBe(400);
    expect((await http.post("/api/workspace/organizations", actors.sa, { ...valid, kind: "VENDOR" })).status).toBe(400);
    expect(memory.current.rows("organization")).toHaveLength(4);
  });
});

describe("organization members", () => {
  it("hides another tenant's organization behind a 404", async () => {
    expect((await http.get("/api/workspace/organizations/org_b/members", actors.owner)).status).toBe(404);
    expect((await http.get("/api/workspace/organizations/org_a/members", actors.lmOutsider)).status).toBe(404);
    expect((await http.get("/api/workspace/organizations/org_a/members", actors.orgMember)).status).toBe(200);
  });

  it("lets owners and admins add members, but members cannot", async () => {
    expect(
      (await http.post("/api/workspace/organizations/org_a/members", actors.orgMember, { userId: "u_lm", role: "MEMBER" })).status
    ).toBe(403);
    const added = await http.post("/api/workspace/organizations/org_a/members", actors.admin2, { userId: "u_lm", role: "MEMBER" });
    expect(added.status).toBe(201);
    expect(audits("organization.member.add")).toHaveLength(1);
    // Duplicate membership is a conflict, not a second row.
    expect(
      (await http.post("/api/workspace/organizations/org_a/members", actors.owner, { userId: "u_lm", role: "ADMIN" })).status
    ).toBe(409);
  });

  it("refuses self-grants and lets only owners grant ownership", async () => {
    expect(
      (await http.post("/api/workspace/organizations/org_a/members", actors.admin2, { userId: "u_admin2", role: "OWNER" })).status
    ).toBe(403);
    expect(
      (await http.post("/api/workspace/organizations/org_a/members", actors.admin2, { userId: "u_pm", role: "OWNER" })).status
    ).toBe(403);
    expect(
      (await http.post("/api/workspace/organizations/org_a/members", actors.owner, { userId: "u_pm", role: "OWNER" })).status
    ).toBe(201);
  });

  it("protects the last active owner and the caller's own membership", async () => {
    expect(
      (await http.patch("/api/workspace/organizations/org_a/members/om_owner", actors.owner, { status: "REVOKED" })).status
    ).toBe(403);
    expect(
      (await http.patch("/api/workspace/organizations/org_a/members/om_owner", actors.admin2, { status: "REVOKED" })).status
    ).toBe(403);
    // SUPER_ADMIN support cannot remove the only owner either.
    const last = await http.patch("/api/workspace/organizations/org_a/members/om_owner", actors.sa, { role: "ADMIN" });
    expect(last.status).toBe(409);
    expect(memory.current.rows("organizationMembership").find((row) => row.id === "om_owner")).toMatchObject({ role: "OWNER" });
  });

  it("updates a member with compare-and-set and audits before/after", async () => {
    const { status, body } = await http.patch("/api/workspace/organizations/org_a/members/om_member", actors.admin2, {
      role: "ADMIN"
    });
    expect(status).toBe(200);
    expect(body.member).toMatchObject({ role: "ADMIN", status: "ACTIVE" });
    const [audit] = audits("organization.member.update");
    expect(audit.beforeData).toEqual({ role: "MEMBER", status: "ACTIVE" });
    expect(audit.afterData).toEqual({ role: "ADMIN", status: "ACTIVE" });
  });

  it("never resolves a membership of another organization", async () => {
    expect(
      (await http.patch("/api/workspace/organizations/org_a/members/om_owner_b", actors.owner, { role: "ADMIN" })).status
    ).toBe(404);
  });
});

import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));
const flags = vi.hoisted(() => ({ demo: true }));
vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});
vi.mock("../env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../env.js")>();
  return {
    env: new Proxy(actual.env, {
      get: (target, key) => (key === "DEMO_MODE_ENABLED" ? flags.demo : Reflect.get(target, key))
    })
  };
});

const { signTokens } = await import("../middleware/auth.js");
const { HttpError } = await import("../utils/http.js");
const demoRouter = (await import("./demo.js")).default;
const { parentFirstOrder, planRestore } = await import("../services/demoBaseline.js");
const { DEMO_ACCOUNTS } = await import("../utils/demoProvisioning.js");
const { prepareInvestorDemo } = await import("../services/investorDemoPrep.js");
const { OVERHAUL_IDS } = await import("../utils/overhaulDemo.js");

const users = DEMO_ACCOUNTS.map((account, index) => ({
  id: `u_demo_${index}`,
  email: account.email,
  role: account.role,
  name: account.name,
  phone: account.phone,
  language: account.language,
  passwordHash: "x"
}));
const admin = users.find((user) => user.role === "SUPER_ADMIN")!;
const supplier = users.find((user) => user.email === "supplier@midyaf.local")!;
const outsider = { id: "u_outsider", email: "outsider@example.test", role: "LOGISTICS_MANAGER" as const, name: "Outsider", phone: "+966500000000", language: "en", passwordHash: "x" };

let base = "";
let close: () => Promise<void>;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/demo", demoRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) return res.status(400).json({ message: "invalid" });
    if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
    return res.status(500).json({ message: String(error) });
  });
  const server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});
afterAll(async () => close());
beforeEach(() => {
  flags.demo = true;
  memory.current.seed({ user: structuredClone([...users, outsider]), auditLog: [] });
});

function tokenFor(user: { id: string; email: string; role: string }, demoOrigin?: string) {
  return signTokens(user as never, { demoOrigin }).accessToken;
}

async function call(method: string, path: string, token: string, body?: unknown) {
  const response = await fetch(`${base}/api/demo${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

describe("investor demo routes", () => {
  it("is invisible (404) unless DEMO_MODE_ENABLED is true", async () => {
    flags.demo = false;
    expect((await call("GET", "/status", tokenFor(admin))).status).toBe(404);
    expect((await call("POST", "/switch", tokenFor(admin), { persona: "client" })).status).toBe(404);
  });

  it("lists every persona for the Super Admin and nothing for other roles", async () => {
    const status = await call("GET", "/status", tokenFor(admin));
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ enabled: true, canSwitch: true, activePersona: "admin", origin: { id: admin.id } });
    expect(status.body.personas.map((persona: { key: string }) => persona.key)).toEqual([
      "admin", "company", "eventLead", "logistics", "client", "supplier", "coordinator", "driver", "guestVip"
    ]);
    expect(status.body.personas.every((persona: { available: boolean }) => persona.available)).toBe(true);
    const other = await call("GET", "/status", tokenFor(outsider));
    expect(other.body).toMatchObject({ canSwitch: false, canReset: false, personas: [] });
    expect((await call("POST", "/switch", tokenFor(outsider), { persona: "admin" })).status).toBe(403);
  });

  it("switches instantly to a persona and back without credentials, keeping the admin origin", async () => {
    const switched = await call("POST", "/switch", tokenFor(admin), { persona: "supplier" });
    expect(switched.status).toBe(200);
    expect(switched.body.user).toMatchObject({ id: supplier.id, role: "SUPPLIER" });
    expect(switched.body.user).not.toHaveProperty("passwordHash");
    const supplierToken: string = switched.body.accessToken;
    const status = await call("GET", "/status", supplierToken);
    expect(status.body).toMatchObject({ canSwitch: true, activePersona: "supplier", origin: { id: admin.id } });
    const back = await call("POST", "/switch", supplierToken, { persona: "admin" });
    expect(back.status).toBe(200);
    expect(back.body.user.role).toBe("SUPER_ADMIN");
    expect(memory.current.rows("auditLog").filter((row) => row.action === "demo.switch")).toHaveLength(2);
  });

  it("refuses forged origins, demoted admins, unknown personas and persona role drift", async () => {
    // A supplier token that names a non-admin origin cannot switch.
    expect((await call("POST", "/switch", tokenFor(supplier, outsider.id), { persona: "admin" })).status).toBe(403);
    expect((await call("POST", "/switch", tokenFor(admin), { persona: "nobody" })).status).toBe(400);
    const supplierToken = tokenFor(supplier, admin.id);
    memory.current.rows("user").find((row) => row.id === admin.id)!.role = "LOGISTICS_MANAGER";
    expect((await call("POST", "/switch", supplierToken, { persona: "client" })).status).toBe(403);
    memory.current.rows("user").find((row) => row.id === admin.id)!.role = "SUPER_ADMIN";
    memory.current.rows("user").find((row) => row.id === supplier.id)!.role = "GUEST";
    expect((await call("POST", "/switch", tokenFor(admin), { persona: "supplier" })).status).toBe(409);
  });

  it("requires an explicit confirmation to reset", async () => {
    expect((await call("POST", "/reset", tokenFor(admin), {})).status).toBe(400);
    expect((await call("POST", "/reset", tokenFor(outsider), { confirm: true })).status).toBe(403);
  });
});

describe("baseline restore order", () => {
  it("restores parents before children", () => {
    const order = parentFirstOrder(
      ["TripPassenger", "Trip", "Event", "User", "Organization"],
      [
        { child: "TripPassenger", parent: "Trip" },
        { child: "Trip", parent: "Event" },
        { child: "Event", parent: "Organization" },
        { child: "Event", parent: "User" },
        { child: "Organization", parent: "User" }
      ]
    );
    expect(order.indexOf("User")).toBeLessThan(order.indexOf("Organization"));
    expect(order.indexOf("Organization")).toBeLessThan(order.indexOf("Event"));
    expect(order.indexOf("Event")).toBeLessThan(order.indexOf("Trip"));
    expect(order.indexOf("Trip")).toBeLessThan(order.indexOf("TripPassenger"));
  });

  it("defers nullable references inside a cycle (Event.approvedPlanId <-> EventPlan.eventId)", () => {
    const plan = planRestore(
      ["User", "Event", "EventPlan"],
      [
        { child: "Event", parent: "EventPlan", columns: ["approvedPlanId"], nullable: true },
        { child: "EventPlan", parent: "Event", columns: ["eventId"], nullable: false },
        { child: "EventPlan", parent: "User", columns: ["generatedById"], nullable: false },
        { child: "Event", parent: "User", columns: ["organizerId"], nullable: false }
      ]
    );
    expect(plan.deferred.map((edge) => `${edge.child}.${edge.columns.join()}`)).toEqual(["Event.approvedPlanId"]);
    expect(plan.order.indexOf("Event")).toBeLessThan(plan.order.indexOf("EventPlan"));
    expect(plan.order[0]).toBe("User");
  });

  it("refuses required self references and required cycles instead of half-restoring", () => {
    expect(() => parentFirstOrder(["Task"], [{ child: "Task", parent: "Task" }])).toThrow(/self-reference/);
    expect(() =>
      parentFirstOrder(["A", "B"], [{ child: "A", parent: "B" }, { child: "B", parent: "A" }])
    ).toThrow(/cycle/);
  });
});

describe("investor demo prepare", () => {
  const planningId = OVERHAUL_IDS.events.planning;
  const company = users.find((user) => user.email === "company@midyaf.local")!;
  const client = users.find((user) => user.email === "client.vip@tourism.gov.sa")!;
  const event = {
    id: planningId, organizationId: OVERHAUL_IDS.organizerOrg, organizerId: company.id, name: "Synthetic planning event",
    brief: null, venue: "Synthetic hall", venueLat: null, venueLng: null, locationLabel: "Riyadh", hotelZone: "Synthetic zone",
    planningMode: "ADVISORY", operationalStatus: "PLANNING", messagingPolicy: "OPEN", vipGuestCount: 6, regularGuestCount: 40, carCount: 0,
    startAt: new Date("2026-12-05T06:00:00.000Z"), endAt: new Date("2026-12-07T18:00:00.000Z"), arrivalStartAt: null, departureEndAt: null,
    approvedPlanId: "ovh2_plan_planning_v1", planApprovedAt: new Date("2026-11-10T08:40:02.586Z"), contractSignedAt: null
  };
  // The live demo database on 2026-11-22: the fixture's planning draft had already been approved.
  const approvedV1 = {
    id: "ovh2_plan_planning_v1", eventId: planningId, version: 1, status: "APPROVED", source: "DETERMINISTIC_ADVISORY", advisory: true,
    summary: "Synthetic advisory", content: { generator: "deterministic-advisory" }, generatedById: company.id, approvedById: client.id
  };
  const seedLive = () =>
    memory.current.seed({
      user: structuredClone(users),
      auditLog: [],
      organization: [{ id: OVERHAUL_IDS.organizerOrg, name: "Synthetic Organizer" }],
      event: [structuredClone(event)],
      eventPlan: [structuredClone(approvedV1)],
      eventMembership: [],
      organizationMembership: []
    });

  it("adds a client-approvable advisory DRAFT when the planning plan was already approved, once", async () => {
    seedLive();
    const changes = await prepareInvestorDemo(memory.current.prisma as never, admin.id);
    expect(changes).toEqual(["client-planning-membership", "planning-draft-plan", "company-org-admin"]);
    const plans = memory.current.rows("eventPlan").filter((row) => row.eventId === planningId);
    const draft = plans.find((row) => row.status === "DRAFT")!;
    expect(draft).toMatchObject({ id: "demo_plan_planning_v2", version: 2, source: "DETERMINISTIC_ADVISORY", advisory: true, generatedById: company.id });
    expect((draft.content as { rfqDraft?: { planId: string; lines: unknown[] } }).rfqDraft).toMatchObject({ planId: "demo_plan_planning_v2" });
    expect(plans.find((row) => row.id === "ovh2_plan_planning_v1")!.status).toBe("APPROVED");
    expect(await prepareInvestorDemo(memory.current.prisma as never, admin.id)).toEqual([]);
    expect(memory.current.rows("eventPlan").filter((row) => row.eventId === planningId)).toHaveLength(2);
  });

  it("leaves an existing draft alone (fresh fixture)", async () => {
    seedLive();
    memory.current.rows("eventPlan")[0].status = "DRAFT";
    expect(await prepareInvestorDemo(memory.current.prisma as never, admin.id)).not.toContain("planning-draft-plan");
    expect(memory.current.rows("eventPlan")).toHaveLength(1);
  });
});

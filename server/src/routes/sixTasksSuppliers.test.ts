import { Router } from "express";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

/**
 * SIX-TASKS #5 supplier lifecycle through the REAL legacy boundary, mounted
 * exactly like server/src/index.ts (requireAuth + legacyWorkspaceBoundary in
 * front of the legacy routers; /workspace without it).
 */

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));
vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});

const { startHarness } = await import("../testing/httpHarness.js");
const { buildWorkspaceTestWorld } = await import("../testing/memoryPrisma.js");
const { requireAuth } = await import("../middleware/auth.js");
const { legacyWorkspaceBoundary } = await import("../utils/legacyWorkspaceBoundary.js");
const workspaceRouter = (await import("./workspace.js")).default;
const suppliersRouter = (await import("./suppliers.js")).default;
const operationsRouter = (await import("./operations.js")).default;
const bootstrapRouter = (await import("./bootstrap.js")).default;

function legacy(router: Router) {
  const wrapped = Router();
  wrapped.use(requireAuth, legacyWorkspaceBoundary, router);
  return wrapped;
}

const { actors: a, seed } = buildWorkspaceTestWorld();
const applicant = { id: "u_applicant", role: "GUEST" as const };

function world() {
  const base = structuredClone(seed) as Record<string, Array<Record<string, unknown>>>;
  // u_vendor registered itself and was activated: SUPPLIER role + legacy Supplier profile.
  const vendor = base.user.find((row) => row.id === a.vendor.id)!;
  Object.assign(vendor, { onboardingKind: "VENDOR", onboardingPending: false, language: "en", avatar: null, createdAt: new Date() });
  base.user.push({ id: applicant.id, role: "GUEST", name: "Pending applicant", email: "applicant@example.test", phone: "+966511111111", passwordHash: "x", onboardingKind: "VENDOR", onboardingPending: true });
  base.supplier = [
    { id: "sup_registered", userId: a.vendor.id, name: "Registered Hotel Vendor (Synthetic)", category: "HOTEL", verified: true, crNumber: null, commissionPercent: "12.00", rating: 4.5, sponsoredRank: null, cityId: null },
    { id: "sup_pending", userId: applicant.id, name: "Pending Applicant Vendor (Synthetic)", category: "HOTEL", verified: false, crNumber: null, commissionPercent: "12.00", rating: 4.5, sponsoredRank: null, cityId: null }
  ];
  base.activityIntake = [];
  base.vendorQuote = [];
  base.notification = [];
  return base;
}

let http: Harness;
beforeAll(async () => {
  http = await startHarness([
    ["/api/workspace", workspaceRouter],
    ["/api/suppliers", legacy(suppliersRouter)],
    ["/api", legacy(bootstrapRouter)],
    ["/api", legacy(operationsRouter)]
  ]);
});
afterAll(async () => {
  await http.close();
});
beforeEach(() => {
  memory.current.seed(world());
});

it("shows an activated self-registered supplier to operations and keeps its own identity in its portal", async () => {
  const list = await http.get("/api/suppliers", a.sa);
  expect(list.status).toBe(200);
  const names = list.body.suppliers.map((row: { name: string }) => row.name);
  expect(names).toContain("Registered Hotel Vendor (Synthetic)");
  // A still-pending applicant stays behind the boundary.
  expect(names).not.toContain("Pending Applicant Vendor (Synthetic)");

  const own = await http.get("/api/bootstrap", a.vendor);
  expect(own.status).toBe(200);
  expect(own.body.users.map((row: { id: string }) => row.id)).toEqual([a.vendor.id]);
});

it("sends an approved plan's RFQ to matching suppliers, who quote on it; logistics stays walled off", async () => {
  // Only the event team may send; nothing before approval.
  expect((await http.post("/api/workspace/events/evt_a/rfq/send", a.client, { confirm: true })).status).toBe(403);
  expect((await http.post("/api/workspace/events/evt_a/rfq/send", a.vendor, { confirm: true })).status).toBe(403);
  expect((await http.post("/api/workspace/events/evt_locked/rfq/send", a.owner, { confirm: true })).status).toBe(423);
  expect((await http.post("/api/workspace/events/evt_a/rfq/send", a.pm, {})).status).toBe(400);

  const sent = await http.post("/api/workspace/events/evt_a/rfq/send", a.pm, { confirm: true });
  expect(sent.status).toBe(201);
  expect(sent.body).toMatchObject({ created: true, notifiedSuppliers: 1, supplierRequest: { status: "QUOTING" } });
  const intakeId: string = sent.body.supplierRequest.intakeId;
  expect(sent.body.supplierRequest.reference).toMatch(/^REQ-[0-9A-F]{8}$/);
  const again = await http.post("/api/workspace/events/evt_a/rfq/send", a.pm, { confirm: true });
  expect(again.status).toBe(200);
  expect(again.body.supplierRequest.intakeId).toBe(intakeId);
  expect((await http.get("/api/workspace/events/evt_a/rfq/dispatch", a.pm)).body.supplierRequest.intakeId).toBe(intakeId);

  // The supplier was told, and sees the request by opaque code with aggregate demand only.
  const notes = memory.current.rows("notification").filter((row) => row.userId === a.vendor.id);
  expect(notes).toHaveLength(1);
  const requests = await http.get("/api/suppliers/me/requests", a.vendor);
  expect(requests.status).toBe(200);
  const request = requests.body.requests.find((row: { intakeId: string }) => row.intakeId === intakeId);
  expect(request).toMatchObject({ category: "HOTEL", scope: "HOTEL_ROOMS", estimatedQuantity: 7, status: "QUOTING" });
  expect(JSON.stringify(requests.body)).not.toContain("evt_a");
  expect(JSON.stringify(requests.body)).not.toContain("Synthetic evt_a");

  const quote = await http.post(`/api/suppliers/me/requests/${intakeId}/quotes`, a.vendor, { item: "Synthetic rooms", quantity: 7, unitPrice: 450 });
  expect(quote.status).toBe(201);

  // D-001: global logistics roles never see the organization's request; D-011: the Super Admin does.
  const lm = await http.get("/api/activity-intakes", a.lm);
  expect(lm.body.activityIntakes.map((row: { id: string }) => row.id)).not.toContain(intakeId);
  expect((await http.get(`/api/vault/${intakeId}`, a.lm)).status).toBe(404);
  const admin = await http.get("/api/activity-intakes", a.sa);
  expect(admin.body.activityIntakes.map((row: { id: string }) => row.id)).toContain(intakeId);
  const submissions = await http.get(`/api/supplier-submissions?intakeId=${intakeId}`, a.sa);
  expect(submissions.status).toBe(200);
  expect(JSON.stringify(submissions.body)).toContain(quote.body.quote.id);
});

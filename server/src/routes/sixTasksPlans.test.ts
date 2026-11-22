import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";
import { editablePlanFromContent } from "../../../shared/planEditing.js";

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));
vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});
const { startHarness } = await import("../testing/httpHarness.js");
const { buildWorkspaceTestWorld } = await import("../testing/memoryPrisma.js");
const router = (await import("./workspace.js")).default;
const { actors: a, seed } = buildWorkspaceTestWorld();
let http: Harness;
beforeAll(async () => {
  http = await startHarness([["/w", router]]);
});
afterAll(async () => {
  await http.close();
});
beforeEach(() => {
  memory.current.seed(structuredClone(seed));
});

async function newDraft(eventId = "evt_a") {
  const generated = await http.post(`/w/events/${eventId}/plans/generate`, a.pm, { mode: "ADVISORY" });
  expect(generated.status).toBe(201);
  return generated.body.plan as { id: string; version: number; summary: string; content: unknown; viewerCanApprove: boolean; viewerCanEdit: boolean };
}

// ---------------------------------------------------------------------------
// #1 Plans awaiting approval belong to the client (and every other authorized party)
// ---------------------------------------------------------------------------

it("lets the event's client approve a draft plan with one click and records it as a client approval", async () => {
  const draft = await newDraft();
  const approved = await http.post(`/w/events/evt_a/plans/${draft.id}/approve`, a.client, { confirm: true });
  expect(approved.status).toBe(200);
  expect(approved.body.plan.status).toBe("APPROVED");
  expect(approved.body.event).toMatchObject({ planApproved: true, approvedPlanId: draft.id });
  const audit = memory.current.rows("auditLog").find((row) => row.action === "workspace.plan.approve" && row.entityId === draft.id)!;
  expect((audit.metadata as { approverKind: string }).approverKind).toBe("CLIENT");
});

it("never lets a supplier approve, and gives suppliers an empty approval queue", async () => {
  const draft = await newDraft();
  expect((await http.post(`/w/events/evt_a/plans/${draft.id}/approve`, a.vendor, { confirm: true })).status).toBe(403);
  const queue = await http.get("/w/plans/awaiting-approval", a.vendor);
  expect(queue.status).toBe(200);
  expect(queue.body.items).toEqual([]);
  const listed = await http.get("/w/events/evt_a/plans", a.vendor);
  expect(listed.body.plans.every((plan: { viewerCanApprove: boolean }) => plan.viewerCanApprove === false)).toBe(true);
});

it("lists the latest draft in the client's queue until it is approved", async () => {
  const draft = await newDraft();
  const queue = await http.get("/w/plans/awaiting-approval", a.client);
  expect(queue.status).toBe(200);
  expect(queue.body.items).toHaveLength(1);
  expect(queue.body.items[0]).toMatchObject({
    event: { id: "evt_a", organizationName: "Synthetic Organizer A", hasApprovedPlan: true },
    plan: { id: draft.id, status: "DRAFT", viewerCanApprove: true, viewerCanEdit: false }
  });
  // The client never sees the internal RFQ draft.
  expect(queue.body.items[0].plan.content).not.toHaveProperty("rfqDraft");
  await http.post(`/w/events/evt_a/plans/${draft.id}/approve`, a.client, { confirm: true });
  expect((await http.get("/w/plans/awaiting-approval", a.client)).body.items).toEqual([]);
});

it("also lets the organizer admin, the project manager and the Super Admin approve", async () => {
  for (const approver of [a.owner, a.pm, a.sa]) {
    memory.current.seed(structuredClone(seed));
    const draft = await newDraft();
    const result = await http.post(`/w/events/evt_a/plans/${draft.id}/approve`, approver, { confirm: true });
    expect(result.status).toBe(200);
  }
  // Organization members from another company still cannot see the event.
  const draft = await newDraft();
  expect((await http.post(`/w/events/evt_a/plans/${draft.id}/approve`, a.ownerB, { confirm: true })).status).toBe(404);
});

it("shows the Super Admin every open event's draft and the organizer only its own", async () => {
  await newDraft();
  const admin = await http.get("/w/plans/awaiting-approval", a.sa);
  expect(admin.body.items.map((item: { event: { id: string } }) => item.event.id).sort()).toEqual(["evt_a", "evt_locked"]);
  const otherCompany = await http.get("/w/plans/awaiting-approval", a.ownerB);
  expect(otherCompany.body.items).toEqual([]);
});

// ---------------------------------------------------------------------------
// #4 Inline "Edit AI Plan"
// ---------------------------------------------------------------------------

function editFrom(plan: { summary: string; content: unknown }) {
  const edit = editablePlanFromContent(plan.summary, plan.content);
  return {
    ...edit,
    summary: "Edited: one extra VIP car and an earlier airport desk",
    vehicleRequirements: { ...edit.vehicleRequirements, vip: edit.vehicleRequirements.vip + 1 },
    hotelDistribution: { ...edit.hotelDistribution, regularTwinRooms: 9 },
    schedule: [...edit.schedule, { subteam: "AIRPORT" as const, name: "Early airport desk", startsAt: "2026-10-31T04:00:00.000Z" }],
    items: [{ category: "TICKETS" as const, quantity: 3, note: "Synthetic VIP tickets" }]
  };
}

it("edits a generated draft in place, keeps its provenance and re-derives the RFQ from the edited numbers", async () => {
  const draft = await newDraft();
  expect(draft.viewerCanEdit).toBe(true);
  const body = editFrom(draft);
  const saved = await http.patch(`/w/events/evt_a/plans/${draft.id}`, a.pm, body);
  expect(saved.status).toBe(200);
  expect(saved.body.created).toBe(false);
  const plan = saved.body.plan;
  expect(plan).toMatchObject({ id: draft.id, version: draft.version, status: "DRAFT", source: "DETERMINISTIC_ADVISORY", edited: true, summary: body.summary });
  expect(plan.content.generator).toBe("midyaf-deterministic-rules/v1");
  expect(plan.content.vehicleRequirements.vip).toBe(body.vehicleRequirements.vip);
  expect(plan.content.hotelDistribution.totalRooms).toBe(body.hotelDistribution.vipSingleRooms + 9);
  expect(plan.content.schedule.at(-1)).toMatchObject({ name: "Early airport desk" });
  expect(plan.content.edited).toMatchObject({ fromPlanId: draft.id, originalSource: "DETERMINISTIC_ADVISORY", count: 1 });
  const lines = plan.content.rfqDraft.lines as Array<{ category: string; description: string; quantity: number }>;
  expect(lines.find((line) => line.description.startsWith("VIP sedans"))!.quantity).toBe(body.vehicleRequirements.vip);
  expect(lines.some((line) => line.category === "TICKETS" && line.quantity === 3)).toBe(true);
  // Re-opening the editor shows the saved values, never a blank form.
  expect(editablePlanFromContent(plan.summary, plan.content)).toMatchObject({ summary: body.summary, hotelDistribution: { regularTwinRooms: 9 } });
});

it("editing an approved plan creates a new draft version and keeps the approved one operational", async () => {
  const saved = await http.patch("/w/events/evt_a/plans/plan_a1", a.pm, editFrom({ summary: "Synthetic plan", content: {} }));
  expect(saved.status).toBe(201);
  expect(saved.body.created).toBe(true);
  expect(saved.body.plan).toMatchObject({ version: 2, status: "DRAFT", source: "MANUAL", edited: true });
  const event = await http.get("/w/events/evt_a", a.pm);
  expect(event.body.event.approvedPlanId).toBe("plan_a1");
  expect(memory.current.rows("eventPlan").find((row) => row.id === "plan_a1")!.status).toBe("APPROVED");
  // The new version is now waiting for the client.
  const queue = await http.get("/w/plans/awaiting-approval", a.client);
  expect(queue.body.items.map((item: { plan: { id: string } }) => item.plan.id)).toEqual([saved.body.plan.id]);
});

it("refuses plan edits from clients, suppliers, other companies and invalid bodies", async () => {
  const draft = await newDraft();
  const body = editFrom(draft);
  expect((await http.patch(`/w/events/evt_a/plans/${draft.id}`, a.client, body)).status).toBe(403);
  expect((await http.patch(`/w/events/evt_a/plans/${draft.id}`, a.vendor, body)).status).toBe(403);
  expect((await http.patch(`/w/events/evt_a/plans/${draft.id}`, a.ownerB, body)).status).toBe(404);
  expect((await http.patch(`/w/events/evt_a/plans/${draft.id}`, a.pm, { ...body, vehicleRequirements: { vip: -1, shuttle: 0 } })).status).toBe(400);
  expect((await http.patch(`/w/events/evt_a/plans/${draft.id}`, a.pm, { ...body, extra: true })).status).toBe(400);
  expect((await http.patch("/w/events/evt_a/plans/plan_b1", a.pm, body)).status).toBe(404);
});

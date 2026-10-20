import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";
const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));
vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma(); return { prisma: memory.current.prisma };
});
const { startHarness } = await import("../testing/httpHarness.js");
const { buildWorkspaceTestWorld } = await import("../testing/memoryPrisma.js");
const router = (await import("./workspace.js")).default;
const messagesRouter = (await import("./messages.js")).default;
const notificationsRouter = (await import("./notifications.js")).default;
const { actors: a, seed } = buildWorkspaceTestWorld();
let http: Harness;
beforeAll(async () => { http = await startHarness([["/w", router], ["/m", messagesRouter], ["/n", notificationsRouter]]); });
afterAll(async () => { await http.close(); });
beforeEach(() => { memory.current.seed(structuredClone(seed)); });
const base = "/w/events/evt_a";
it("isolates company events from global roles and other companies", async () => {
  expect((await http.get(base, a.ownerB)).status).toBe(404);
  expect((await http.get(base, a.lmOutsider)).status).toBe(404);
  expect((await http.get("/w/events", a.owner)).body.events.map((e: {id:string}) => e.id)).toEqual(expect.arrayContaining(["evt_a", "evt_locked"]));
  expect((await http.get("/w/events", a.owner)).body.events.map((e: {id:string}) => e.id)).not.toContain("evt_b");
});
it("requires explicit approval to unlock operational endpoints", async () => {
  for (const part of ["members", "telemetry", "dispatch/recipients?flow=LM_TO_SUPERVISOR"]) {
    expect((await http.get(`/w/events/evt_locked/${part}`, a.pm)).status).toBe(423);
  }
  const plan = await http.post("/w/events/evt_locked/plans/generate", a.pm, { mode: "ADVISORY" });
  expect(plan.status).toBe(201);
  expect(plan.body.plan.source).toBe("DETERMINISTIC_ADVISORY");
  for (const section of ["logistics", "hotelDistribution", "vehicleRequirements", "teamRequirements", "scopeOfWork"]) expect(plan.body.plan.content).toHaveProperty(section);
  expect((await http.post(`/w/events/evt_locked/plans/${plan.body.plan.id}/approve`, a.lmOutsider, { confirm: true })).status).toBe(404);
  expect((await http.post(`/w/events/evt_locked/plans/${plan.body.plan.id}/approve`, a.pm, { confirm: true })).status).toBe(200);
  expect((await http.get("/w/events/evt_locked/members", a.pm)).status).toBe(200);
});
it("prevents lower-role escalation and permits the logistics manager's team builder", async () => {
  const low = memory.current.rows("eventMembership").find(m => m.userId === a.sup.id)!;
  low.permissions = ["VIEW", "INVITE"];
  expect((await http.post(`${base}/members`, a.sup, { userId: a.orgMember.id, role: "PROJECT_MANAGER", permissions: ["VIEW"] })).status).toBe(403);
  const team = await http.post(`${base}/members`, a.lm, { userId: a.orgMember.id, role: "COORDINATOR", subteam: "HOTELS", workScope: "Check-in desk", permissions: ["VIEW"] });
  expect(team.status).toBe(201); expect(team.body.member.workScope).toBe("Check-in desk");
  expect((await http.patch(`${base}/members/em_evt_a_u_pm`, a.lm, { available: false })).status).toBe(403);
  expect((await http.patch(`${base}/members/em_evt_a_u_lm`, a.lm, { permissions: ["VIEW"] })).status).toBe(403);
});
it("re-evaluates a grantor revoked while its team change is in flight", async () => {
  // The revocation commits between the route's pre-checks and its transaction.
  memory.current.beforeNext("eventMembership", "findMany", () => {
    memory.current.rows("eventMembership").find(m => m.eventId === "evt_a" && m.userId === a.lm.id)!.status = "REVOKED";
  });
  expect([403, 404]).toContain((await http.post(`${base}/members`, a.lm, { userId: a.orgMember.id, role: "COORDINATOR", permissions: ["VIEW"] })).status);
  expect(memory.current.rows("eventMembership").some(m => m.eventId === "evt_a" && m.userId === a.orgMember.id)).toBe(false);

  memory.current.beforeNext("eventMembership", "findMany", () => {
    memory.current.rows("eventMembership").find(m => m.eventId === "evt_a" && m.userId === a.lm.id)!.permissions = ["VIEW", "EDIT"];
  });
  expect((await http.patch(`${base}/members/em_evt_a_u_cap`, a.lm, { canReceive: false })).status).toBe(403);
  expect(memory.current.rows("eventMembership").find(m => m.id === "em_evt_a_u_cap")).toMatchObject({ canReceive: true });
  expect(memory.current.rows("auditLog").filter(row => row.action.startsWith("workspace.member."))).toHaveLength(0);
});
it("notifies matching assigned vendors and atomically locks signed event scope", async () => {
  const changed = await http.patch(base, a.owner, { hotelZone: "New synthetic zone" });
  expect(changed.status).toBe(200); expect(changed.body.scopeChange.notifiedVendors).toBeGreaterThan(0);
  expect(memory.current.rows("notification").some(n => n.userId === a.vendor.id)).toBe(true);
  expect((await http.post(`${base}/contract/sign`, a.owner, { confirm: true, reference: "Signed synthetic contract" })).status).toBe(200);
  expect((await http.patch(base, a.owner, { hotelZone: "Forbidden scope" })).status).toBe(409);
});
it("rolls back scope change and notifications when the audit fails", async () => {
  memory.current.failNext("auditLog", "create", new Error("synthetic failure"));
  expect((await http.patch(base, a.owner, { hotelZone: "Rollback zone" })).status).toBe(500);
  expect(memory.current.rows("event").find(e => e.id === "evt_a")?.hotelZone).toBe("Synthetic hotel zone");
  expect(memory.current.rows("eventScopeChange")).toHaveLength(0);
  expect(memory.current.rows("notification")).toHaveLength(0);
  expect(memory.current.rows("conversation")).toHaveLength(0);
});
it("delivers vendor scope alerts as scoped inbox threads that outsiders and revoked vendors cannot read", async () => {
  http.emitted.length = 0;
  const changed = await http.patch(base, a.owner, { hotelZone: "Alert synthetic zone" });
  expect(changed.status).toBe(200); expect(changed.body.scopeChange.notifiedVendors).toBe(1);
  // The intended hotel vendor sees the alert in the supported inbox and can open it.
  const inbox = await http.get("/w/inbox", a.vendor);
  const item = inbox.body.items.find((i: { messageClass: string; eventId: string }) => i.messageClass === "ALERT" && i.eventId === "evt_a");
  expect(item).toBeTruthy(); expect(item.unreadCount).toBe(1); expect(item.preview).toContain("hotelZone");
  expect(http.emitted.some(e => e.room === `user:${a.vendor.id}` && e.event === "message:new")).toBe(true);
  const thread = await http.get(`/m/conversations/${item.conversationId}`, a.vendor);
  expect(thread.status).toBe(200); expect(thread.body.conversation.messages[0].body).toContain("Synthetic evt_a");
  // An unaffected vendor neither receives nor shares the thread.
  expect((await http.get("/w/inbox", a.vendorCar)).body.items).toHaveLength(0);
  expect((await http.get(`/m/conversations/${item.conversationId}`, a.vendorCar)).status).toBe(404);
  // The header notification is the recipient's alone and carries no tenant information.
  const own = await http.get("/n", a.vendor);
  expect(own.body.notifications).toHaveLength(1);
  expect(JSON.stringify(own.body)).not.toMatch(/Synthetic evt_a|hotelZone|Alert synthetic zone/);
  for (const outsider of [a.lmOutsider, a.sa]) {
    for (const path of ["/n?all=true", `/n?userId=${a.vendor.id}`]) {
      const listed = await http.get(path, outsider);
      expect(listed.status).toBe(200); expect(listed.body.notifications).toHaveLength(0);
    }
    expect((await http.put(`/n/${own.body.notifications[0].id}/read`, outsider)).status).toBe(404);
  }
  // After revocation the thread is no longer listed or readable; the header stays opaque.
  memory.current.rows("eventMembership").find(m => m.id === "em_evt_a_u_vendor")!.status = "REVOKED";
  expect((await http.get("/w/inbox", a.vendor)).body.items).toHaveLength(0);
  expect((await http.get(`/m/conversations/${item.conversationId}`, a.vendor)).status).toBe(404);
  const after = await http.get("/n", a.vendor);
  expect(after.body.notifications).toHaveLength(1);
  expect(JSON.stringify(after.body)).not.toMatch(/Synthetic evt_a|hotelZone|Alert synthetic zone/);
});
it("labels a linked private guest's event membership by guest code unless currently granted", async () => {
  memory.current.rows("eventGuest").find(g => g.id === "eg_gv01")!.privacyMasked = true;
  memory.current.rows("eventMembership").push({
    id: "em_evt_a_u_guest", eventId: "evt_a", userId: a.guest.id, role: "COORDINATOR", subteam: null, workScope: null,
    permissions: ["VIEW"], clientVisible: false, canReceive: true, available: true, status: "ACTIVE", grantedById: "u_owner",
    createdAt: new Date("2026-10-06T00:00:00Z"), updatedAt: new Date("2026-10-06T00:00:00Z")
  });
  const label = async (actor: Parameters<Harness["get"]>[1]) => {
    const members = await http.get(`${base}/members`, actor);
    const contacts = await http.get(`${base}/message-contacts`, actor);
    expect(members.status).toBe(200); expect(contacts.status).toBe(200);
    return {
      member: members.body.members.find((m: { user: { id: string } }) => m.user.id === a.guest.id).user.name,
      contact: contacts.body.contacts.find((c: { id: string }) => c.id === a.guest.id).name
    };
  };
  for (const actor of [a.owner, a.lm]) expect(await label(actor)).toEqual({ member: "GV01", contact: "GV01" });
  memory.current.rows("guestPrivacyGrant").push({ id: "pg_gv01_lm", eventId: "evt_a", eventGuestId: "eg_gv01", groupKey: null, viewerUserId: a.lm.id, grantedById: a.owner.id });
  expect(await label(a.lm)).toEqual({ member: `Name ${a.guest.id}`, contact: `Name ${a.guest.id}` });
  expect(await label(a.owner)).toEqual({ member: "GV01", contact: "GV01" });
});

const inviteBody={email:"u_guest_b@example.test",role:"COORDINATOR",subteam:"AIRPORT",permissions:["VIEW"],workScope:"Arrival desk"};
it("stores only invitation hashes, requires the intended email and accepts once",async()=>{
  const created=await http.post(`${base}/invitations`,a.lm,inviteBody);
  expect(created.status).toBe(201);
  const {token}=created.body.invitation;
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(memory.current.rows("eventInvite")[0].tokenHash).not.toBe(token);
  expect(JSON.stringify((await http.get(`${base}/invitations`,a.lm)).body)).not.toContain(token);
  expect((await http.post("/w/invitations/accept",a.ownerB,{token})).status).toBe(404);
  expect((await http.post("/w/invitations/accept",a.guestB,{token})).status).toBe(200);
  expect((await http.post("/w/invitations/accept",a.guestB,{token})).status).toBe(404);
  expect(memory.current.rows("eventMembership").find(m=>m.eventId==="evt_a"&&m.userId===a.guestB.id)).toMatchObject({role:"COORDINATOR",subteam:"AIRPORT",workScope:"Arrival desk"});
});
it.each(["expiry","revoked","grantor"])("refuses %s invitations without granting membership",async(reason)=>{
  const created=await http.post(`${base}/invitations`,a.lm,inviteBody),row=memory.current.rows("eventInvite")[0];
  if(reason==="expiry")row.expiresAt=new Date(0);
  if(reason==="revoked")expect((await http.post(`${base}/invitations/${row.id}/revoke`,a.lm,{})).status).toBe(200);
  if(reason==="grantor")memory.current.rows("eventMembership").find(m=>m.userId===a.lm.id)!.status="REVOKED";
  expect([403,404]).toContain((await http.post("/w/invitations/accept",a.guestB,{token:created.body.invitation.token})).status);
  expect(memory.current.rows("eventMembership").some(m=>m.eventId==="evt_a"&&m.userId===a.guestB.id)).toBe(false);
});
it("keeps executive event invitations and direct grants read-only",async()=>{
  expect((await http.post(`${base}/members`,a.owner,{userId:a.sa.id,role:"EXECUTIVE_VIEWER",permissions:["VIEW","EDIT"]})).status).toBe(400);
  const created=await http.post(`${base}/members`,a.owner,{userId:a.sa.id,role:"EXECUTIVE_VIEWER",permissions:["VIEW"]});
  expect(created.status).toBe(201);
  expect((await http.patch(`${base}/members/${created.body.member.id}`,a.owner,{permissions:["VIEW","INVITE"]})).status).toBe(400);
});

// ---------------------------------------------------------------------------
// RADAR-ORGANIZER-001: create -> generate -> plan view -> approve -> unlock,
// with the server-derived RFQ draft, through the real router.
// ---------------------------------------------------------------------------

const createBody = {
  organizationId: "org_a",
  name: "Synthetic setup summit",
  locationLabel: "Synthetic district",
  planningMode: "AI",
  hotelZone: "Synthetic north",
  vipGuestCount: 4,
  regularGuestCount: 20,
  carCount: 6,
  startAt: "2026-12-01T06:00:00.000Z",
  endAt: "2026-12-02T18:00:00.000Z",
  arrivalStartAt: "2026-11-30T06:00:00.000Z",
  departureEndAt: "2026-12-03T18:00:00.000Z"
};

it("creates an event once, generates a locked advisory draft with an RFQ, and unlocks operations only on explicit approval", async () => {
  const created = await http.post("/w/events", a.owner, createBody);
  expect(created.status).toBe(201);
  const eventId: string = created.body.event.id;
  expect(created.body.event).toMatchObject({ planApproved: false, operationalStatus: "PLANNING", contractSigned: false });

  const generated = await http.post(`/w/events/${eventId}/plans/generate`, a.owner, { mode: "ADVISORY" });
  expect(generated.status).toBe(201);
  const plan = generated.body.plan;
  expect(plan).toMatchObject({ status: "DRAFT", source: "DETERMINISTIC_ADVISORY", advisory: true });
  for (const section of ["logistics", "hotelDistribution", "vehicleRequirements", "teamRequirements", "scopeOfWork"]) expect(plan.content).toHaveProperty(section);

  // The RFQ draft is persisted inside the plan content, scoped to this event and plan.
  const rfq = plan.content.rfqDraft;
  expect(rfq).toMatchObject({ status: "DRAFT", sent: false, eventId, planId: plan.id, planVersion: 1, quantitiesFrom: "PLAN_ITEMS" });
  expect(rfq.lines.map((line: { category: string }) => line.category)).toEqual(expect.arrayContaining(["HOTEL_ROOMS", "VEHICLES", "STAFF"]));
  const hotel = rfq.lines.filter((line: { category: string }) => line.category === "HOTEL_ROOMS");
  expect(hotel.reduce((sum: number, line: { quantity: number }) => sum + line.quantity, 0)).toBe(plan.content.hotelDistribution.totalRooms);
  expect(rfq.scope).toMatchObject({ vipGuests: 4, regularGuests: 20, guestsNeedingVehicles: 6, serviceDays: 4, hotelZone: "Synthetic north" });
  for (const line of rfq.lines) expect(Object.keys(line).sort()).toEqual(["category", "description", "quantity", "serviceDays", "unit"]);
  const stored = memory.current.rows("eventPlan").find((row) => row.id === plan.id)!;
  expect((stored.content as { rfqDraft: { reference: string } }).rfqDraft.reference).toBe(rfq.reference);

  // Still locked: the draft does not unlock anything.
  expect((await http.get(`/w/events/${eventId}`, a.owner)).body.event.planApproved).toBe(false);
  for (const part of ["members", "telemetry", "rfq"]) expect((await http.get(`/w/events/${eventId}/${part}`, a.owner)).status).toBe(423);

  // The plan view lists exactly this draft.
  const listed = await http.get(`/w/events/${eventId}/plans`, a.owner);
  expect(listed.body.plans.map((p: { id: string }) => p.id)).toEqual([plan.id]);

  // Only an authorized approver; an organization member without event access cannot.
  expect([403, 404]).toContain((await http.post(`/w/events/${eventId}/plans/${plan.id}/approve`, a.orgMember, { confirm: true })).status);
  expect((await http.post(`/w/events/${eventId}/plans/${plan.id}/approve`, a.sa, { confirm: true })).status).toBe(403);
  expect((await http.post(`/w/events/${eventId}/plans/${plan.id}/approve`, a.owner, {})).status).toBe(400);
  const approved = await http.post(`/w/events/${eventId}/plans/${plan.id}/approve`, a.owner, { confirm: true });
  expect(approved.status).toBe(200);
  expect(approved.body.event).toMatchObject({ planApproved: true, approvedPlanId: plan.id, operationalStatus: "PLANNING", contractSigned: false });
  expect(approved.body.plan.status).toBe("APPROVED");

  // Persisted: a fresh read and the operational endpoints agree.
  expect((await http.get(`/w/events/${eventId}`, a.owner)).body.event.planApproved).toBe(true);
  expect((await http.get(`/w/events/${eventId}/members`, a.owner)).status).toBe(200);
  const vendorsRfq = await http.get(`/w/events/${eventId}/rfq`, a.owner);
  expect(vendorsRfq.status).toBe(200);
  expect(vendorsRfq.body.rfq.reference).toBe(rfq.reference);

  // Approval assigns, contracts and notifies no one, and one event exists.
  expect(memory.current.rows("event").filter((row) => row.name === createBody.name)).toHaveLength(1);
  expect(memory.current.rows("eventMembership").filter((row) => row.eventId === eventId)).toHaveLength(0);
  expect(memory.current.rows("notification")).toHaveLength(0);
  expect(memory.current.rows("conversation")).toHaveLength(0);
});

it("rolls back a failed plan generation without touching the created event, so only generation is retried", async () => {
  const created = await http.post("/w/events", a.owner, createBody);
  const eventId: string = created.body.event.id;
  memory.current.failNext("eventPlan", "update", new Error("synthetic failure"));
  expect((await http.post(`/w/events/${eventId}/plans/generate`, a.owner, { mode: "ADVISORY" })).status).toBe(500);
  expect(memory.current.rows("eventPlan").filter((row) => row.eventId === eventId)).toHaveLength(0);
  expect(memory.current.rows("event").filter((row) => row.id === eventId)).toHaveLength(1);
  const retried = await http.post(`/w/events/${eventId}/plans/generate`, a.owner, { mode: "ADVISORY" });
  expect(retried.status).toBe(201);
  expect(retried.body.plan.version).toBe(1);
  expect(memory.current.rows("event").filter((row) => row.name === createBody.name)).toHaveLength(1);
});

it("derives a manual plan's RFQ from its validated items and never trusts request pricing or supplier ids", async () => {
  const items = [
    { category: "HOTEL_ROOMS", quantity: 12, note: "Hotels: four-star near the venue" },
    { category: "VEHICLES", quantity: 5, note: "Vehicles: sedans" },
    { category: "STAFF", quantity: 0, note: "Teams: to confirm" }
  ];
  const manual = await http.post("/w/events/evt_locked/plans/generate", a.pm, { mode: "MANUAL", summary: "Synthetic manual plan", items });
  expect(manual.status).toBe(201);
  const rfq = manual.body.plan.content.rfqDraft;
  expect(rfq.quantitiesFrom).toBe("PLAN_ITEMS");
  expect(rfq.lines.map((line: { category: string; quantity: number }) => [line.category, line.quantity])).toEqual([["HOTEL_ROOMS", 12], ["VEHICLES", 5]]);
  // Pricing and supplier ids are not accepted anywhere in the request.
  expect((await http.post("/w/events/evt_locked/plans/generate", a.pm, { mode: "MANUAL", summary: "Priced", items: [{ ...items[0], unitPrice: 900 }] })).status).toBe(400);
  expect((await http.post(`/w/events/evt_locked/plans/${manual.body.plan.id}/rfq`, a.pm, { supplierId: "x" })).status).toBe(400);
  expect((await http.post(`/w/events/evt_locked/plans/${manual.body.plan.id}/rfq`, a.pm, { lines: [{ quantity: 999 }] })).status).toBe(400);
  expect((await http.post(`/w/events/evt_locked/plans/${manual.body.plan.id}/rfq`, a.pm, {})).status).toBe(201);
  expect(JSON.stringify(memory.current.rows("eventPlan").find((row) => row.id === manual.body.plan.id)!.content)).not.toMatch(/supplierId|unitPrice/);
});

it("keeps a manual plan's exact quantities in the RFQ when its items carry no notes, including on regeneration", async () => {
  const items = [
    { category: "HOTEL_ROOMS", quantity: 7 },
    { category: "VEHICLES", quantity: 3 },
    { category: "STAFF", quantity: 9 }
  ];
  const manual = await http.post("/w/events/evt_locked/plans/generate", a.pm, { mode: "MANUAL", summary: "Synthetic manual plan without notes", items });
  expect(manual.status).toBe(201);
  // The route stores the absent notes as null.
  const stored = memory.current.rows("eventPlan").find((row) => row.id === manual.body.plan.id)!;
  expect((stored.content as { items: Array<{ note: unknown }> }).items.every((item) => item.note === null)).toBe(true);
  const exact = [["HOTEL_ROOMS", 7], ["VEHICLES", 3], ["STAFF", 9]];
  const quantities = (rfq: { lines: Array<{ category: string; quantity: number }> }) => rfq.lines.map((line) => [line.category, line.quantity]);
  expect(manual.body.plan.content.rfqDraft.quantitiesFrom).toBe("PLAN_ITEMS");
  expect(quantities(manual.body.plan.content.rfqDraft)).toEqual(exact);
  const regenerated = await http.post(`/w/events/evt_locked/plans/${manual.body.plan.id}/rfq`, a.pm, {});
  expect(regenerated.status).toBe(201);
  expect(regenerated.body.rfq.quantitiesFrom).toBe("PLAN_ITEMS");
  expect(quantities(regenerated.body.rfq)).toEqual(exact);
});

it("re-authorizes RFQ regeneration under the event lock, so an actor revoked or demoted while waiting writes nothing", async () => {
  const content = () => JSON.stringify(memory.current.rows("eventPlan").find((row) => row.id === "plan_a1")!.content);
  const audits = () => memory.current.rows("auditLog").filter((row) => row.action === "workspace.plan.rfq_draft").length;
  const pmMembership = () => memory.current.rows("eventMembership").find((m) => m.id === "em_evt_a_u_pm")!;
  const before = content();
  // The revocation commits after the route's pre-checks, before the Event row lock is granted.
  memory.current.beforeNext("$raw", "$queryRaw", () => { pmMembership().status = "REVOKED"; });
  expect([403, 404]).toContain((await http.post(`${base}/plans/plan_a1/rfq`, a.pm, {})).status);
  expect(content()).toBe(before);
  expect(audits()).toBe(0);

  memory.current.seed(structuredClone(seed));
  memory.current.beforeNext("$raw", "$queryRaw", () => { pmMembership().permissions = ["VIEW"]; });
  expect((await http.post(`${base}/plans/plan_a1/rfq`, a.pm, {})).status).toBe(403);
  expect(content()).toBe(before);
  expect(audits()).toBe(0);

  // Without a concurrent change the same request succeeds.
  memory.current.seed(structuredClone(seed));
  expect((await http.post(`${base}/plans/plan_a1/rfq`, a.pm, {})).status).toBe(201);
  expect(audits()).toBe(1);
});

it("keeps RFQ drafts internal: hidden from vendors and clients, refused to support and other tenants, locked by the contract", async () => {
  const regenerated = await http.post(`${base}/plans/plan_a1/rfq`, a.owner, {});
  expect(regenerated.status).toBe(201);
  const rfq = regenerated.body.rfq;
  expect(rfq).toMatchObject({ eventId: "evt_a", planId: "plan_a1", status: "DRAFT", sent: false });
  // plan_a1 has no items: quantities fall back to the deterministic rules, never invented.
  expect(rfq.quantitiesFrom).toBe("DETERMINISTIC_RULES");
  expect(memory.current.rows("auditLog").some((row) => row.action === "workspace.plan.rfq_draft" && row.entityId === "plan_a1")).toBe(true);

  // No guest identities, contacts or positions, and nothing was sent.
  const text = JSON.stringify(rfq);
  for (const secret of ["Synthetic person", "GV01", "+966", "example.test", "24.7", "Synthetic Hotel"]) expect(text).not.toContain(secret);
  expect(memory.current.rows("notification")).toHaveLength(0);
  expect(memory.current.rows("conversation")).toHaveLength(0);

  // Internal viewers read it; vendors and client viewers neither read it nor see it in the plan list.
  expect((await http.get(`${base}/rfq`, a.pm)).body.rfq.reference).toBe(rfq.reference);
  for (const actor of [a.vendor, a.client]) {
    expect((await http.get(`${base}/rfq`, actor)).status).toBe(403);
    const plans = await http.get(`${base}/plans`, actor);
    expect(plans.status).toBe(200);
    expect(JSON.stringify(plans.body)).not.toContain("rfqDraft");
    expect((await http.post(`${base}/plans/plan_a1/rfq`, actor, {})).status).toBe(403);
  }
  expect(JSON.stringify((await http.get(`${base}/plans`, a.pm)).body)).toContain("rfqDraft");
  expect((await http.post(`${base}/plans/plan_a1/rfq`, a.sa, {})).status).toBe(403);
  for (const outsider of [a.ownerB, a.lmOutsider]) {
    expect((await http.get(`${base}/rfq`, outsider)).status).toBe(404);
    expect((await http.post(`${base}/plans/plan_a1/rfq`, outsider, {})).status).toBe(404);
  }
  expect((await http.post(`/w/events/evt_b/plans/plan_a1/rfq`, a.ownerB, {})).status).toBe(404);

  // A signed contract locks the scope, including RFQ regeneration.
  expect((await http.post(`${base}/contract/sign`, a.owner, { confirm: true, reference: "Signed synthetic contract" })).status).toBe(200);
  expect((await http.post(`${base}/plans/plan_a1/rfq`, a.owner, {})).status).toBe(409);
});

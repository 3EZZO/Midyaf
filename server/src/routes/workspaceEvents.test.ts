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

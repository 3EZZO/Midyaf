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
const messages = (await import("./messages.js")).default;
const { actors: a, seed } = buildWorkspaceTestWorld(); let http: Harness;
beforeAll(async () => { http = await startHarness([["/w", router],["/messages",messages]]); });
afterAll(async () => { await http.close(); });
beforeEach(() => { memory.current.seed(structuredClone(seed)); });
const base = "/w/events/evt_a/dispatch";
const task = { type: "HOTEL_TRANSFER", pickupLocation: "Synthetic lobby", dropoffLocation: "Synthetic hall" };
const request = { subject: "Please arrange transport", body: "Synthetic request", task };
it.each([
  ["GUEST_TO_LM", a.guest, a.lm, "CLIENT_TASK"],
  ["GUEST_TO_SUPERVISOR", a.guest, a.sup, "CLIENT_TASK"],
  ["GUEST_TO_CAPTAIN", a.guest, a.cap, "CLIENT_TASK"],
  ["ORGANIZER_TO_LM", a.owner, a.lm, "CLIENT_TASK"],
  ["LM_TO_SUPERVISOR", a.lm, a.sup, "LOGISTICS_TEAM_TASK"],
  ["LM_TO_CAPTAIN_EMERGENCY", a.lm, a.cap, "LOGISTICS_TEAM_TASK"]
] as const)("persists %s with server-derived classification", async (flow, sender, recipient, source) => {
  const response = await http.post(base, sender, { ...request, flow, recipientUserIds: [recipient.id] });
  expect(response.status).toBe(201); expect(response.body.dispatch.taskSource).toBe(source);
  expect(memory.current.rows("task")[0]).toMatchObject({ source, status: flow.endsWith("EMERGENCY") ? "ASSIGNED" : "PENDING" });
  if (flow.endsWith("EMERGENCY")) {
    expect(response.body.dispatch.supervisorAlert.userId).toBe(a.sup.id);
    expect(memory.current.rows("conversation").filter(c => c.messageClass === "ALERT")).toHaveLength(1);
    expect(memory.current.rows("notification").some(n => n.userId === a.sup.id)).toBe(true);
  }
});
it("denies cross-event recipients, role spoofing and VIEW-only logistics dispatch", async () => {
  expect((await http.post(base, a.lm, { ...request, flow: "LM_TO_CAPTAIN_EMERGENCY", recipientUserIds: [a.capB.id] })).status).toBe(403);
  expect((await http.post(base, a.guest, { ...request, flow: "LM_TO_SUPERVISOR", recipientUserIds: [a.sup.id] })).status).toBe(403);
  memory.current.rows("eventMembership").find(m => m.userId === a.lm.id && m.eventId === "evt_a")!.permissions = ["VIEW"];
  expect((await http.post(base, a.lm, { ...request, flow: "LM_TO_SUPERVISOR", recipientUserIds: [a.sup.id] })).status).toBe(403);
});
it("rechecks membership after taking transactional locks", async () => {
  memory.current.beforeNext("$raw", "$queryRaw", () => { memory.current.rows("eventMembership").find(m => m.userId === a.cap.id)!.status = "REVOKED"; });
  expect((await http.post(base, a.lm, { ...request, flow: "LM_TO_CAPTAIN_EMERGENCY", recipientUserIds: [a.cap.id] })).status).toBe(403);
  expect(memory.current.rows("task")).toHaveLength(0);
});
it("rolls back the task when the supervisor alert notification fails", async () => {
  memory.current.failNext("notification", "createMany", new Error("synthetic failure"));
  expect((await http.post(base, a.lm, { ...request, flow: "LM_TO_CAPTAIN_EMERGENCY", recipientUserIds: [a.cap.id] })).status).toBe(500);
  for (const table of ["task", "conversation", "conversationMessage", "dispatchRecord", "notification"]) expect(memory.current.rows(table)).toHaveLength(0);
});
it("retries idempotently and revokes inbox access when a member loses VIEW", async () => {
  const payload = { ...request, flow: "LM_TO_SUPERVISOR", recipientUserIds: [a.sup.id], clientRequestId: "retry_0001" };
  expect((await http.post(base, a.lm, payload)).status).toBe(201);
  expect((await http.post(base, a.lm, payload)).body.dispatch.replayed).toBe(true);
  expect((await http.get("/w/inbox", a.sup)).body.items).toHaveLength(1);
  memory.current.rows("eventMembership").find(m => m.userId === a.sup.id)!.permissions = [];
  expect((await http.get("/w/inbox", a.sup)).body.items).toHaveLength(0);
});

const message={recipientUserIds:[a.sup.id],subject:"Arrival desk inquiry",body:"Check this arrival",kind:"INQUIRY",clientRequestId:"message_retry_1"};
const policy={individualSenderIds:[a.lm.id,a.sup.id],groupSenderIds:[a.lm.id],taskReceiverIds:[a.sup.id],clientVisible:true,executiveVisible:false};
it("replays a committed emergency dispatch after the captain and supervisors became unavailable", async () => {
  const payload = { ...request, flow: "LM_TO_CAPTAIN_EMERGENCY", recipientUserIds: [a.cap.id], clientRequestId: "emergency_retry_1" };
  const first = await http.post(base, a.lm, payload);
  expect(first.status).toBe(201);
  for (const member of memory.current.rows("eventMembership")) if (["CAPTAIN", "FLEET_SUPERVISOR"].includes(member.role)) member.available = false;
  const retry = await http.post(base, a.lm, payload);
  expect(retry.status).toBe(200);
  expect(retry.body.dispatch).toMatchObject({ replayed: true, dispatchId: first.body.dispatch.dispatchId, taskId: first.body.dispatch.taskId });
  expect(retry.body.dispatch.supervisorAlert.userId).toBe(a.sup.id);
  expect(memory.current.rows("task")).toHaveLength(1);
  expect(memory.current.rows("conversation").filter(c => c.messageClass === "ALERT")).toHaveLength(1);
  // A changed payload under the same id is still refused, and an unknown id is not replayed.
  expect((await http.post(base, a.lm, { ...payload, subject: "Changed" })).status).toBe(409);
  expect((await http.post(base, a.lm, { ...payload, clientRequestId: "emergency_retry_2" })).status).toBe(403);
});
it("keeps inbox paging past conversations the caller can no longer read", async () => {
  const conversation = (id: string, eventId: string, at: string) => {
    memory.current.rows("conversation").push({ id, subject: `Synthetic ${id}`, createdById: a.lm.id, lastMessageAt: new Date(at), createdAt: new Date(at), eventId, messageClass: "INDIVIDUAL", dispatchFlow: null, clientVisible: false, executiveVisible: false, dedupeKey: null, requestHash: null });
    memory.current.rows("conversationParticipant").push({ id: `cp_${id}`, conversationId: id, userId: a.sup.id, lastReadAt: null, joinedAt: new Date(at) });
    memory.current.rows("conversationMessage").push({ id: `cm_${id}`, conversationId: id, senderId: a.lm.id, body: "Synthetic body", clientRequestId: null, createdAt: new Date(at) });
  };
  // Two newer threads of an event the supervisor has no access to, one readable older thread.
  conversation("conv_hidden_1", "evt_b", "2026-10-12T10:00:00Z");
  conversation("conv_hidden_2", "evt_b", "2026-10-12T09:00:00Z");
  conversation("conv_visible", "evt_a", "2026-10-11T09:00:00Z");
  const first = await http.get("/w/inbox?limit=1", a.sup);
  expect(first.status).toBe(200);
  expect(first.body.items).toEqual([]);
  expect(first.body.nextCursor).toBeTruthy();
  const second = await http.get(`/w/inbox?limit=1&cursor=${first.body.nextCursor}`, a.sup);
  expect(second.body.items.map((item: { conversationId: string }) => item.conversationId)).toEqual(["conv_visible"]);
  expect(second.body.nextCursor).toBe(null);
});
it("applies current messaging policy and distinguishes inquiry from task badges",async()=>{
  expect((await http.put("/w/events/evt_a/messaging-policy",a.lm,policy)).status).toBe(200);
  expect((await http.post("/w/events/evt_a/conversations",a.pm,message)).status).toBe(403);
  const first=await http.post("/w/events/evt_a/conversations",a.lm,message);
  expect(first.status).toBe(201);
  expect((await http.post("/w/events/evt_a/conversations",a.lm,message)).body).toMatchObject({replayed:true,conversationId:first.body.conversationId});
  expect((await http.post("/w/events/evt_a/conversations",a.lm,{...message,body:"Changed"})).status).toBe(409);
  const inbox=await http.get("/w/inbox",a.sup);
  expect(inbox.body.items[0]).toMatchObject({taskSource:null,messageClass:"INQUIRY",unreadCount:1});
  const path=`/messages/conversations/${first.body.conversationId}/messages`,reply={body:"Confirmed",clientRequestId:"reply_retry_1"};
  expect((await http.post(path,a.sup,reply)).status).toBe(201);
  expect((await http.post(path,a.sup,reply)).status).toBe(201);
  expect(memory.current.rows("conversationMessage")).toHaveLength(2);
  expect((await http.post(path,a.sup,{...reply,body:"Changed"})).status).toBe(409);
  expect((await http.put("/w/events/evt_a/messaging-policy",a.lm,{...policy,individualSenderIds:[a.lm.id]})).status).toBe(200);
  expect((await http.post(path,a.sup,{body:"No longer allowed"})).status).toBe(403);
  expect((await http.get(`/messages/conversations/${first.body.conversationId}`,a.sup)).status).toBe(200);
});
it("shares only explicitly selected new conversations with client viewers",async()=>{
  await http.put("/w/events/evt_a/messaging-policy",a.lm,policy);
  const privateThread=await http.post("/w/events/evt_a/conversations",a.lm,message);
  expect((await http.get(`/messages/conversations/${privateThread.body.conversationId}`,a.client)).status).toBe(404);
  const shared=await http.post("/w/events/evt_a/conversations",a.lm,{...message,clientRequestId:"message_shared_1",clientVisible:true});
  expect(shared.status).toBe(201);
  expect((await http.get(`/messages/conversations/${shared.body.conversationId}`,a.client)).status).toBe(200);
  expect((await http.post("/w/events/evt_a/conversations",a.lm,{...message,clientRequestId:"message_exec_1",executiveVisible:true})).status).toBe(403);
  expect((await http.post(base,a.lm,{...request,flow:"LM_TO_CAPTAIN_EMERGENCY",recipientUserIds:[a.cap.id]})).status).toBe(403);
});
it('refuses off-shift emergency captains and changed retry payloads',async()=>{
 memory.current.rows('captainShift').push({id:'shift_off',eventId:'evt_a',driverId:'drv_cap',status:'OFF_SHIFT',available:true,startsAt:new Date(Date.now()-10000),endsAt:new Date(Date.now()+60000)});
 expect((await http.post(base,a.lm,{...request,flow:'LM_TO_CAPTAIN_EMERGENCY',recipientUserIds:[a.cap.id]})).status).toBe(403);
 const payload={...request,flow:'LM_TO_SUPERVISOR',recipientUserIds:[a.sup.id],clientRequestId:'stable_dispatch_1'};
 expect((await http.post(base,a.lm,payload)).status).toBe(201);
 expect((await http.post(base,a.lm,{...payload,body:'Different instruction'})).status).toBe(409);
});
it('routes task progress to assigned operators with atomic notifications and terminal-state protection',async()=>{
 const created=await http.post(base,a.lm,{...request,flow:'LM_TO_SUPERVISOR',recipientUserIds:[a.sup.id]});const id=created.body.dispatch.taskId,path=`/w/events/evt_a/tasks/${id}`;
 expect((await http.get('/w/events/evt_a/tasks',a.sup)).body.tasks[0]).toMatchObject({source:'LOGISTICS_TEAM_TASK',status:'PENDING'});
 expect((await http.patch(path,a.capB,{status:'ACCEPTED'})).status).toBe(404);
 expect((await http.patch(path,a.sup,{status:'ACCEPTED'})).status).toBe(200);
 expect((await http.patch(path,a.sup,{status:'COMPLETED'})).status).toBe(409);
 for(const status of ['EN_ROUTE','ARRIVED','COMPLETED'])expect((await http.patch(path,a.sup,{status})).status).toBe(200);
 expect((await http.patch(path,a.sup,{status:'EN_ROUTE'})).status).toBe(409);
 expect(memory.current.rows('auditLog').filter(row=>row.action==='workspace.task.status')).toHaveLength(4);
});
it('refuses emergency dispatch atomically when no supervisor is available',async()=>{
 for(const member of memory.current.rows('eventMembership'))if(member.role==='FLEET_SUPERVISOR')member.available=false;
 expect((await http.post(base,a.lm,{...request,flow:'LM_TO_CAPTAIN_EMERGENCY',recipientUserIds:[a.cap.id]})).status).toBe(409);
 expect(memory.current.rows('task')).toHaveLength(0);expect(memory.current.rows('conversation')).toHaveLength(0);
});

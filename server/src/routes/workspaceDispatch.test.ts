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

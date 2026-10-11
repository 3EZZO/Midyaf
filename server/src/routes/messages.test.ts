import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

/**
 * OPS-COLLAB-001 HTTP checks for built-in messaging: directory scope,
 * contact policy, participant-only threads, read tracking and strict input.
 * Real messages router and JWT middleware over an in-memory Prisma double.
 */

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));

vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});

const { startHarness } = await import("../testing/httpHarness.js");
const messagesRouter = (await import("./messages.js")).default;

const actors = {
  lm: { id: "usr_lm", role: Role.LOGISTICS_MANAGER },
  coord: { id: "usr_coord", role: Role.COORDINATOR },
  guest: { id: "usr_guest", role: Role.GUEST },
  guest2: { id: "usr_guest2", role: Role.GUEST },
  captain: { id: "usr_captain", role: Role.DRIVER },
  captain2: { id: "usr_captain2", role: Role.DRIVER },
  supplier: { id: "usr_supplier", role: Role.SUPPLIER },
  company: { id: "usr_company", role: Role.COMPANY_ORGANIZER }
};

function seed() {
  memory.current.seed({
    user: Object.values(actors).map((actor) => ({
      id: actor.id,
      role: actor.role,
      name: `Name ${actor.id}`,
      email: `${actor.id}@example.test`,
      phone: `+966${actor.id}`
    })),
    guest: [
      { id: "gst_1", userId: "usr_guest", eventId: "evt_1" },
      { id: "gst_2", userId: "usr_guest2", eventId: "evt_1" }
    ],
    driver: [
      { id: "drv_1", userId: "usr_captain" },
      { id: "drv_2", userId: "usr_captain2" }
    ],
    task: [{ id: "tsk_1", eventId: "evt_1", guestId: "gst_1", driverId: "drv_1" }]
  });
}

let http: Harness;

beforeAll(async () => {
  http = await startHarness([
    ["/api/messages", messagesRouter],
    ["/messages", messagesRouter]
  ]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(() => {
  seed();
  http.emitted.length = 0;
});

async function startThread(from: { id: string; role: Role }, to: string[], subject = "Synthetic subject") {
  return http.post("/api/messages/conversations", from, {
    recipientIds: to,
    subject,
    body: "Synthetic first message"
  });
}

describe("GET /messages/contacts", () => {
  it("shows staff everyone else, names and roles only", async () => {
    const { status, body } = await http.get("/api/messages/contacts", actors.coord);
    expect(status).toBe(200);
    expect(body.contacts.map((c: any) => c.id).sort()).toEqual(
      Object.values(actors).map((a) => a.id).filter((id) => id !== "usr_coord").sort()
    );
    expect(JSON.stringify(body)).not.toMatch(/email|phone|passwordHash/);
  });

  it("shows a guest the staff and their own captain only", async () => {
    const { body } = await http.get("/api/messages/contacts", actors.guest);
    expect(body.contacts.map((c: any) => c.id).sort()).toEqual(["usr_captain", "usr_coord", "usr_lm"]);
  });

  it("shows a supplier only the staff", async () => {
    const { body } = await http.get("/messages/contacts", actors.supplier);
    expect(body.contacts.map((c: any) => c.id).sort()).toEqual(["usr_coord", "usr_lm"]);
  });

  it("filters by name and rejects unknown query fields", async () => {
    const { body } = await http.get("/api/messages/contacts?search=captain2", actors.lm);
    expect(body.contacts.map((c: any) => c.id)).toEqual(["usr_captain2"]);
    expect((await http.get("/api/messages/contacts?role=GUEST", actors.lm)).status).toBe(400);
    expect((await http.get("/api/messages/contacts")).status).toBe(401);
  });
});

describe("POST /messages/conversations", () => {
  it("creates a thread with participants, a first message and recipient notifications", async () => {
    const { status, body } = await startThread(actors.guest, ["usr_coord", "usr_captain"]);
    expect(status).toBe(201);
    expect(body.conversation).toMatchObject({ subject: "Synthetic subject" });
    expect(body.conversation.participants.map((p: any) => p.id).sort()).toEqual(
      ["usr_captain", "usr_coord", "usr_guest"].sort()
    );
    expect(body.conversation.messages).toEqual([
      expect.objectContaining({ body: "Synthetic first message", mine: true, sender: expect.objectContaining({ id: "usr_guest" }) })
    ]);
    expect(memory.current.rows("notification").map((n) => n.userId).sort()).toEqual(["usr_captain", "usr_coord"]);
    expect(http.emitted.map((e) => e.room).sort()).toEqual(["user:usr_captain", "user:usr_coord"]);
  });

  it("refuses recipients outside the contact policy, unknown users and self", async () => {
    expect((await startThread(actors.guest, ["usr_guest2"])).status).toBe(403);
    expect((await startThread(actors.guest, ["usr_captain2"])).status).toBe(403);
    expect((await startThread(actors.supplier, ["usr_guest"])).status).toBe(403);
    expect((await startThread(actors.company, ["usr_supplier"])).status).toBe(403);
    expect((await startThread(actors.lm, ["usr_unknown"])).status).toBe(403);
    expect((await startThread(actors.guest, ["usr_coord", "usr_guest2"])).status).toBe(403);
    expect((await startThread(actors.lm, ["usr_lm"])).status).toBe(400);
    expect(memory.current.rows("conversation")).toHaveLength(0);
  });

  it("rejects extra fields and empty text", async () => {
    expect(
      (await http.post("/api/messages/conversations", actors.lm, { recipientIds: ["usr_coord"], subject: "s", body: "b", createdById: "x" })).status
    ).toBe(400);
    expect(
      (await http.post("/api/messages/conversations", actors.lm, { recipientIds: ["usr_coord"], subject: " ", body: "b" })).status
    ).toBe(400);
  });
});

describe("threads", () => {
  it("are readable and writable by participants only", async () => {
    const created = await startThread(actors.lm, ["usr_guest"]);
    const id = created.body.conversation.id;

    expect((await http.get(`/api/messages/conversations/${id}`, actors.guest)).status).toBe(200);
    for (const outsider of [actors.guest2, actors.coord, actors.supplier]) {
      expect((await http.get(`/api/messages/conversations/${id}`, outsider)).status).toBe(404);
      expect((await http.post(`/api/messages/conversations/${id}/messages`, outsider, { body: "hi" })).status).toBe(404);
    }
    expect((await http.get("/api/messages/conversations/bad%20id", actors.guest)).status).toBe(404);

    const reply = await http.post(`/api/messages/conversations/${id}/messages`, actors.guest, { body: "Synthetic reply" });
    expect(reply.status).toBe(201);
    expect(reply.body.message).toMatchObject({ body: "Synthetic reply", mine: true });

    const thread = await http.get(`/api/messages/conversations/${id}`, actors.lm);
    expect(thread.body.conversation.messages.map((m: any) => [m.body, m.mine])).toEqual([
      ["Synthetic first message", true],
      ["Synthetic reply", false]
    ]);
  });

  it("tracks unread messages per reader and clears them when read", async () => {
    const created = await startThread(actors.lm, ["usr_coord"]);
    const id = created.body.conversation.id;
    await http.post(`/api/messages/conversations/${id}/messages`, actors.lm, { body: "Second" });

    const before = await http.get("/api/messages/unread-count", actors.coord);
    expect(before.body).toEqual({ unread: 2, conversations: 1 });
    const senderView = await http.get("/api/messages/unread-count", actors.lm);
    expect(senderView.body.unread).toBe(0);

    const list = await http.get("/api/messages/conversations", actors.coord);
    expect(list.body.conversations).toEqual([
      expect.objectContaining({ id, unreadCount: 2, lastMessage: expect.objectContaining({ preview: "Second" }) })
    ]);

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await http.post(`/api/messages/conversations/${id}/read`, actors.coord)).status).toBe(200);
    const after = await http.get("/api/messages/unread-count", actors.coord);
    expect(after.body.unread).toBe(0);
  });

  it("lists only the reader's own conversations, newest first", async () => {
    await startThread(actors.lm, ["usr_coord"], "First");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await startThread(actors.lm, ["usr_guest"], "Second");

    const lm = await http.get("/api/messages/conversations", actors.lm);
    expect(lm.body.conversations.map((c: any) => c.subject)).toEqual(["Second", "First"]);
    const coord = await http.get("/api/messages/conversations", actors.coord);
    expect(coord.body.conversations.map((c: any) => c.subject)).toEqual(["First"]);
    expect((await http.get("/api/messages/conversations?cursor=nope", actors.coord)).status).toBe(400);
  });
});

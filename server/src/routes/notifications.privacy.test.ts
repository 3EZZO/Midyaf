import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

/**
 * OPS-COLLAB-001 correction R2: private-message notifications (subject,
 * sender, conversation) reach their recipient only, across both bootstrap
 * aliases, both notification aliases and the read/update response, while
 * operational notifications keep their legacy manager visibility. Real
 * routers and JWT middleware over the in-memory Prisma double.
 */

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));

vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});

const { startHarness } = await import("../testing/httpHarness.js");
const notificationsRouter = (await import("./notifications.js")).default;
const bootstrapRouter = (await import("./bootstrap.js")).default;
const messagesRouter = (await import("./messages.js")).default;

const actors = {
  lm: { id: "usr_lm", role: Role.LOGISTICS_MANAGER },
  sa: { id: "usr_sa", role: Role.SUPER_ADMIN },
  org: { id: "usr_org", role: Role.ORGANIZER },
  coord: { id: "usr_coord", role: Role.COORDINATOR },
  guest: { id: "usr_guest", role: Role.GUEST },
  guest2: { id: "usr_guest2", role: Role.GUEST }
};

const at = (minute: number) => new Date(Date.UTC(2026, 9, 11, 8, minute));

function notification(
  id: string,
  userId: string,
  minute: number,
  title: string,
  metadata: Record<string, unknown> | null
) {
  return { id, userId, title, body: `${title} body`, metadata, read: false, createdAt: at(minute) };
}

function seed() {
  memory.current.seed({
    user: Object.values(actors).map((actor) => ({
      id: actor.id,
      role: actor.role,
      name: `Name ${actor.id}`,
      email: `${actor.id}@example.test`,
      createdAt: at(0)
    })),
    notification: [
      notification("n_ops_guest", "usr_guest", 1, "Driver assigned", null),
      notification("n_task_coord", "usr_coord", 2, "Task delegated to you", {
        taskId: "tsk_1",
        handoverId: "hnd_1",
        kind: "DELEGATE"
      }),
      // Written before the MESSAGE marker existed: still private.
      notification("n_old_msg_guest", "usr_guest", 3, "New message", { conversationId: "cnv_old" }),
      {
        ...notification("n_msg_guest", "usr_guest", 4, "New message", {
          kind: "MESSAGE",
          conversationId: "cnv_1"
        }),
        body: "Name usr_lm: Private synthetic subject"
      },
      notification("n_msg_coord", "usr_coord", 5, "New message", {
        kind: "MESSAGE",
        conversationId: "cnv_2"
      })
    ]
  });
}

let http: Harness;

beforeAll(async () => {
  http = await startHarness([
    ["/api/notifications", notificationsRouter],
    ["/notifications", notificationsRouter],
    ["/api/messages", messagesRouter],
    ["/api", bootstrapRouter],
    ["/", bootstrapRouter]
  ]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(() => {
  seed();
});

const ids = (body: any) => (body.notifications as Array<{ id: string }>).map((n) => n.id).sort();
const row = (id: string) => memory.current.rows("notification").find((n) => n.id === id)!;

describe("bootstrap notifications", () => {
  it.each(["/api/bootstrap", "/bootstrap"])("%s hides other users' private messages from managers", async (path) => {
    for (const actor of [actors.lm, actors.sa, actors.org]) {
      const { status, body } = await http.get(path, actor);
      expect(status).toBe(200);
      expect(ids(body)).toEqual(["n_ops_guest", "n_task_coord"]);
      expect(JSON.stringify(body.notifications)).not.toMatch(/Private synthetic subject|cnv_/);
    }
  });

  it("gives a staff recipient their own private messages but not other users'", async () => {
    const { body } = await http.get("/api/bootstrap", actors.coord);
    expect(ids(body)).toEqual(["n_msg_coord", "n_ops_guest", "n_task_coord"]);
  });

  it("gives an ordinary user only their own notifications", async () => {
    const { body } = await http.get("/bootstrap", actors.guest);
    expect(ids(body)).toEqual(["n_msg_guest", "n_old_msg_guest", "n_ops_guest"]);
    expect(ids((await http.get("/api/bootstrap", actors.guest2)).body)).toEqual([]);
  });
});

describe("GET /notifications", () => {
  it.each(["/api/notifications", "/notifications"])("%s refuses another userId for ordinary users", async (path) => {
    expect((await http.get(`${path}?userId=usr_guest`, actors.guest2)).status).toBe(403);
    expect((await http.get(`${path}?userId=usr_guest&all=true`, actors.guest2)).status).toBe(403);
    const own = await http.get(`${path}?userId=usr_guest`, actors.guest);
    expect(ids(own.body)).toEqual(["n_msg_guest", "n_old_msg_guest", "n_ops_guest"]);
    expect(ids((await http.get(path, actors.guest2)).body)).toEqual([]);
  });

  it("keeps legacy manager views of operational notifications only", async () => {
    const all = await http.get("/api/notifications?all=true", actors.lm);
    expect(ids(all.body)).toEqual(["n_ops_guest", "n_task_coord"]);

    for (const manager of [actors.lm, actors.coord]) {
      const other = await http.get("/notifications?userId=usr_guest", manager);
      expect(other.status).toBe(200);
      expect(ids(other.body)).toEqual(["n_ops_guest"]);
    }
    const ownStaff = await http.get("/api/notifications", actors.coord);
    expect(ids(ownStaff.body)).toEqual(["n_msg_coord", "n_task_coord"]);
  });

  it("still finds operational notifications behind a long run of hidden ones", async () => {
    for (let index = 0; index < 150; index += 1) {
      memory.current.rows("notification").push(
        notification(`n_bulk_${index}`, "usr_guest", 10 + (index % 40), "New message", {
          kind: "MESSAGE",
          conversationId: `cnv_bulk_${index}`
        })
      );
    }
    const { body } = await http.get("/api/notifications?all=true", actors.lm);
    expect(ids(body)).toEqual(["n_ops_guest", "n_task_coord"]);
  });
});

describe("PUT /notifications/:id/read", () => {
  it.each(["/api/notifications", "/notifications"])("%s never lets a non-owner touch a private message", async (path) => {
    for (const actor of [actors.lm, actors.sa, actors.coord, actors.guest2]) {
      const response = await http.put(`${path}/n_msg_guest/read`, actor);
      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body)).not.toMatch(/Private synthetic subject|cnv_/);
    }
    expect((await http.put(`${path}/n_old_msg_guest/read`, actors.lm)).status).toBe(404);
    expect(row("n_msg_guest").read).toBe(false);
    expect(row("n_old_msg_guest").read).toBe(false);

    const own = await http.put(`${path}/n_msg_guest/read`, actors.guest);
    expect(own.status).toBe(200);
    expect(own.body.notification).toMatchObject({ id: "n_msg_guest", read: true });
  });

  it("keeps legacy rules for operational notifications", async () => {
    expect((await http.put("/api/notifications/n_ops_guest/read", actors.guest2)).status).toBe(403);
    const managed = await http.put("/api/notifications/n_ops_guest/read", actors.lm);
    expect(managed.status).toBe(200);
    expect(row("n_ops_guest").read).toBe(true);
    expect((await http.put("/api/notifications/n_missing/read", actors.lm)).status).toBe(404);
  });
});

describe("real messaging flow", () => {
  it("notifies the recipient privately; managers and other staff never see it", async () => {
    const created = await http.post("/api/messages/conversations", actors.guest, {
      recipientIds: ["usr_coord"],
      subject: "Flow synthetic subject",
      body: "Synthetic first message"
    });
    expect(created.status).toBe(201);
    const fresh = memory.current.rows("notification").find((n) => n.body.includes("Flow synthetic subject"))!;
    expect(fresh.metadata).toMatchObject({ kind: "MESSAGE", conversationId: created.body.conversation.id });

    const recipient = await http.get("/api/bootstrap", actors.coord);
    expect(ids(recipient.body)).toContain(fresh.id);

    for (const actor of [actors.lm, actors.org]) {
      const boot = await http.get("/bootstrap", actor);
      expect(JSON.stringify(boot.body.notifications)).not.toContain("Flow synthetic subject");
      const list = await http.get("/api/notifications?userId=usr_coord", actor);
      expect(JSON.stringify(list.body)).not.toContain("Flow synthetic subject");
      expect((await http.put(`/api/notifications/${fresh.id}/read`, actor)).status).toBe(404);
    }
  });
});

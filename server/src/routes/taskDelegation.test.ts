import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Role, TaskStatus } from "@prisma/client";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

/**
 * OPS-COLLAB-001 HTTP checks for task delegation, transfer and return:
 * who may hand over, who may receive, compare-and-set concurrency, history,
 * recipient notification, metadata-only audit and the realtime hint.
 * Real tasks router and JWT middleware over an in-memory Prisma double.
 */

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));

vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});

const { startHarness } = await import("../testing/httpHarness.js");
const tasksRouter = (await import("./tasks.js")).default;

const actors = {
  lm: { id: "usr_lm", role: Role.LOGISTICS_MANAGER },
  sa: { id: "usr_sa", role: Role.SUPER_ADMIN },
  org: { id: "usr_org", role: Role.ORGANIZER },
  org2: { id: "usr_org2", role: Role.ORGANIZER },
  coord: { id: "usr_coord", role: Role.COORDINATOR },
  coord2: { id: "usr_coord2", role: Role.COORDINATOR },
  guest: { id: "usr_guest", role: Role.GUEST },
  driver: { id: "usr_driver", role: Role.DRIVER },
  supplier: { id: "usr_supplier", role: Role.SUPPLIER }
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
    event: [
      { id: "evt_1", organizerId: "usr_org", name: "Synthetic event" },
      { id: "evt_2", organizerId: "usr_org2", name: "Other event" }
    ],
    task: [
      { id: "tsk_1", eventId: "evt_1", type: "AIRPORT_PICKUP", status: TaskStatus.ASSIGNED, pickupLocation: "Synthetic airport", dropoffLocation: "Synthetic hotel", scheduledAt: new Date(), responsibleUserId: null, delegateUserId: null, driverId: null, guestId: null },
      { id: "tsk_owned", eventId: "evt_1", type: "VIP_ESCORT", status: TaskStatus.EN_ROUTE, pickupLocation: "Synthetic gate", dropoffLocation: "Venue", scheduledAt: new Date(), responsibleUserId: "usr_coord", delegateUserId: null, driverId: null, guestId: null },
      { id: "tsk_done", eventId: "evt_1", type: "HOTEL_TRANSFER", status: TaskStatus.COMPLETED, pickupLocation: "A", dropoffLocation: "B", scheduledAt: new Date(), responsibleUserId: "usr_coord", delegateUserId: null, driverId: null, guestId: null },
      { id: "tsk_other", eventId: "evt_2", type: "AIRPORT_PICKUP", status: TaskStatus.PENDING, pickupLocation: "C", dropoffLocation: "D", scheduledAt: new Date(), responsibleUserId: null, delegateUserId: null, driverId: null, guestId: null }
    ]
  });
}

let http: Harness;

beforeAll(async () => {
  http = await startHarness([["/api/tasks", tasksRouter]]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(() => {
  seed();
  http.emitted.length = 0;
});

const taskRow = (id: string) => memory.current.rows("task").find((t) => t.id === id)!;
const handovers = () => memory.current.rows("taskHandover");

describe("POST /tasks/:id/handover", () => {
  it("delegates an unowned task: the actor stays accountable, the recipient is told", async () => {
    const { status, body } = await http.post("/api/tasks/tsk_1/handover", actors.lm, {
      mode: "DELEGATE",
      toUserId: "usr_coord",
      reason: "Cover the arrival wave"
    });
    expect(status).toBe(201);
    expect(taskRow("tsk_1")).toMatchObject({ responsibleUserId: "usr_lm", delegateUserId: "usr_coord" });
    expect(body.task.responsibleUser).toEqual({ id: "usr_lm", name: "Name usr_lm", role: "LOGISTICS_MANAGER" });
    expect(body.task.delegateUser).toEqual({ id: "usr_coord", name: "Name usr_coord", role: "COORDINATOR" });
    expect(JSON.stringify(body.task.delegateUser)).not.toMatch(/email|phone/);

    expect(handovers()).toEqual([
      expect.objectContaining({
        taskId: "tsk_1",
        kind: "DELEGATE",
        fromUserId: "usr_lm",
        toUserId: "usr_coord",
        actorUserId: "usr_lm",
        reason: "Cover the arrival wave"
      })
    ]);

    const [notification] = memory.current.rows("notification");
    expect(notification).toMatchObject({ userId: "usr_coord", title: "Task delegated to you" });

    const [audit] = memory.current.rows("auditLog");
    expect(audit).toMatchObject({
      action: "task.handover.delegate",
      entityId: "tsk_1",
      eventId: "evt_1",
      metadata: { kind: "DELEGATE", fromUserId: "usr_lm", toUserId: "usr_coord", reasonProvided: true }
    });
    expect(JSON.stringify(audit)).not.toContain("Cover the arrival wave");

    expect(http.emitted).toEqual([
      expect.objectContaining({ room: "user:usr_coord", event: "task:assigned" })
    ]);
  });

  it("lets the responsible coordinator transfer the task for good", async () => {
    const response = await http.post("/api/tasks/tsk_owned/handover", actors.coord, {
      mode: "TRANSFER",
      toUserId: "usr_coord2"
    });
    expect(response.status).toBe(201);
    expect(taskRow("tsk_owned")).toMatchObject({ responsibleUserId: "usr_coord2", delegateUserId: null });
    expect(memory.current.rows("notification")[0]).toMatchObject({
      userId: "usr_coord2",
      title: "Task transferred to you"
    });
  });

  it("lets the delegate return the task but not transfer it", async () => {
    await http.post("/api/tasks/tsk_owned/handover", actors.coord, { mode: "DELEGATE", toUserId: "usr_coord2" });
    expect(taskRow("tsk_owned")).toMatchObject({ responsibleUserId: "usr_coord", delegateUserId: "usr_coord2" });

    expect(
      (await http.post("/api/tasks/tsk_owned/handover", actors.coord2, { mode: "TRANSFER", toUserId: "usr_lm" })).status
    ).toBe(403);

    const back = await http.post("/api/tasks/tsk_owned/handover/return", actors.coord2, { reason: "Shift over" });
    expect(back.status).toBe(201);
    expect(taskRow("tsk_owned")).toMatchObject({ responsibleUserId: "usr_coord", delegateUserId: null });
    expect(handovers().map((h) => h.kind)).toEqual(["DELEGATE", "RETURN"]);
  });

  it("denies people with no stake in the task", async () => {
    const body = { mode: "DELEGATE", toUserId: "usr_coord2" };
    expect((await http.post("/api/tasks/tsk_1/handover", actors.coord, body)).status).toBe(403);
    expect((await http.post("/api/tasks/tsk_1/handover", actors.org2, body)).status).toBe(404);
    for (const actor of [actors.guest, actors.driver, actors.supplier]) {
      expect((await http.post("/api/tasks/tsk_1/handover", actor, body)).status).toBe(403);
    }
    expect(handovers()).toHaveLength(0);
  });

  it("only hands tasks to operations staff (and the event's own organizer)", async () => {
    for (const toUserId of ["usr_guest", "usr_driver", "usr_supplier", "usr_org2", "usr_missing"]) {
      const response = await http.post("/api/tasks/tsk_1/handover", actors.lm, { mode: "TRANSFER", toUserId });
      expect(response.status).toBe(400);
    }
    expect(
      (await http.post("/api/tasks/tsk_1/handover", actors.lm, { mode: "TRANSFER", toUserId: "usr_org" })).status
    ).toBe(201);
    expect(taskRow("tsk_1").responsibleUserId).toBe("usr_org");
  });

  it("refuses closed tasks, no-ops and unknown fields", async () => {
    expect(
      (await http.post("/api/tasks/tsk_done/handover", actors.lm, { mode: "DELEGATE", toUserId: "usr_coord2" })).status
    ).toBe(409);
    expect(
      (await http.post("/api/tasks/tsk_owned/handover", actors.lm, { mode: "TRANSFER", toUserId: "usr_coord" })).status
    ).toBe(409);
    expect(
      (await http.post("/api/tasks/tsk_1/handover", actors.lm, { mode: "TRANSFER", toUserId: "usr_coord", status: "COMPLETED" })).status
    ).toBe(400);
    expect((await http.post("/api/tasks/tsk_owned/handover/return", actors.coord, {})).status).toBe(409);
    expect((await http.post("/api/tasks/tsk_missing/handover", actors.lm, { mode: "DELEGATE", toUserId: "usr_coord" })).status).toBe(404);
  });

  it("refuses a handover decided on state that changed meanwhile", async () => {
    // Another operator transfers the task after this request read it but
    // before its guarded write (here: while the recipient is looked up).
    memory.current.beforeNext("user", "findUnique", () => {
      taskRow("tsk_owned").responsibleUserId = "usr_sa";
    });
    const response = await http.post("/api/tasks/tsk_owned/handover", actors.coord, {
      mode: "TRANSFER",
      toUserId: "usr_coord2"
    });
    expect(response.status).toBe(409);
    expect(taskRow("tsk_owned").responsibleUserId).toBe("usr_sa");
    expect(handovers()).toHaveLength(0);
    expect(memory.current.rows("notification")).toHaveLength(0);
  });

  it("rolls the handover back when the audit write fails", async () => {
    memory.current.failNext("auditLog", "create", new Error("audit store unavailable"));
    const response = await http.post("/api/tasks/tsk_1/handover", actors.lm, { mode: "DELEGATE", toUserId: "usr_coord" });
    expect(response.status).toBe(500);
    expect(taskRow("tsk_1")).toMatchObject({ responsibleUserId: null, delegateUserId: null });
    expect(handovers()).toHaveLength(0);
    expect(memory.current.rows("notification")).toHaveLength(0);
  });
});

describe("GET /tasks/handover-candidates and /tasks/:id/handovers", () => {
  it("lists operations staff plus the event's own organizer, names and roles only", async () => {
    const { status, body } = await http.get("/api/tasks/handover-candidates?eventId=evt_1", actors.coord);
    expect(status).toBe(200);
    expect(body.candidates.map((c: any) => c.id).sort()).toEqual(
      ["usr_coord", "usr_coord2", "usr_lm", "usr_org", "usr_sa"].sort()
    );
    expect(JSON.stringify(body)).not.toMatch(/email|phone/);
  });

  it("refuses other organizers' events and non-operations roles", async () => {
    expect((await http.get("/api/tasks/handover-candidates?eventId=evt_1", actors.org2)).status).toBe(403);
    expect((await http.get("/api/tasks/handover-candidates?eventId=evt_1", actors.guest)).status).toBe(403);
    expect((await http.get("/api/tasks/handover-candidates?eventId=evt_missing", actors.lm)).status).toBe(404);
  });

  it("returns the newest-first handover history to people who can see the task", async () => {
    await http.post("/api/tasks/tsk_owned/handover", actors.coord, { mode: "DELEGATE", toUserId: "usr_coord2" });
    await http.post("/api/tasks/tsk_owned/handover/return", actors.coord2, {});
    const { status, body } = await http.get("/api/tasks/tsk_owned/handovers", actors.org);
    expect(status).toBe(200);
    expect(body.handovers.map((h: any) => h.kind)).toEqual(["RETURN", "DELEGATE"]);
    expect(body.handovers[1]).toMatchObject({
      fromUser: { id: "usr_coord" },
      toUser: { id: "usr_coord2" },
      actor: { id: "usr_coord" }
    });
    expect((await http.get("/api/tasks/tsk_owned/handovers", actors.org2)).status).toBe(404);
    expect((await http.get("/api/tasks/tsk_owned/handovers", actors.guest)).status).toBe(403);
  });
});

describe("task reads", () => {
  it("carry the responsible person and delegate for operations staff", async () => {
    await http.post("/api/tasks/tsk_1/handover", actors.lm, { mode: "DELEGATE", toUserId: "usr_coord" });
    const { body } = await http.get("/api/tasks/tsk_1", actors.coord);
    expect(body.task.responsibleUser).toMatchObject({ id: "usr_lm" });
    expect(body.task.delegateUser).toMatchObject({ id: "usr_coord" });
  });
});

import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EventMemberRole, EventPermission, MembershipStatus, Role, TaskStatus, TaskType } from "@prisma/client";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

type PushCall = {
  kind: "users" | "event";
  eventId?: string;
  userIds: Array<string | null | undefined>;
  payload: { title: string; body: string; tag?: string; url?: string };
  excludeUserId?: string;
  insideTransaction: boolean;
};

const state = vi.hoisted(() => ({
  memory: undefined as unknown as MemoryPrisma,
  txDepth: 0,
  failNextTx: false,
  pushCalls: [] as PushCall[]
}));

vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  const mem = createMemoryPrisma();
  state.memory = mem;
  const origTx = mem.prisma.$transaction.bind(mem.prisma);
  mem.prisma.$transaction = (async (fnOrOps: unknown, opts?: unknown) => {
    state.txDepth += 1;
    try {
      if (state.failNextTx) {
        state.failNextTx = false;
        throw new Error("Simulated transaction rollback");
      }
      return await (origTx as (a: unknown, b?: unknown) => Promise<unknown>)(fnOrOps, opts);
    } finally {
      state.txDepth -= 1;
    }
  }) as typeof mem.prisma.$transaction;
  return { prisma: mem.prisma };
});

vi.mock("../services/webPush.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/webPush.js")>();
  return {
    ...actual,
    notifyUsersByWebPush: vi.fn((userIds, payload, options) => {
      state.pushCalls.push({
        kind: "users",
        userIds: [...userIds],
        payload,
        excludeUserId: options?.excludeUserId,
        insideTransaction: state.txDepth > 0
      });
    }),
    notifyEventUsersByWebPush: vi.fn((eventId, userIds, payload, options) => {
      state.pushCalls.push({
        kind: "event",
        eventId,
        userIds: [...userIds],
        payload,
        excludeUserId: options?.excludeUserId,
        insideTransaction: state.txDepth > 0
      });
    })
  };
});

const { startHarness } = await import("../testing/httpHarness.js");
const { buildWorkspaceTestWorld } = await import("../testing/memoryPrisma.js");
const tasksRouter = (await import("./tasks.js")).default;
const messagesRouter = (await import("./messages.js")).default;
const workspaceDispatchRouter = (await import("./workspaceDispatch.js")).default;

const actors = {
  sa: { id: "u_sa", email: "sa@example.test", role: Role.SUPER_ADMIN },
  lm: { id: "u_lm", email: "lm@example.test", role: Role.LOGISTICS_MANAGER },
  sup: { id: "u_sup", email: "sup@example.test", role: Role.COORDINATOR },
  cap1: { id: "u_cap1", email: "cap1@example.test", role: Role.DRIVER },
  cap2: { id: "u_cap2", email: "cap2@example.test", role: Role.DRIVER },
  coord: { id: "u_coord", email: "coord@example.test", role: Role.COORDINATOR }
};

let http: Harness;

function seedBase() {
  const now = new Date();
  state.memory.seed({
    user: [
      { id: "u_sa", name: "Super Admin", email: "sa@example.test", phone: "+966500000001", role: Role.SUPER_ADMIN, language: "en", avatar: null, passwordHash: "x", onboardingPending: false, onboardingKind: null, createdAt: now, updatedAt: now },
      { id: "u_lm", name: "Logistics Mgr", email: "lm@example.test", phone: "+966500000002", role: Role.LOGISTICS_MANAGER, language: "en", avatar: null, passwordHash: "x", onboardingPending: false, onboardingKind: null, createdAt: now, updatedAt: now },
      { id: "u_sup", name: "Fleet Supervisor", email: "sup@example.test", phone: "+966500000003", role: Role.COORDINATOR, language: "en", avatar: null, passwordHash: "x", onboardingPending: false, onboardingKind: null, createdAt: now, updatedAt: now },
      { id: "u_cap1", name: "Captain One", email: "cap1@example.test", phone: "+966500000004", role: Role.DRIVER, language: "en", avatar: null, passwordHash: "x", onboardingPending: false, onboardingKind: null, createdAt: now, updatedAt: now },
      { id: "u_cap2", name: "Captain Two", email: "cap2@example.test", phone: "+966500000005", role: Role.DRIVER, language: "en", avatar: null, passwordHash: "x", onboardingPending: false, onboardingKind: null, createdAt: now, updatedAt: now },
      { id: "u_coord", name: "Field Coord", email: "coord@example.test", phone: "+966500000006", role: Role.COORDINATOR, language: "en", avatar: null, passwordHash: "x", onboardingPending: false, onboardingKind: null, createdAt: now, updatedAt: now }
    ],
    organization: [{ id: "org_1", name: "Sila Org", createdAt: now, updatedAt: now }],
    organizationMembership: [
      { id: "om_lm", organizationId: "org_1", userId: "u_lm", role: "OWNER", status: MembershipStatus.ACTIVE, createdAt: now, updatedAt: now }
    ],
    event: [
      {
        id: "evt_1",
        name: "Riyadh Summit",
        organizationId: "org_1",
        organizerId: "u_lm",
        startDate: now,
        endDate: new Date(now.getTime() + 86_400_000),
        location: "Diriyah Gate",
        status: "ACTIVE",
        operationalStatus: "ACTIVE",
        approvedPlanId: "plan_1",
        createdAt: now,
        updatedAt: now
      }
    ],
    eventMembership: [
      { id: "em_lm", eventId: "evt_1", userId: "u_lm", role: EventMemberRole.LOGISTICS_MANAGER, status: MembershipStatus.ACTIVE, permissions: [EventPermission.VIEW, EventPermission.EDIT], available: true, canReceive: true, createdAt: now, updatedAt: now },
      { id: "em_sup", eventId: "evt_1", userId: "u_sup", role: EventMemberRole.FLEET_SUPERVISOR, status: MembershipStatus.ACTIVE, permissions: [EventPermission.VIEW, EventPermission.EDIT], available: true, canReceive: true, createdAt: now, updatedAt: now },
      { id: "em_cap1", eventId: "evt_1", userId: "u_cap1", role: EventMemberRole.CAPTAIN, status: MembershipStatus.ACTIVE, permissions: [EventPermission.VIEW], available: true, canReceive: true, createdAt: now, updatedAt: now },
      { id: "em_cap2", eventId: "evt_1", userId: "u_cap2", role: EventMemberRole.CAPTAIN, status: MembershipStatus.ACTIVE, permissions: [EventPermission.VIEW], available: true, canReceive: true, createdAt: now, updatedAt: now },
      { id: "em_coord", eventId: "evt_1", userId: "u_coord", role: EventMemberRole.COORDINATOR, status: MembershipStatus.ACTIVE, permissions: [EventPermission.VIEW], available: true, canReceive: true, createdAt: now, updatedAt: now }
    ],
    driver: [
      { id: "drv_1", userId: "u_cap1", active: true, status: "AVAILABLE", vehicleModel: "S-Class", plateNumber: "KSA-1", currentLat: 24.7136, currentLng: 46.6753, createdAt: now, updatedAt: now },
      { id: "drv_2", userId: "u_cap2", active: true, status: "AVAILABLE", vehicleModel: "G-Class", plateNumber: "KSA-2", currentLat: 24.7136, currentLng: 46.6753, createdAt: now, updatedAt: now }
    ],
    task: [],
    taskHandover: [],
    conversation: [],
    conversationParticipant: [],
    conversationMessage: [],
    dispatchRecord: [],
    notification: [],
    auditLog: []
  });
}

beforeAll(async () => {
  http = await startHarness([
    ["/tasks", tasksRouter],
    ["/messages", messagesRouter],
    ["/workspace", workspaceDispatchRouter]
  ]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(() => {
  state.txDepth = 0;
  state.failNextTx = false;
  state.pushCalls = [];
  seedBase();
});

describe("Web Push post-commit wiring, tags, and lock-screen privacy", () => {
  it("POST /tasks and PUT /tasks/:id/assignment push only newly assigned captain with per-task tag and zero PII", async () => {
    const created = await http.post("/tasks", actors.lm, {
      eventId: "evt_1",
      driverId: "drv_1",
      type: TaskType.VIP_ESCORT,
      pickupLocation: "Secret Palace Gate 7 — VIP Prince",
      dropoffLocation: "Four Seasons Royal Suite",
      scheduledAt: new Date().toISOString()
    });
    expect(created.status).toBe(201);
    const taskId = created.body.task.id as string;

    // No silent DB Notification row added; push fires for cap1 only with zero location/VIP PII.
    expect(state.memory.rows("notification")).toHaveLength(0);
    expect(state.pushCalls).toHaveLength(1);
    expect(state.pushCalls[0].insideTransaction).toBe(false);
    expect(state.pushCalls[0].userIds).toEqual(["u_cap1"]);
    expect(state.pushCalls[0].excludeUserId).toBe("u_lm");
    expect(state.pushCalls[0].payload.tag).toBe(`midyaf-task-${taskId}`);
    expect(JSON.stringify(state.pushCalls[0].payload)).not.toContain("Secret Palace");
    expect(JSON.stringify(state.pushCalls[0].payload)).not.toContain("Royal Suite");

    // Updating the same driver does NOT re-push.
    state.pushCalls = [];
    const sameDriver = await http.put(`/tasks/${taskId}/assignment`, actors.lm, { driverId: "drv_1" });
    expect(sameDriver.status).toBe(200);
    expect(state.pushCalls).toHaveLength(0);

    // Reassigning to drv_2 pushes ONLY the new captain (u_cap2), not the old captain (u_cap1).
    const reassigned = await http.put(`/tasks/${taskId}/assignment`, actors.lm, { driverId: "drv_2" });
    expect(reassigned.status).toBe(200);
    expect(state.pushCalls).toHaveLength(1);
    expect(state.pushCalls[0].userIds).toEqual(["u_cap2"]);
    expect(state.pushCalls[0].payload.tag).toBe(`midyaf-task-${taskId}`);
    expect(state.memory.rows("notification")).toHaveLength(0);
  });

  it("POST /tasks/:id/handover fires push strictly AFTER transaction commit and never on rollback", async () => {
    const now = new Date();
    state.memory.seed({
      ...Object.fromEntries(
        ["user", "organization", "organizationMembership", "event", "eventMembership", "driver", "taskHandover", "conversation", "conversationParticipant", "conversationMessage", "dispatchRecord", "notification", "auditLog"].map(
          (k) => [k, state.memory.rows(k as never)]
        )
      ),
      task: [
        {
          id: "t_handover_1",
          eventId: "evt_1",
          type: TaskType.VIP_ESCORT,
          status: TaskStatus.ASSIGNED,
          pickupLocation: "Secret Gate A",
          dropoffLocation: "Secret Hotel B",
          responsibleUserId: "u_lm",
          delegateUserId: null,
          scheduledAt: now,
          createdAt: now,
          updatedAt: now
        }
      ]
    });

    // Rollback must emit ZERO push.
    state.failNextTx = true;
    const failed = await http.post("/tasks/t_handover_1/handover", actors.lm, {
      mode: "DELEGATE",
      toUserId: "u_coord",
      reason: "Confidential VIP escort reason"
    });
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(state.pushCalls).toHaveLength(0);

    // Successful commit fires push AFTER tx ends, with per-handover tag and zero reason/location PII.
    const ok = await http.post("/tasks/t_handover_1/handover", actors.lm, {
      mode: "DELEGATE",
      toUserId: "u_coord",
      reason: "Confidential VIP escort reason"
    });
    expect(ok.status).toBe(201);
    expect(state.pushCalls).toHaveLength(1);
    expect(state.pushCalls[0].insideTransaction).toBe(false);
    expect(state.pushCalls[0].userIds).toEqual(["u_coord"]);
    expect(state.pushCalls[0].payload.tag).toBe(`midyaf-handover-${ok.body.handover.id}`);
    expect(JSON.stringify(state.pushCalls[0].payload)).not.toContain("Confidential VIP");
    expect(JSON.stringify(state.pushCalls[0].payload)).not.toContain("Secret Gate");
  });

  it("POST /messages/conversations and replies fire post-commit push with zero PII and skip rollback/replay", async () => {
    state.failNextTx = true;
    const rolledBack = await http.post("/messages/conversations", actors.lm, {
      recipientIds: ["u_cap1"],
      subject: "VIP Passport #99182",
      body: "Sensitive arrival note"
    });
    expect(rolledBack.status).toBeGreaterThanOrEqual(500);
    expect(state.pushCalls).toHaveLength(0);

    const created = await http.post("/messages/conversations", actors.lm, {
      recipientIds: ["u_cap1"],
      subject: "VIP Passport #99182",
      body: "Sensitive arrival note"
    });
    expect(created.status).toBe(201);
    const convId = created.body.conversation.id as string;
    expect(state.pushCalls).toHaveLength(1);
    expect(state.pushCalls[0].insideTransaction).toBe(false);
    expect(state.pushCalls[0].userIds).toEqual(["u_cap1"]);
    expect(state.pushCalls[0].excludeUserId).toBe("u_lm");
    expect(state.pushCalls[0].payload.tag).toBe(`midyaf-msg-${convId}`);
    expect(JSON.stringify(state.pushCalls[0].payload)).not.toContain("99182");
    expect(JSON.stringify(state.pushCalls[0].payload)).not.toContain("Sensitive arrival");

    // Reply pushes post-commit with unique per-message tag; replayed clientRequestId does NOT push again.
    state.pushCalls = [];
    const reply1 = await http.post(`/messages/conversations/${convId}/messages`, actors.cap1, {
      body: "Private gate 3 code 7741",
      clientRequestId: "reply_req_001"
    });
    expect(reply1.status).toBe(201);
    expect(state.pushCalls).toHaveLength(1);
    expect(state.pushCalls[0].insideTransaction).toBe(false);
    expect(state.pushCalls[0].userIds).toEqual(["u_lm"]);
    expect(state.pushCalls[0].payload.tag).toBe(`midyaf-msg-${convId}-${reply1.body.message.id}`);
    expect(JSON.stringify(state.pushCalls[0].payload)).not.toContain("7741");

    state.pushCalls = [];
    const replyReplay = await http.post(`/messages/conversations/${convId}/messages`, actors.cap1, {
      body: "Private gate 3 code 7741",
      clientRequestId: "reply_req_001"
    });
    expect(replyReplay.status).toBe(201);
    expect(state.pushCalls).toHaveLength(0);
  });

  it("workspace dispatch, emergency dispatch, event conversation, and task PATCH push strictly post-commit with per-item tags and zero PII", async () => {
    const world = buildWorkspaceTestWorld();
    state.memory.seed(structuredClone(world.seed));
    const a = world.actors;
    const base = "/workspace/events/evt_a/dispatch";
    const dispatchTask = {
      type: "HOTEL_TRANSFER",
      pickupLocation: "Diplomatic Gate 2",
      dropoffLocation: "Royal Pavilion Hall"
    };

    // Rollback inside $transaction must emit ZERO push.
    state.memory.failNext("notification", "createMany", new Error("synthetic tx rollback"));
    const rolledBack = await http.post(base, a.lm, {
      flow: "LM_TO_CAPTAIN_EMERGENCY",
      recipientUserIds: [a.cap.id],
      subject: "URGENT Royal Convoy Shift",
      body: "Move to Diplomatic Gate 2 immediately",
      task: dispatchTask,
      clientRequestId: "dispatch_em_fail"
    });
    expect(rolledBack.status).toBe(500);
    expect(state.pushCalls).toHaveLength(0);

    // 1. Emergency dispatch (LM -> Captain, auto-alerts Fleet Supervisor)
    const emRes = await http.post(base, a.lm, {
      flow: "LM_TO_CAPTAIN_EMERGENCY",
      recipientUserIds: [a.cap.id],
      subject: "URGENT Royal Convoy Shift",
      body: "Move to Diplomatic Gate 2 immediately",
      task: dispatchTask,
      clientRequestId: "dispatch_em_0001"
    });
    expect(emRes.status).toBe(201);
    expect(state.pushCalls).toHaveLength(2);
    expect(state.pushCalls.every((c) => c.insideTransaction === false)).toBe(true);
    expect(state.pushCalls[0].userIds).toEqual([a.cap.id]);
    expect(state.pushCalls[0].payload.title).toContain("Emergency");
    expect(state.pushCalls[0].payload.tag).toBe(`midyaf-dispatch-${emRes.body.dispatch.conversationId}`);
    expect(state.pushCalls[1].userIds).toEqual([a.sup.id]);
    expect(state.pushCalls[1].payload.tag).toBe(`midyaf-alert-${emRes.body.dispatch.supervisorAlert.conversationId}`);
    for (const call of state.pushCalls) {
      expect(JSON.stringify(call.payload)).not.toContain("Royal Convoy");
      expect(JSON.stringify(call.payload)).not.toContain("Diplomatic Gate");
    }

    // Replaying the same clientRequestId must NOT fire duplicate pushes.
    state.pushCalls = [];
    const emReplay = await http.post(base, a.lm, {
      flow: "LM_TO_CAPTAIN_EMERGENCY",
      recipientUserIds: [a.cap.id],
      subject: "URGENT Royal Convoy Shift",
      body: "Move to Diplomatic Gate 2 immediately",
      task: dispatchTask,
      clientRequestId: "dispatch_em_0001"
    });
    expect(emReplay.status).toBe(200);
    expect(state.pushCalls).toHaveLength(0);

    // 2. Event conversation creation
    const convRes = await http.post("/workspace/events/evt_a/conversations", a.lm, {
      recipientUserIds: [a.cap.id],
      subject: "Secret Venue Briefing",
      body: "Do not expose on lock screen",
      kind: "ALERT",
      clientRequestId: "ev_conv_00001"
    });
    expect(convRes.status).toBe(201);
    expect(state.pushCalls).toHaveLength(1);
    expect(state.pushCalls[0].insideTransaction).toBe(false);
    expect(state.pushCalls[0].userIds).toEqual([a.cap.id]);
    expect(state.pushCalls[0].payload.tag).toBe(`midyaf-msg-${convRes.body.conversationId}`);
    expect(JSON.stringify(state.pushCalls[0].payload)).not.toContain("Secret Venue");

    // 3. PATCH /workspace/events/:eventId/tasks/:taskId (status update + response shape preserved)
    const taskId = emRes.body.dispatch.taskId as string;
    state.pushCalls = [];
    const patchRes = await http.patch(`/workspace/events/evt_a/tasks/${taskId}`, a.cap, {
      status: TaskStatus.ACCEPTED
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body).toEqual({ task: { id: taskId, status: TaskStatus.ACCEPTED } });
    expect(state.pushCalls).toHaveLength(1);
    expect(state.pushCalls[0].insideTransaction).toBe(false);
    expect(state.pushCalls[0].kind).toBe("event");
    expect(state.pushCalls[0].eventId).toBe("evt_a");
    expect(state.pushCalls[0].userIds).toEqual([a.lm.id]);
    expect(state.pushCalls[0].payload.tag).toBe(`midyaf-task-${taskId}-ACCEPTED`);
  });

  it("accounts explicitly for every notification.create / createMany site across server/src", () => {
    const serverSrc = path.join(process.cwd(), "server", "src");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          const text = fs.readFileSync(full, "utf8");
          if (/notification\.create(?:Many)?\s*\(/.test(text)) {
            hits.push(path.relative(serverSrc, full).replace(/\\/g, "/"));
          }
        }
      }
    };
    walk(serverSrc);
    hits.sort();

    // Push-wired notification writers:
    const pushWired = [
      "routes/messages.ts",
      "routes/tasks.ts",
      "routes/workspaceDispatch.ts",
      "services/notificationDelivery.ts"
    ];
    // Explicitly left in-app only (no lock-screen push by design / out of scope):
    const intentionallyInAppOnly = [
      "routes/bookings.ts",
      "routes/events.ts",
      "routes/onboarding.ts",
      "routes/workspaceEvents.ts",
      "services/delayMonitor.ts",
      "utils/demoProvisioning.ts"
    ];
    expect(hits).toEqual([...pushWired, ...intentionallyInAppOnly].sort());
  });
});

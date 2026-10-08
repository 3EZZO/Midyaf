import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Role } from "@prisma/client";
import { ZodError } from "zod";

/**
 * T-08: HTTP-level checks for the AI routes. The AI service module is fully
 * mocked, so no provider, key or paid API can be reached; persistence is an
 * in-memory synthetic fake. The real router and JWT middleware run.
 */

const fake = vi.hoisted(() => {
  type Row = Record<string, any>;

  const seed = (): Record<string, Row[]> => ({
    user: [{ id: "usr_company", name: "Synthetic Company" }],
    event: [
      { id: "evt_own", organizerId: "usr_org" },
      { id: "evt_other", organizerId: "usr_org2" },
      { id: "evt_company", organizerId: "usr_org2" },
      { id: "evt_company_owned", organizerId: "usr_company" }
    ],
    guest: [
      { id: "gst_own", userId: "usr_guest", eventId: "evt_own" },
      { id: "gst_other", userId: "usr_guest2", eventId: "evt_other" }
    ],
    driver: [
      { id: "drv_own", userId: "usr_driver" },
      { id: "drv_other", userId: "usr_driver2" }
    ],
    task: [
      { id: "tsk_own", eventId: "evt_own", driverId: "drv_own", guestId: "gst_own" },
      { id: "tsk_other", eventId: "evt_other", driverId: "drv_other", guestId: "gst_other" }
    ],
    supplier: [{ id: "sup_1", userId: "usr_supplier" }],
    booking: [{ id: "bk_1", eventId: "evt_own", supplierId: "sup_1" }],
    activityIntake: [
      { id: "int_1", eventId: "evt_company", submittedBy: "Synthetic Company" },
      // Stale intake: ActivityIntake.eventId has no foreign key.
      { id: "int_stale", eventId: "evt_deleted", submittedBy: "Synthetic Company" }
    ]
  });

  const relations: Record<string, Record<string, [string, string]>> = {
    guest: { event: ["event", "eventId"] },
    task: {
      guest: ["guest", "guestId"],
      driver: ["driver", "driverId"],
      event: ["event", "eventId"]
    },
    booking: { supplier: ["supplier", "supplierId"] }
  };

  let db = seed();
  const calls: Array<{ model: string; method: string; args: Row }> = [];

  function hydrate(model: string, row: Row, depth = 0): Row {
    const out = { ...row };
    if (depth > 2) return out;
    for (const [field, [target, fk]] of Object.entries(relations[model] ?? {})) {
      const related = db[target].find((item) => item.id === row[fk]);
      out[field] = related ? hydrate(target, related, depth + 1) : null;
    }
    return out;
  }

  function matches(row: Row | null | undefined, where: Row = {}): boolean {
    if (!row) return false;
    return Object.entries(where).every(([key, cond]) => {
      const value = row[key];
      if (cond && typeof cond === "object" && !Array.isArray(cond)) {
        if ("not" in cond) return value !== cond.not;
        if ("in" in cond) return (cond.in as unknown[]).includes(value);
        return matches(value, cond);
      }
      return value === cond;
    });
  }

  function model(name: string) {
    const find = (args: Row = {}) =>
      db[name]
        .map((row) => hydrate(name, row))
        .filter((row) => matches(row, args.where));
    return {
      findUnique: async (args: Row) => {
        calls.push({ model: name, method: "findUnique", args });
        return find(args)[0] ?? null;
      },
      findFirst: async (args: Row) => {
        calls.push({ model: name, method: "findFirst", args });
        return find(args)[0] ?? null;
      },
      findMany: async (args: Row = {}) => {
        calls.push({ model: name, method: "findMany", args });
        return find(args);
      }
    };
  }

  const prisma = Object.fromEntries(Object.keys(seed()).map((name) => [name, model(name)]));

  return {
    prisma,
    calls,
    reset: () => {
      db = seed();
      calls.length = 0;
    }
  };
});

const ai = vi.hoisted(() => ({
  smartAssistant: vi.fn(async (_query: string, _language: string, _context?: unknown) => ({
    message: "Synthetic assistant reply"
  })),
  chatGuide: vi.fn(async (input: { persona?: string; context?: unknown }) => ({
    persona: input.persona ?? "Noura",
    content: "Synthetic chat reply"
  })),
  streamChatCompletion: vi.fn(async function* (input: { persona?: string; context?: unknown }) {
    yield { type: "meta" as const, meta: { persona: input.persona ?? "Noura", source: "local" as const } };
    yield { type: "delta" as const, delta: "Synthetic " };
    yield { type: "delta" as const, delta: "stream" };
    yield { type: "done" as const, content: "Synthetic stream" };
  }),
  executeSmartAction: vi.fn(async (actionId: string, _params?: unknown) => ({
    ok: true,
    message: actionId,
    messageAr: actionId
  })),
  verifyDocument: vi.fn(async (_input: unknown) => ({ status: "APPROVED" })),
  getCommandCenterInsights: vi.fn(async (_input?: unknown) => ({ status: "AMBER_WARNING" })),
  generatePostEventReport: vi.fn(async (input?: unknown) => ({ input })),
  planEvent: vi.fn(async (_brief: string) => ({ summary: "Synthetic plan" })),
  analyzeSuppliers: vi.fn(async (_offers: unknown) => ({ bestValue: "Synthetic supplier" }))
}));

vi.mock("../db.js", () => ({ prisma: fake.prisma }));
vi.mock("../services/ai.js", () => ai);

const { signTokens } = await import("../middleware/auth.js");
const aiRouter = (await import("./ai.js")).default;

const actors: Record<string, { id: string; role: Role }> = {
  SA: { id: "usr_sa", role: Role.SUPER_ADMIN },
  LM: { id: "usr_lm", role: Role.LOGISTICS_MANAGER },
  ORG: { id: "usr_org", role: Role.ORGANIZER },
  GUEST: { id: "usr_guest", role: Role.GUEST },
  DRIVER: { id: "usr_driver", role: Role.DRIVER },
  SUPPLIER: { id: "usr_supplier", role: Role.SUPPLIER },
  COMPANY: { id: "usr_company", role: Role.COMPANY_ORGANIZER },
  COORDINATOR: { id: "usr_coord", role: Role.COORDINATOR }
};
type Actor = keyof typeof actors;

const PERSONAL: Actor[] = ["GUEST", "DRIVER", "SUPPLIER", "COMPANY", "COORDINATOR"];

let server: Server;
let base = "";

async function post(path: string, actor: Actor, body: unknown) {
  const { id, role } = actors[actor];
  const token = signTokens({ id, email: `${id}@example.test`, role }).accessToken;
  return fetch(`${base}/ai${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

async function postJson(path: string, actor: Actor, body: unknown) {
  const res = await post(path, actor, body);
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

/** Context the War Room briefing sends, shaped like buildBriefingContext. */
function briefing(eventId: string | null, extra: Record<string, unknown> = {}) {
  return {
    demo: false,
    event: eventId ? { id: eventId, name: "Synthetic Summit" } : null,
    fleet: { total: 12, active: 9, idle: 2, offline: 1, utilisationPercent: 75 },
    finance: { commissionSAR: 1000, contractedSpendSAR: 9000, marginPercent: 11 },
    tasks: { PENDING: 1, EN_ROUTE: 2 },
    guests: { total: 3, vip: 1, arrived: 1 },
    recentEvents: [],
    ...extra
  };
}

function lastChatContext() {
  const calls = ai.chatGuide.mock.calls;
  return calls[calls.length - 1]?.[0].context;
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/ai", aiRouter);
  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error instanceof ZodError ? 400 : (error.status ?? 500)).json({ error: error.message });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe("POST /ai/chat personas", () => {
  it.each(PERSONAL)("keeps personal chat for %s", async (actor) => {
    const res = await postJson("/chat", actor, { message: "Where is my driver?" });
    expect(res.status).toBe(200);
    expect(res.json.reply.content).toBe("Synthetic chat reply");
    expect(ai.chatGuide).toHaveBeenCalledTimes(1);
  });

  it.each(["Saud", "Noura", "Saif & Munirah"])("allows the %s persona for a guest", async (persona) => {
    expect((await postJson("/chat", "GUEST", { message: "Hello", persona })).status).toBe(200);
  });

  it.each(
    PERSONAL.flatMap((actor) => [
      [actor, "Ops Manager"],
      [actor, "Supply Chain AI"]
    ])
  )("denies %s the %s persona before the AI call", async (actor, persona) => {
    const res = await postJson("/chat", actor as Actor, { message: "Vault status", persona });
    expect(res.status).toBe(403);
    expect(ai.chatGuide).not.toHaveBeenCalled();
  });

  it.each(["SA", "LM", "ORG"] as Actor[])("allows %s operational personas", async (actor) => {
    expect((await postJson("/chat", actor, { message: "Vault", persona: "Ops Manager" })).status).toBe(200);
    expect((await postJson("/chat", actor, { message: "Bids", persona: "Supply Chain AI" })).status).toBe(200);
  });
});

describe("POST /ai/chat context", () => {
  it("strips operational aggregates from a guest's context", async () => {
    const res = await postJson("/chat", "GUEST", { message: "Hi", context: briefing(null) });
    expect(res.status).toBe(200);
    expect(lastChatContext()).toBeUndefined();
  });

  it("forwards only a guest's own validated references", async () => {
    const res = await postJson("/chat", "GUEST", {
      message: "My rider",
      context: { eventId: "evt_own", guest: { id: "gst_own" }, finance: { marginPercent: 11 } }
    });
    expect(res.status).toBe(200);
    expect(lastChatContext()).toEqual({ eventId: "evt_own", guestIds: ["gst_own"] });
  });

  it.each([
    ["another guest", { guest: { id: "gst_other" } }],
    ["another event", { eventId: "evt_other" }],
    ["another guest's task", { taskId: "tsk_other" }],
    ["a driver not assigned to them", { driverId: "drv_other" }],
    ["a spoofed nested task", { event: { id: "evt_own" }, recentEvents: [{ payload: { taskId: "tsk_other" } }] }],
    ["a spoofed ID list", { guestIds: ["gst_own", "gst_other"] }]
  ])("denies a guest context that references %s", async (_label, context) => {
    const res = await postJson("/chat", "GUEST", { message: "Hi", context });
    expect(res.status).toBe(403);
    expect(ai.chatGuide).not.toHaveBeenCalled();
  });

  it("gives a guest's demo marker no privilege", async () => {
    const stripped = await postJson("/chat", "GUEST", { message: "Hi", context: briefing(null, { demo: true }) });
    expect(stripped.status).toBe(200);
    expect(lastChatContext()).toBeUndefined();

    const spoofed = await postJson("/chat", "GUEST", { message: "Hi", context: { demo: true, guestId: "gst_other" } });
    expect(spoofed.status).toBe(403);
  });

  it("lets a driver reference its own assignment but not another driver", async () => {
    const own = await postJson("/chat", "DRIVER", {
      message: "Next pickup",
      context: { driverId: "drv_own", taskId: "tsk_own", guestId: "gst_own" }
    });
    expect(own.status).toBe(200);
    expect(lastChatContext()).toEqual({ guestIds: ["gst_own"], driverIds: ["drv_own"], taskIds: ["tsk_own"] });

    expect((await postJson("/chat", "DRIVER", { message: "x", context: { driverId: "drv_other" } })).status).toBe(403);
  });

  it("lets a supplier reference an event it is booked on, nothing else", async () => {
    expect((await postJson("/chat", "SUPPLIER", { message: "x", context: { eventId: "evt_own" } })).status).toBe(200);
    expect((await postJson("/chat", "SUPPLIER", { message: "x", context: { eventId: "evt_other" } })).status).toBe(403);
    expect((await postJson("/chat", "SUPPLIER", { message: "x", context: { guestId: "gst_own" } })).status).toBe(403);
  });

  it("lets a company organizer reference an owned or intake-linked existing event", async () => {
    for (const eventId of ["evt_company", "evt_company_owned"]) {
      const res = await postJson("/chat", "COMPANY", { message: "x", context: { eventId } });
      expect(res.status).toBe(200);
      expect(lastChatContext()).toEqual({ eventId });
    }
  });

  it("denies a company organizer whose own intake points to a missing event", async () => {
    const res = await postJson("/chat", "COMPANY", { message: "x", context: { eventId: "evt_deleted" } });
    expect(res.status).toBe(403);
    expect(ai.chatGuide).not.toHaveBeenCalled();
  });

  it("fails closed for coordinator references", async () => {
    expect((await postJson("/chat", "COORDINATOR", { message: "x", context: { eventId: "evt_own" } })).status).toBe(403);
    expect(ai.chatGuide).not.toHaveBeenCalled();
  });

  it("passes an operator's validated briefing context through unchanged", async () => {
    const context = briefing("evt_own", {
      recentEvents: [{ name: "geofence:transition", payload: { driverId: "drv_own" } }]
    });
    const res = await postJson("/chat", "ORG", { message: "Brief me", persona: "Ops Manager", context });
    expect(res.status).toBe(200);
    expect(lastChatContext()).toEqual(context);
  });

  it.each([
    ["another organizer's event", briefing("evt_other")],
    ["a foreign guest under its own event", briefing("evt_own", { guest: { id: "gst_other" } })],
    ["a foreign driver in recent events", briefing("evt_own", { recentEvents: [{ payload: { driverId: "drv_other" } }] })],
    ["records without a selected event", { driverId: "drv_own" }],
    ["two different events", { eventId: "evt_own", event: { id: "evt_other" } }]
  ])("denies an organizer context with %s", async (_label, context) => {
    const res = await postJson("/chat", "ORG", { message: "Brief", persona: "Ops Manager", context });
    expect(res.status).toBe(403);
    expect(ai.chatGuide).not.toHaveBeenCalled();
  });

  it("requires LM references to exist and match the selected event", async () => {
    expect((await postJson("/chat", "LM", { message: "x", context: briefing("evt_missing") })).status).toBe(403);
    expect(
      (await postJson("/chat", "LM", { message: "x", context: briefing("evt_own", { task: { id: "tsk_other" } }) })).status
    ).toBe(403);
    expect((await postJson("/chat", "LM", { message: "x", context: { driverId: "drv_other" } })).status).toBe(200);
  });

  it("replaces an operator's demo context with the server's synthetic context", async () => {
    const res = await postJson("/chat", "LM", {
      message: "Brief",
      persona: "Ops Manager",
      context: briefing("evt_missing", { demo: true, guest: { id: "gst_other" } })
    });
    expect(res.status).toBe(200);
    expect(lastChatContext()).toEqual({
      demo: true,
      note: "Scripted showcase simulation. All figures are synthetic."
    });
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects context too deeply nested to inspect", async () => {
    let context: Record<string, unknown> = { guestId: "gst_other" };
    for (let i = 0; i < 12; i += 1) context = { nested: context };
    const res = await postJson("/chat", "LM", { message: "x", context });
    expect(res.status).toBe(400);
    expect(ai.chatGuide).not.toHaveBeenCalled();
  });
});

describe("POST /ai/chat/stream", () => {
  it("streams a guest's personal chat with a minimized context", async () => {
    const res = await post("/chat/stream", "GUEST", {
      message: "Where is my driver?",
      persona: "Saif & Munirah",
      context: briefing(null)
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const frames = (await res.text()).split("\n\n").filter(Boolean);
    expect(frames[0]).toMatch(/^event: meta\ndata: /);
    expect(frames[frames.length - 1]).toMatch(/^event: done\ndata: /);
    expect(ai.streamChatCompletion.mock.calls[0][0].context).toBeUndefined();
  });

  it("streams the War Room demo briefing for an operator with synthetic context", async () => {
    const res = await post("/chat/stream", "ORG", {
      message: "Situation briefing",
      persona: "Noura",
      context: briefing("evt_demo_synthetic", { demo: true })
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.text();
    expect(ai.streamChatCompletion.mock.calls[0][0].context).toMatchObject({ demo: true });
  });

  it.each([
    ["an operational persona for a guest", "GUEST", { message: "Vault", persona: "Ops Manager" }],
    ["a foreign event for an organizer", "ORG", { message: "x", persona: "Ops Manager", context: briefing("evt_other") }],
    ["a foreign guest for a guest", "GUEST", { message: "x", context: { guestId: "gst_other" } }]
  ])("denies %s with a JSON error before SSE headers", async (_label, actor, body) => {
    const res = await post("/chat/stream", actor as Actor, body);
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/json");
    await res.text();
    expect(ai.streamChatCompletion).not.toHaveBeenCalled();
  });
});

describe("POST /ai/assistant", () => {
  it("minimizes a guest's context and denies foreign references", async () => {
    expect((await postJson("/assistant", "GUEST", { query: "Hi", context: briefing(null) })).status).toBe(200);
    expect(ai.smartAssistant.mock.calls[0][2]).toBeUndefined();

    expect((await postJson("/assistant", "GUEST", { query: "Hi", context: { guestId: "gst_other" } })).status).toBe(403);
    expect(ai.smartAssistant).toHaveBeenCalledTimes(1);
  });
});

describe("POST /ai/execute-action", () => {
  it.each(["SA", "LM", "ORG"] as Actor[])("lets %s run known operational actions", async (actor) => {
    expect((await postJson("/execute-action", actor, { actionId: "divert_fleet" })).status).toBe(200);
    expect((await postJson("/execute-action", actor, { actionId: "send_vendor_sms" })).status).toBe(200);
  });

  it("rejects unknown actions for every role", async () => {
    expect((await postJson("/execute-action", "LM", { actionId: "wire_funds" })).status).toBe(400);
    expect((await postJson("/execute-action", "GUEST", { actionId: "wire_funds" })).status).toBe(400);
    expect(ai.executeSmartAction).not.toHaveBeenCalled();
  });

  it.each(
    PERSONAL.flatMap((actor) =>
      ["divert_fleet", "command_center_divert_vans", "send_vendor_sms", "confirm_dispatch_staff"].map((id) => [actor, id])
    )
  )("denies %s the operational action %s", async (actor, actionId) => {
    const res = await postJson("/execute-action", actor as Actor, { actionId });
    expect(res.status).toBe(403);
    expect(ai.executeSmartAction).not.toHaveBeenCalled();
  });

  it.each(["notify_butler", "reserve_dining", "track_driver"])("keeps the personal action %s for a guest", async (actionId) => {
    expect((await postJson("/execute-action", "GUEST", { actionId })).status).toBe(200);
  });

  it("ignores role claims in params and forwards only validated references", async () => {
    const res = await postJson("/execute-action", "GUEST", {
      actionId: "notify_butler",
      params: { guestId: "gst_own", role: "SUPER_ADMIN", persona: "Ops Manager" }
    });
    expect(res.status).toBe(200);
    expect(ai.executeSmartAction).toHaveBeenCalledWith("notify_butler", { guestIds: ["gst_own"] });

    expect(
      (await postJson("/execute-action", "GUEST", { actionId: "track_driver", params: { driverId: "drv_other" } })).status
    ).toBe(403);
    expect(ai.executeSmartAction).toHaveBeenCalledTimes(1);
  });
});

describe("POST /ai/verify-document", () => {
  it.each(["GUEST", "SUPPLIER", "LM"] as Actor[])("checks %s's own submitted text", async (actor) => {
    const res = await postJson("/verify-document", actor, { fileName: "synthetic.pdf", content: "Synthetic" });
    expect(res.status).toBe(200);
    expect(ai.verifyDocument).toHaveBeenCalledWith({ fileName: "synthetic.pdf", content: "Synthetic" });
  });
});

describe("POST /ai/command-center/insights", () => {
  it.each(["SA", "LM", "ORG"] as Actor[])("allows %s", async (actor) => {
    expect((await postJson("/command-center/insights", actor, {})).status).toBe(200);
  });

  it.each(PERSONAL)("denies %s before the service", async (actor) => {
    expect((await postJson("/command-center/insights", actor, {})).status).toBe(403);
    expect(ai.getCommandCenterInsights).not.toHaveBeenCalled();
  });

  it("validates references and discards unrecognized context", async () => {
    expect((await postJson("/command-center/insights", "ORG", { eventId: "evt_other" })).status).toBe(403);
    expect(
      (await postJson("/command-center/insights", "LM", { eventId: "evt_own", finance: { bids: [1, 2] } })).status
    ).toBe(200);
    expect(ai.getCommandCenterInsights).toHaveBeenCalledWith({ eventId: "evt_own" });
  });
});

describe("POST /ai/post-event-report", () => {
  it.each([
    ["LM", "evt_other"],
    ["SA", "evt_own"],
    ["ORG", "evt_own"],
    ["COMPANY", "evt_company"],
    ["COMPANY", "evt_company_owned"]
  ] as Array<[Actor, string]>)("lets %s report on accessible event %s", async (actor, eventId) => {
    const res = await postJson("/post-event-report", actor, { eventId });
    expect(res.status).toBe(200);
    expect(ai.generatePostEventReport).toHaveBeenCalledWith({ eventId });
  });

  it.each([
    ["ORG", "evt_other"],
    ["COMPANY", "evt_own"],
    ["COMPANY", "evt_deleted"],
    ["LM", "evt_missing"]
  ] as Array<[Actor, string]>)("denies %s a report on %s", async (actor, eventId) => {
    expect((await postJson("/post-event-report", actor, { eventId })).status).toBe(403);
    expect(ai.generatePostEventReport).not.toHaveBeenCalled();
  });

  it.each(["GUEST", "DRIVER", "SUPPLIER", "COORDINATOR"] as Actor[])("denies %s reporting", async (actor) => {
    expect((await postJson("/post-event-report", actor, { eventId: "evt_own" })).status).toBe(403);
    expect(ai.generatePostEventReport).not.toHaveBeenCalled();
  });

  it("requires an explicit eventId", async () => {
    expect((await postJson("/post-event-report", "LM", {})).status).toBe(400);
    expect(ai.generatePostEventReport).not.toHaveBeenCalled();
  });
});

describe("POST /ai/plan-event and /ai/analyze-suppliers", () => {
  const brief = { eventBrief: "Synthetic three-day summit brief" };

  it.each(["SA", "LM", "ORG", "COMPANY"] as Actor[])("lets %s plan from its own brief", async (actor) => {
    expect((await postJson("/plan-event", actor, brief)).status).toBe(200);
  });

  it.each(["GUEST", "DRIVER", "SUPPLIER", "COORDINATOR"] as Actor[])("denies %s planning", async (actor) => {
    expect((await postJson("/plan-event", actor, brief)).status).toBe(403);
    expect(ai.planEvent).not.toHaveBeenCalled();
  });

  it.each(["SA", "LM", "ORG"] as Actor[])("lets %s analyze suppliers", async (actor) => {
    expect((await postJson("/analyze-suppliers", actor, { offers: [] })).status).toBe(200);
  });

  it.each(PERSONAL)("denies %s supplier analysis", async (actor) => {
    expect((await postJson("/analyze-suppliers", actor, { offers: [] })).status).toBe(403);
    expect(ai.analyzeSuppliers).not.toHaveBeenCalled();
  });
});

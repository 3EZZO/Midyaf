import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MidyafData, Task, TaskHandoverEntry, TaskPerson } from "@shared/domain";
import { ApiError } from "../lib/api";
import {
  HandoverForm,
  HandoverHistory,
  MyHandoverTaskList,
  createHandoverController,
  runHandoverSubmit,
  handoverErrorMessage,
  handoverOptions,
  myHandoverTasks,
  validateHandoverDraft
} from "./TaskHandover";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));

/** OPS-COLLAB-001 handover UI helpers and views (react-dom/server, no DOM). */

const task = (overrides: Partial<Task> = {}): Task =>
  ({
    id: "tsk_1",
    eventId: "evt_1",
    type: "AIRPORT_PICKUP",
    status: "ASSIGNED",
    pickupLocation: "Synthetic airport",
    dropoffLocation: "Synthetic hotel",
    scheduledAt: "2026-11-02T06:00:00.000Z",
    responsibleUserId: null,
    delegateUserId: null,
    ...overrides
  }) as Task;

const coord = { id: "usr_coord", name: "Synthetic Coordinator", role: "COORDINATOR" as const };
const lm = { id: "usr_lm", name: "Synthetic Manager", role: "LOGISTICS_MANAGER" as const };

describe("handoverOptions", () => {
  it("mirrors the server rules", () => {
    expect(handoverOptions(task(), { id: "usr_lm", role: "LOGISTICS_MANAGER" })).toMatchObject({
      modes: ["DELEGATE", "TRANSFER"],
      canReturn: false
    });
    expect(handoverOptions(task(), { id: "usr_coord", role: "COORDINATOR" }).modes).toEqual([]);
    const delegated = task({ responsibleUserId: "usr_lm", delegateUserId: "usr_coord" });
    expect(handoverOptions(delegated, { id: "usr_coord", role: "COORDINATOR" })).toMatchObject({
      modes: ["DELEGATE"],
      canReturn: true
    });
    expect(handoverOptions(task(), { id: "usr_org", role: "ORGANIZER" }, "usr_org").modes).toHaveLength(2);
    expect(handoverOptions(task(), { id: "usr_org", role: "ORGANIZER" }, "usr_other").modes).toHaveLength(0);
    expect(handoverOptions(task({ status: "COMPLETED" }), { id: "usr_lm", role: "LOGISTICS_MANAGER" })).toMatchObject({
      modes: [],
      closed: true
    });
    expect(handoverOptions(task(), { id: "usr_guest", role: "GUEST" }).modes).toEqual([]);
  });
});

describe("HandoverForm", () => {
  it("offers the allowed modes and eligible people, with return when delegated", () => {
    const html = renderToStaticMarkup(
      <HandoverForm
        task={task({
          responsibleUserId: "usr_lm",
          delegateUserId: "usr_coord",
          responsibleUser: lm,
          delegateUser: coord
        })}
        draft={{ mode: "DELEGATE", toUserId: "", reason: "" }}
        candidates={[lm, coord]}
        modes={["DELEGATE", "TRANSFER"]}
        canReturn
        pending={false}
        error={null}
        isArabic={false}
        onChange={() => {}}
        onSubmit={() => {}}
        onReturn={() => {}}
      />
    );
    expect(html).toContain("Responsible: Synthetic Manager");
    expect(html).toContain("Delegated to: Synthetic Coordinator");
    expect(html).toContain("Delegate task");
    expect(html).toContain("Transfer");
    expect(html).toContain("Return to responsible");
    // The current delegate is not offered again as a delegate.
    expect(html).toContain("Synthetic Manager · Logistics manager");
    expect(html).not.toContain("Synthetic Coordinator · Coordinator");
  });

  it("explains when no handover is possible, in Arabic too", () => {
    const html = renderToStaticMarkup(
      <HandoverForm
        task={task()}
        draft={{ mode: "DELEGATE", toUserId: "", reason: "" }}
        candidates={[]}
        modes={[]}
        canReturn={false}
        pending={false}
        error={null}
        isArabic
        onChange={() => {}}
        onSubmit={() => {}}
        onReturn={() => {}}
      />
    );
    expect(html).toContain("لا يمكنك تفويض هذه المهمة أو نقلها");
  });
});

describe("history and my tasks", () => {
  it("renders the handover history newest first as given", () => {
    const html = renderToStaticMarkup(
      <HandoverHistory
        isArabic={false}
        entries={[
          { id: "h2", kind: "RETURN", createdAt: "2026-10-11T09:00:00.000Z", fromUser: coord, toUser: lm, actor: coord, reason: null },
          { id: "h1", kind: "DELEGATE", createdAt: "2026-10-11T08:00:00.000Z", fromUser: lm, toUser: coord, actor: lm, reason: "Cover" }
        ]}
      />
    );
    expect(html.indexOf("Returned")).toBeLessThan(html.indexOf("Delegated"));
    expect(html).toContain("By Synthetic Manager · Cover");
    expect(renderToStaticMarkup(<HandoverHistory isArabic={false} entries={[]} />)).toContain("not been handed over");
  });

  it("finds open tasks the user is responsible for or acting on", () => {
    const data = {
      events: [
        {
          id: "evt_1",
          organizerId: "usr_org",
          tasks: [
            task({ id: "a", responsibleUserId: "usr_coord" }),
            task({ id: "b", delegateUserId: "usr_coord", responsibleUserId: "usr_lm" }),
            task({ id: "c", responsibleUserId: "usr_lm" }),
            task({ id: "d", responsibleUserId: "usr_coord", status: "COMPLETED" })
          ]
        }
      ]
    } as unknown as MidyafData;
    const mine = myHandoverTasks(data, "usr_coord");
    expect(mine.map((item) => item.task.id)).toEqual(["a", "b"]);
    expect(mine[0].organizerId).toBe("usr_org");

    const html = renderToStaticMarkup(
      <MyHandoverTaskList items={mine} me="usr_coord" isArabic={false} onOpen={() => {}} />
    );
    expect(html).toContain("You are responsible");
    expect(html).toContain("Delegated to you");
    expect(renderToStaticMarkup(<MyHandoverTaskList items={[]} me="x" isArabic={false} onOpen={() => {}} />)).toContain(
      "No tasks are handed to you"
    );
  });

  it("offers organizers nothing on another organizer's event", () => {
    const stored = task({ responsibleUserId: "usr_org" });
    expect(handoverOptions(stored, { id: "usr_org", role: "ORGANIZER" }, "usr_other")).toMatchObject({
      modes: [],
      canReturn: false
    });
  });

  it("validates drafts and explains refusals", () => {
    expect(validateHandoverDraft({ mode: "DELEGATE", toUserId: "", reason: "" }, false)).toMatch(/Choose/);
    expect(validateHandoverDraft({ mode: "DELEGATE", toUserId: "u", reason: "x".repeat(501) }, false)).toMatch(/500/);
    expect(validateHandoverDraft({ mode: "TRANSFER", toUserId: "u", reason: "" }, false)).toBeNull();
    expect(handoverErrorMessage(new ApiError("x", 409), false)).toMatch(/changed/);
    expect(handoverErrorMessage(new ApiError("x", 403), true)).toBe("لا تملك صلاحية تسليم هذه المهمة");
  });
});

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function handoverHarness() {
  const people = new Map<string, Deferred<TaskPerson[]>>();
  const logs = new Map<string, Deferred<TaskHandoverEntry[]>>();
  const submits: Array<Deferred<void>> = [];
  const loaded: string[] = [];
  let failures = 0;
  const controller = createHandoverController(
    {
      candidates: (eventId) => {
        const call = deferred<TaskPerson[]>();
        people.set(eventId, call);
        return call.promise;
      },
      history: (taskId) => {
        const call = deferred<TaskHandoverEntry[]>();
        logs.set(taskId, call);
        return call.promise;
      },
      submit: () => {
        const call = deferred<void>();
        submits.push(call);
        return call.promise;
      }
    },
    {
      loaded: (candidates) => loaded.push(candidates.map((person) => person.id).join(",")),
      failed: () => {
        failures += 1;
      }
    }
  );
  return { controller, people, logs, submits, loaded, failures: () => failures };
}

describe("createHandoverController", () => {
  it("shows people and history only for the task the dialog is open for", async () => {
    const { controller, people, logs, loaded, failures } = handoverHarness();
    const openA = controller.open({ id: "tsk_a", eventId: "evt_a" });
    const openB = controller.open({ id: "tsk_b", eventId: "evt_b" });
    people.get("evt_b")!.resolve([lm]);
    logs.get("tsk_b")!.resolve([]);
    await openB;
    people.get("evt_a")!.resolve([coord]);
    logs.get("tsk_a")!.reject(new Error("late failure"));
    await openA;
    expect(loaded).toEqual(["usr_lm"]);
    expect(failures()).toBe(0);
  });

  it("ignores loads that finish after the dialog closed or the session ended", async () => {
    const { controller, people, logs, loaded } = handoverHarness();
    const opening = controller.open({ id: "tsk_a", eventId: "evt_a" });
    controller.close();
    people.get("evt_a")!.resolve([lm]);
    logs.get("tsk_a")!.resolve([]);
    await opening;
    expect(loaded).toEqual([]);
  });

  it("reports whether a submission still belongs to the open dialog", async () => {
    const { controller, submits } = handoverHarness();
    void controller.open({ id: "tsk_a", eventId: "evt_a" });
    const first = controller.submit("/tasks/tsk_a/handover", {});
    submits[0].resolve();
    expect(await first).toEqual({ ok: true, current: true });

    const moved = controller.submit("/tasks/tsk_a/handover", {});
    void controller.open({ id: "tsk_b", eventId: "evt_b" });
    submits[1].reject(new ApiError("x", 409));
    expect(await moved).toMatchObject({ ok: false, current: false });
  });
});

describe("handover submit effects used by the dialog", () => {
  it("discards stale success, refresh and pending effects after a task switch or close", async () => {
    for (const invalidate of ["switch", "close"]) {
      const {controller,submits}=handoverHarness();
      void controller.open({id:"tsk_a",eventId:"evt_a"});
      const effects:string[]=[];
      const pending=runHandoverSubmit(controller,"/tasks/tsk_a/handover",{}, {
        succeeded:()=>effects.push("success"),failed:()=>effects.push("failure"),settled:()=>effects.push("settled"),refresh:()=>{effects.push("refresh");}
      });
      if(invalidate==="switch")void controller.open({id:"tsk_b",eventId:"evt_b"});else controller.close();
      submits[0].resolve();await pending;expect(effects).toEqual([]);
    }
  });
  it("settles the current dialog before refresh and never paints after a late refresh", async () => {
    const {controller,submits}=handoverHarness();void controller.open({id:"tsk_a",eventId:"evt_a"});
    const refresh=deferred<void>(),effects:string[]=[];
    const pending=runHandoverSubmit(controller,"/tasks/tsk_a/handover",{}, {
      succeeded:()=>effects.push("success"),failed:()=>effects.push("failure"),settled:()=>effects.push("settled"),refresh:()=>{effects.push("refresh");return refresh.promise;}
    });submits[0].resolve();await Promise.resolve();await Promise.resolve();
    expect(effects).toEqual(["success","settled","refresh"]);controller.close();refresh.resolve();await pending;
    expect(effects).toEqual(["success","settled","refresh"]);
  });
});

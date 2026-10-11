import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupplierSubmissionsView as View } from "@shared/domain";
import { ApiError } from "../lib/api";
import {
  SupplierSubmissionsView,
  createSubmissionsController,
  rejectErrorMessage,
  type SubmissionsState
} from "./SupplierSubmissions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));

/** SUPPLIER-001 logistics review panel: origin/status/notes, never prices. */

const value: View = {
  intakeId: "int_demo",
  policyPending: true,
  sealedCount: 1,
  submissions: [
    {
      quoteId: "q1",
      source: "SUPPLIER_PORTAL",
      supplier: { id: "sup_1", name: "Synthetic Hotel Supplier", category: "HOTEL" },
      intakeId: "int_demo",
      category: "HOTEL",
      item: "Synthetic supplier hotel offer",
      quantity: 15,
      status: "RECEIVED",
      submittedAt: "2026-10-11T08:00:00.000Z",
      sealed: true,
      policyPending: true
    }
  ],
  notes: [
    {
      id: "n1",
      supplier: { id: "sup_1", name: "Synthetic Hotel Supplier" },
      author: { id: "u1", name: "Synthetic supplier user" },
      text: "Synthetic recommendation",
      createdAt: "2026-10-11T08:00:00.000Z"
    }
  ]
};

function render(state: SubmissionsState, canManage = true, isArabic = false) {
  return renderToStaticMarkup(
    <SupplierSubmissionsView
      state={state}
      isArabic={isArabic}
      canManage={canManage}
      onRetry={() => {}}
      onReject={async () => null}
    />
  );
}

describe("SupplierSubmissionsView", () => {
  it("shows origin, item, quantity, sealed price, status and notes", () => {
    const html = render({ status: "ready", value });
    expect(html).toContain("Synthetic Hotel Supplier");
    expect(html).toContain("Synthetic supplier hotel offer");
    expect(html).toContain("Qty 15");
    expect(html).toContain("Price sealed");
    expect(html).toContain("Received, under review");
    expect(html).toContain("Synthetic recommendation");
    expect(html).toContain("Sealed submissions: 1");
    expect(html).toContain("D-011");
    expect(html).toContain("Not included in the legacy quote totals");
    expect(html).not.toMatch(/SAR \d|18,000|1,200/);
  });

  it("offers rejection only to managers and only for received submissions", () => {
    expect(render({ status: "ready", value })).toContain("Reject submission");
    expect(render({ status: "ready", value }, false)).not.toContain("Reject submission");
    const rejected = {
      ...value,
      submissions: [{ ...value.submissions[0], status: "REJECTED" as const }]
    };
    const html = render({ status: "ready", value: rejected });
    expect(html).not.toContain("Reject submission");
    expect(html).toContain("Not selected");
  });

  it("has honest loading, error, empty and Arabic states", () => {
    expect(render({ status: "loading" })).toContain("Loading supplier submissions");
    expect(render({ status: "error", message: "Supplier submissions could not be loaded." })).toContain("Retry");
    expect(render({ status: "ready", value: { ...value, sealedCount: 0, submissions: [], notes: [] } })).toContain(
      "No supplier has submitted through the portal yet"
    );
    expect(render({ status: "ready", value }, true, true)).toContain("عروض بوابة الموردين");
  });

  it("explains conflicts truthfully", () => {
    expect(rejectErrorMessage(new ApiError("x", 409), false)).toMatch(/changed/);
    expect(rejectErrorMessage(new ApiError("x", 500), false)).toMatch(/could not be saved/);
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

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function submissionsHarness() {
  const loads: Array<{ intakeId: string; call: Deferred<View> }> = [];
  const rejects: Array<Deferred<void>> = [];
  const painted: string[] = [];
  let failures = 0;
  const controller = createSubmissionsController(
    {
      load: (intakeId) => {
        const call = deferred<View>();
        loads.push({ intakeId, call });
        return call.promise;
      },
      reject: () => {
        const call = deferred<void>();
        rejects.push(call);
        return call.promise;
      }
    },
    {
      ready: (view) => painted.push(view.intakeId),
      failed: () => {
        failures += 1;
      }
    }
  );
  return { controller, loads, rejects, painted, failures: () => failures };
}

describe("createSubmissionsController", () => {
  it("never paints an earlier intake's result under a newer intake", async () => {
    const { controller, loads, painted } = submissionsHarness();
    controller.open("int_a");
    const loadA = controller.load();
    controller.open("int_b");
    const loadB = controller.load();
    loads[1].call.resolve({ ...value, intakeId: "int_b" });
    await loadB;
    loads[0].call.resolve({ ...value, intakeId: "int_a" });
    await loadA;
    expect(loads.map((entry) => entry.intakeId)).toEqual(["int_a", "int_b"]);
    expect(painted).toEqual(["int_b"]);
  });

  it("keeps the latest load of the same intake when replies arrive in reverse", async () => {
    const { controller, loads, painted, failures } = submissionsHarness();
    controller.open("int_a");
    const older = controller.load();
    const newer = controller.load();
    loads[1].call.resolve({ ...value, intakeId: "int_a", sealedCount: 2 });
    await newer;
    loads[0].call.reject(new Error("late failure"));
    await older;
    expect(painted).toEqual(["int_a"]);
    expect(failures()).toBe(0);
  });

  it("ignores results after logout or unmount", async () => {
    const { controller, loads, painted } = submissionsHarness();
    controller.open("int_a");
    const pending = controller.load();
    controller.close();
    loads[0].call.resolve(value);
    await pending;
    expect(painted).toEqual([]);
    await controller.load();
    expect(loads).toHaveLength(1);
  });

  it("refreshes after a rejection only on the intake it was made for", async () => {
    const { controller, loads, rejects, painted } = submissionsHarness();
    controller.open("int_a");
    const rejecting = controller.reject("q1", "");
    controller.open("int_b");
    rejects[0].resolve();
    await rejecting;
    expect(loads).toHaveLength(0);

    const again = controller.reject("q2", "");
    rejects[1].reject(new ApiError("x", 409));
    await flush();
    // A failed rejection still refreshes the same intake, then reports.
    expect(loads.map((entry) => entry.intakeId)).toEqual(["int_b"]);
    loads[0].call.resolve({ ...value, intakeId: "int_b" });
    await expect(again).rejects.toMatchObject({ status: 409 });
    expect(painted).toEqual(["int_b"]);
  });
});

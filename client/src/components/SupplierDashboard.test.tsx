import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupplierRequestView } from "@shared/domain";
import { ApiError } from "../lib/api";
import {
  SupplierWorkspaceView,
  createWorkspaceController,
  estimateLabel,
  quoteStatusLabel,
  sar,
  supplierErrorMessage,
  validateQuoteDraft,
  type SupplierWorkspace,
  type WorkspaceState
} from "./SupplierDashboard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));

/**
 * SUPPLIER-001 supplier workspace: truthful loading/error/unlinked states,
 * bilingual content, the estimate label and client-side quote validation.
 * No DOM environment exists, so views render with react-dom/server.
 */

const request: SupplierRequestView = {
  intakeId: "int_demo",
  reference: "REQ-1A2B3C4D",
  eventCode: "DEMO-SUMMIT-01",
  category: "HOTEL",
  scope: "HOTEL_ROOMS",
  estimatedQuantity: 15,
  unit: "ROOM",
  isEstimate: true,
  status: "QUOTING",
  currency: "SAR",
  eventDate: "2026-11-02T06:00:00.000Z",
  timezone: "Asia/Riyadh",
  ownQuote: null,
  notes: [{ id: "n1", text: "Synthetic recommendation", createdAt: "2026-10-11T08:00:00.000Z" }]
};

const workspace: SupplierWorkspace = {
  dashboard: {
    linked: true,
    profile: {
      id: "sup_1",
      name: "Synthetic Hotel Supplier",
      category: "HOTEL",
      verified: true,
      city: { code: "riyadh", nameEn: "Riyadh", nameAr: "الرياض" }
    },
    services: [
      { id: "s1", name: "Executive suite", description: null, unit: "night", available: true, listedPrice: "950.00" }
    ],
    bookings: [
      {
        id: "b1",
        serviceName: "Executive suite",
        serviceUnit: "night",
        quantity: 3,
        totalPrice: "2850.00",
        status: "CONFIRMED",
        event: { reference: "DEMO-SUMMIT-01", date: "2026-11-02T06:00:00.000Z", currency: "SAR", timezone: "Asia/Riyadh" }
      }
    ]
  },
  requests: [request],
  quotes: []
};

const noop = async () => null;

function render(state: WorkspaceState, isArabic = false) {
  return renderToStaticMarkup(
    <SupplierWorkspaceView state={state} isArabic={isArabic} onRetry={() => {}} onSubmitQuote={noop} onAddNote={noop} />
  );
}

describe("SupplierWorkspaceView", () => {
  it("shows honest loading, error and unlinked states", () => {
    expect(render({ status: "loading" })).toContain("Loading your supplier workspace");
    const error = render({ status: "error", message: "Your supplier workspace could not be loaded." });
    expect(error).toContain('role="alert"');
    expect(error).toContain("Retry");
    const unlinked = render({
      status: "ready",
      value: { ...workspace, dashboard: { linked: false, profile: null, services: [], bookings: [] } }
    });
    expect(unlinked).toContain("No supplier profile is linked to this account");
    expect(unlinked).not.toContain("Submit sealed quotation");
  });

  it("renders the profile, the demo estimate, the quote form and own notes", () => {
    const html = render({ status: "ready", value: workspace });
    expect(html).toContain("Synthetic Hotel Supplier");
    expect(html).toContain("Verified supplier");
    expect(html).toContain("Hotel rooms: 15 rooms");
    expect(html).toContain("Demo estimate, not a confirmed order");
    expect(html).toContain("DEMO-SUMMIT-01");
    expect(html).toContain("Submit sealed quotation");
    expect(html).toContain("Synthetic recommendation");
    expect(html).toContain("SAR 950.00");
  });

  it("shows a submitted quote as sealed and read-only", () => {
    const html = render({
      status: "ready",
      value: {
        ...workspace,
        requests: [
          {
            ...request,
            ownQuote: {
              id: "q1",
              requestReference: "REQ-1A2B3C4D",
              intakeId: "int_demo",
              category: "HOTEL",
              item: "Synthetic supplier hotel offer",
              quantity: 15,
              unitPrice: "1200.00",
              totalPrice: "18000.00",
              currency: "SAR",
              taxInclusive: true,
              status: "RECEIVED",
              sealed: true,
              submittedAt: "2026-10-11T08:00:00.000Z"
            }
          }
        ]
      }
    });
    expect(html).toContain("Received, under review");
    expect(html).toContain("SAR 18,000.00");
    expect(html).toContain("Sealed:");
    expect(html).not.toContain("Submit sealed quotation");
  });

  it("renders Arabic copy", () => {
    const html = render({ status: "ready", value: workspace }, true);
    expect(html).toContain("مساحة المورد");
    expect(html).toContain("غرف فندقية: 15 غرفة");
    expect(html).toContain("إرسال عرض سعر مختوم");
    expect(html).toContain("950.00 ر.س");
  });
});

describe("validateQuoteDraft", () => {
  it("accepts a valid draft and computes the total in cents", () => {
    const result = validateQuoteDraft({ item: " Rooms ", quantity: "15", unitPrice: "1200" }, false);
    expect(result.value).toEqual({ item: "Rooms", quantity: 15, unitPrice: 1200 });
    expect(result.totalCents).toBe(1_800_000);
  });

  it("mirrors the server bounds", () => {
    const base = { item: "Rooms", quantity: "1", unitPrice: "1" };
    expect(validateQuoteDraft({ ...base, item: "x" }, false).errors.item).toBeTruthy();
    expect(validateQuoteDraft({ ...base, quantity: "0" }, false).errors.quantity).toBeTruthy();
    expect(validateQuoteDraft({ ...base, quantity: "1.5" }, false).errors.quantity).toBeTruthy();
    expect(validateQuoteDraft({ ...base, unitPrice: "10.555" }, false).errors.unitPrice).toBeTruthy();
    expect(validateQuoteDraft({ ...base, unitPrice: "" }, false).errors.unitPrice).toBeTruthy();
    expect(
      validateQuoteDraft({ item: "Rooms", quantity: "1000000", unitPrice: "9999999.99" }, false).errors.quantity
    ).toMatch(/maximum/);
  });
});

describe("labels and errors", () => {
  it("formats amounts and statuses in both languages", () => {
    expect(sar("18000", false)).toBe("SAR 18,000.00");
    expect(sar("18000", true)).toBe("18,000.00 ر.س");
    expect(quoteStatusLabel("REJECTED", false)).toBe("Not selected");
    expect(quoteStatusLabel("REJECTED", true)).toBe("لم يتم اختياره");
    expect(estimateLabel({ scope: "VEHICLES", estimatedQuantity: 9 }, false)).toBe("9 vehicles");
  });

  it("maps server statuses to truthful messages", () => {
    expect(supplierErrorMessage(new ApiError("x", 409), false)).toMatch(/already submitted/);
    expect(supplierErrorMessage(new ApiError("x", 404), false)).toMatch(/no longer open/);
    expect(supplierErrorMessage(new ApiError("x", 422), false)).toMatch(/maximum/);
    expect(supplierErrorMessage(new Error("offline"), true)).toBe("حدث خطأ. حاول مجدداً.");
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

function workspaceHarness() {
  const loads: Array<Deferred<SupplierWorkspace>> = [];
  const painted: number[] = [];
  let failures = 0;
  const controller = createWorkspaceController(
    {
      load: () => {
        const call = deferred<SupplierWorkspace>();
        loads.push(call);
        return call.promise;
      }
    },
    {
      ready: (value) => painted.push(value.quotes.length),
      failed: () => {
        failures += 1;
      }
    }
  );
  return { controller, loads, painted, failures: () => failures };
}

describe("createWorkspaceController", () => {
  it("keeps the latest load when replies arrive in reverse order", async () => {
    const { controller, loads, painted, failures } = workspaceHarness();
    const older = controller.load();
    const newer = controller.load();
    loads[1].resolve({ ...workspace, quotes: [] });
    await newer;
    loads[0].reject(new Error("late failure"));
    await older;
    expect(painted).toEqual([0]);
    expect(failures()).toBe(0);
  });

  it("drops results and skips refreshes after logout or unmount", async () => {
    const { controller, loads, painted } = workspaceHarness();
    const pending = controller.load();
    const sent = deferred<void>();
    const mutation = controller.mutate(() => sent.promise, true);
    controller.reset();
    loads[0].resolve(workspace);
    sent.resolve();
    await Promise.all([pending, mutation]);
    expect(painted).toEqual([]);
    expect(loads).toHaveLength(1);
  });

  it("refreshes the same session after a mutation, and after a failed quote", async () => {
    const { controller, loads, painted } = workspaceHarness();
    const ok = controller.mutate(async () => undefined, false);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    loads[0].resolve(workspace);
    await ok;
    expect(painted).toEqual([workspace.quotes.length]);

    const failing = controller.mutate(async () => {
      throw new ApiError("x", 409);
    }, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loads).toHaveLength(2);
    loads[1].resolve(workspace);
    await expect(failing).rejects.toMatchObject({ status: 409 });

    const noteFailure = controller.mutate(async () => {
      throw new ApiError("x", 404);
    }, false);
    await expect(noteFailure).rejects.toMatchObject({ status: 404 });
    expect(loads).toHaveLength(2);
  });
});

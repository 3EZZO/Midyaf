import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  AdminSupplierDirectoryResponse,
  AdminSupplierQuoteView,
  AdminSupplierWorkspaceView as AdminSupplierWorkspaceDto
} from "@shared/domain";
import { ApiError } from "../lib/api";
import {
  AdminSupplierWorkspaceView,
  adminSupplierErrorMessage,
  createAdminSupplierController,
  type AdminWorkspaceState,
  type DirectoryState
} from "./AdminSupplierWorkspace";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));

/**
 * ADMIN-PORTALS-001 read-only Super Admin supplier workspace: directory and
 * workspace states, linked/unlinked profiles, sealed quotes without prices,
 * no forms or submit actions, both languages, and the async freshness rules.
 * No DOM environment exists, so views render with react-dom/server.
 */

const directory: AdminSupplierDirectoryResponse = {
  suppliers: [
    { id: "sup_hotel", name: "Synthetic Hotel Supplier", category: "HOTEL", accountLinked: true },
    { id: "sup_free", name: "Unlinked Hotel", category: "HOTEL", accountLinked: false }
  ],
  truncated: false
};

const sealedQuote: AdminSupplierQuoteView = {
  id: "q1",
  requestReference: "REQ-1A2B3C4D",
  intakeId: "int_demo",
  category: "HOTEL",
  item: "Synthetic supplier hotel offer",
  quantity: 15,
  currency: "SAR",
  status: "RECEIVED",
  sealed: true,
  policyPending: true,
  submittedAt: "2026-10-11T08:00:00.000Z"
};

const workspace: AdminSupplierWorkspaceDto = {
  accountLinked: true,
  profile: {
    id: "sup_hotel",
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
  ],
  requests: [
    {
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
      quote: sealedQuote,
      notes: [{ id: "n1", text: "Synthetic recommendation", createdAt: "2026-10-11T08:00:00.000Z" }]
    }
  ],
  quotes: [sealedQuote],
  policyPending: true
};

const ready: DirectoryState = { status: "ready", value: directory };

function render(dir: DirectoryState, ws: AdminWorkspaceState, isArabic = false) {
  return renderToStaticMarkup(
    <AdminSupplierWorkspaceView
      directory={dir}
      workspace={ws}
      isArabic={isArabic}
      onSelect={() => {}}
      onRetryDirectory={() => {}}
      onRetryWorkspace={() => {}}
    />
  );
}

function expectNoActions(html: string) {
  expect(html).not.toContain("<form");
  expect(html).not.toContain("<input");
  expect(html).not.toContain("<textarea");
  expect(html).not.toMatch(/Submit sealed quotation|Add note|إرسال عرض سعر مختوم|إضافة ملاحظة/);
  expect(html).not.toContain('type="submit"');
  expect(html).not.toMatch(/\bMy\b/);
}

describe("AdminSupplierWorkspaceView directory", () => {
  it("shows loading, error with retry, and empty directory states", () => {
    expect(render({ status: "loading" }, { status: "idle" })).toContain("Loading the supplier directory");
    const error = render({ status: "error", message: "The supplier directory could not be loaded." }, { status: "idle" });
    expect(error).toContain('role="alert"');
    expect(error).toContain("Retry");
    const empty = render({ status: "ready", value: { suppliers: [], truncated: false } }, { status: "idle" });
    expect(empty).toContain("No supplier profiles exist yet");
  });

  it("lists linked and unlinked profiles truthfully and marks the read-only view", () => {
    const html = render(ready, { status: "idle" });
    expect(html).toContain("Read-only administrative view");
    expect(html).toContain("You are not signed in as any supplier");
    expect(html).toContain("Synthetic Hotel Supplier");
    expect(html).toContain("Unlinked Hotel");
    expect(html).toContain("Supplier account linked");
    expect(html).toContain("No supplier account linked");
    expect(html).toContain("Choose a supplier to view its workspace");
    expect(html).not.toContain("first 100");
    expectNoActions(html);
  });

  it("says when the directory is truncated", () => {
    const html = render({ status: "ready", value: { ...directory, truncated: true } }, { status: "idle" });
    expect(html).toContain("Showing the first 100 suppliers by name.");
  });

  it("marks only the selected supplier as pressed", () => {
    const html = render(ready, { status: "loading", supplierId: "sup_free" });
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("Loading the supplier&#x27;s workspace");
  });
});

describe("AdminSupplierWorkspaceView workspace", () => {
  it("shows a workspace error with retry", () => {
    const html = render(ready, { status: "error", supplierId: "sup_hotel", message: "This supplier profile no longer exists." });
    expect(html).toContain("This supplier profile no longer exists.");
    expect(html).toContain("Retry");
  });

  it("renders profile, services, bookings, eligible demand, notes and the sealed quote without a price", () => {
    const html = render(ready, { status: "ready", supplierId: "sup_hotel", value: workspace });
    expect(html).toContain("Verified supplier");
    expect(html).toContain("Hotel rooms: 15 rooms");
    expect(html).toContain("Demo estimate, not a confirmed order");
    expect(html).toContain("Synthetic recommendation");
    expect(html).toContain("Synthetic supplier hotel offer");
    expect(html).toContain("Received, under review");
    expect(html).toContain("Sealed: the quoted price is not shown to administrators");
    expect(html).toContain("Opening policy pending");
    expect(html).toContain("Supplier quotations");
    expect(html).toContain("Supplier services");
    expect(html).toContain("Supplier bookings");
    // Listed service prices and booked totals are existing manager reads.
    expect(html).toContain("SAR 950.00");
    expect(html).toContain("SAR 2,850.00");
    expect(html).not.toMatch(/unitPrice|totalPrice|taxInclusive/);
    expectNoActions(html);
  });

  it("labels an unlinked profile and its empty collections honestly", () => {
    const html = render(ready, {
      status: "ready",
      supplierId: "sup_free",
      value: {
        ...workspace,
        accountLinked: false,
        profile: { ...workspace.profile, id: "sup_free", name: "Unlinked Hotel", verified: false, city: null },
        services: [],
        bookings: [],
        requests: [{ ...workspace.requests[0], quote: null, notes: [] }],
        quotes: []
      }
    });
    expect(html).toContain("This profile exists without a supplier sign-in account");
    expect(html).toContain("Verification pending");
    expect(html).toContain("No quotation submitted for this request");
    expect(html).toContain("No notes from this supplier");
    expect(html).toContain("This supplier has not submitted a quotation");
    expect(html).toContain("No services are listed on this profile");
    expect(html).toContain("No bookings for this supplier");
    expectNoActions(html);
  });

  it("renders Arabic copy, still read-only and sealed", () => {
    const html = render(ready, { status: "ready", supplierId: "sup_hotel", value: workspace }, true);
    expect(html).toContain("عرض إداري للقراءة فقط");
    expect(html).toContain("مساحات الموردين");
    expect(html).toContain("غرف فندقية: 15 غرفة");
    expect(html).toContain("مختوم: لا يظهر السعر المعروض للمشرفين");
    expect(html).toContain("حساب المورد مرتبط");
    expect(html).toContain("لا يوجد حساب مورد مرتبط");
    expect(html).toContain("950.00 ر.س");
    expectNoActions(html);
  });
});

describe("adminSupplierErrorMessage", () => {
  it("maps server statuses to truthful messages in both languages", () => {
    expect(adminSupplierErrorMessage(new ApiError("x", 404), false, "workspace")).toBe(
      "This supplier profile no longer exists."
    );
    expect(adminSupplierErrorMessage(new ApiError("x", 403), false, "directory")).toBe(
      "Only the super admin can open this view."
    );
    expect(adminSupplierErrorMessage(new Error("offline"), false, "directory")).toBe(
      "The supplier directory could not be loaded."
    );
    expect(adminSupplierErrorMessage(new Error("offline"), true, "workspace")).toBe("تعذر تحميل مساحة هذا المورد.");
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

function controllerHarness() {
  const directoryLoads: Array<Deferred<AdminSupplierDirectoryResponse>> = [];
  const workspaceLoads: Array<{ supplierId: string; call: Deferred<AdminSupplierWorkspaceDto> }> = [];
  const log: string[] = [];
  const controller = createAdminSupplierController(
    {
      loadDirectory: () => {
        const call = deferred<AdminSupplierDirectoryResponse>();
        directoryLoads.push(call);
        return call.promise;
      },
      loadWorkspace: (supplierId) => {
        const call = deferred<AdminSupplierWorkspaceDto>();
        workspaceLoads.push({ supplierId, call });
        return call.promise;
      }
    },
    {
      directoryLoading: () => log.push("directory:loading"),
      directoryReady: (value) => log.push(`directory:ready:${value.suppliers.length}`),
      directoryFailed: () => log.push("directory:failed"),
      workspaceLoading: (id) => log.push(`workspace:loading:${id}`),
      workspaceReady: (id, value) => log.push(`workspace:ready:${id}:${value.profile.id}`),
      workspaceFailed: (id) => log.push(`workspace:failed:${id}`)
    }
  );
  return { controller, directoryLoads, workspaceLoads, log };
}

const last = (log: string[]) => log[log.length - 1];

const workspaceFor = (id: string): AdminSupplierWorkspaceDto => ({
  ...workspace,
  profile: { ...workspace.profile, id }
});

describe("createAdminSupplierController", () => {
  it("keeps the latest directory load when replies arrive in reverse order", async () => {
    const { controller, directoryLoads, log } = controllerHarness();
    const older = controller.loadDirectory();
    const newer = controller.loadDirectory();
    directoryLoads[1].resolve(directory);
    await newer;
    directoryLoads[0].reject(new Error("late failure"));
    await older;
    expect(log).toEqual(["directory:loading", "directory:loading", "directory:ready:2"]);
  });

  it("clears the previous supplier at once and never paints a late reply for it", async () => {
    const { controller, workspaceLoads, log } = controllerHarness();
    const first = controller.select("sup_hotel");
    workspaceLoads[0].call.resolve(workspaceFor("sup_hotel"));
    await first;
    const toA = controller.select("sup_a");
    const toB = controller.select("sup_b");
    // Switching reports loading for B before any reply arrives.
    expect(log.slice(-2)).toEqual(["workspace:loading:sup_a", "workspace:loading:sup_b"]);
    workspaceLoads[2].call.resolve(workspaceFor("sup_b"));
    await toB;
    workspaceLoads[1].call.resolve(workspaceFor("sup_a"));
    await toA;
    expect(log.filter((line) => line.startsWith("workspace:ready"))).toEqual([
      "workspace:ready:sup_hotel:sup_hotel",
      "workspace:ready:sup_b:sup_b"
    ]);
    expect(controller.selection()).toBe("sup_b");
  });

  it("drops a late failure for an older selection", async () => {
    const { controller, workspaceLoads, log } = controllerHarness();
    const toA = controller.select("sup_a");
    const toB = controller.select("sup_b");
    workspaceLoads[1].call.resolve(workspaceFor("sup_b"));
    await toB;
    workspaceLoads[0].call.reject(new ApiError("x", 500));
    await toA;
    expect(log).not.toContain("workspace:failed:sup_a");
    expect(last(log)).toBe("workspace:ready:sup_b:sup_b");
  });

  it("retries the failing workspace with the current selection", async () => {
    const { controller, workspaceLoads, log } = controllerHarness();
    const failing = controller.select("sup_b");
    workspaceLoads[0].call.reject(new ApiError("x", 500));
    await failing;
    expect(last(log)).toBe("workspace:failed:sup_b");
    const retry = controller.retryWorkspace();
    expect(workspaceLoads.map((load) => load.supplierId)).toEqual(["sup_b", "sup_b"]);
    workspaceLoads[1].call.resolve(workspaceFor("sup_b"));
    await retry;
    expect(last(log)).toBe("workspace:ready:sup_b:sup_b");
  });

  it("drops every in-flight reply after logout, session change or unmount", async () => {
    const { controller, directoryLoads, workspaceLoads, log } = controllerHarness();
    const dir = controller.loadDirectory();
    const ws = controller.select("sup_hotel");
    controller.reset();
    directoryLoads[0].resolve(directory);
    workspaceLoads[0].call.resolve(workspaceFor("sup_hotel"));
    await Promise.all([dir, ws]);
    expect(log).toEqual(["directory:loading", "workspace:loading:sup_hotel"]);
    expect(controller.selection()).toBeNull();
    // After reset there is no selection to retry.
    await controller.retryWorkspace();
    expect(workspaceLoads).toHaveLength(1);
  });

  it("drops a late directory failure after reset", async () => {
    const { controller, directoryLoads, log } = controllerHarness();
    const dir = controller.loadDirectory();
    controller.reset();
    directoryLoads[0].reject(new ApiError("x", 500));
    await dir;
    expect(log).toEqual(["directory:loading"]);
  });
});

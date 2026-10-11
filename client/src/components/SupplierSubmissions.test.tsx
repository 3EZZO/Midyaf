import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupplierSubmissionsView as View } from "@shared/domain";
import { ApiError } from "../lib/api";
import { SupplierSubmissionsView, rejectErrorMessage, type SubmissionsState } from "./SupplierSubmissions";

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

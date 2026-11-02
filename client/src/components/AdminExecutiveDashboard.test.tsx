import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActivityIntake, AiLogisticsPlan, MidyafData } from "@shared/domain";
import { DEFAULT_COMPLAINTS } from "@shared/constants";

/**
 * SILA-DASHBOARD-003: Admin Executive dashboard polish. Every value comes
 * from the data passed in; the former invented contact, submitter, upcoming
 * event, estimate and default complaints are gone outside the scripted demo,
 * and each plan approval targets that activity's own plan.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));
vi.mock("./charts", () => ({ AreaTrend: () => null, EventHistogram: () => null }));
vi.mock("./OnboardingWorkspace", () => ({ OnboardingWorkspace: () => <div data-onboarding /> }));

import {
  AdminExecutiveDashboard,
  adminAttention,
  adminPlanRows,
  adminSubmitterRows,
  initialComplaints
} from "./AdminExecutiveDashboard";

const intake = (over: Partial<ActivityIntake> & { id: string }) =>
  ({
    activityName: `Activity ${over.id}`,
    activityPlace: "Synthetic hall",
    visitorCount: 30,
    vipVisitorCount: 5,
    normalVisitorCount: 25,
    status: "DRAFT",
    submittedBy: "",
    submittedAt: "",
    ...over
  }) as ActivityIntake;

const plan = (over: Partial<AiLogisticsPlan> & { id: string; intakeId: string }) =>
  ({ summary: `Plan for ${over.intakeId}`, confirmed: false, ...over }) as AiLogisticsPlan;

const emptyData = {
  events: [],
  drivers: [],
  suppliers: [],
  commission: [],
  users: [],
  activityIntakes: [],
  aiPlans: [],
  vendorQuotes: [],
  contracts: [],
  guestJourneys: [],
  coordinatorRequests: [],
  companyReports: [],
  fileAssets: [],
  notifications: [],
  auditLogs: []
} as unknown as MidyafData;

const render = (data: MidyafData = emptyData, isArabic = false, isDemoMode = false) =>
  renderToStaticMarkup(<AdminExecutiveDashboard data={data} session={null} isArabic={isArabic} isDemoMode={isDemoMode} />);

describe("admin data selectors", () => {
  it("keeps missing submitter details visibly unrecorded instead of inventing them", () => {
    const [row] = adminSubmitterRows([intake({ id: "a" })], false);
    expect(row).toMatchObject({ submittedBy: "Not recorded", organization: "Not recorded", submittedAt: "", contact: "" });
    expect(adminSubmitterRows([intake({ id: "a" })], true)[0].organization).toBe("غير مسجل");
    const [recorded] = adminSubmitterRows(
      [intake({ id: "b", submittedBy: "Synthetic submitter", organizerCompany: "Synthetic Co", submittedAt: "2026-11-01T08:00:00Z", hotelContact: "contact@example.test" })],
      false
    );
    expect(recorded).toMatchObject({ submittedBy: "Synthetic submitter", organization: "Synthetic Co", contact: "contact@example.test" });
  });

  it("matches each activity to its own plan and only offers approval of an unconfirmed own plan", () => {
    const rows = adminPlanRows(
      [intake({ id: "a" }), intake({ id: "b" }), intake({ id: "c" }), intake({ id: "d", status: "OPERATIONS_OPEN" })],
      [plan({ id: "p_b", intakeId: "b", confirmed: true }), plan({ id: "p_a", intakeId: "a" })],
      false
    );
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    expect(byId.a).toMatchObject({ planId: "p_a", canConfirm: true, status: "PENDING", summary: "Plan for a" });
    expect(byId.b).toMatchObject({ planId: "p_b", canConfirm: false, status: "APPROVED" });
    // A confirmed plan elsewhere no longer marks unrelated activities approved.
    expect(byId.c).toMatchObject({ planId: null, canConfirm: false, status: "PENDING", summary: "No plan generated for this activity yet" });
    expect(byId.d.status).toBe("APPROVED");
  });

  it("uses sample complaints only in the scripted demo", () => {
    expect(initialComplaints(false)).toEqual([]);
    expect(initialComplaints(undefined)).toEqual([]);
    expect(initialComplaints(true)).toBe(DEFAULT_COMPLAINTS);
  });

  it("groups the owner decisions from real counts", () => {
    expect(adminAttention({ pendingPlans: 2, unsignedContracts: 1, openComplaints: 0 })).toEqual([
      { tab: "plans", count: 2 },
      { tab: "vault", count: 1 },
      { tab: "complaints", count: 0 }
    ]);
  });
});

describe("AdminExecutiveDashboard", () => {
  it("renders hero, KPI row and the decision group in English with honest empty states", () => {
    const html = render();
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("Executive oversight, financials &amp; governance");
    expect(html).toContain("Needs your decision");
    expect(html.match(/data-attention="/g)).toHaveLength(3);
    expect(html).toContain("Nothing pending");
    expect(html).toContain("No activities entered yet");
    expect(html.indexOf("Executive oversight")).toBeLessThan(html.indexOf("Platform Commissions"));
  });

  it("renders Arabic right-to-left", () => {
    const html = render(emptyData, true);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("بانتظار قرارك");
    expect(html).toContain("لا شيء معلق");
  });

  it("no longer shows invented operational data outside the demo", () => {
    const data = { ...emptyData, activityIntakes: [intake({ id: "a" })] } as MidyafData;
    const html = render(data);
    for (const invented of ["+966 50 123 4567", "Sultan Al Rashed", "Sila Entertainment", "Diriyah", "450,000", "Within pricing target", DEFAULT_COMPLAINTS[0].activityName]) {
      expect(html).not.toContain(invented);
    }
    expect(html).toContain("Not recorded");
  });

  it("counts pending plans in the decision group and survives a dataset without events", () => {
    const data = {
      ...emptyData,
      activityIntakes: [intake({ id: "a" }), intake({ id: "b" })],
      aiPlans: [plan({ id: "p_a", intakeId: "a" })]
    } as MidyafData;
    const html = render(data);
    expect(html).toMatch(/aria-label="Plans awaiting approval: 2"/);
  });

  it("keeps the scripted demo labelled as such", () => {
    expect(render(emptyData, false, true)).toContain("Demo mode");
    expect(render()).not.toContain("Demo mode");
  });
});

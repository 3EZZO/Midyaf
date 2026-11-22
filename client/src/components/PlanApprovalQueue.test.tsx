import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MidyafData, Session } from "@shared/domain";
import type { PlanApprovalQueueItem, WorkspaceEventDto } from "@shared/overhaul";

const workspaceMock = vi.hoisted(() => ({
  queue: [] as PlanApprovalQueueItem[],
  events: [] as WorkspaceEventDto[]
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));
vi.mock("../lib/workspaceApi", () => ({
  useWorkspaceResource: (_token: string, path: string | null) =>
    path === "/plans/awaiting-approval"
      ? { data: { items: workspaceMock.queue } }
      : path === "/events"
        ? { data: { events: workspaceMock.events } }
        : {},
  workspaceRequest: vi.fn()
}));
vi.mock("./charts", () => ({ Funnel: () => null }));

import {
  PlanApprovalQueue,
  PlanApprovalQueueView,
  canApproveQueueItem,
  canShowApprovalQueue,
  extractPlanKeyFigures
} from "./PlanApprovalQueue";
import { ClientDashboard } from "./ClientDashboard";

const makeItem = (over: Partial<PlanApprovalQueueItem["plan"]> = {}): PlanApprovalQueueItem => ({
  event: {
    id: "evt_1",
    name: "Riyadh Hospitality Summit",
    organizationName: "Sila Events",
    startAt: "2027-02-10T09:00:00Z",
    operationalStatus: "PLANNING",
    hasApprovedPlan: false
  },
  plan: {
    id: "plan_1",
    version: 2,
    status: "DRAFT",
    source: "AI_PROVIDER",
    advisory: true,
    sourceLabel: "AI",
    summary: "18 VIP vehicles and 5-star hotel allocation ready for approval.",
    content: {
      logistics: ["Airport welcome"],
      hotelDistribution: { zone: "KAFD", vipSingleRooms: 12, regularTwinRooms: 20 },
      vehicleRequirements: { vip: 12, shuttle: 5 },
      teamRequirements: [{ subteam: "AIRPORT", minimumPeople: 4 }],
      scopeOfWork: ["VIP airport transfers"]
    },
    generatedBy: { id: "u1", name: "Planner" },
    approvedBy: null,
    approvedAt: null,
    createdAt: "2027-01-15T10:00:00Z",
    edited: true,
    viewerCanApprove: true,
    viewerCanEdit: false,
    ...over
  }
});

describe("PlanApprovalQueue rules", () => {
  it("allows Approve only when plan is DRAFT and viewerCanApprove === true", () => {
    expect(canApproveQueueItem(makeItem({ status: "DRAFT", viewerCanApprove: true }))).toBe(true);
    expect(canApproveQueueItem(makeItem({ status: "DRAFT", viewerCanApprove: false }))).toBe(false);
    expect(canApproveQueueItem(makeItem({ status: "DRAFT", viewerCanApprove: undefined }))).toBe(false);
    expect(canApproveQueueItem(makeItem({ status: "APPROVED", viewerCanApprove: true }))).toBe(false);
  });

  it("never shows the approval queue to suppliers", () => {
    const supplierSession = {
      accessToken: "tok",
      refreshToken: "ref",
      user: { id: "s1", role: "SUPPLIER", name: "Vendor", email: "v@test", phone: "", language: "en" }
    } as Session;
    const clientSession = {
      accessToken: "tok",
      refreshToken: "ref",
      user: { id: "c1", role: "CLIENT", name: "Client", email: "c@test", phone: "", language: "en" }
    } as Session;

    expect(canShowApprovalQueue(supplierSession)).toBe(false);
    expect(canShowApprovalQueue(clientSession)).toBe(true);
    expect(renderToStaticMarkup(<PlanApprovalQueue session={supplierSession} isArabic={false} />)).toBe("");
  });
});

describe("PlanApprovalQueueView SSR", () => {
  it("renders event name, org, summary, provenance badge, View plan and one-click Approve in English", () => {
    const html = renderToStaticMarkup(
      <PlanApprovalQueueView
        items={[makeItem()]}
        isArabic={false}
        onApprove={() => undefined}
      />
    );

    expect(html).toContain("Plans awaiting approval");
    expect(html).toContain("Riyadh Hospitality Summit");
    expect(html).toContain("Sila Events");
    expect(html).toContain("AI-Generated (Edited)");
    expect(html).toContain("18 VIP vehicles and 5-star hotel allocation ready for approval.");
    expect(html).toContain("View plan");
    expect(html).toContain('data-approve-plan="plan_1"');
    expect(html).toContain("Approve");
  });

  it("hides Approve button when viewerCanApprove is false", () => {
    const html = renderToStaticMarkup(
      <PlanApprovalQueueView
        items={[makeItem({ viewerCanApprove: false })]}
        isArabic={false}
        onApprove={() => undefined}
      />
    );

    expect(html).toContain("View plan");
    expect(html).not.toContain("data-approve-plan=");
  });

  it("renders Arabic labels, provenance badge and empty state cleanly", () => {
    const populated = renderToStaticMarkup(
      <PlanApprovalQueueView
        items={[makeItem()]}
        isArabic
        onApprove={() => undefined}
      />
    );
    expect(populated).toContain("خطط بانتظار الاعتماد");
    expect(populated).toContain("مولدة بالذكاء الاصطناعي (معدّلة)");
    expect(populated).toContain("عرض الخطة");
    expect(populated).toContain("اعتماد الخطة");

    const empty = renderToStaticMarkup(
      <PlanApprovalQueueView items={[]} isArabic />
    );
    expect(empty).toContain("لا توجد خطط بانتظار الاعتماد حالياً");

    const emptyEn = renderToStaticMarkup(
      <PlanApprovalQueueView items={[]} isArabic={false} />
    );
    expect(emptyEn).toContain("No plans awaiting approval");
  });

  it("renders ClientDashboard workspace queue and events even when legacy bootstrap data is empty", () => {
    workspaceMock.queue = [makeItem()];
    workspaceMock.events = [
      {
        id: "evt_1",
        organizationId: "org_1",
        name: "Riyadh Hospitality Summit",
        locationLabel: "KAFD",
        operationalStatus: "PLANNING",
        planApproved: false,
        vipGuestCount: 10,
        regularGuestCount: 40,
        startAt: "2027-02-10T09:00:00Z"
      } as unknown as WorkspaceEventDto
    ];
    const emptyBootstrap = {
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
    const clientSession = {
      accessToken: "tok",
      refreshToken: "ref",
      user: { id: "c1", role: "CLIENT", name: "Client", email: "c@test", phone: "", language: "en" }
    } as Session;

    const html = renderToStaticMarkup(
      <ClientDashboard data={emptyBootstrap} session={clientSession} isArabic={false} />
    );
    workspaceMock.queue = [];
    workspaceMock.events = [];

    expect(html).toContain("Plans awaiting approval");
    expect(html).toContain("Riyadh Hospitality Summit");
    expect(html).toContain('data-approve-plan="plan_1"');
    expect(html).toContain("data-client-workspace-events");
    expect(html).toContain("data-client-compact-hero");
    expect(html).toContain('data-sadu-ribbon="hairline"');
    expect(html).toContain("KAFD");
  });

  it("extracts factual plan key figures and renders the 450ms brass->emerald approval seal state", () => {
    const item = makeItem();
    const figures = extractPlanKeyFigures(item.plan.content);
    expect(figures.map((f) => [f.id, f.value])).toEqual([
      ["rooms", 32],
      ["vehicles", 17],
      ["teams", 4]
    ]);

    const sealedEn = renderToStaticMarkup(
      <PlanApprovalQueueView
        items={[item]}
        sealedPlanId="plan_1"
        isArabic={false}
        onApprove={() => undefined}
      />
    );
    expect(sealedEn).toContain('data-approval-sealed="true"');
    expect(sealedEn).toContain('data-approval-seal-badge="plan_1"');
    expect(sealedEn).toContain("qasr-approval-sealed-card");
    expect(sealedEn).toContain("Approved · Unlocking ops");
    expect(sealedEn).toContain("data-approval-key-figures");

    const sealedAr = renderToStaticMarkup(
      <PlanApprovalQueueView
        items={[item]}
        sealedPlanId="plan_1"
        isArabic
        onApprove={() => undefined}
      />
    );
    expect(sealedAr).toContain("تم الاعتماد · جارٍ فتح التشغيل");
  });
});

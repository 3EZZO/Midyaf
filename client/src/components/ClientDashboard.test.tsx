import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MidyafData, Session } from "@shared/domain";
import { DEFAULT_CLIENT_CONFIG, DEFAULT_CLIENT_MESSAGES, DEFAULT_SCHEDULE_AMENDMENTS } from "@shared/constants";

const state = vi.hoisted(() => ({
  events: [] as unknown[],
  updates: [] as unknown[]
}));

vi.mock("./charts", () => ({ Funnel: () => <div data-funnel /> }));
vi.mock("./PlanApprovalQueue", () => ({
  PlanApprovalQueue: () => <div data-plan-approval-queue />,
  canShowApprovalQueue: (session: Session | null) => Boolean(session)
}));
vi.mock("./MessagesCenter", () => ({
  MessagesCenter: () => <div data-messages-center />
}));
vi.mock("../lib/workspaceApi", () => ({
  useWorkspaceResource: (_token: string, path: string | null) => {
    if (path === "/events") return { data: { events: state.events } };
    if (path && path.endsWith("/updates")) return { data: { updates: state.updates } };
    return {};
  },
  workspaceRequest: vi.fn()
}));

import { ClientDashboard, describeWorkspaceUpdateAction } from "./ClientDashboard";

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

const liveSession = {
  accessToken: "synthetic-client-token",
  refreshToken: "synthetic-refresh",
  user: {
    id: "u_client_1",
    name: "Noura Al-Qahtani",
    email: "noura@riyadh-summit.sa",
    phone: "+966500001111",
    role: "CLIENT",
    language: "en"
  }
} as unknown as Session;

afterEach(() => {
  state.events = [];
  state.updates = [];
});

describe("ClientDashboard (PLAN_READY_1 Sprint 1)", () => {
  it("gates DEFAULT_CLIENT_CONFIG, DEFAULT_SCHEDULE_AMENDMENTS, and demo reports strictly behind isDemoMode", () => {
    const html = renderToStaticMarkup(
      <ClientDashboard data={emptyData} session={liveSession} isArabic={false} isDemoMode={false} />
    );

    expect(html).toContain("Noura Al-Qahtani");
    expect(html).toContain("noura@riyadh-summit.sa");
    expect(html).toContain("No live event updates yet");
    expect(html).not.toContain(DEFAULT_CLIENT_CONFIG.clientName);
    expect(html).not.toContain(DEFAULT_SCHEDULE_AMENDMENTS[0].titleEn ?? DEFAULT_SCHEDULE_AMENDMENTS[0].title);
    expect(html).not.toContain(DEFAULT_CLIENT_MESSAGES[0].message);
    expect(html).not.toContain("Sep 10, 2026");
  });

  it("renders live workspace event timeline updates in EN and AR for real clients", () => {
    state.events = [
      {
        id: "evt_live_1",
        name: "Riyadh Hospitality Forum",
        locationLabel: "KAFD Conference Center",
        vipGuestCount: 40,
        regularGuestCount: 120,
        planApproved: true,
        contractSigned: false,
        operationalStatus: "ACTIVE",
        startAt: "2026-12-01T09:00:00Z"
      }
    ];
    state.updates = [
      {
        id: "upd_1",
        action: "workspace.plan.approve",
        at: "2026-11-24T09:30:00Z",
        actor: "Noura Al-Qahtani"
      }
    ];

    const en = renderToStaticMarkup(
      <ClientDashboard data={emptyData} session={liveSession} isArabic={false} isDemoMode={false} />
    );
    expect(en).toContain("data-client-live-updates");
    expect(en).toContain("Riyadh Hospitality Forum");
    expect(en).toContain("Logistics plan approved");
    expect(en).not.toContain(DEFAULT_SCHEDULE_AMENDMENTS[0].originalTime);

    const ar = renderToStaticMarkup(
      <ClientDashboard data={emptyData} session={liveSession} isArabic={true} isDemoMode={false} />
    );
    expect(ar).toContain("اعتماد الخطة اللوجستية");
    expect(describeWorkspaceUpdateAction("workspace.dispatch.emergency", false)).toEqual({
      label: "Emergency dispatch alert",
      tone: "danger"
    });
  });

  it("preserves scripted demo config and schedule amendments when isDemoMode is true", () => {
    const html = renderToStaticMarkup(
      <ClientDashboard data={emptyData} session={liveSession} isArabic={false} isDemoMode={true} />
    );
    expect(html).toContain("Schedule Amendments");
    expect(html).toContain(DEFAULT_SCHEDULE_AMENDMENTS[0].revisedTime);
  });
});

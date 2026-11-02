import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Session } from "@shared/domain";
import type { WorkspaceEventDto } from "@shared/overhaul";
import type { PortalProps } from "../types";

/**
 * SILA-DASHBOARD-003: the Organizing Company dashboard — hero with the
 * «New event / activity» action, a summary derived only from the scoped
 * /workspace/events, honest loading/error/empty states, and the canonical
 * OrganizerWorkspace (stubbed here; it has its own tests).
 */

const state = vi.hoisted(() => ({ language: "en", events: {} as unknown, paths: [] as Array<string | null> }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: state.language } })
}));
vi.mock("../../lib/workspaceApi", () => ({
  useWorkspaceResource: (_token: string, path: string | null) => {
    state.paths.push(path);
    return path === "/events" ? state.events : {};
  },
  workspaceRequest: vi.fn()
}));
vi.mock("../../components/OrganizerWorkspace", async () => ({
  ...(await vi.importActual<typeof import("../../components/OrganizerWorkspace")>("../../components/OrganizerWorkspace")),
  OrganizerWorkspace: (props: { session?: Session | null; isArabic: boolean; newEventRequest?: number; onNewEventRequestTaken?: (id: number) => void; showNewEventButton?: boolean }) => (
    <div
      data-organizer-workspace={props.session?.user.role ?? "none"}
      data-arabic={String(props.isArabic)}
      data-new-event-request={String(props.newEventRequest ?? 0)}
      data-new-event-ack={typeof props.onNewEventRequestTaken}
      data-own-button={String(props.showNewEventButton ?? true)}
    />
  )
}));

import { CompanyDashboard, CompanyEventSummary, companyEventSummary } from "./CompanyDashboard";
import { NEW_EVENT_LABEL_AR, NEW_EVENT_LABEL_EN } from "../../components/OrganizerWorkspace";

const session = (role: Session["user"]["role"]) =>
  ({
    accessToken: "synthetic",
    refreshToken: "synthetic",
    user: { id: "synthetic", role, name: "Synthetic", email: "synthetic@example.test", phone: "", language: "en" }
  }) as Session;

const event = (over: Partial<WorkspaceEventDto>) =>
  ({ id: "e", organizationId: "o", name: "Synthetic event", operationalStatus: "PLANNING", planApproved: false, vipGuestCount: 0, regularGuestCount: 0, ...over }) as WorkspaceEventDto;

const render = (role: Session["user"]["role"] | null = "COMPANY_ORGANIZER") =>
  renderToStaticMarkup(
    <CompanyDashboard {...({ data: {}, isDemoMode: false, session: role ? session(role) : undefined } as unknown as PortalProps)} />
  );

const shortcut = (html: string) =>
  html.match(/<button[^>]*data-company-new-event="shortcut"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";

afterEach(() => {
  state.language = "en";
  state.events = {};
  state.paths = [];
});

describe("CompanyDashboard hero and new event / activity action", () => {
  it("offers the localized action once, in the hero, and hands the request to the canonical workspace", () => {
    const html = render();
    const button = shortcut(html);
    expect(button).toContain(NEW_EVENT_LABEL_EN);
    expect(button).toContain('aria-controls="organizer-event-entry"');
    expect(button).not.toContain('disabled=""');
    expect(html).toContain("Organizing company events");
    expect(html).toContain('dir="ltr"');
    // The workspace receives no pending request and does not repeat the button.
    expect(html).toContain('data-new-event-request="0"');
    // One-shot: the workspace acknowledges the request it takes.
    expect(html).toContain('data-new-event-ack="function"');
    expect(html).toContain('data-own-button="false"');
    expect(html.match(/data-organizer-workspace=/g)).toHaveLength(1);
    expect(html).not.toContain("<form");
  });

  it("describes the workflow without implementation or permission-enforcement copy", () => {
    for (const language of ["en", "ar"]) {
      state.language = language;
      const html = render();
      expect(html).not.toMatch(/enforced by the server|Permissions are|الخادم|الصلاحيات تُطبَّق/);
    }
    state.language = "en";
    expect(render()).toContain("Open any event below to view or edit it.");
  });

  it("renders in Arabic right-to-left", () => {
    state.language = "ar";
    const html = render();
    expect(shortcut(html)).toContain(NEW_EVENT_LABEL_AR);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("الشركة المنظِّمة");
    expect(html).toContain('data-arabic="true"');
  });

  it("offers no action or summary before sign-in and requests nothing", () => {
    const html = render(null);
    expect(shortcut(html)).toBe("");
    expect(html).not.toContain("data-company-summary");
    expect(state.paths.filter(Boolean)).toEqual([]);
  });

  it("keeps the workspace for every role (server-enforced permissions)", () => {
    for (const role of ["SUPER_ADMIN", "ORGANIZER", "COMPANY_ORGANIZER", "LOGISTICS_MANAGER"] as const) {
      expect(render(role)).toContain(`data-organizer-workspace="${role}"`);
    }
  });
});

describe("company event summary", () => {
  it("derives every number from the scoped events", () => {
    const summary = companyEventSummary([
      event({ id: "a", vipGuestCount: 4, regularGuestCount: 20 }),
      event({ id: "b", operationalStatus: "ACTIVE", planApproved: true, vipGuestCount: 2, regularGuestCount: 8 }),
      event({ id: "c", operationalStatus: "COMPLETED", planApproved: true, regularGuestCount: 5 }),
      event({ id: "d", operationalStatus: "COMPLETED", planApproved: false })
    ]);
    expect(summary).toEqual({ total: 4, planning: 1, active: 1, completed: 2, awaitingApproval: 1, approved: 2, guests: 39, vipGuests: 6 });
    expect(companyEventSummary([])).toEqual({ total: 0, planning: 0, active: 0, completed: 0, awaitingApproval: 0, approved: 0, guests: 0, vipGuests: 0 });
  });

  it("shows loading, error and ready states without invented values", () => {
    const loading = renderToStaticMarkup(<CompanyEventSummary resource={{}} isArabic={false} />);
    expect(loading).toContain('data-company-summary="loading"');
    expect(loading).toContain('role="status"');

    const failed = renderToStaticMarkup(<CompanyEventSummary resource={{ error: "Request failed" }} isArabic />);
    expect(failed).toContain('data-company-summary="error"');
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Request failed");

    const empty = renderToStaticMarkup(<CompanyEventSummary resource={{ data: { events: [] } }} isArabic={false} />);
    expect(empty).toContain('data-company-summary="ready"');
    expect(empty).toContain("of 0 permitted events");

    const ready = renderToStaticMarkup(
      <CompanyEventSummary resource={{ data: { events: [event({ vipGuestCount: 3, regularGuestCount: 9 })] } }} isArabic={false} />
    );
    expect(ready).toContain("Awaiting plan approval");
    expect(ready).toContain("3 VIP");
    expect(ready).toContain("of 1 permitted events");
  });

  it("is wired to the dashboard's scoped events request", () => {
    state.events = { data: { events: [event({ operationalStatus: "ACTIVE", planApproved: true })] } };
    const html = render();
    expect(state.paths).toContain("/events");
    expect(html).toContain('data-company-summary="ready"');
    expect(html).toContain("0 completed");
  });
});

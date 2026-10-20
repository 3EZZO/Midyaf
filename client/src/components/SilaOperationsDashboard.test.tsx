import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { Driver, MidyafData, Session, Task } from "@shared/domain";
import type { OrganizationDto } from "@shared/overhaul";
import { eventTaskCards, TASK_CARD_LIMIT } from "../lib/eventTaskCards";
import type { PortalProps } from "../pages/types";

// Translation is not initialised in tests; use a fixed English language.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } })
}));

// The organizer workspace and radar are tested in their own files; here only their placement matters.
vi.mock("./OrganizerWorkspace", () => ({
  OrganizerWorkspace: ({ session, isArabic }: { session?: Session | null; isArabic: boolean }) => (
    <div data-organizer-workspace={session?.user.role ?? "none"} data-arabic={String(isArabic)} />
  )
}));
vi.mock("./EventRadar", () => ({
  OperationalEventEntry: ({ empty }: { empty?: ReactNode }) => <div data-operational-radar>{empty}</div>
}));
vi.mock("./AiPanel", () => ({ AiPanel: () => null }));
vi.mock("./charts", () => ({ ArcGauge: () => null, Funnel: () => null, StackedBars: () => null }));
const orgState = vi.hoisted(() => ({ value: {} as { data?: { organizations: unknown[] } } }));
vi.mock("../lib/workspaceApi", () => ({ useWorkspaceResource: () => orgState.value, workspaceRequest: vi.fn() }));

import {
  ClientMessagesEmpty,
  EventTaskList,
  IntakeAccessNote,
  SilaOperationsDashboard,
  canCreateEvents,
  type SilaTab
} from "./SilaOperationsDashboard";
import { CompanyDashboard } from "../pages/ops/CompanyDashboard";

/**
 * VIS-04: the operations task cards come from the current event's tasks and
 * the scoped drivers, and the seeded client chat is gone. No DOM test
 * environment exists here, so the list is rendered with react-dom/server;
 * tab switching itself is left to the browser check.
 */

const source = fs.readFileSync(
  path.join(process.cwd(), "client/src/components/SilaOperationsDashboard.tsx"),
  "utf8"
);

const driver = (id: string, name: string): Driver =>
  ({ id, status: "ASSIGNED", user: { id: `u-${id}`, name } }) as unknown as Driver;

const task = (overrides: Partial<Task> & { id: string }): Task =>
  ({
    eventId: "evt",
    type: "AIRPORT_PICKUP",
    status: "ASSIGNED",
    pickupLocation: "Pickup",
    dropoffLocation: "Dropoff",
    scheduledAt: "2027-01-01T10:00:00.000Z",
    ...overrides
  }) as Task;

function render(tasks: Task[], drivers: Driver[], isArabic = false) {
  return renderToStaticMarkup(
    <EventTaskList cards={eventTaskCards(tasks, drivers, isArabic)} isArabic={isArabic} />
  );
}

describe("EventTaskList", () => {
  it("renders each event's own routes and captains", () => {
    const first = render(
      [task({ id: "a1", pickupLocation: "Taif Airport", dropoffLocation: "Shubra Palace", driverId: "d1" })],
      [driver("d1", "Majed Rashed")]
    );
    const second = render(
      [task({ id: "b1", type: "HOTEL_TRANSFER", pickupLocation: "Hail Station", dropoffLocation: "Aja Lodge", driverId: "d2" })],
      [driver("d2", "Yousef Amin")]
    );

    expect(first).toContain("Taif Airport → Shubra Palace");
    expect(first).toContain("Majed Rashed");
    expect(first).toContain("Airport pickup");
    expect(first).not.toContain("Hail Station");
    expect(second).toContain("Hail Station → Aja Lodge");
    expect(second).toContain("Yousef Amin");
    expect(second).toContain("Hotel transfer");
    expect(second).not.toContain("Majed Rashed");
  });

  it("shows honest unassigned, unnamed-captain and missing-time states", () => {
    const html = render(
      [
        task({ id: "u1", pickupLocation: "Gate A" }),
        task({ id: "u2", pickupLocation: "Gate B", driverId: "hidden" }),
        task({ id: "u3", pickupLocation: "Gate C", scheduledAt: "" })
      ],
      []
    );
    expect(html).toContain("Unassigned");
    expect(html).toContain("Captain assigned (name not available)");
    expect(html).toContain("No time set");
    expect(html).toContain("Scheduled ·");
  });

  it("renders Arabic labels for the same data", () => {
    const html = render([task({ id: "x1", type: "VIP_ESCORT", ownerName: "Field Lead" })], [], true);
    expect(html).toContain("مرافقة كبار الشخصيات");
    expect(html).toContain("المسؤول:");
    expect(html).toContain("Field Lead");
  });

  it("has an empty state and a limit note instead of invented rows", () => {
    expect(render([], [])).toContain("No tasks for this event yet");
    const many = Array.from({ length: TASK_CARD_LIMIT + 3 }, (_, i) => task({ id: `m${i}` }));
    expect(render(many, [])).toContain(`Showing ${TASK_CARD_LIMIT} of ${TASK_CARD_LIMIT + 3} tasks`);
  });
});

describe("client messages", () => {
  it("shows that messaging is not connected", () => {
    const html = renderToStaticMarkup(<ClientMessagesEmpty isArabic={false} />);
    expect(html).toContain("No client messages");
    expect(html).toContain("Client messaging is not connected");
  });
});

describe("SilaOperationsDashboard source", () => {
  it("no longer carries the fixed sample delegations or seeded chat", () => {
    for (const fixed of [
      "UK Delegation",
      "Four Seasons",
      "Saud Al Otaibi",
      "Sultan Al Ghamdi",
      "Ministry of Culture",
      "all 12 vehicles",
      "handleSendClientReply",
      "TaskDelegation"
    ]) {
      expect(source).not.toContain(fixed);
    }
    expect(source).toMatch(/eventTaskCards\(tasks, data\.drivers, isArabic\)/);
  });
});

/**
 * SILA-INTAKE-002: Sila → Intake is the default tab and embeds the organizer
 * workspace (the only event-creation form) in normal and demo modes. The
 * live radar sits in Fleet; nothing is hidden under a previous-workspace drawer.
 */
const session = (role: Session["user"]["role"]) =>
  ({
    accessToken: "synthetic",
    refreshToken: "synthetic",
    user: { id: "synthetic", role, name: "Synthetic", email: "synthetic@example.test", phone: "", language: "en" }
  }) as Session;

const emptyData = {
  events: [],
  drivers: [],
  guestJourneys: [],
  activityIntakes: [],
  companyReports: [],
  contracts: []
} as unknown as MidyafData;

const org = (myRole: string | null, kind = "COMPANY") =>
  ({ id: `org-${myRole}-${kind}`, name: "Synthetic org", kind, myRole }) as unknown as OrganizationDto;

function renderSila({
  isDemoMode = false,
  isArabic = false,
  initialTab,
  data = emptyData,
  role = "LOGISTICS_MANAGER"
}: { isDemoMode?: boolean; isArabic?: boolean; initialTab?: SilaTab; data?: MidyafData; role?: Session["user"]["role"] } = {}) {
  return renderToStaticMarkup(
    <SilaOperationsDashboard
      data={data}
      session={session(role)}
      isDemoMode={isDemoMode}
      isArabic={isArabic}
      initialTab={initialTab}
    />
  );
}

const selectedTab = (html: string) =>
  html.match(/role="tab" aria-selected="true"(?:(?!<\/button>)[\s\S])*?<span class="relative">([^<]+)<\/span>/)?.[1];

describe("Sila Intake", () => {
  afterEach(() => {
    orgState.value = {};
  });

  for (const isDemoMode of [false, true]) {
    it(`opens on Intake with the embedded organizer workspace${isDemoMode ? " in demo mode" : ""}`, () => {
      const html = renderSila({ isDemoMode });
      expect(selectedTab(html)).toBe("Intake");
      expect(html).toContain('data-organizer-workspace="LOGISTICS_MANAGER"');
      expect(html).toContain("How to enter a new event");
      expect(html).toContain("إدخال وتجهيز فعالية جديدة");
      expect(html).toContain("Save &amp; open event plan");
      expect(html).toContain("Approve plan &amp; unlock operations");
      // No second form, no legacy drawer, and the radar is not on the default tab.
      expect(html).not.toContain("<form");
      expect(html).not.toContain("Previous personal workspace");
      expect(html).not.toContain("data-operational-radar");
    });
  }

  it("works for an organization without events and in Arabic", () => {
    const html = renderSila({ isArabic: true });
    expect(html).toContain('data-organizer-workspace="LOGISTICS_MANAGER"');
    expect(html).toContain('data-arabic="true"');
    expect(html).toContain("كيف تُدخل فعالية جديدة");
    expect(html).toContain("اعتماد الخطة وتفعيل التشغيل");
    expect(html).not.toContain("Earlier activity records");
  });

  it("keeps earlier activity intake records as a read-only list below the workspace", () => {
    const data = {
      ...emptyData,
      activityIntakes: [{ id: "ai1", activityName: "Synthetic gala", activityPlace: "Synthetic hall", status: "SUBMITTED", visitorCount: 10, vipVisitorCount: 2 }]
    } as unknown as MidyafData;
    const html = renderSila({ data });
    expect(html).toContain("Earlier activity records (1)");
    expect(html).toContain("Synthetic gala");
    expect(html.indexOf("data-organizer-workspace")).toBeLessThan(html.indexOf("Synthetic gala"));
  });

  it("explains a hidden new-event button without granting anything", () => {
    orgState.value = { data: { organizations: [] } };
    const html = renderSila({ role: "SUPER_ADMIN" });
    const note = html.match(/<p role="note" data-intake-no-access[^>]*>([^<]*)<\/p>/)?.[1] ?? "";
    expect(note).toContain("not an owner or admin of an organizing company");
    expect(note).not.toMatch(/success|created|granted/i);

    orgState.value = { data: { organizations: [org("OWNER")] } };
    expect(renderSila()).not.toContain("data-intake-no-access");

    // Still loading: no premature message.
    orgState.value = {};
    expect(renderSila()).not.toContain("data-intake-no-access");
  });

  it("uses the organizer workspace's own creation rule", () => {
    expect(canCreateEvents([org("OWNER")])).toBe(true);
    expect(canCreateEvents([org("ADMIN")])).toBe(true);
    expect(canCreateEvents([org("MEMBER"), org(null)])).toBe(false);
    expect(canCreateEvents([org("OWNER", "VENDOR")])).toBe(false);
    expect(renderToStaticMarkup(<IntakeAccessNote organizations={[org("MEMBER")]} isArabic />)).toContain(
      "ليس مالكاً أو مديراً"
    );
    expect(renderToStaticMarkup(<IntakeAccessNote organizations={[org("ADMIN")]} isArabic={false} />)).toBe("");
  });
});

describe("Sila Fleet & Radar", () => {
  it("puts the live event radar in the Fleet tab, with an honest empty state", () => {
    const html = renderSila({ initialTab: "fleet" });
    expect(selectedTab(html)).toBe("Fleet &amp; Radar");
    expect(html).toContain("data-operational-radar");
    expect(html).toContain("No approved event for the radar yet");
    expect(html).not.toContain("data-organizer-workspace");
  });

  it("leaves the scripted demo fleet view without the live radar", () => {
    const html = renderSila({ initialTab: "fleet", isDemoMode: true });
    expect(html).not.toContain("data-operational-radar");
    expect(html).toContain("Live Fleet Telemetry");
  });
});

/**
 * Migrated from the retired ActivityIntakePage wrapper test: the company
 * portal stays the same organizer workspace for every role and in demo mode,
 * and no entry module uses browser-local plan state or legacy intake calls.
 */
describe("single organizer entry path", () => {
  const props = (over: Partial<PortalProps>) => ({ data: {}, isDemoMode: false, ...over }) as unknown as PortalProps;

  for (const role of ["SUPER_ADMIN", "ORGANIZER", "COMPANY_ORGANIZER", "LOGISTICS_MANAGER"] as const) {
    for (const isDemoMode of [false, true]) {
      it(`renders the organizer workspace in the company portal for ${role}${isDemoMode ? " in demo mode" : ""}`, () => {
        const html = renderToStaticMarkup(<CompanyDashboard {...props({ session: session(role), isDemoMode })} />);
        expect(html).toContain(`data-organizer-workspace="${role}"`);
        expect(html).not.toContain("<form");
      });
    }
  }

  it("keeps no browser-local plan approval or legacy intake calls in the entry modules", () => {
    for (const file of ["client/src/pages/ops/CompanyDashboard.tsx", "client/src/components/SilaOperationsDashboard.tsx"]) {
      const text = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(text, file).not.toMatch(
        /localPlanApproved|saveActivityIntake|analyzeActivityIntake|localStorage|\/activity-intakes|ActivityIntakePage/
      );
    }
    const company = fs.readFileSync(path.join(process.cwd(), "client/src/pages/ops/CompanyDashboard.tsx"), "utf8");
    expect(company).not.toMatch(/isDemoMode\s*\?/);
  });
});

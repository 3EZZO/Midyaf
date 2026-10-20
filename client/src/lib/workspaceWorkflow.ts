import type { EventPlanDto, WorkspaceEventDto } from "@shared/overhaul";
export const workspaceTabs = ["overview", "plan", "guests", "vendors", "teams", "permissions", "inbox", "radar"] as const;
export type WorkspaceTab = typeof workspaceTabs[number];
export function tabUnlocked(event: Pick<WorkspaceEventDto, "planApproved">, tab: WorkspaceTab) {
  return ["overview", "plan", "guests"].includes(tab) || event.planApproved;
}
export function categorizeEvents(events: WorkspaceEventDto[]) {
  return { PLANNING: events.filter(e => e.operationalStatus === "PLANNING"), ACTIVE: events.filter(e => e.operationalStatus === "ACTIVE"), COMPLETED: events.filter(e => e.operationalStatus === "COMPLETED") };
}

/**
 * RADAR-ORGANIZER-001: the single event setup path lives in the company
 * workspace under this exact heading (comments.docx §3.2).
 */
export const EVENT_SETUP_HEADING_AR = "إدخال وتجهيز فعالية جديدة";
export const EVENT_SETUP_HEADING_EN = "Event Setup & AI Planning";

/** Thin seam over `workspaceRequest(token, …)` so the workflow is testable without a DOM. */
export type WorkspaceRequester = (path: string, body?: unknown, method?: string) => Promise<unknown>;

/** Where the workspace opens after setup: always the Plan tab of the new event. */
export type WorkspaceLanding = { tab: WorkspaceTab; planError: string | null; manual: boolean };
export type EventSetupResult = { event: WorkspaceEventDto; plan: EventPlanDto | null; planError: string | null };

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

/** The setup form's fields as the strict `POST /events` body (Riyadh local times). */
export function eventSetupBody(fields: Record<string, string>) {
  const riyadh = (value: string | undefined) => (value ? new Date(`${value}+03:00`).toISOString() : null);
  return {
    organizationId: fields.organizationId,
    name: fields.name,
    locationLabel: fields.locationLabel,
    planningMode: fields.planningMode === "MANUAL" ? "MANUAL" : "AI",
    hotelZone: fields.hotelZone || null,
    vipGuestCount: Number(fields.vipGuestCount),
    regularGuestCount: Number(fields.regularGuestCount),
    carCount: Number(fields.carCount),
    startAt: riyadh(fields.startAt),
    endAt: riyadh(fields.endAt),
    arrivalStartAt: riyadh(fields.arrivalStartAt),
    departureEndAt: riyadh(fields.departureEndAt)
  };
}

/** Asks the existing API for an advisory plan. Failure is returned, never thrown. */
export async function generateAdvisoryPlan(request: WorkspaceRequester, eventId: string): Promise<{ plan: EventPlanDto | null; planError: string | null }> {
  try {
    const result = (await request(`/events/${eventId}/plans/generate`, { mode: "ADVISORY" })) as { plan: EventPlanDto };
    return { plan: result.plan, planError: null };
  } catch (error) {
    return { plan: null, planError: messageOf(error) };
  }
}

/**
 * Creates the event exactly once. In assisted mode it then generates the
 * advisory plan; if that fails the created event is still returned (with the
 * error) so the caller keeps it selected and retries generation only.
 * Manual mode creates no plan: the team enters it on the Plan tab.
 */
export async function createEventWithPlan(request: WorkspaceRequester, body: ReturnType<typeof eventSetupBody>): Promise<EventSetupResult> {
  const { event } = (await request("/events", body)) as { event: WorkspaceEventDto };
  if (event.planningMode !== "AI") return { event, plan: null, planError: null };
  return { event, ...(await generateAdvisoryPlan(request, event.id)) };
}

export function landingAfterSetup(result: EventSetupResult): WorkspaceLanding {
  return { tab: "plan", planError: result.planError, manual: result.event.planningMode === "MANUAL" };
}

/** Explicit approval through the existing gate; the server answers with the unlocked event. */
export async function approvePlan(request: WorkspaceRequester, eventId: string, planId: string) {
  return (await request(`/events/${eventId}/plans/${planId}/approve`, { confirm: true })) as { event: WorkspaceEventDto; plan: EventPlanDto };
}

export function unlockedTabs(event: Pick<WorkspaceEventDto, "planApproved">) {
  return workspaceTabs.filter(tab => tabUnlocked(event, tab));
}

/** The five plan sections every plan view shows (comments.docx §3.2). */
export const PLAN_SECTIONS = ["logistics", "hotelDistribution", "vehicleRequirements", "teamRequirements", "scopeOfWork"] as const;
export type PlanSection = typeof PLAN_SECTIONS[number];
export function planSections(content: unknown): Array<{ key: PlanSection; value: unknown }> {
  const record = content && typeof content === "object" && !Array.isArray(content) ? (content as Record<string, unknown>) : {};
  return PLAN_SECTIONS.map(key => ({ key, value: record[key] ?? (key === "scopeOfWork" ? record.items ?? null : null) }));
}

/** Internal RFQ drafts: editors and org admins, never vendors or client viewers (mirrors the server). */
export function canViewRfq(event: Pick<WorkspaceEventDto, "access">) {
  return event.access.permissions.includes("EDIT") && !["VENDOR", "CLIENT_VIEWER"].includes(event.access.eventRole ?? "");
}

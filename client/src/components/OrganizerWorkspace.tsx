import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Plus, RefreshCw } from "lucide-react";
import type { Session } from "@shared/domain";
import type { OrganizationDto, WorkspaceEventDto } from "@shared/overhaul";
import { OnboardingWorkspace } from "./OnboardingWorkspace";
import { Section } from "./Section";
import { EventWorkspace } from "./EventWorkspace";
import { OrganizationMembers, canManageMembers } from "./OrganizationMembers";
import { Badge, Button } from "./ui";
import { EVENT_SETUP_HEADING_AR, EVENT_SETUP_HEADING_EN, categorizeEvents, createEventWithPlan, eventSetupBody, landingAfterSetup, type WorkspaceLanding } from "../lib/workspaceWorkflow";
import { useWorkspaceResource, workspaceRequest } from "../lib/workspaceApi";

export const workspaceInput = "w-full rounded-md border border-hairline bg-surface-1 p-2 text-ink";
export const workspaceButton = "rounded-md border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40";
export type WorkspaceProps = { token: string; isArabic: boolean; eventId: string };

/** SILA-DASHBOARD-003: the one localized label of the new-event action, wherever it is offered. */
export const NEW_EVENT_LABEL_EN = "New event / activity";
export const NEW_EVENT_LABEL_AR = "إضافة فعالية / نشاط";
export function newEventLabel(isArabic: boolean) {
  return isArabic ? NEW_EVENT_LABEL_AR : NEW_EVENT_LABEL_EN;
}
/** Anchors the action scrolls to: the canonical setup form, or the access explanation. */
export const EVENT_SETUP_ANCHOR_ID = "organizer-event-setup";
export const EVENT_ACCESS_NOTE_ID = "organizer-event-access";

/**
 * Display mirror of the server rule: OWNER/ADMIN of a non-vendor organization
 * may create events. It only decides what the UI offers; the /workspace API
 * enforces creation and grants nothing here.
 */
export function creatableOrganizations(organizations: OrganizationDto[]) {
  return organizations.filter(o => ["OWNER", "ADMIN"].includes(o.myRole ?? "") && o.kind !== "VENDOR");
}
export function canCreateEvents(organizations: OrganizationDto[]) {
  return creatableOrganizations(organizations).length > 0;
}

export type NewEventEntryState = "loading" | "error" | "create" | "no-access";
/** What the new-event action can do with the organizations resource as loaded. */
export function newEventEntryState(orgs: { data?: { organizations: OrganizationDto[] }; error?: string }): NewEventEntryState {
  if (orgs.error) return "error";
  if (!orgs.data) return "loading";
  return canCreateEvents(orgs.data.organizations) ? "create" : "no-access";
}

export type NewEventNotice = "no-access" | "error";

/**
 * Pure outcome of requesting a new event: with creation rights the canonical
 * form opens (leaving any open event) and takes focus; without them nothing
 * opens and a visible notice (role explanation, or the loading error) takes
 * focus - also over an already selected event; while loading the request
 * waits. Nothing here changes permissions.
 */
export function resolveNewEventRequest(state: NewEventEntryState): { pending: boolean; openForm: boolean; focus: "form" | "access-note" | null; notice: NewEventNotice | null } {
  if (state === "loading") return { pending: true, openForm: false, focus: null, notice: null };
  if (state === "create") return { pending: false, openForm: true, focus: "form", notice: null };
  return { pending: false, openForm: false, focus: "access-note", notice: state };
}

/**
 * SILA-DASHBOARD-003 R1: a parent-owned, ONE-SHOT and session-scoped request.
 * The parent issues it from its shortcut; the workspace acknowledges it as
 * soon as it has taken it over, after which no pending request remains. So
 * leaving and returning (remounting the workspace) or a session/actor change
 * never replays an old request.
 */
export type NewEventRequestState = { sessionKey: string | null; lastId: number; pendingId: number };
export const NO_NEW_EVENT_REQUEST: NewEventRequestState = { sessionKey: null, lastId: 0, pendingId: 0 };
export function issueNewEventRequest(state: NewEventRequestState, sessionKey: string | null): NewEventRequestState {
  const id = state.lastId + 1;
  return { sessionKey, lastId: id, pendingId: id };
}
/** Acknowledges exactly that request; a newer one stays pending. */
export function acknowledgeNewEventRequest(state: NewEventRequestState, id: number): NewEventRequestState {
  return state.pendingId === id ? { ...state, pendingId: 0 } : state;
}
/** Drops any pending request (e.g. ordinary tab navigation). */
export function withdrawNewEventRequest(state: NewEventRequestState): NewEventRequestState {
  return state.pendingId ? { ...state, pendingId: 0 } : state;
}
/** The request id to hand to the workspace: 0 unless pending for THIS session. */
export function pendingNewEventRequest(state: NewEventRequestState, sessionKey: string | null): number {
  return state.pendingId && state.sessionKey === sessionKey ? state.pendingId : 0;
}
/** Workspace side: act once per distinct, positive request id. */
export function shouldTakeNewEventRequest(request: number, lastTakenId: number) {
  return request > 0 && request !== lastTakenId;
}

/** Parent hook: the shortcut's one-shot request, scoped to the given session. */
export function useNewEventRequest(sessionKey: string | null | undefined) {
  const key = sessionKey ?? null;
  const [state, setState] = useState<NewEventRequestState>(NO_NEW_EVENT_REQUEST);
  return {
    newEventRequest: pendingNewEventRequest(state, key),
    requestNewEvent: () => setState(current => issueNewEventRequest(current, key)),
    acknowledgeNewEventRequest: (id: number) => setState(current => acknowledgeNewEventRequest(current, id)),
    withdrawNewEventRequest: () => setState(current => withdrawNewEventRequest(current))
  };
}

/**
 * @param newEventRequest The pending one-shot request id from a parent
 *   shortcut (Sila / company hero; see useNewEventRequest), 0 for none.
 * @param onNewEventRequestTaken Acknowledges that id to the parent once the
 *   workspace has taken it over, so it is never replayed.
 * @param showNewEventButton False when the parent's hero already carries the
 *   action, so the page offers it once; the role explanation still shows here.
 * @param onEventsChanged Called after a create or refresh so parent summaries reload.
 */
export function OrganizerWorkspace({ session, isArabic, newEventRequest = 0, onNewEventRequestTaken, showNewEventButton = true, onEventsChanged }: { session?: Session | null; isArabic: boolean; newEventRequest?: number; onNewEventRequestTaken?: (id: number) => void; showNewEventButton?: boolean; onEventsChanged?: () => void }) {
  if (!session) return <p>{isArabic ? "سجل الدخول لعرض فعاليات المؤسسة" : "Sign in to view organization events"}</p>;
  return <div className="space-y-4"><OrganizerContent key={session.accessToken} token={session.accessToken} isArabic={isArabic} isSuperAdmin={session.user.role === "SUPER_ADMIN"} currentUserId={session.user.id} newEventRequest={newEventRequest} onNewEventRequestTaken={onNewEventRequestTaken} showNewEventButton={showNewEventButton} onEventsChanged={onEventsChanged} /><details className="rounded-lg border border-hairline bg-surface-2 p-4"><summary className="cursor-pointer text-sm font-semibold text-ink">{isArabic?"تسجيل الموردين والعملاء":"Vendor / client registration"}</summary><div className="mt-3"><OnboardingWorkspace key={session.accessToken} session={session} isArabic={isArabic}/></div></details></div>;
}

/** The new-event action. Disabled (never a forbidden form) while access is unknown or missing. */
export function NewEventButton({ state, isArabic, expanded, onClick, size = "lg" }: { state: NewEventEntryState; isArabic: boolean; expanded: boolean; onClick: () => void; size?: "md" | "lg" }) {
  const allowed = state === "create";
  return <Button data-new-event-action={state} variant="gold" size={size} leadingIcon={<Plus className="size-5" aria-hidden />} disabled={!allowed} aria-busy={state === "loading" || undefined} aria-expanded={allowed ? expanded : undefined} aria-controls={allowed ? EVENT_SETUP_ANCHOR_ID : undefined} aria-describedby={state === "no-access" || state === "error" ? EVENT_ACCESS_NOTE_ID : undefined} onClick={onClick}>{newEventLabel(isArabic)}</Button>;
}

/** The organizations (and so creation access) could not be loaded; nothing is offered. */
export function EventAccessError({ isArabic, message }: { isArabic: boolean; message?: string }) {
  return <p role="alert" id={EVENT_ACCESS_NOTE_ID} tabIndex={-1} data-intake-access-error className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
    {isArabic
      ? `تعذر تحميل مؤسساتك، لذا لا يمكن استخدام «${NEW_EVENT_LABEL_AR}» الآن. اضغط «تحديث» وحاول مرة أخرى.`
      : `Your organizations could not be loaded, so «${NEW_EVENT_LABEL_EN}» is unavailable right now. Use Refresh and try again.`}
    {message ? <span className="mt-1 block text-xs">{message}</span> : null}
  </p>;
}

/** The visible, focusable answer to a request that cannot open the form. */
export function NewEventNoticeView({ notice, isArabic, message }: { notice: NewEventNotice; isArabic: boolean; message?: string }) {
  return notice === "error" ? <EventAccessError isArabic={isArabic} message={message} /> : <EventAccessNote isArabic={isArabic} />;
}

/**
 * Header of an open event. A new-event request that cannot open the form
 * shows its notice here, above the event, which stays open for viewing and
 * editing; a request still waiting for access shows a status.
 */
export function SelectedEventHeader({ isArabic: ar, eventName, notice, noticeMessage, waiting = false, onBack, onDismissNotice }: { isArabic: boolean; eventName?: string; notice?: NewEventNotice | null; noticeMessage?: string; waiting?: boolean; onBack: () => void; onDismissNotice: () => void }) {
  return <div className="space-y-3">
    {notice ? <div data-selected-event-notice={notice} className="space-y-2">
      <NewEventNoticeView notice={notice} isArabic={ar} message={noticeMessage} />
      <Button variant="ghost" size="sm" onClick={onDismissNotice}>{ar ? "إخفاء" : "Dismiss"}</Button>
    </div> : null}
    {waiting && !notice ? <NewEventWaiting isArabic={ar} /> : null}
    <div data-selected-event className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-surface-2 p-3">
      <Button variant="outline" size="sm" leadingIcon={ar ? <ArrowRight className="size-4" aria-hidden /> : <ArrowLeft className="size-4" aria-hidden />} onClick={onBack}>{ar ? "جميع الفعاليات" : "All events"}</Button>
      <span className="text-xs text-ink-muted">{ar ? "الفعالية المختارة للعرض والتعديل:" : "Selected for viewing and editing:"}</span>
      <strong className="min-w-0 truncate text-sm text-ink">{eventName ?? (ar ? "فعالية" : "Event")}</strong>
    </div>
  </div>;
}

/** A request is held until the organization access has loaded. */
export function NewEventWaiting({ isArabic }: { isArabic: boolean }) {
  return <p role="status" data-new-event-waiting className="text-sm text-ink-muted">{isArabic ? `جارٍ التحقق من صلاحيتك لـ«${NEW_EVENT_LABEL_AR}»…` : `Checking your access for «${NEW_EVENT_LABEL_EN}»…`}</p>;
}

/** Explains the missing organization role; grants nothing and claims nothing. */
export function EventAccessNote({ isArabic }: { isArabic: boolean }) {
  return <p role="note" id={EVENT_ACCESS_NOTE_ID} tabIndex={-1} data-intake-no-access className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-ink">
    {isArabic
      ? `لا يمكنك استخدام «${NEW_EVENT_LABEL_AR}» لأن حسابك ليس مالكاً أو مديراً في مؤسسة منظِّمة. اطلب من المشرف العام لمضياف أو من مالك المؤسسة إضافتك بدور «مدير» (اختر المؤسسة ← أعضاء المؤسسة والصلاحيات)؛ وإلى ذلك يمكنك متابعة الفعاليات المصرح لك بها وتعديلها حسب صلاحياتك.`
      : `«${NEW_EVENT_LABEL_EN}» is not available because your account is not an owner or admin of an organizing company. Ask the Midyaf Super Admin or that organization's owner to add you as an Admin (choose the organization → Organization members & roles); until then you can follow and edit only the events you were given access to.`}
  </p>;
}

/**
 * The only event-creation form in the product (RADAR-ORGANIZER-001): it sits
 * under the exact heading «إدخال وتجهيز فعالية جديدة» inside the company
 * workspace and posts to the organization-scoped /workspace API.
 */
export function EventSetupForm({ organizations, defaultOrganizationId, busy, isArabic: ar, onSubmit, onCancel }: { organizations: OrganizationDto[]; defaultOrganizationId?: string; busy: boolean; isArabic: boolean; onSubmit: (form: HTMLFormElement) => void; onCancel?: () => void }) {
  return <Section id={EVENT_SETUP_ANCHOR_ID} title={<span lang="ar" dir="rtl">{EVENT_SETUP_HEADING_AR}</span>} eyebrow={ar ? undefined : EVENT_SETUP_HEADING_EN} description={ar ? "جميع الأوقات بتوقيت الرياض. يُنشأ مقترح الخطة تلقائياً بعد الحفظ ويبقى مسودة حتى الاعتماد" : "All times in Riyadh (UTC+03:00). An advisory plan is generated after saving and stays a locked draft until approved"}>
    <form data-event-setup className="grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); onSubmit(e.currentTarget); }}>
      <label>{ar ? "المؤسسة" : "Organization"}<select required className={workspaceInput} name="organizationId" defaultValue={organizations.find(o => o.id === defaultOrganizationId)?.id ?? organizations[0]?.id}>{organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label>{ar ? "اسم الفعالية" : "Event name"}<input required minLength={2} maxLength={160} name="name" className={workspaceInput} /></label>
      <label>{ar ? "الموقع" : "Location"}<input required minLength={2} maxLength={200} name="locationLabel" className={workspaceInput} /></label>
      <label>{ar ? "نطاق الفنادق (اختياري — يُترك للمقترح)" : "Hotel zone (optional — leave to the advisory plan)"}<input name="hotelZone" maxLength={120} className={workspaceInput} /></label>
      <label>{ar ? "طريقة التخطيط" : "Planning mode"}<select name="planningMode" defaultValue="AI" className={workspaceInput}><option value="AI">{ar ? "مقترح آلي مع اعتماد بشري" : "Assisted plan, human approval"}</option><option value="MANUAL">{ar ? "يدوي" : "Manual"}</option></select></label>
      {([['vipGuestCount', ar ? 'كبار الشخصيات' : 'VIP guests'], ['regularGuestCount', ar ? 'ضيوف عاديون' : 'Regular guests'], ['carCount', ar ? 'عدد المحتاجين لسيارات' : 'Guests needing vehicles']] as const).map(([name,label]) => <label key={name}>{label}<input required type="number" min="0" max="100000" defaultValue="0" name={name} className={workspaceInput}/></label>)}
      {([['startAt', ar ? 'بداية الفعالية' : 'Event start'], ['endAt', ar ? 'نهاية الفعالية' : 'Event end'], ['arrivalStartAt', ar ? 'بداية وصول الضيوف' : 'Guest arrivals from'], ['departureEndAt', ar ? 'نهاية مغادرة الضيوف' : 'Guest departures until']] as const).map(([name,label]) => <label key={name}>{label}<input type="datetime-local" required={name === 'startAt' || name === 'endAt'} name={name} className={workspaceInput}/></label>)}
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button className={workspaceButton} disabled={busy}>{busy ? (ar ? "جارٍ الحفظ وتجهيز المقترح…" : "Saving & preparing the plan…") : (ar ? "حفظ وفتح خطة الفعالية" : "Save & open event plan")}</button>
        {onCancel ? <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>{ar ? "إلغاء" : "Cancel"}</Button> : null}
      </div>
    </form>
  </Section>;
}

const STATUS_GROUPS = [['PLANNING', 'تحت التخطيط', 'Under planning'], ['ACTIVE', 'نشطة', 'Active'], ['COMPLETED', 'مكتملة', 'Completed']] as const;

/** Scrolls to and focuses the requested anchor after it has rendered. */
function focusAnchor(target: "form" | "access-note") {
  if (typeof document === "undefined") return;
  const anchor = document.getElementById(target === "form" ? EVENT_SETUP_ANCHOR_ID : EVENT_ACCESS_NOTE_ID);
  if (!anchor) return;
  anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  const field = target === "form" ? anchor.querySelector<HTMLElement>("select, input, textarea") : anchor;
  field?.focus({ preventScroll: true });
}

function OrganizerContent({ token, isArabic: ar, isSuperAdmin = false, currentUserId, newEventRequest, onNewEventRequestTaken, showNewEventButton, onEventsChanged }: { token: string; isArabic: boolean; isSuperAdmin?: boolean; currentUserId?: string; newEventRequest: number; onNewEventRequestTaken?: (id: number) => void; showNewEventButton: boolean; onEventsChanged?: () => void }) {
  const [revision, setRevision] = useState(0); const [selected, select] = useState<string | null>(null);
  const refresh = (next: (n: number) => number) => { setRevision(next); onEventsChanged?.(); };
  const [landing, setLanding] = useState<WorkspaceLanding | undefined>(undefined);
  const [organizationId, setOrganization] = useState(""); const [creating, setCreating] = useState(false);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [wantsNewEvent, setWantsNewEvent] = useState(false);
  const [focusTarget, setFocusTarget] = useState<"form" | "access-note" | null>(null);
  const [notice, setNotice] = useState<NewEventNotice | null>(null);
  const lastTakenRequest = useRef(0);
  const events = useWorkspaceResource<{ events: WorkspaceEventDto[] }>(token, "/events", revision);
  const orgs = useWorkspaceResource<{ organizations: OrganizationDto[] }>(token, "/organizations", revision);
  const entry = newEventEntryState(orgs);
  const canCreate = orgs.data ? creatableOrganizations(orgs.data.organizations) : [];
  const allEvents = events.data?.events ?? [];
  const companyEvents = allEvents.filter(e => !organizationId || e.organizationId === organizationId);
  const selectedOrganization = orgs.data?.organizations.find(o => o.id === organizationId);
  const selectedEvent = allEvents.find(e => e.id === selected);
  const managesAny = orgs.data?.organizations.some(o => canManageMembers(o, isSuperAdmin)) ?? false;
  const grouped = categorizeEvents(companyEvents);

  // A parent shortcut hands over a one-shot request: take it (it is then held
  // here, also while access is loading) and acknowledge it, so the parent
  // keeps nothing pending that a remount or another session could replay.
  useEffect(() => {
    if (!shouldTakeNewEventRequest(newEventRequest, lastTakenRequest.current)) return;
    lastTakenRequest.current = newEventRequest;
    setWantsNewEvent(true);
    onNewEventRequestTaken?.(newEventRequest);
  }, [newEventRequest, onNewEventRequestTaken]);
  useEffect(() => {
    if (!wantsNewEvent) return;
    const outcome = resolveNewEventRequest(entry);
    if (outcome.pending) return;
    setWantsNewEvent(false);
    if (outcome.openForm) { select(null); setLanding(undefined); setCreating(true); }
    setNotice(outcome.notice);
    setFocusTarget(outcome.focus);
  }, [wantsNewEvent, entry]);
  useEffect(() => {
    if (!focusTarget) return;
    focusAnchor(focusTarget);
    setFocusTarget(null);
  }, [focusTarget, creating, selected, notice]);
  const openEvent = (id: string | null) => { setNotice(null); setCreating(false); setLanding(undefined); select(id); };

  async function create(form: HTMLFormElement) {
    if (busy) return;
    const fields = Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, String(value)]));
    setBusy(true); setError("");
    try {
      // Created once; a failed plan generation keeps this event selected and is retried from its Plan tab.
      const result = await createEventWithPlan((path, body, method) => workspaceRequest(token, path, body, method), eventSetupBody(fields));
      refresh(n => n + 1); setCreating(false); setLanding(landingAfterSetup(result)); select(result.event.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); } finally { setBusy(false); }
  }

  // An open event stays open for viewing/editing; a request that cannot open
  // the form shows (and focuses) its notice above it.
  if (selected) return <div className="space-y-4" dir={ar ? "rtl" : "ltr"}>
    <SelectedEventHeader isArabic={ar} eventName={selectedEvent?.name} notice={notice} noticeMessage={notice === "error" ? orgs.error : undefined} waiting={wantsNewEvent && entry === "loading"} onBack={() => { openEvent(null); refresh(n => n + 1); }} onDismissNotice={() => setNotice(null)} />
    <EventWorkspace key={`${token}:${selected}`} token={token} eventId={selected} isArabic={ar} landing={landing} />
  </div>;

  return <div className="space-y-5" dir={ar ? "rtl" : "ltr"}>
    <Section id="organizer-event-entry" eyebrow={ar ? "مساحة الفعاليات الموحدة" : "Unified event workspace"} title={ar ? "فعاليات المؤسسة" : "Organization events"} description={ar ? "أنشئ فعالية أو نشاطاً جديداً، أو اختر فعالية قائمة لعرضها وتعديلها. التخطيط والاعتماد والتشغيل في مكان واحد." : "Create a new event or activity, or choose an existing one to view and edit. Plan, approve and operate in one place."} action={<Button size="sm" variant="ghost" leadingIcon={<RefreshCw className="size-4" aria-hidden />} onClick={() => refresh(n => n + 1)}>{ar ? "تحديث" : "Refresh"}</Button>}>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        {showNewEventButton ? <NewEventButton state={entry} isArabic={ar} expanded={creating} onClick={() => setWantsNewEvent(true)} /> : null}
        <label className="flex min-w-0 flex-col gap-1 text-sm text-ink-muted sm:w-72">{ar ? "المؤسسة" : "Organization"}<select className={workspaceInput} value={organizationId} onChange={e => setOrganization(e.target.value)}><option value="">{ar ? "جميع المؤسسات المصرح بها" : "All permitted organizations"}</option>{orgs.data?.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      </div>
      {entry === "no-access" && <div className="mt-4"><EventAccessNote isArabic={ar} /></div>}
      {entry === "error" && <div className="mt-4"><EventAccessError isArabic={ar} message={orgs.error} /></div>}
      {wantsNewEvent && entry === "loading" && <div className="mt-4"><NewEventWaiting isArabic={ar} /></div>}
      {(events.error || error) && <p role="alert" className="mt-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{events.error || error}</p>}
      {!events.data && !events.error && <p role="status" className="mt-4 text-sm text-ink-muted">{ar ? "جاري التحميل…" : "Loading…"}</p>}
      {!selectedOrganization && managesAny && <p data-members-hint className="mt-4 text-sm text-ink-muted">{ar ? "اختر مؤسسة لإدارة أعضائها ومنح دور «مدير» لمن يُنشئ الفعاليات." : "Choose an organization to manage its members and grant the Admin role to whoever creates events."}</p>}
    </Section>
    {selectedOrganization && canManageMembers(selectedOrganization, isSuperAdmin) && <details className="rounded-lg border border-hairline bg-surface-2 p-4"><summary className="cursor-pointer text-sm font-semibold text-ink">{ar ? "أعضاء المؤسسة والصلاحيات" : "Organization members & roles"}</summary><div className="mt-3"><OrganizationMembers key={selectedOrganization.id} token={token} organization={selectedOrganization} isArabic={ar} isSuperAdmin={isSuperAdmin} currentUserId={currentUserId} /></div></details>}
    {creating && canCreate.length > 0 && <EventSetupForm organizations={canCreate} defaultOrganizationId={organizationId} busy={busy} isArabic={ar} onSubmit={form => void create(form)} onCancel={() => setCreating(false)} />}
    {!events.data ? null : companyEvents.length === 0 ? (
      <Section title={ar ? "لا توجد فعاليات بعد" : "No events yet"}>
        <div data-events-empty className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <span className="grid size-9 place-items-center rounded-lg border border-hairline bg-surface-1 text-ink-faint" aria-hidden><CalendarDays className="size-4" /></span>
          <p className="text-sm font-semibold text-ink">{ar ? "لا توجد فعاليات في هذا النطاق" : "No events in this scope"}</p>
          <p className="max-w-sm text-sm text-ink-muted">{entry === "create" ? (ar ? `ابدأ بزر «${NEW_EVENT_LABEL_AR}».` : `Start with «${NEW_EVENT_LABEL_EN}».`) : (ar ? "ستظهر هنا الفعاليات المصرح لك بها." : "Events you are given access to will appear here.")}</p>
        </div>
      </Section>
    ) : (
      <div className="grid gap-4 lg:grid-cols-3">{STATUS_GROUPS.map(([status, labelAr, labelEn]) => <Section key={status} title={`${ar ? labelAr : labelEn} (${grouped[status].length})`}><div className="space-y-3">{grouped[status].map(event => <button key={event.id} type="button" data-event-card={event.id} aria-label={`${ar ? "فتح وتعديل" : "Open and edit"}: ${event.name}`} className="group w-full rounded-lg border border-hairline bg-surface-1 p-4 text-start transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:shadow-focus" onClick={() => openEvent(event.id)}><span className="flex items-start justify-between gap-2"><strong className="min-w-0 text-ink">{event.name}</strong><Badge size="sm" tone={event.planApproved ? "ok" : "warn"}>{event.planApproved ? (ar ? "معتمدة" : "Approved") : (ar ? "مسودة" : "Draft")}</Badge></span><span className="mt-1 block text-sm text-ink-muted">{event.locationLabel} · {event.vipGuestCount + event.regularGuestCount} {ar ? "ضيف" : "guests"}</span><span className="mt-1 block text-xs text-gold-500">{event.planApproved ? (event.contractSigned ? (ar ? "العقد موقع" : "Contract signed") : (ar ? "الخطة معتمدة — التشغيل متاح" : "Plan approved — operations unlocked")) : (ar ? "بانتظار اعتماد الخطة" : "Awaiting plan approval")}</span><span className="mt-3 block text-xs font-semibold text-ink-muted group-hover:text-ink">{ar ? "فتح وتعديل ←" : "Open & edit →"}</span></button>)}{grouped[status].length === 0 && <p className="text-sm text-ink-muted">{ar ? "لا توجد فعاليات" : "No events"}</p>}</div></Section>)}</div>
    )}
  </div>;
}

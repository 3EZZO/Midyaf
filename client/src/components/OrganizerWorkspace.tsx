import { useState } from "react";
import type { Session } from "@shared/domain";
import type { OrganizationDto, WorkspaceEventDto } from "@shared/overhaul";
import { OnboardingWorkspace } from "./OnboardingWorkspace";
import { Section } from "./Section";
import { EventWorkspace } from "./EventWorkspace";
import { EVENT_SETUP_HEADING_AR, EVENT_SETUP_HEADING_EN, categorizeEvents, createEventWithPlan, eventSetupBody, landingAfterSetup, type WorkspaceLanding } from "../lib/workspaceWorkflow";
import { useWorkspaceResource, workspaceRequest } from "../lib/workspaceApi";

export const workspaceInput = "w-full rounded-md border border-hairline bg-surface-1 p-2 text-ink";
export const workspaceButton = "rounded-md border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40";
export type WorkspaceProps = { token: string; isArabic: boolean; eventId: string };
export function OrganizerWorkspace({ session, isArabic }: { session?: Session | null; isArabic: boolean }) {
  if (!session) return <p>{isArabic ? "سجل الدخول لعرض فعاليات المؤسسة" : "Sign in to view organization events"}</p>;
  return <div className="space-y-4"><OrganizerContent key={session.accessToken} token={session.accessToken} isArabic={isArabic} /><details><summary>{isArabic?"تسجيل الموردين والعملاء":"Vendor / client registration"}</summary><OnboardingWorkspace key={session.accessToken} session={session} isArabic={isArabic}/></details></div>;
}

/**
 * The only event-creation form in the product (RADAR-ORGANIZER-001): it sits
 * under the exact heading «إدخال وتجهيز فعالية جديدة» inside the company
 * workspace and posts to the organization-scoped /workspace API.
 */
export function EventSetupForm({ organizations, defaultOrganizationId, busy, isArabic: ar, onSubmit }: { organizations: OrganizationDto[]; defaultOrganizationId?: string; busy: boolean; isArabic: boolean; onSubmit: (form: HTMLFormElement) => void }) {
  return <Section title={<span lang="ar" dir="rtl">{EVENT_SETUP_HEADING_AR}</span>} eyebrow={ar ? undefined : EVENT_SETUP_HEADING_EN} description={ar ? "جميع الأوقات بتوقيت الرياض. يُنشأ مقترح الخطة تلقائياً بعد الحفظ ويبقى مسودة حتى الاعتماد" : "All times in Riyadh (UTC+03:00). An advisory plan is generated after saving and stays a locked draft until approved"}>
    <form data-event-setup className="grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); onSubmit(e.currentTarget); }}>
      <label>{ar ? "المؤسسة" : "Organization"}<select required className={workspaceInput} name="organizationId" defaultValue={organizations.find(o => o.id === defaultOrganizationId)?.id ?? organizations[0]?.id}>{organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label>{ar ? "اسم الفعالية" : "Event name"}<input required minLength={2} maxLength={160} name="name" className={workspaceInput} /></label>
      <label>{ar ? "الموقع" : "Location"}<input required minLength={2} maxLength={200} name="locationLabel" className={workspaceInput} /></label>
      <label>{ar ? "نطاق الفنادق (اختياري — يُترك للمقترح)" : "Hotel zone (optional — leave to the advisory plan)"}<input name="hotelZone" maxLength={120} className={workspaceInput} /></label>
      <label>{ar ? "طريقة التخطيط" : "Planning mode"}<select name="planningMode" defaultValue="AI" className={workspaceInput}><option value="AI">{ar ? "مقترح آلي مع اعتماد بشري" : "Assisted plan, human approval"}</option><option value="MANUAL">{ar ? "يدوي" : "Manual"}</option></select></label>
      {([['vipGuestCount', ar ? 'كبار الشخصيات' : 'VIP guests'], ['regularGuestCount', ar ? 'ضيوف عاديون' : 'Regular guests'], ['carCount', ar ? 'عدد المحتاجين لسيارات' : 'Guests needing vehicles']] as const).map(([name,label]) => <label key={name}>{label}<input required type="number" min="0" max="100000" defaultValue="0" name={name} className={workspaceInput}/></label>)}
      {([['startAt', ar ? 'بداية الفعالية' : 'Event start'], ['endAt', ar ? 'نهاية الفعالية' : 'Event end'], ['arrivalStartAt', ar ? 'بداية وصول الضيوف' : 'Guest arrivals from'], ['departureEndAt', ar ? 'نهاية مغادرة الضيوف' : 'Guest departures until']] as const).map(([name,label]) => <label key={name}>{label}<input type="datetime-local" required={name === 'startAt' || name === 'endAt'} name={name} className={workspaceInput}/></label>)}
      <button className={workspaceButton} disabled={busy}>{busy ? (ar ? "جارٍ الحفظ وتجهيز المقترح…" : "Saving & preparing the plan…") : (ar ? "حفظ وفتح خطة الفعالية" : "Save & open event plan")}</button>
    </form>
  </Section>;
}

function OrganizerContent({ token, isArabic: ar }: { token: string; isArabic: boolean }) {
  const [revision, refresh] = useState(0); const [selected, select] = useState<string | null>(null);
  const [landing, setLanding] = useState<WorkspaceLanding | undefined>(undefined);
  const [organizationId, setOrganization] = useState(""); const [creating, setCreating] = useState(false);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const events = useWorkspaceResource<{ events: WorkspaceEventDto[] }>(token, "/events", revision);
  const orgs = useWorkspaceResource<{ organizations: OrganizationDto[] }>(token, "/organizations", revision);
  const canCreate = orgs.data?.organizations.filter(o => ["OWNER", "ADMIN"].includes(o.myRole ?? "") && o.kind !== "VENDOR") ?? [];
  const companyEvents = events.data?.events.filter(e => !organizationId || e.organizationId === organizationId) ?? [];
  const grouped = categorizeEvents(companyEvents);
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
  if (selected) return <div className="space-y-4" dir={ar ? "rtl" : "ltr"}><button className={workspaceButton} onClick={() => { select(null); setLanding(undefined); refresh(n => n + 1); }}>{ar ? "جميع الفعاليات" : "All events"}</button><EventWorkspace key={`${token}:${selected}`} token={token} eventId={selected} isArabic={ar} landing={landing} /></div>;
  return <div className="space-y-5" dir={ar ? "rtl" : "ltr"}>
    <Section title={ar ? "لوحة المنظم — مساحة الفعاليات الموحدة" : "Organizer — event workspace"} description={ar ? "التخطيط والاعتماد والتشغيل في مكان واحد" : "Plan, approve and operate each event in one place"} action={<button className={workspaceButton} onClick={() => refresh(n => n + 1)}>{ar ? "تحديث" : "Refresh"}</button>}>
      <div className="flex flex-wrap gap-3"><label>{ar ? "المؤسسة" : "Organization"}<select className={workspaceInput} value={organizationId} onChange={e => setOrganization(e.target.value)}><option value="">{ar ? "جميع المؤسسات المصرح بها" : "All permitted organizations"}</option>{orgs.data?.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>{canCreate.length > 0 && <button className={workspaceButton} aria-expanded={creating} onClick={() => setCreating(!creating)}>{ar ? EVENT_SETUP_HEADING_AR : `${EVENT_SETUP_HEADING_AR} · ${EVENT_SETUP_HEADING_EN}`}</button>}</div>
      {(events.error || orgs.error || error) && <p role="alert" className="mt-3 text-red-500">{events.error || orgs.error || error}</p>}
      {!events.data && !events.error && <p role="status">{ar ? "جاري التحميل…" : "Loading…"}</p>}
    </Section>
    {creating && canCreate.length > 0 && <EventSetupForm organizations={canCreate} defaultOrganizationId={organizationId} busy={busy} isArabic={ar} onSubmit={form => void create(form)} />}
    <div className="grid gap-4 lg:grid-cols-3">{([['PLANNING', ar ? 'تحت التخطيط' : 'Under planning'], ['ACTIVE', ar ? 'نشطة' : 'Active'], ['COMPLETED', ar ? 'مكتملة' : 'Completed']] as const).map(([status,label]) => <Section key={status} title={`${label} (${grouped[status].length})`}><div className="space-y-3">{grouped[status].map(event => <button key={event.id} className="w-full rounded-lg border border-hairline bg-surface-1 p-4 text-start hover:border-gold-500" onClick={() => { setLanding(undefined); select(event.id); }}><strong>{event.name}</strong><p className="text-sm text-ink-muted">{event.locationLabel} · {event.vipGuestCount + event.regularGuestCount} {ar ? "ضيف" : "guests"}</p><p className="text-xs text-gold-500">{event.planApproved ? (event.contractSigned ? (ar ? "العقد موقع" : "Contract signed") : (ar ? "الخطة معتمدة — التشغيل متاح" : "Plan approved — operations unlocked")) : (ar ? "بانتظار اعتماد الخطة" : "Awaiting plan approval")}</p></button>)}{grouped[status].length === 0 && <p className="text-sm text-ink-muted">{ar ? "لا توجد فعاليات" : "No events"}</p>}</div></Section>)}</div>
  </div>;
}

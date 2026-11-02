// Organizing company dashboard.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, CalendarClock, CheckCircle2, Plus, Radio, Users } from "lucide-react";
import type { WorkspaceEventDto } from "@shared/overhaul";
import { OrganizerWorkspace, newEventLabel, useNewEventRequest } from "../../components/OrganizerWorkspace";
import { Button, KpiTile, SkeletonKpiRow } from "../../components/ui";
import { PortalHero } from "../../components/ui/PortalHero";
import { categorizeEvents } from "../../lib/workspaceWorkflow";
import { useWorkspaceResource } from "../../lib/workspaceApi";
import { integer } from "../../lib/format";
import { isArabicLanguage } from "../../lib/localize";
import type { PortalProps } from "../types";

/**
 * Counts for the summary row, derived only from the organization-scoped
 * /workspace/events the signed-in user may see. No sample or invented values.
 */
export function companyEventSummary(events: WorkspaceEventDto[]) {
  const grouped = categorizeEvents(events);
  return {
    total: events.length,
    planning: grouped.PLANNING.length,
    active: grouped.ACTIVE.length,
    completed: grouped.COMPLETED.length,
    awaitingApproval: events.filter(e => !e.planApproved && e.operationalStatus !== "COMPLETED").length,
    approved: events.filter(e => e.planApproved).length,
    guests: events.reduce((sum, e) => sum + e.vipGuestCount + e.regularGuestCount, 0),
    vipGuests: events.reduce((sum, e) => sum + e.vipGuestCount, 0)
  };
}

/** Summary row with explicit loading, error and empty states. */
export function CompanyEventSummary({ resource, isArabic: ar }: { resource: { data?: { events: WorkspaceEventDto[] }; error?: string }; isArabic: boolean }) {
  if (resource.error) {
    return <p role="alert" data-company-summary="error" className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">{ar ? `تعذر تحميل ملخص الفعاليات: ${resource.error}` : `Event summary unavailable: ${resource.error}`}</p>;
  }
  if (!resource.data) {
    return <div data-company-summary="loading" role="status" aria-label={ar ? "جاري تحميل ملخص الفعاليات" : "Loading event summary"}><SkeletonKpiRow /></div>;
  }
  const s = companyEventSummary(resource.data.events);
  return <div data-company-summary="ready" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <KpiTile label={ar ? "فعاليات تحت التخطيط" : "Under planning"} value={s.planning} detail={ar ? `من ${integer(s.total)} فعالية مصرح بها` : `of ${integer(s.total)} permitted events`} icon={<CalendarClock className="size-4" aria-hidden />} tone="gold" />
    <KpiTile label={ar ? "بانتظار اعتماد الخطة" : "Awaiting plan approval"} value={s.awaitingApproval} detail={ar ? "لا يبدأ التشغيل قبل الاعتماد" : "Operations start only after approval"} icon={<CheckCircle2 className="size-4" aria-hidden />} tone={s.awaitingApproval ? "warn" : "none"} />
    <KpiTile label={ar ? "فعاليات نشطة" : "Active events"} value={s.active} detail={ar ? `${integer(s.completed)} مكتملة` : `${integer(s.completed)} completed`} icon={<Radio className="size-4" aria-hidden />} tone={s.active ? "ok" : "none"} />
    <KpiTile label={ar ? "الضيوف المخطط لهم" : "Planned guests"} value={s.guests} detail={ar ? `منهم ${integer(s.vipGuests)} من كبار الشخصيات` : `${integer(s.vipGuests)} VIP`} icon={<Users className="size-4" aria-hidden />} />
  </div>;
}

/**
 * RADAR-ORGANIZER-001: the company portal is the unified organizer workspace
 * for every role and in demo mode too. The former demo-only dashboard (local
 * intake summary, browser-stored client permissions) bypassed it and is
 * gone; the scripted War Room demo is unaffected. Event setup happens only
 * in the workspace's «إدخال وتجهيز فعالية جديدة» section.
 *
 * SILA-DASHBOARD-003: a page hero with the «New event / activity» action and
 * a summary row from the same scoped events API. The hero action only asks
 * the workspace for its canonical form or its role explanation.
 */
export function CompanyDashboard({ session }: PortalProps) {
  const { i18n } = useTranslation();
  const ar = isArabicLanguage(i18n.language);
  const [revision, setRevision] = useState(0);
  // One-shot request scoped to this session: the workspace acknowledges it,
  // so a remount or a session/actor change never replays it.
  const newEventShortcut = useNewEventRequest(session?.accessToken);
  const events = useWorkspaceResource<{ events: WorkspaceEventDto[] }>(session?.accessToken ?? "", session ? "/events" : null, revision, "/workspace", true);
  return <div className="space-y-6" dir={ar ? "rtl" : "ltr"}>
    <PortalHero
      badge={<span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5" aria-hidden />{ar ? "الشركة المنظِّمة" : "Organizing company"}</span>}
      title={ar ? "مساحة الشركة المنظِّمة للفعاليات" : "Organizing company events"}
      body={ar ? "أدخل فعالية أو نشاطاً جديداً، ثم تابع تخطيطه واعتماده وتشغيله. افتح أي فعالية أدناه لعرضها أو تعديلها." : "Enter a new event or activity, then follow its planning, approval and operations. Open any event below to view or edit it."}
      action={session ? <Button data-company-new-event="shortcut" variant="gold" size="lg" leadingIcon={<Plus className="size-5" aria-hidden />} aria-controls="organizer-event-entry" onClick={newEventShortcut.requestNewEvent}>{newEventLabel(ar)}</Button> : undefined}
    />
    {session ? <CompanyEventSummary resource={events} isArabic={ar} /> : null}
    <OrganizerWorkspace session={session} isArabic={ar} newEventRequest={newEventShortcut.newEventRequest} onNewEventRequestTaken={newEventShortcut.acknowledgeNewEventRequest} showNewEventButton={false} onEventsChanged={() => setRevision(n => n + 1)} />
  </div>;
}

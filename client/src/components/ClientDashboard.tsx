import { useMemo, useState, type FormEvent } from "react";
import { Building2, CalendarDays, CheckCircle2, Clock, Download, FileText, Lock, MessageSquare, Send, ShieldCheck, Users } from "lucide-react";
import type { ClientMessage, ClientPermissionConfig, MidyafData, ScheduleAmendment, Session } from "@shared/domain";
import { DEFAULT_CLIENT_CONFIG, DEFAULT_CLIENT_MESSAGES, DEFAULT_SCHEDULE_AMENDMENTS } from "@shared/constants";
import type { WorkspaceEventDto } from "@shared/overhaul";
import { integer, shortDate, shortTime } from "../lib/format";
import { deriveClientKpis, guestFunnel, slaSample } from "../lib/metrics";
import { localizeDemoText } from "../lib/localizeDemo";
import { localizeAmendmentType } from "../lib/localizeDomain";
import { useWorkspaceResource } from "../lib/workspaceApi";
import { Funnel } from "./charts";
import { EventLifecycleRail } from "./EventLifecycleRail";
import { MessagesCenter } from "./MessagesCenter";
import { PlanApprovalQueue, canShowApprovalQueue } from "./PlanApprovalQueue";
import { Badge, Button, EmptyState, IconTabNav, Input, KpiTile, Section, StatusPill, Surface, useToast } from "./ui";
import { SaduRibbon } from "./ui/SaduRibbon";

type Tab = "amendments" | "chat" | "reports";

type WorkspaceEventUpdate = {
  id: string;
  action: string;
  at: string;
  actor: string;
};

const WORKSPACE_ACTION_LABELS: Record<string, { en: string; ar: string; tone: "info" | "ok" | "warn" | "danger" }> = {
  "workspace.event.create": { en: "Event workspace created", ar: "إنشاء مساحة الفعالية", tone: "info" },
  "workspace.event.update": { en: "Event details updated", ar: "تحديث تفاصيل الفعالية", tone: "info" },
  "workspace.event.scope_change": { en: "Event scope updated", ar: "تعديل نطاق الفعالية", tone: "warn" },
  "workspace.event.status": { en: "Operational status changed", ar: "تغيير الحالة التشغيلية", tone: "info" },
  "workspace.plan.generate": { en: "Logistics plan draft generated", ar: "إعداد مسودة الخطة اللوجستية", tone: "info" },
  "workspace.plan.approve": { en: "Logistics plan approved", ar: "اعتماد الخطة اللوجستية", tone: "ok" },
  "workspace.member.add": { en: "Team member assigned", ar: "إضافة عضو للفريق", tone: "info" },
  "workspace.member.update": { en: "Team permissions updated", ar: "تحديث صلاحيات الفريق", tone: "info" },
  "workspace.dispatch": { en: "Operational dispatch issued", ar: "إصدار توجيه تشغيلي", tone: "info" },
  "workspace.dispatch.emergency": { en: "Emergency dispatch alert", ar: "تنبيه طوارئ تشغيلي", tone: "danger" }
};

export function describeWorkspaceUpdateAction(action: string, isArabic: boolean) {
  const known = WORKSPACE_ACTION_LABELS[action];
  if (known) {
    return { label: isArabic ? known.ar : known.en, tone: known.tone };
  }
  return { label: action.replace(/^workspace\./, "").replace(/[._]/g, " "), tone: "info" as const };
}

function buildLiveClientConfig(
  session: Session | null,
  primaryWorkspaceEvent: WorkspaceEventDto | undefined,
  legacyEventName: string | undefined,
  isArabic: boolean
): ClientPermissionConfig {
  return {
    clientId: session?.user.id ?? "live-client",
    clientName: session?.user.name || (isArabic ? "حساب العميل" : "Client Account"),
    clientEntity: session?.user.email || (isArabic ? "مساحة عمل مضياف" : "Midyaf Workspace"),
    eventTitle: primaryWorkspaceEvent?.name || legacyEventName || (isArabic ? "بوابة العميل" : "Client Portal"),
    canViewReports: true,
    canViewScheduleAmendments: true,
    canCommunicateLogistics: true,
    canViewPerformance: true,
    shareableToken: "",
    createdAt: "",
    isActive: true
  };
}

function Locked({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-2 p-4 text-sm text-ink-muted">
      <Lock className="size-4 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

export function ClientDashboard({
  data,
  session = null,
  isArabic = true,
  config: providedConfig,
  isDemoMode = false,
  onDownloadReport,
  onPlanApproved
}: {
  data: MidyafData;
  session?: Session | null;
  isArabic?: boolean;
  config?: ClientPermissionConfig;
  isDemoMode?: boolean;
  onDownloadReport?: () => void;
  onPlanApproved?: () => void;
}) {
  const toast = useToast();
  const event = data.events[0];
  const report = data.companyReports[0];

  const [activeTab, setActiveTab] = useState<Tab>("amendments");
  const [demoMessages, setDemoMessages] = useState<ClientMessage[]>(DEFAULT_CLIENT_MESSAGES);
  const [newMessageText, setNewMessageText] = useState("");
  const [selectedUpdateEventId, setSelectedUpdateEventId] = useState("");
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const workspaceEnabled = canShowApprovalQueue(session);
  const workspaceEvents = useWorkspaceResource<{ events: WorkspaceEventDto[] }>(
    session?.accessToken ?? "",
    workspaceEnabled ? "/events" : null,
    workspaceRevision,
    "/workspace",
    true
  );

  const liveEvents = workspaceEvents.data?.events ?? [];
  const activeWorkspaceEvent =
    liveEvents.find((item) => item.id === selectedUpdateEventId) ?? liveEvents[0];

  // PLAN_READY_1 Sprint 1: live clients load real event timeline updates instead of demo amendments.
  const liveEventUpdates = useWorkspaceResource<{ updates: WorkspaceEventUpdate[] }>(
    session?.accessToken ?? "",
    !isDemoMode && session?.accessToken && activeWorkspaceEvent
      ? `/events/${activeWorkspaceEvent.id}/updates`
      : null,
    workspaceRevision,
    "/workspace",
    true
  );

  // Gate DEFAULT_CLIENT_CONFIG, DEFAULT_SCHEDULE_AMENDMENTS, and DEFAULT_CLIENT_MESSAGES behind isDemoMode === true.
  const config: ClientPermissionConfig = providedConfig
    ? providedConfig
    : isDemoMode
      ? DEFAULT_CLIENT_CONFIG
      : buildLiveClientConfig(session, activeWorkspaceEvent, event?.name, isArabic);

  const demoAmendments: ScheduleAmendment[] = isDemoMode ? DEFAULT_SCHEDULE_AMENDMENTS : [];
  const updates = liveEventUpdates.data?.updates ?? [];

  // ── Selectors ──
  const kpis = useMemo(() => deriveClientKpis(data, isDemoMode), [data, isDemoMode]);
  const funnel = useMemo(() => guestFunnel(event?.guests ?? [], data.guestJourneys, isDemoMode), [event?.guests, data.guestJourneys, isDemoMode]);
  const sla = useMemo(() => slaSample(event?.tasks ?? []), [event?.tasks]);

  const handleSendDemoMessage = (e: FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim()) return;
    const newMsg: ClientMessage = {
      id: `msg-${Date.now().toString().slice(-4)}`,
      clientId: config.clientId,
      senderName: config.clientName,
      senderRole: "CLIENT",
      message: newMessageText.trim(),
      timestamp: shortTime(new Date().toISOString()),
      isRead: true
    };
    setDemoMessages((prev) => [...prev, newMsg]);
    setNewMessageText("");
    toast.success(
      isArabic ? "تم إرسال رسالتك لمدير العمليات" : "Message Dispatched",
      isArabic ? "سيتولى مدير العمليات اللوجستية (صلة) الرد فوراً" : "Sila Logistics Manager will respond shortly"
    );
  };

  const tabs = [
    ...(config.canViewScheduleAmendments
      ? [
          {
            id: "amendments" as const,
            icon: Clock,
            labelEn: isDemoMode ? "Schedule Amendments" : "Event Timeline",
            labelAr: isDemoMode ? "التعديلات المباشرة" : "سجل تحديثات الفعالية"
          }
        ]
      : []),
    ...(config.canCommunicateLogistics ? [{ id: "chat" as const, icon: MessageSquare, labelEn: "Logistics Chat", labelAr: "التواصل اللوجستي" }] : []),
    ...(config.canViewReports ? [{ id: "reports" as const, icon: FileText, labelEn: "Executive Reports", labelAr: "التقارير التنفيذية" }] : [])
  ];

  const permissions = [
    { on: config.canViewReports, label: isArabic ? "التقارير" : "Reports" },
    { on: config.canViewScheduleAmendments, label: isArabic ? "تعديلات الجداول" : "Schedule Updates" },
    { on: config.canCommunicateLogistics, label: isArabic ? "التواصل المباشر" : "Direct Chat" },
    { on: config.canViewPerformance, label: isArabic ? "مؤشرات الأداء" : "Performance KPIs" }
  ];

  const clientDisplayName = isDemoMode ? localizeDemoText(config.clientName, isArabic) : config.clientName;
  const clientDisplayEntity = isDemoMode ? localizeDemoText(config.clientEntity, isArabic) : config.clientEntity;
  const eventDisplayTitle = isDemoMode ? localizeDemoText(config.eventTitle, isArabic) : config.eventTitle;

  return (
    <div className="space-y-5" dir={isArabic ? "rtl" : "ltr"}>
      {/* Qasr P4: Compact royal hospitality welcome header so the decision card sits immediately above the fold */}
      <header className="space-y-2.5" data-client-compact-hero>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <Badge tone="gold" size="sm" className="max-w-full whitespace-normal [&_svg]:shrink-0">
              <Building2 className="size-3.5" aria-hidden />
              {isArabic ? "بوابة العميل المستفيد المخصصة" : "Dedicated Client Executive Portal"}
            </Badge>
            <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {isArabic
                ? `مرحباً بك: ${clientDisplayName} — ${clientDisplayEntity}`
                : `Welcome: ${clientDisplayName} — ${clientDisplayEntity}`}
            </h1>
          </div>
        </div>
        <p className="hidden max-w-3xl text-sm leading-relaxed text-ink-muted sm:block">
          {isArabic
            ? `لوحة المتابعة الخاصة بفعالية (${eventDisplayTitle})، تتيح لك الاطلاع الفوري على التقارير، تحديثات الفعالية، والتواصل المباشر مع العمليات.`
            : `Executive dashboard for (${eventDisplayTitle}), providing verified reports, live event updates, and direct communication with logistics.`}
        </p>
        <SaduRibbon variant="hairline" className="opacity-70" />
      </header>

      {/* SIX-TASKS #1 / Qasr P4: One-click plan approval decision card above the fold */}
      <PlanApprovalQueue
        session={session}
        isArabic={isArabic}
        onApproved={() => {
          setWorkspaceRevision((n) => n + 1);
          onPlanApproved?.();
        }}
      />

      {workspaceEnabled ? (
        <Section
          id="section-client-events"
          title={isArabic ? "فعالياتك المرتبطة" : "Your workspace events"}
          eyebrow={isArabic ? "من مساحة العمل" : "From workspace"}
          isArabic={isArabic}
        >
          {workspaceEvents.error ? (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              {workspaceEvents.error}
            </p>
          ) : !workspaceEvents.data ? (
            <p role="status" className="text-sm text-ink-muted">
              {isArabic ? "جارٍ تحميل الفعاليات…" : "Loading events…"}
            </p>
          ) : workspaceEvents.data.events.length === 0 ? (
            <EmptyState
              compact
              icon={<CalendarDays className="size-4" aria-hidden />}
              title={isArabic ? "لا توجد فعاليات مرتبطة بحسابك حالياً" : "No workspace events assigned yet"}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2" data-client-workspace-events>
              {workspaceEvents.data.events.map((wsEvent) => (
                <Surface key={wsEvent.id} padding="sm" className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink">{isDemoMode ? localizeDemoText(wsEvent.name, isArabic) : wsEvent.name}</h3>
                    <div className="flex items-center gap-1.5">
                      <Badge size="sm" tone={wsEvent.planApproved ? "ok" : "warn"}>
                        {wsEvent.planApproved
                          ? isArabic
                            ? "الخطة معتمدة"
                            : "Plan approved"
                          : isArabic
                            ? "بانتظار الاعتماد"
                            : "Awaiting approval"}
                      </Badge>
                      <StatusPill status={wsEvent.operationalStatus} size="sm" />
                    </div>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {isDemoMode ? localizeDemoText(wsEvent.locationLabel, isArabic) : wsEvent.locationLabel} · {integer(wsEvent.vipGuestCount + wsEvent.regularGuestCount)}{" "}
                    {isArabic ? "ضيف" : "guests"}
                    {wsEvent.startAt ? ` · ${shortDate(wsEvent.startAt, isArabic ? "ar" : "en")}` : ""}
                  </p>
                  <EventLifecycleRail
                    compact
                    planApproved={wsEvent.planApproved}
                    contractSigned={wsEvent.contractSigned}
                    operationalStatus={wsEvent.operationalStatus}
                    isArabic={isArabic}
                  />
                </Surface>
              ))}
            </div>
          )}
        </Section>
      ) : null}

      {/* Permissions transparency */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-2 p-3.5 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold text-ink">
          <ShieldCheck className="size-4 text-gold-500" aria-hidden />
          {isArabic ? "مستوى الصلاحيات المصرح به:" : "Authorized Access Privileges:"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {permissions.map((p) => (
            <Badge key={p.label} tone={p.on ? "ok" : "neutral"}>
              {p.on ? "✓" : "✕"} {p.label}
            </Badge>
          ))}
        </div>
      </div>

      {config.canViewPerformance ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiTile label={isArabic ? "دقة الالتزام بالمواعيد" : "Punctuality SLA"} value={kpis.onTimePercent.value} format="percent" detail={isArabic ? "ضمن معايير البروتوكول المعتمدة" : "Within protocol standard"} tone={kpis.onTimePercent.value >= 95 ? "ok" : "warn"} size="lg" />
            <KpiTile label={isArabic ? "الضيوف المستقبلون" : "Guests Welcomed"} value={`${integer(kpis.guestsServed.served)} / ${integer(kpis.guestsServed.total)}`} detail={kpis.guestsServed.served === kpis.guestsServed.total && kpis.guestsServed.total > 0 ? (isArabic ? "اكتمال وصول جميع الوفود" : "All delegations arrived safely") : isArabic ? "الوصول جارٍ" : "Arrivals in progress"} icon={<Users className="size-4" aria-hidden />} size="lg" />
            <KpiTile label={isArabic ? "المهام المكتملة" : "Tasks Completed"} value={`${integer(kpis.tasksCompleted.completed)} / ${integer(kpis.tasksCompleted.total)}`} detail={isArabic ? `${integer(sla.delayed)} متأخرة` : `${integer(sla.delayed)} delayed`} tone={sla.delayed ? "warn" : "none"} size="lg" />
            <KpiTile label={isArabic ? "الحوادث الحرجة" : "Critical Incidents"} value={kpis.openIssues.value} detail={kpis.openIssues.value === 0 ? (isArabic ? "سجل تشغيلي نظيف 100%" : "100% clean incident record") : isArabic ? "بلاغات مفتوحة" : "Open issues"} tone={kpis.openIssues.value === 0 ? "ok" : "danger"} size="lg" />
          </div>
          <Section
            id="section-client-journey"
            title={isArabic ? "رحلة الوفود" : "Delegation journey"}
            eyebrow={isArabic ? "من الدعوة إلى الوصول" : "Invitation to arrival"}
            isArabic={isArabic}
          >
            <Funnel stages={funnel} isArabic={isArabic} className="max-w-2xl" />
          </Section>
        </>
      ) : (
        <Locked text={isArabic ? "عرض مؤشرات الأداء مقفل حالياً بناءً على صلاحيات الفعالية." : "Performance data view is currently restricted."} />
      )}

      {tabs.length ? (
        <IconTabNav
          tabs={tabs}
          value={activeTab}
          onChange={setActiveTab}
          layoutId="client-tabs"
          storageId="client-tabs"
          isArabic={isArabic}
          ariaLabel={isArabic ? "أقسام بوابة العميل" : "Client portal sections"}
        />
      ) : null}

      {activeTab === "amendments" &&
        (config.canViewScheduleAmendments ? (
          isDemoMode ? (
            <Section id="section-client-amendments" title={isArabic ? "التعديلات المباشرة" : "Schedule Amendments"} isArabic={isArabic}>
              {demoAmendments.length === 0 ? (
                <EmptyState compact title={isArabic ? "لا توجد تعديلات" : "No amendments"} />
              ) : (
                <ul className="space-y-3">
                  {demoAmendments.map((amd) => (
                    <li key={amd.id}>
                      <Surface padding="sm" className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink">{isArabic ? amd.titleAr || amd.title : amd.titleEn || amd.title}</span>
                            <Badge tone="info">{localizeAmendmentType(amd.type, isArabic)}</Badge>
                            <span className="font-tnum text-xs text-ink-faint">{amd.updatedAt}</span>
                          </div>
                          <p className="text-xs text-ink-muted">
                            {isArabic ? `الأطراف المعنية: ${amd.affectedGuestsAr || amd.affectedGuests}` : `Affected: ${amd.affectedGuestsEn || amd.affectedGuests}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <div className="text-end text-xs">
                            <span className="block font-tnum text-ink-faint line-through">{amd.originalTime}</span>
                            <span className="font-tnum text-sm font-bold text-gold-500">{amd.revisedTime}</span>
                          </div>
                          <Badge tone="ok">
                            <CheckCircle2 className="size-3" aria-hidden />
                            {isArabic ? "معتمد ومنفذ" : "Confirmed"}
                          </Badge>
                        </div>
                      </Surface>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ) : (
            <Section
              id="section-client-amendments"
              title={isArabic ? "سجل تحديثات الفعالية" : "Live Event Timeline"}
              eyebrow={isArabic ? "من سجل العمليات المباشر" : "Live workspace activity"}
              isArabic={isArabic}
              action={
                liveEvents.length > 1 ? (
                  <select
                    aria-label={isArabic ? "اختر الفعالية" : "Select event"}
                    value={activeWorkspaceEvent?.id ?? ""}
                    onChange={(e) => setSelectedUpdateEventId(e.target.value)}
                    className="rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 text-xs text-ink"
                  >
                    {liveEvents.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                ) : undefined
              }
            >
              {liveEventUpdates.error ? (
                <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                  {liveEventUpdates.error}
                </p>
              ) : !activeWorkspaceEvent ? (
                <EmptyState
                  compact
                  icon={<Clock className="size-4" aria-hidden />}
                  title={isArabic ? "لا توجد تحديثات تشغيلية حتى الآن" : "No live event updates yet"}
                  description={isArabic ? "ستظهر التحديثات هنا تلقائياً عند ربط فعالية بحسابك." : "Updates will appear here automatically once an event is linked to your account."}
                />
              ) : !liveEventUpdates.data ? (
                <p role="status" className="text-sm text-ink-muted">
                  {isArabic ? "جارٍ تحميل سجل التحديثات…" : "Loading event updates…"}
                </p>
              ) : updates.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Clock className="size-4" aria-hidden />}
                  title={isArabic ? "لا توجد تحديثات تشغيلية حتى الآن" : "No live event updates yet"}
                />
              ) : (
                <ul className="space-y-3" data-client-live-updates>
                  {updates.map((item) => {
                    const desc = describeWorkspaceUpdateAction(item.action, isArabic);
                    return (
                      <li key={item.id}>
                        <Surface padding="sm" className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={desc.tone}>{desc.label}</Badge>
                              <span className="text-xs font-medium text-ink-muted">{item.actor}</span>
                            </div>
                          </div>
                          <time className="font-tnum text-xs text-ink-faint">
                            {shortDate(item.at, isArabic ? "ar" : "en")} · {shortTime(item.at, isArabic ? "ar" : "en")}
                          </time>
                        </Surface>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          )
        ) : (
          <Locked text={isArabic ? "عرض تعديلات الجداول مقفل حالياً." : "Schedule updates view is currently restricted."} />
        ))}

      {activeTab === "chat" &&
        (config.canCommunicateLogistics ? (
          isDemoMode ? (
            <Section id="section-client-chat" title={isArabic ? "القناة المباشرة مع مدير العمليات اللوجستية (صلة)" : "Direct Channel with Sila Logistics Manager"} isArabic={isArabic}>
              <ul className="mb-4 max-h-72 space-y-3 overflow-y-auto p-1">
                {demoMessages.map((m) => {
                  const fromClient = m.senderRole === "CLIENT";
                  return (
                    <li key={m.id} className={`flex flex-col ${fromClient ? "items-start" : "items-end"}`}>
                      <div className="mb-1 flex items-center gap-1.5 text-xs text-ink-faint">
                        <span className="font-semibold">{m.senderName}</span>
                        <span>·</span>
                        <span className="font-tnum">{m.timestamp}</span>
                      </div>
                      <div className={`max-w-xl rounded-lg px-4 py-2.5 text-sm leading-relaxed ${fromClient ? "rounded-ss-none bg-surface-1 text-ink" : "rounded-se-none bg-gold-500/15 text-ink"}`}>
                        {isArabic ? m.messageAr || m.message : m.messageEn || m.message}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <form onSubmit={handleSendDemoMessage} className="flex gap-2">
                <Input
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  aria-label={isArabic ? "رسالة" : "Message"}
                  placeholder={isArabic ? "اكتب رسالة أو استفساراً لمدير العمليات اللوجستية (صلة)..." : "Send a note or request to Sila Logistics Manager..."}
                />
                <Button type="submit" leadingIcon={<Send className="size-4" aria-hidden />}>
                  {isArabic ? "إرسال" : "Send"}
                </Button>
              </form>
            </Section>
          ) : (
            <div data-client-live-messages>
              <MessagesCenter session={session ?? undefined} isArabic={isArabic} />
            </div>
          )
        ) : (
          <Locked text={isArabic ? "التواصل المباشر مع مدير العمليات مقفل حالياً." : "Direct communication with Logistics Manager is currently restricted."} />
        ))}

      {activeTab === "reports" &&
        (config.canViewReports ? (
          <Section
            id="section-client-reports"
            title={isArabic ? "التقارير التنفيذية" : "Executive Reports"}
            isArabic={isArabic}
            action={
              onDownloadReport && (report || isDemoMode) ? (
                <Button size="sm" variant="gold" leadingIcon={<Download className="size-4" aria-hidden />} onClick={onDownloadReport}>
                  {isArabic ? "تحميل التقرير التنفيذي PDF" : "Download PDF Report"}
                </Button>
              ) : undefined
            }
          >
            {!report && !isDemoMode ? (
              <EmptyState
                compact
                icon={<FileText className="size-4" aria-hidden />}
                title={isArabic ? "لا توجد تقارير تنفيذية معتمدة بعد" : "No confirmed executive reports yet"}
                description={isArabic ? "سيظهر التقرير الختامي المعتمد هنا فور إصداره من فريق العمليات." : "Confirmed executive reports will appear here as soon as they are issued by operations."}
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-bold text-ink">
                      {report?.title || (isArabic ? "التقرير الختامي المعتمد للفعالية — قمة القيادة والضيافة" : "Confirmed Event Report — Leadership Summit")}
                    </h4>
                    <p className="mt-1 font-tnum text-xs text-ink-muted">
                      {report?.updatedAt
                        ? isArabic
                          ? `آخر تحديث: ${shortDate(report.updatedAt, "ar")}`
                          : `Updated: ${shortDate(report.updatedAt, "en")}`
                        : isArabic
                          ? "تاريخ الإصدار: 10 سبتمبر 2026 · اعتماد مدير العمليات (صلة)"
                          : "Issued: Sep 10, 2026 · Confirmed by Sila Logistics Manager"}
                    </p>
                  </div>
                  <Badge tone="ok">
                    <CheckCircle2 className="size-3" aria-hidden />
                    {isArabic ? "معتمد ومصدق" : "Manager Confirmed"}
                  </Badge>
                </div>
                {report?.summary || isDemoMode ? (
                  <p className="rounded-lg bg-surface-1 p-3.5 text-sm leading-relaxed text-ink-muted">
                    {report?.summary ||
                      (isArabic
                        ? "حقق المؤتمر نجاحاً لوجستياً مبهراً بمعدل إشغال فندقي 100% وتفويج كامل للوفود عبر الصالة الملكية بمطار الملك خالد الدولي، مع تسجيل نسبة رضا 98% لكبار الشخصيات دون تسجيل أي تأخير يذكر."
                        : "The summit achieved flawless logistics execution with 100% hotel occupancy, seamless VIP terminal handoffs, and 98% VIP satisfaction with zero recorded schedule delays.")}
                  </p>
                ) : null}
                {report?.kpis?.length ? (
                  <dl className="grid gap-3 sm:grid-cols-4">
                    {report.kpis.map((stat) => (
                      <div key={stat.label} className="rounded-lg border border-hairline bg-surface-1 p-3 text-center">
                        <dt className="text-xs text-ink-faint">{stat.label}</dt>
                        <dd className="font-tnum text-base font-bold text-ink">{stat.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <dl className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: isArabic ? "إجمالي الحضور" : "Total Guests", val: integer(kpis.guestsServed.total) },
                      { label: isArabic ? "الالتزام بالوقت" : "On-time", val: `${kpis.onTimePercent.value}%` },
                      { label: isArabic ? "المهام المكتملة" : "Tasks completed", val: `${integer(kpis.tasksCompleted.completed)} / ${integer(kpis.tasksCompleted.total)}` }
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-lg border border-hairline bg-surface-1 p-3 text-center">
                        <dt className="text-xs text-ink-faint">{stat.label}</dt>
                        <dd className="font-tnum text-base font-bold text-ink">{stat.val}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}
          </Section>
        ) : (
          <Locked text={isArabic ? "عرض التقارير مقفل حالياً." : "Reports view is currently restricted."} />
        ))}
    </div>
  );
}

import { useMemo, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, Clock, Download, FileText, Lock, MessageSquare, Send, ShieldCheck, Users } from "lucide-react";
import type { ClientMessage, ClientPermissionConfig, MidyafData, ScheduleAmendment } from "@shared/domain";
import { DEFAULT_CLIENT_CONFIG, DEFAULT_CLIENT_MESSAGES, DEFAULT_SCHEDULE_AMENDMENTS } from "@shared/constants";
import { integer, shortTime } from "../lib/format";
import { deriveClientKpis, guestFunnel, slaSample } from "../lib/metrics";
import { localizeAmendmentType } from "../lib/localizeDomain";
import { Funnel } from "./charts";
import { Badge, Button, EmptyState, IconTabNav, Input, KpiTile, Section, Surface, useToast } from "./ui";
import { PortalHero } from "./ui/PortalHero";

type Tab = "amendments" | "chat" | "reports";

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
  isArabic = true,
  config = DEFAULT_CLIENT_CONFIG,
  isDemoMode = false,
  onDownloadReport
}: {
  data: MidyafData;
  isArabic?: boolean;
  config?: ClientPermissionConfig;
  isDemoMode?: boolean;
  onDownloadReport?: () => void;
}) {
  const toast = useToast();
  const event = data.events[0];
  const report = data.companyReports[0];

  const [activeTab, setActiveTab] = useState<Tab>("amendments");
  const [messages, setMessages] = useState<ClientMessage[]>(DEFAULT_CLIENT_MESSAGES);
  const [newMessageText, setNewMessageText] = useState("");
  const [amendments] = useState<ScheduleAmendment[]>(DEFAULT_SCHEDULE_AMENDMENTS);

  // ── Selectors ──
  const kpis = useMemo(() => deriveClientKpis(data, isDemoMode), [data, isDemoMode]);
  const funnel = useMemo(() => guestFunnel(event?.guests ?? [], data.guestJourneys, isDemoMode), [event?.guests, data.guestJourneys, isDemoMode]);
  const sla = useMemo(() => slaSample(event?.tasks ?? []), [event?.tasks]);

  const handleSendMessage = (e: FormEvent) => {
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
    setMessages((prev) => [...prev, newMsg]);
    setNewMessageText("");
    toast.success(
      isArabic ? "تم إرسال رسالتك لمدير العمليات" : "Message Dispatched",
      isArabic ? "سيتولى مدير العمليات اللوجستية (صلة) الرد فوراً" : "Sila Logistics Manager will respond shortly"
    );
  };

  const tabs = [
    ...(config.canViewScheduleAmendments ? [{ id: "amendments" as const, icon: Clock, labelEn: "Schedule Amendments", labelAr: "التعديلات المباشرة" }] : []),
    ...(config.canCommunicateLogistics ? [{ id: "chat" as const, icon: MessageSquare, labelEn: "Logistics Chat", labelAr: "التواصل اللوجستي" }] : []),
    ...(config.canViewReports ? [{ id: "reports" as const, icon: FileText, labelEn: "Executive Reports", labelAr: "التقارير التنفيذية" }] : [])
  ];

  const permissions = [
    { on: config.canViewReports, label: isArabic ? "التقارير" : "Reports" },
    { on: config.canViewScheduleAmendments, label: isArabic ? "تعديلات الجداول" : "Schedule Updates" },
    { on: config.canCommunicateLogistics, label: isArabic ? "التواصل المباشر" : "Direct Chat" },
    { on: config.canViewPerformance, label: isArabic ? "مؤشرات الأداء" : "Performance KPIs" }
  ];

  return (
    <div className="space-y-6">
      <PortalHero
        badge={
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-3.5" aria-hidden />
            {isArabic ? "بوابة العميل المستفيد المخصصة" : "Dedicated Client Executive Portal"}
          </span>
        }
        title={isArabic ? `مرحباً بك: ${config.clientName} — ${config.clientEntity}` : `Welcome: ${config.clientName} — ${config.clientEntity}`}
        body={
          isArabic
            ? `لوحة المتابعة الخاصة بفعالية (${config.eventTitle}) تحت إشراف الشركة المنظمة (صلة)، تتيح لك الاطلاع الفوري على التقارير، تعديلات الجداول، والتواصل مع العمليات.`
            : `Executive dashboard for (${config.eventTitle}) managed by Sila, providing verified reports, live schedule adjustments, and direct communication with logistics.`
        }
      />

      {/* Permissions transparency */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-2 p-3.5 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold text-ink">
          <ShieldCheck className="size-4 text-gold-500" aria-hidden />
          {isArabic ? "مستوى الصلاحيات المصرح به من شركة صلة:" : "Authorized Access Privileges from Sila:"}
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
            <KpiTile label={isArabic ? "دقة الالتزام بالمواعيد" : "Punctuality SLA"} value={kpis.onTimePercent.value} format="percent" detail={isArabic ? "ضمن المعايير السيادية المعتمدة" : "Within sovereign protocol standard"} tone={kpis.onTimePercent.value >= 95 ? "ok" : "warn"} size="lg" />
            <KpiTile label={isArabic ? "الضيوف المستقبلون" : "Guests Welcomed"} value={`${integer(kpis.guestsServed.served)} / ${integer(kpis.guestsServed.total)}`} detail={kpis.guestsServed.served === kpis.guestsServed.total && kpis.guestsServed.total > 0 ? (isArabic ? "اكتمال وصول جميع الوفود" : "All delegations arrived safely") : isArabic ? "الوصول جارٍ" : "Arrivals in progress"} icon={<Users className="size-4" aria-hidden />} size="lg" />
            <KpiTile label={isArabic ? "المهام المكتملة" : "Tasks Completed"} value={`${integer(kpis.tasksCompleted.completed)} / ${integer(kpis.tasksCompleted.total)}`} detail={isArabic ? `${integer(sla.delayed)} متأخرة` : `${integer(sla.delayed)} delayed`} tone={sla.delayed ? "warn" : "none"} size="lg" />
            <KpiTile label={isArabic ? "الحوادث الحرجة" : "Critical Incidents"} value={kpis.openIssues.value} detail={kpis.openIssues.value === 0 ? (isArabic ? "سجل تشغيلي نظيف 100%" : "100% clean incident record") : isArabic ? "بلاغات مفتوحة" : "Open issues"} tone={kpis.openIssues.value === 0 ? "ok" : "danger"} size="lg" />
          </div>
          <Section title={isArabic ? "رحلة الوفود" : "Delegation journey"} eyebrow={isArabic ? "من الدعوة إلى الوصول" : "Invitation to arrival"}>
            <Funnel stages={funnel} isArabic={isArabic} className="max-w-2xl" />
          </Section>
        </>
      ) : (
        <Locked text={isArabic ? "عرض مؤشرات الأداء مقفل حالياً بناءً على إعدادات شركة صلة." : "Performance data view is currently restricted by Sila."} />
      )}

      {tabs.length ? <IconTabNav tabs={tabs} value={activeTab} onChange={setActiveTab} layoutId="client-tabs" /> : null}

      {activeTab === "amendments" &&
        (config.canViewScheduleAmendments ? (
          <Section id="section-client-amendments" title={isArabic ? "التعديلات المباشرة" : "Schedule Amendments"}>
            {amendments.length === 0 ? (
              <EmptyState compact title={isArabic ? "لا توجد تعديلات" : "No amendments"} />
            ) : (
              <ul className="space-y-3">
                {amendments.map((amd) => (
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
          <Locked text={isArabic ? "عرض تعديلات الجداول مقفل حالياً بناءً على إعدادات شركة صلة." : "Schedule amendments view is currently restricted by Sila."} />
        ))}

      {activeTab === "chat" &&
        (config.canCommunicateLogistics ? (
          <Section id="section-client-chat" title={isArabic ? "القناة المباشرة مع مدير العمليات اللوجستية (صلة)" : "Direct Channel with Sila Logistics Manager"}>
            <ul className="mb-4 max-h-72 space-y-3 overflow-y-auto p-1">
              {messages.map((m) => {
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
            <form onSubmit={handleSendMessage} className="flex gap-2">
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
          <Locked text={isArabic ? "التواصل المباشر مع مدير العمليات مقفل حالياً بناءً على إعدادات شركة صلة." : "Direct communication with Logistics Manager is currently restricted by Sila."} />
        ))}

      {activeTab === "reports" &&
        (config.canViewReports ? (
          <Section
            id="section-client-reports"
            title={isArabic ? "التقارير التنفيذية" : "Executive Reports"}
            action={
              onDownloadReport ? (
                <Button size="sm" variant="gold" leadingIcon={<Download className="size-4" aria-hidden />} onClick={onDownloadReport}>
                  {isArabic ? "تحميل التقرير التنفيذي PDF" : "Download PDF Report"}
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-bold text-ink">
                    {report?.title || (isArabic ? "التقرير الختامي المعتمد للفعالية — قمة القيادة والضيافة السيادية" : "Confirmed Event Report — Sovereign Leadership Summit")}
                  </h4>
                  <p className="mt-1 font-tnum text-xs text-ink-muted">
                    {isArabic ? "تاريخ الإصدار: 10 سبتمبر 2026 · اعتماد مدير العمليات (صلة)" : "Issued: Sep 10, 2026 · Confirmed by Sila Logistics Manager"}
                  </p>
                </div>
                <Badge tone="ok">
                  <CheckCircle2 className="size-3" aria-hidden />
                  {isArabic ? "معتمد ومصدق" : "Manager Confirmed"}
                </Badge>
              </div>
              <p className="rounded-lg bg-surface-1 p-3.5 text-sm leading-relaxed text-ink-muted">
                {report?.summary ||
                  (isArabic
                    ? "حقق المؤتمر نجاحاً لوجستياً مبهراً بمعدل إشغال فندقي 100% وتفويج كامل للوفود عبر الصالة الملكية بمطار الملك خالد الدولي، مع تسجيل نسبة رضا 98% لكبار الشخصيات دون تسجيل أي تأخير يذكر."
                    : "The summit achieved flawless logistics execution with 100% hotel occupancy, seamless VIP terminal handoffs, and 98% VIP satisfaction with zero recorded schedule delays.")}
              </p>
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
          </Section>
        ) : (
          <Locked text={isArabic ? "عرض التقارير مقفل حالياً بناءً على إعدادات شركة صلة." : "Reports view is currently restricted by Sila."} />
        ))}
    </div>
  );
}

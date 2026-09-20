import { useMemo, useState, type FormEvent } from "react";
import { CarFront, ChevronLeft, ChevronRight, ClipboardList, FileText, Layers, Mail, Map, Send, TrendingUp } from "lucide-react";
import type { MidyafData, Session, TaskDelegation } from "@shared/domain";
import { integer, shortTime } from "../lib/format";
import { fleetUtilisation, guestFunnel, slaSample, taskStatusByZone, taskStatusCounts } from "../lib/metrics";
import { localizeZone } from "../lib/localizeDomain";
import { ArcGauge, Funnel, StackedBars } from "./charts";
import { Badge, Button, EmptyState, IconTabNav, Input, KpiTile, Section, StatusPill, Surface, useToast } from "./ui";
import { PortalHero } from "./ui/PortalHero";

type Tab = "intake" | "fleet" | "contracts" | "delegation" | "reports";

export function SilaOperationsDashboard({
  data,
  isDemoMode,
  isArabic,
  onDownloadReport,
  onToggleDemo
}: {
  data: MidyafData;
  session: Session | null;
  isDemoMode: boolean;
  isArabic: boolean;
  onDownloadReport?: () => void;
  onToggleDemo?: () => void;
}) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("intake");
  const event = data.events[0];
  const tasks = event?.tasks ?? [];

  // ── Selectors ──
  const fleet = useMemo(() => fleetUtilisation(data.drivers), [data.drivers]);
  const funnel = useMemo(() => guestFunnel(event?.guests ?? [], data.guestJourneys, isDemoMode), [event?.guests, data.guestJourneys, isDemoMode]);
  const byZone = useMemo(() => taskStatusByZone(tasks, data.drivers), [tasks, data.drivers]);
  const counts = useMemo(() => taskStatusCounts(tasks), [tasks]);
  const sla = useMemo(() => slaSample(tasks), [tasks]);
  const activeTasks = counts.ASSIGNED + counts.ACCEPTED + counts.EN_ROUTE + counts.ARRIVED + counts.PICKED_UP;

  const [replyText, setReplyText] = useState("");
  const [clientMessages, setClientMessages] = useState(() => [
    { id: "1", senderName: "Ministry of Culture (Client)", senderRole: "CLIENT", messageEn: "Are the VIP executive fleets staged at the Royal Terminal?", messageAr: "هل سيارات كبار الشخصيات جاهزة في الصالة الملكية؟", timestamp: "09:14 AM" },
    { id: "2", senderName: "Sila Logistics Command", senderRole: "LOGISTICS_MANAGER", messageEn: "Yes, all 12 vehicles are staged and drivers are briefed on protocol.", messageAr: "نعم، تم تجهيز جميع السيارات والسائقين بالبروتوكول.", timestamp: "09:16 AM" }
  ]);

  const intakes = [...data.activityIntakes];
  const report = data.companyReports[0];

  const [delegationTasks] = useState<TaskDelegation[]>([
    {
      id: "tsk-rel-1",
      taskId: "t-101",
      taskTitle: isArabic ? "استقبال الوفد البريطاني في الصالة الملكية وتأمين الموكب" : "Royal Terminal VIP Escort for UK Delegation",
      fromRole: "LOGISTICS_MANAGER",
      toRole: "TEAM_MEMBER",
      assignedBy: isArabic ? "سعود العتيبي (مدير الفعالية)" : "Saud Al Otaibi (Event Mgr)",
      assignedTo: isArabic ? "سلطان الغامدي (قائد النقل)" : "Sultan Al Ghamdi (Transport Lead)",
      teamMemberId: "tm-001",
      instructions: isArabic ? "الانتظار في البوابة رقم 4 والتنسيق مع التشريفات الملكية فور الهبوط" : "Gate 4 standby, coordinate with royal protocol",
      priority: "HIGH",
      deadline: "14:00",
      status: "IN_PROGRESS",
      createdAt: new Date().toISOString()
    },
    {
      id: "tsk-rel-2",
      taskId: "t-102",
      taskTitle: isArabic ? "تدقيق أجنحة فندق فورسيزونز وتوزيع بطاقات الضيوف الرقمية" : "Inspect Four Seasons VIP Suites & Hand Over Passes",
      fromRole: "LOGISTICS_MANAGER",
      toRole: "TEAM_MEMBER",
      assignedBy: isArabic ? "سعود العتيبي (مدير الفعالية)" : "Saud Al Otaibi (Event Mgr)",
      assignedTo: isArabic ? "فيصل الدوسري (مشرف التسكين)" : "Faisal Al Dosari (Hotel Lead)",
      teamMemberId: "tm-004",
      instructions: isArabic ? "التأكد من اكتمال باقات الضيافة والتسكين السريع للأجنحة الملكية" : "Ensure swift check-in for Royal suites",
      priority: "NORMAL",
      deadline: "16:00",
      status: "ASSIGNED",
      createdAt: new Date().toISOString()
    }
  ]);

  function handleSendClientReply(e: FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;
    setClientMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        senderName: "Sila Operations Command",
        senderRole: "LOGISTICS_MANAGER",
        messageEn: replyText,
        messageAr: replyText,
        timestamp: shortTime(new Date().toISOString())
      }
    ]);
    setReplyText("");
  }

  const tabs = [
    { id: "intake" as const, icon: ClipboardList, labelEn: "Activity Intake", labelAr: "استقبال الأنشطة" },
    { id: "delegation" as const, icon: Layers, labelEn: "Task Delegation", labelAr: "تفويض المهام" },
    { id: "fleet" as const, icon: CarFront, labelEn: "Fleet Telemetry", labelAr: "تتبع الأسطول" },
    { id: "contracts" as const, icon: FileText, labelEn: "Supplier Contracts", labelAr: "عقود الموردين" },
    { id: "reports" as const, icon: TrendingUp, labelEn: "Executive Reports", labelAr: "التقارير التنفيذية" }
  ];

  const Chevron = isArabic ? ChevronLeft : ChevronRight;
  const zoneRows = byZone.map((r) => ({ ...r, label: r.zone === "UNASSIGNED" ? (isArabic ? "غير مسند" : "Unassigned") : localizeZone(r.zone, isArabic) }));

  return (
    <div className="space-y-6">
      <PortalHero
        badge={isArabic ? "صلة" : "Sila"}
        title={isArabic ? "منصة عمليات صلة (لوجستيات وفعاليات)" : "Sila Operations Command (Logistics & Events Unified)"}
        body={
          isArabic
            ? "تتبع الأسطول، تفويض المهام، إدارة العقود، والتواصل مع العميل في لوحة واحدة."
            : "Analyze metrics, track fleet telemetry, delegate tasks, and prepare executive reports in one unified dashboard."
        }
        action={
          onToggleDemo ? (
            <Button variant={isDemoMode ? "danger" : "gold"} size="lg" leadingIcon={<Map className="size-5" aria-hidden />} onClick={onToggleDemo}>
              {isDemoMode ? (isArabic ? "إيقاف العرض التوضيحي" : "Stop Investor Demo") : isArabic ? "بدء العرض التوضيحي الحي" : "Start Investor Demo"}
            </Button>
          ) : undefined
        }
      />

      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={isArabic ? "الأسطول النشط" : "Fleet active"} value={fleet.percent} format="percent" detail={isArabic ? `${integer(fleet.active)} من ${integer(fleet.total)} كابتن` : `${integer(fleet.active)} of ${integer(fleet.total)} captains`} icon={<CarFront className="size-4" aria-hidden />} tone="gold" />
        <KpiTile label={isArabic ? "المهام الجارية" : "Active tasks"} value={activeTasks} detail={isArabic ? `${integer(counts.COMPLETED)} مكتملة · ${integer(counts.DELAYED)} متأخرة` : `${integer(counts.COMPLETED)} completed · ${integer(counts.DELAYED)} delayed`} icon={<Layers className="size-4" aria-hidden />} tone={counts.DELAYED ? "warn" : "none"} />
        <KpiTile label={isArabic ? "الالتزام بالوقت" : "On-time"} value={sla.onTimePercent} format="percent" detail={isArabic ? `${integer(sla.completed + sla.delayed)} مهمة مُقاسة` : `${integer(sla.completed + sla.delayed)} tasks measured`} icon={<TrendingUp className="size-4" aria-hidden />} tone={sla.onTimePercent >= 95 ? "ok" : "warn"} />
        <KpiTile label={isArabic ? "الضيوف الواصلون" : "Guests arrived"} value={funnel.at(-1)?.count ?? 0} detail={isArabic ? `من ${integer(funnel[0]?.count ?? 0)} مدعو` : `of ${integer(funnel[0]?.count ?? 0)} invited`} icon={<ClipboardList className="size-4" aria-hidden />} />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={isArabic ? "استغلال الأسطول" : "Fleet utilisation"} bodyClassName="flex flex-col items-center gap-3">
          <ArcGauge
            value={fleet.percent}
            label={isArabic ? "نشط" : "active"}
            segments={[
              { value: fleet.active, className: "stroke-gold-500" },
              { value: fleet.idle, className: "stroke-ok" },
              { value: fleet.offline, className: "stroke-neutral" }
            ]}
          />
          <dl className="grid w-full grid-cols-3 gap-2 text-center text-xs">
            {[
              { l: isArabic ? "نشط" : "Active", v: fleet.active, c: "text-gold-500" },
              { l: isArabic ? "متاح" : "Idle", v: fleet.idle, c: "text-ok" },
              { l: isArabic ? "غير متصل" : "Offline", v: fleet.offline, c: "text-ink-muted" }
            ].map((s) => (
              <div key={s.l} className="rounded-lg bg-surface-1 p-2">
                <dt className="text-ink-faint">{s.l}</dt>
                <dd className={`font-tnum text-lg font-bold ${s.c}`}>{integer(s.v)}</dd>
              </div>
            ))}
          </dl>
        </Section>
        <Section title={isArabic ? "رحلة الضيوف" : "Guest journey"} eyebrow={isArabic ? "من الدعوة إلى الوصول" : "Invitation to arrival"}>
          <Funnel stages={funnel} isArabic={isArabic} />
        </Section>
        <Section title={isArabic ? "المهام حسب المنطقة" : "Tasks by zone"}>
          {zoneRows.length ? (
            <StackedBars rows={zoneRows} keys={["COMPLETED", "EN_ROUTE", "ASSIGNED", "PENDING", "DELAYED"]} isArabic={isArabic} height={200} />
          ) : (
            <EmptyState compact title={isArabic ? "لا توجد مهام بعد" : "No tasks yet"} />
          )}
        </Section>
      </div>

      <IconTabNav tabs={tabs} value={activeTab} onChange={setActiveTab} layoutId="sila-tabs" ariaLabel={isArabic ? "أقسام العمليات" : "Operations sections"} />

      {activeTab === "intake" && (
        <Section
          id="section-intake"
          title={isArabic ? "استقبال الأنشطة وإدارة الضيوف" : "Sila Intake & Guest Management"}
          action={
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Mail className="size-4" aria-hidden />}
              onClick={() => {
                const url = window.location.origin + window.location.pathname + "#onboarding";
                void navigator.clipboard.writeText(url);
                toast.success(isArabic ? "تم نسخ رابط التسجيل للضيوف!" : "Guest invite link copied to clipboard!");
              }}
            >
              {isArabic ? "نسخ رابط دعوة الضيوف" : "Copy Guest Invite Link"}
            </Button>
          }
        >
          {intakes.length === 0 ? (
            <EmptyState compact title={isArabic ? "لا توجد أنشطة مسجلة" : "No activities yet"} />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {intakes.map((act) => (
                <Surface key={act.id} padding="sm">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h4 className="text-sm font-semibold leading-tight text-ink">{act.activityName}</h4>
                    <StatusPill status={act.status} />
                  </div>
                  <p className="mb-3 text-xs text-ink-muted">{act.activityPlace}</p>
                  <div className="flex items-center justify-between border-t border-hairline pt-3 text-xs text-ink-muted">
                    <span>
                      {isArabic ? "الزوار:" : "Visitors:"} <span className="font-tnum font-semibold text-ink">{integer(act.visitorCount)}</span>
                    </span>
                    <span>
                      VIP: <span className="font-tnum font-semibold text-gold-500">{integer(act.vipVisitorCount)}</span>
                    </span>
                  </div>
                </Surface>
              ))}
            </div>
          )}
        </Section>
      )}

      {activeTab === "fleet" && (
        <Section id="section-fleet" title={isArabic ? "تتبع الأسطول المباشر" : "Live Fleet Telemetry"}>
          {data.drivers.length === 0 ? (
            <EmptyState compact icon={<Map className="size-5" />} title={isArabic ? "لا يوجد كباتن" : "No captains"} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.drivers.map((d) => (
                <li key={d.id}>
                  <Surface padding="sm" className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{d.user.name}</p>
                      <p className="truncate text-xs text-ink-muted">{localizeZone(d.zone, isArabic)}</p>
                    </div>
                    <StatusPill status={d.status} live />
                  </Surface>
                </li>
              ))}
            </ul>
          )}
          {!isDemoMode ? (
            <p className="mt-4 text-xs text-ink-faint">
              {isArabic
                ? "سيتم عرض الخريطة الحية للأسطول عند تفعيل محاكاة العرض التوضيحي (Investor Demo)."
                : "Fleet mapping is accessible via the live demo simulation. Trigger the simulation to view active convoys."}
            </p>
          ) : null}
        </Section>
      )}

      {activeTab === "delegation" && (
        <Section id="section-delegation" title={isArabic ? "تفويض المهام وسلسلة الأوامر" : "Task Delegation & Command Chain"}>
          <ul className="space-y-3">
            {delegationTasks.map((t) => (
              <li key={t.id}>
                <Surface padding="sm">
                  <div className="mb-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <h5 className="text-sm font-semibold text-ink">{t.taskTitle}</h5>
                      <p className="mt-1 text-xs text-ink-muted">{t.instructions}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusPill status={t.priority} size="sm" showIcon={false} />
                      {t.teamMemberId ? <Badge tone="ok">{isArabic ? "مفوضة" : "Delegated"}</Badge> : <Button size="sm">{isArabic ? "تفويض لشخص" : "Delegate"}</Button>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3 text-xs text-ink-muted">
                    <span className="font-semibold">{isArabic ? "سلسلة الأوامر:" : "Command Chain:"}</span>
                    <Badge tone="neutral">{t.fromRole}</Badge>
                    <Chevron className="size-3.5" aria-hidden />
                    <Badge tone="gold">{t.teamMemberId ? t.assignedTo : isArabic ? "بانتظار التعيين" : "Pending Assignee"}</Badge>
                    <span className="ms-auto font-tnum">{t.deadline}</span>
                  </div>
                </Surface>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {activeTab === "contracts" && (
        <Section id="section-contracts" title={isArabic ? "عقود الموردين التشغيلية" : "Operational Supplier Contracts"}>
          {data.contracts.length === 0 ? (
            <EmptyState compact title={isArabic ? "لا توجد عقود" : "No contracts"} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.contracts.map((cnt) => (
                <Surface key={cnt.id} padding="sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-xs text-gold-300">{cnt.contractNumber}</span>
                    <StatusPill status={cnt.status} size="sm" />
                  </div>
                  <h5 className="text-sm font-semibold text-ink">{cnt.vendorName}</h5>
                  <p className="mt-0.5 text-xs text-ink-muted">{cnt.category}</p>
                </Surface>
              ))}
            </div>
          )}
        </Section>
      )}

      {activeTab === "reports" && (
        <Section id="section-reports" title={isArabic ? "التقارير التنفيذية ومحادثة العميل" : "Executive Reports & Client Chat"}>
          <div className="grid gap-4 xl:grid-cols-2">
            <Surface padding="sm">
              <div className="mb-3 flex items-center justify-between">
                <h5 className="text-sm font-semibold text-ink">{report?.title || (isArabic ? "تقرير تنفيذي" : "Executive Briefing")}</h5>
                {onDownloadReport ? (
                  <Button size="sm" variant="ghost" leadingIcon={<FileText className="size-4" aria-hidden />} onClick={onDownloadReport}>
                    {isArabic ? "تصدير PDF" : "Export PDF"}
                  </Button>
                ) : null}
              </div>
              <p className="text-sm text-ink-muted">{report?.summary}</p>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-lg bg-surface-1 p-2">
                  <dt className="text-ink-faint">{isArabic ? "الالتزام بالوقت" : "On-Time Rate"}</dt>
                  <dd className="font-tnum text-lg font-bold text-ok">{sla.onTimePercent}%</dd>
                </div>
                <div className="rounded-lg bg-surface-1 p-2">
                  <dt className="text-ink-faint">{isArabic ? "المهام المغلقة" : "Closed Tasks"}</dt>
                  <dd className="font-tnum text-lg font-bold text-ink">
                    {integer(sla.completed)} / {integer(sla.total)}
                  </dd>
                </div>
              </dl>
            </Surface>

            <Surface padding="sm" className="flex h-[260px] flex-col">
              <ul className="mb-3 flex-1 space-y-3 overflow-y-auto pe-1">
                {clientMessages.map((m) => (
                  <li key={m.id} className={`rounded-lg p-2.5 text-sm ${m.senderRole === "CLIENT" ? "bg-surface-1" : "bg-gold-500/10"}`}>
                    <div className="mb-1 flex justify-between text-xs text-ink-muted">
                      <span className="font-semibold">{m.senderName}</span>
                      <span className="font-tnum">{m.timestamp}</span>
                    </div>
                    <p className="text-ink">{isArabic ? m.messageAr : m.messageEn}</p>
                  </li>
                ))}
              </ul>
              <form onSubmit={handleSendClientReply} className="flex shrink-0 gap-2">
                <Input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={isArabic ? "رد..." : "Reply..."} aria-label={isArabic ? "رد" : "Reply"} />
                <Button type="submit" aria-label={isArabic ? "إرسال" : "Send"}>
                  <Send className="size-4" aria-hidden />
                </Button>
              </form>
            </Surface>
          </div>
        </Section>
      )}
    </div>
  );
}

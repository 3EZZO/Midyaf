import { useMemo, useState } from "react";
import {
  Bot,
  CarFront,
  ClipboardList,
  FileText,
  Layers,
  Mail,
  Map,
  MessageSquare,
  TrendingUp
} from "lucide-react";
import { AiPanel } from "./AiPanel";
import type { MidyafData, Session } from "@shared/domain";
import {
  TASK_CARD_LIMIT,
  eventTaskCards,
  type EventTaskCard
} from "../lib/eventTaskCards";
import { integer, shortDate, shortTime } from "../lib/format";
import {
  fleetUtilisation,
  guestFunnel,
  slaSample,
  taskStatusByZone,
  taskStatusCounts
} from "../lib/metrics";
import { localizeZone } from "../lib/localizeDomain";
import { ArcGauge, Funnel, StackedBars } from "./charts";
import {
  Badge,
  Button,
  EmptyState,
  IconTabNav,
  KpiTile,
  Section,
  StatusPill,
  Surface,
  useToast
} from "./ui";
import { PortalHero } from "./ui/PortalHero";

type Tab = "intake" | "fleet" | "contracts" | "delegation" | "reports" | "ai";

export function SilaOperationsDashboard({
  data,
  session,
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
  const funnel = useMemo(
    () => guestFunnel(event?.guests ?? [], data.guestJourneys, isDemoMode),
    [event?.guests, data.guestJourneys, isDemoMode]
  );
  const byZone = useMemo(
    () => taskStatusByZone(tasks, data.drivers),
    [tasks, data.drivers]
  );
  const counts = useMemo(() => taskStatusCounts(tasks), [tasks]);
  const sla = useMemo(() => slaSample(tasks), [tasks]);
  const activeTasks =
    counts.ASSIGNED +
    counts.ACCEPTED +
    counts.EN_ROUTE +
    counts.ARRIVED +
    counts.PICKED_UP;

  const intakes = [...data.activityIntakes];
  const report = data.companyReports[0];

  // The current event's own tasks, re-derived whenever data or language changes.
  const taskCards = useMemo(
    () => eventTaskCards(tasks, data.drivers, isArabic),
    [tasks, data.drivers, isArabic]
  );

  const tabs = [
    {
      id: "intake" as const,
      icon: ClipboardList,
      labelEn: "Activity Intake",
      labelAr: "استقبال الأنشطة"
    },
    {
      id: "delegation" as const,
      icon: Layers,
      labelEn: "Event Tasks",
      labelAr: "مهام الفعالية"
    },
    {
      id: "fleet" as const,
      icon: CarFront,
      labelEn: "Fleet Telemetry",
      labelAr: "تتبع الأسطول"
    },
    {
      id: "contracts" as const,
      icon: FileText,
      labelEn: "Supplier Contracts",
      labelAr: "عقود الموردين"
    },
    {
      id: "reports" as const,
      icon: TrendingUp,
      labelEn: "Executive Reports",
      labelAr: "التقارير التنفيذية"
    },
    {
      id: "ai" as const,
      icon: Bot,
      labelEn: "Sovereign AI",
      labelAr: "الذكاء السيادي"
    }
  ];

  const zoneRows = byZone.map((r) => ({
    ...r,
    label:
      r.zone === "UNASSIGNED"
        ? isArabic
          ? "غير مسند"
          : "Unassigned"
        : localizeZone(r.zone, isArabic)
  }));

  return (
    <div className="space-y-6">
      <PortalHero
        badge={isArabic ? "صلة" : "Sila"}
        title={
          isArabic
            ? "منصة عمليات صلة (لوجستيات وفعاليات)"
            : "Sila Operations Command (Logistics & Events Unified)"
        }
        body={
          isArabic
            ? "تتبع الأسطول، تفويض المهام، إدارة العقود، والتواصل مع العميل في لوحة واحدة."
            : "Analyze metrics, track fleet telemetry, delegate tasks, and prepare executive reports in one unified dashboard."
        }
        action={
          onToggleDemo ? (
            <Button
              variant={isDemoMode ? "danger" : "gold"}
              size="lg"
              leadingIcon={<Map className="size-5" aria-hidden />}
              onClick={onToggleDemo}
            >
              {isDemoMode
                ? isArabic
                  ? "إيقاف العرض التوضيحي"
                  : "Stop Investor Demo"
                : isArabic
                  ? "بدء العرض التوضيحي الحي"
                  : "Start Investor Demo"}
            </Button>
          ) : undefined
        }
      />

      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label={isArabic ? "الأسطول النشط" : "Fleet active"}
          value={fleet.percent}
          format="percent"
          detail={
            isArabic
              ? `${integer(fleet.active)} من ${integer(fleet.total)} كابتن`
              : `${integer(fleet.active)} of ${integer(fleet.total)} captains`
          }
          icon={<CarFront className="size-4" aria-hidden />}
          tone="gold"
        />
        <KpiTile
          label={isArabic ? "المهام الجارية" : "Active tasks"}
          value={activeTasks}
          detail={
            isArabic
              ? `${integer(counts.COMPLETED)} مكتملة · ${integer(counts.DELAYED)} متأخرة`
              : `${integer(counts.COMPLETED)} completed · ${integer(counts.DELAYED)} delayed`
          }
          icon={<Layers className="size-4" aria-hidden />}
          tone={counts.DELAYED ? "warn" : "none"}
        />
        <KpiTile
          label={isArabic ? "الالتزام بالوقت" : "On-time"}
          value={sla.onTimePercent}
          format="percent"
          detail={
            isArabic
              ? `${integer(sla.completed + sla.delayed)} مهمة مُقاسة`
              : `${integer(sla.completed + sla.delayed)} tasks measured`
          }
          icon={<TrendingUp className="size-4" aria-hidden />}
          tone={sla.onTimePercent >= 95 ? "ok" : "warn"}
        />
        <KpiTile
          label={isArabic ? "الضيوف الواصلون" : "Guests arrived"}
          value={funnel.at(-1)?.count ?? 0}
          detail={
            isArabic
              ? `من ${integer(funnel[0]?.count ?? 0)} مدعو`
              : `of ${integer(funnel[0]?.count ?? 0)} invited`
          }
          icon={<ClipboardList className="size-4" aria-hidden />}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title={isArabic ? "استغلال الأسطول" : "Fleet utilisation"}
          bodyClassName="flex flex-col items-center gap-3"
        >
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
              {
                l: isArabic ? "نشط" : "Active",
                v: fleet.active,
                c: "text-gold-500"
              },
              { l: isArabic ? "متاح" : "Idle", v: fleet.idle, c: "text-ok" },
              {
                l: isArabic ? "غير متصل" : "Offline",
                v: fleet.offline,
                c: "text-ink-muted"
              }
            ].map((s) => (
              <div key={s.l} className="rounded-lg bg-surface-1 p-2">
                <dt className="text-ink-faint">{s.l}</dt>
                <dd className={`font-tnum text-lg font-bold ${s.c}`}>
                  {integer(s.v)}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
        <Section
          title={isArabic ? "رحلة الضيوف" : "Guest journey"}
          eyebrow={isArabic ? "من الدعوة إلى الوصول" : "Invitation to arrival"}
        >
          <Funnel stages={funnel} isArabic={isArabic} />
        </Section>
        <Section title={isArabic ? "المهام حسب المنطقة" : "Tasks by zone"}>
          {zoneRows.length ? (
            <StackedBars
              rows={zoneRows}
              keys={["COMPLETED", "EN_ROUTE", "ASSIGNED", "PENDING", "DELAYED"]}
              isArabic={isArabic}
              height={200}
            />
          ) : (
            <EmptyState
              compact
              title={isArabic ? "لا توجد مهام بعد" : "No tasks yet"}
            />
          )}
        </Section>
      </div>

      <IconTabNav
        tabs={tabs}
        value={activeTab}
        onChange={setActiveTab}
        layoutId="sila-tabs"
        ariaLabel={isArabic ? "أقسام العمليات" : "Operations sections"}
      />

      {activeTab === "intake" && (
        <Section
          id="section-intake"
          title={
            isArabic
              ? "استقبال الأنشطة وإدارة الضيوف"
              : "Sila Intake & Guest Management"
          }
          action={
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Mail className="size-4" aria-hidden />}
              onClick={() => {
                const url =
                  window.location.origin +
                  window.location.pathname +
                  "#onboarding";
                void navigator.clipboard.writeText(url);
                toast.success(
                  isArabic
                    ? "تم نسخ رابط التسجيل للضيوف!"
                    : "Guest invite link copied to clipboard!"
                );
              }}
            >
              {isArabic ? "نسخ رابط دعوة الضيوف" : "Copy Guest Invite Link"}
            </Button>
          }
        >
          {intakes.length === 0 ? (
            <EmptyState
              compact
              title={isArabic ? "لا توجد أنشطة مسجلة" : "No activities yet"}
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {intakes.map((act) => (
                <Surface key={act.id} padding="sm">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h4 className="text-sm font-semibold leading-tight text-ink">
                      {act.activityName}
                    </h4>
                    <StatusPill status={act.status} />
                  </div>
                  <p className="mb-3 text-xs text-ink-muted">
                    {act.activityPlace}
                  </p>
                  <div className="flex items-center justify-between border-t border-hairline pt-3 text-xs text-ink-muted">
                    <span>
                      {isArabic ? "الزوار:" : "Visitors:"}{" "}
                      <span className="font-tnum font-semibold text-ink">
                        {integer(act.visitorCount)}
                      </span>
                    </span>
                    <span>
                      VIP:{" "}
                      <span className="font-tnum font-semibold text-gold-500">
                        {integer(act.vipVisitorCount)}
                      </span>
                    </span>
                  </div>
                </Surface>
              ))}
            </div>
          )}
        </Section>
      )}

      {activeTab === "fleet" && (
        <Section
          id="section-fleet"
          title={isArabic ? "تتبع الأسطول المباشر" : "Live Fleet Telemetry"}
        >
          {data.drivers.length === 0 ? (
            <EmptyState
              compact
              icon={<Map className="size-5" />}
              title={isArabic ? "لا يوجد كباتن" : "No captains"}
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.drivers.map((d) => (
                <li key={d.id}>
                  <Surface
                    padding="sm"
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {d.user.name}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {localizeZone(d.zone, isArabic)}
                      </p>
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
        <Section
          id="section-delegation"
          title={isArabic ? "مهام الفعالية والإسناد" : "Event Tasks & Assignments"}
          eyebrow={event?.name}
        >
          <EventTaskList cards={taskCards} isArabic={isArabic} />
        </Section>
      )}

      {activeTab === "contracts" && (
        <Section
          id="section-contracts"
          title={
            isArabic
              ? "عقود الموردين التشغيلية"
              : "Operational Supplier Contracts"
          }
        >
          {data.contracts.length === 0 ? (
            <EmptyState
              compact
              title={isArabic ? "لا توجد عقود" : "No contracts"}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.contracts.map((cnt) => (
                <Surface key={cnt.id} padding="sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-xs text-gold-300">
                      {cnt.contractNumber}
                    </span>
                    <StatusPill status={cnt.status} size="sm" />
                  </div>
                  <h5 className="text-sm font-semibold text-ink">
                    {cnt.vendorName}
                  </h5>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {cnt.category}
                  </p>
                </Surface>
              ))}
            </div>
          )}
        </Section>
      )}

      {activeTab === "reports" && (
        <Section
          id="section-reports"
          title={
            isArabic
              ? "التقارير التنفيذية ورسائل العميل"
              : "Executive Reports & Client Messages"
          }
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <Surface padding="sm">
              <div className="mb-3 flex items-center justify-between">
                <h5 className="text-sm font-semibold text-ink">
                  {report?.title ||
                    (isArabic ? "تقرير تنفيذي" : "Executive Briefing")}
                </h5>
                {onDownloadReport ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={<FileText className="size-4" aria-hidden />}
                    onClick={onDownloadReport}
                  >
                    {isArabic ? "تصدير PDF" : "Export PDF"}
                  </Button>
                ) : null}
              </div>
              <p className="text-sm text-ink-muted">{report?.summary}</p>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-lg bg-surface-1 p-2">
                  <dt className="text-ink-faint">
                    {isArabic ? "الالتزام بالوقت" : "On-Time Rate"}
                  </dt>
                  <dd className="font-tnum text-lg font-bold text-ok">
                    {sla.onTimePercent}%
                  </dd>
                </div>
                <div className="rounded-lg bg-surface-1 p-2">
                  <dt className="text-ink-faint">
                    {isArabic ? "المهام المغلقة" : "Closed Tasks"}
                  </dt>
                  <dd className="font-tnum text-lg font-bold text-ink">
                    {integer(sla.completed)} / {integer(sla.total)}
                  </dd>
                </div>
              </dl>
            </Surface>

            <Surface padding="sm" className="flex flex-col justify-center">
              <ClientMessagesEmpty isArabic={isArabic} />
            </Surface>
          </div>
        </Section>
      )}

      {activeTab === "ai" && (
        <Section
          id="section-smart-assistant"
          title={
            isArabic ? "الذكاء السيادي للعمليات" : "Sovereign operations AI"
          }
          eyebrow={
            isArabic
              ? "إحاطة مبنية على الأرقام المعروضة"
              : "Briefings grounded in the numbers on screen"
          }
          bodyClassName="p-0"
        >
          <AiPanel
            persona="Ops Manager"
            session={session ?? undefined}
            data={data}
            isDemoMode={isDemoMode}
            autoBrief
            className="border-0"
          />
        </Section>
      )}
    </div>
  );
}

/** The current event's tasks with honest empty/unassigned/missing states. */
export function EventTaskList({
  cards,
  isArabic
}: {
  cards: EventTaskCard[];
  isArabic: boolean;
}) {
  if (!cards.length)
    return (
      <EmptyState
        compact
        icon={<Layers className="size-4" aria-hidden />}
        title={
          isArabic ? "لا توجد مهام لهذه الفعالية بعد" : "No tasks for this event yet"
        }
      />
    );

  const shown = cards.slice(0, TASK_CARD_LIMIT);
  const locale = isArabic ? "ar" : "en";
  const missing = isArabic ? "غير محدد" : "Not set";

  return (
    <>
      <ul className="space-y-3">
        {shown.map((card) => {
          const assignee =
            card.assignment.kind === "captain" || card.assignment.kind === "owner"
              ? card.assignment.name
              : card.assignment.kind === "captain_unnamed"
                ? isArabic
                  ? "كابتن مُسند (الاسم غير متاح)"
                  : "Captain assigned (name not available)"
                : isArabic
                  ? "غير مسندة"
                  : "Unassigned";
          const timeLabel = card.time
            ? `${
                card.timeKind === "deadline"
                  ? isArabic
                    ? "الموعد النهائي"
                    : "Deadline"
                  : isArabic
                    ? "الموعد المجدول"
                    : "Scheduled"
              } · ${shortDate(card.time, locale)} ${shortTime(card.time, locale)}`
            : isArabic
              ? "لا يوجد موعد محدد"
              : "No time set";
          return (
            <li key={card.id}>
              <Surface padding="sm">
                <div className="mb-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <h5 className="text-sm font-semibold text-ink">
                      {card.title}
                    </h5>
                    <p className="mt-1 text-xs text-ink-muted">
                      {`${card.pickup ?? missing} → ${card.dropoff ?? missing}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {card.isVip ? <Badge tone="gold">VIP</Badge> : null}
                    <StatusPill status={card.status} size="sm" />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3 text-xs text-ink-muted">
                  <span className="font-semibold">
                    {card.assignment.kind === "owner"
                      ? isArabic
                        ? "المسؤول:"
                        : "Owner:"
                      : isArabic
                        ? "الكابتن:"
                        : "Captain:"}
                  </span>
                  <Badge
                    tone={card.assignment.kind === "unassigned" ? "warn" : "neutral"}
                  >
                    {assignee}
                  </Badge>
                  {card.guestName ? (
                    <span>
                      {isArabic ? "الضيف:" : "Guest:"} {card.guestName}
                    </span>
                  ) : null}
                  <span className="ms-auto font-tnum">{timeLabel}</span>
                </div>
              </Surface>
            </li>
          );
        })}
      </ul>
      {cards.length > shown.length ? (
        <p className="mt-3 text-xs text-ink-faint">
          {isArabic
            ? `عرض ${integer(shown.length)} من ${integer(cards.length)} مهمة`
            : `Showing ${integer(shown.length)} of ${integer(cards.length)} tasks`}
        </p>
      ) : null}
    </>
  );
}

/** No client messaging is connected; say so instead of showing sample chat. */
export function ClientMessagesEmpty({ isArabic }: { isArabic: boolean }) {
  return (
    <EmptyState
      compact
      icon={<MessageSquare className="size-4" aria-hidden />}
      title={isArabic ? "لا توجد رسائل من العميل" : "No client messages"}
      description={
        isArabic
          ? "مراسلة العميل غير مفعّلة في هذه المساحة."
          : "Client messaging is not connected in this workspace."
      }
    />
  );
}

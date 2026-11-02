import { OnboardingWorkspace } from "./OnboardingWorkspace";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileCheck,
  Flame,
  Lock,
  MessageSquareWarning,
  Plus,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  UserCheck
} from "lucide-react";
import type {
  ActivityIntake,
  AiLogisticsPlan,
  ComplaintItem,
  ComplaintSeverity,
  ComplaintStatus,
  Contract,
  MidyafData,
  Session
} from "@shared/domain";
import { DEFAULT_COMPLAINTS } from "@shared/constants";
import { compact, integer, money, shortDate, shortTime } from "../lib/format";
import { deriveExecutiveKpis, fleetUtilisation, slaSample } from "../lib/metrics";
import { localizeCategory, localizePaymentTerms } from "../lib/localizeDomain";
import { AreaTrend, EventHistogram } from "./charts";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  IconTabNav,
  Input,
  KpiTile,
  Section,
  Select,
  StatusPill,
  Surface,
  Textarea,
  useToast
} from "./ui";
import { PortalHero } from "./ui/PortalHero";

export type AdminTab = "submitters" | "plans" | "complaints" | "activities" | "vault";

/** Honest placeholder for a value the record does not carry. */
const notRecorded = (ar: boolean) => (ar ? "غير مسجل" : "Not recorded");

/**
 * SILA-DASHBOARD-003: submitter rows from the stored intakes only. Missing
 * submitter, organization, contact or time stay visibly «not recorded»
 * instead of the former invented names, phone number and current time.
 */
export function adminSubmitterRows(intakes: ActivityIntake[], ar: boolean) {
  return intakes.map((act) => ({
    id: act.id,
    activityName: act.activityName,
    activityPlace: act.activityPlace,
    submittedBy: act.submittedBy || notRecorded(ar),
    organization: act.organizerCompany || notRecorded(ar),
    submittedAt: act.submittedAt || act.createdAt || "",
    status: act.status,
    visitors: act.visitorCount,
    vipCount: act.vipVisitorCount,
    contact: act.hotelContact || ""
  }));
}

/**
 * Plan rows, each matched to ITS OWN plan (previously the first plan's
 * summary/approval was applied to every intake and every approve button
 * targeted that first plan).
 */
export function adminPlanRows(intakes: ActivityIntake[], plans: AiLogisticsPlan[], ar: boolean) {
  return intakes.map((act) => {
    const plan = plans.find((candidate) => candidate.intakeId === act.id);
    const isApproved = act.status === "PLAN_CONFIRMED" || act.status === "OPERATIONS_OPEN" || Boolean(plan?.confirmed);
    return {
      id: act.id,
      planId: plan?.id ?? null,
      canConfirm: Boolean(plan && !plan.confirmed),
      title: act.activityName,
      place: act.activityPlace,
      status: isApproved ? ("APPROVED" as const) : ("PENDING" as const),
      submittedBy: act.submittedBy || notRecorded(ar),
      visitorCount: act.visitorCount,
      vipCount: act.vipVisitorCount,
      hotelRooms: act.hotels?.length
        ? act.hotels.reduce((sum, h) => sum + (h.roomsBooked || 0), 0)
        : act.hotelRoomsBooked ?? 0,
      fleetCount: act.carRentals?.reduce((sum, r) => sum + (r.fleetCount || 0), 0) ?? 0,
      summary: plan?.summary || (ar ? "لم تُنشأ خطة لهذا النشاط بعد" : "No plan generated for this activity yet")
    };
  });
}

/**
 * Sample complaints appear only in the scripted demo. Outside it the log
 * starts empty and is local to this browser session (it is not saved).
 */
export function initialComplaints(isDemoMode?: boolean): ComplaintItem[] {
  return isDemoMode ? DEFAULT_COMPLAINTS : [];
}

/** Owner decisions waiting, grouped for the attention row. */
export function adminAttention(input: { pendingPlans: number; unsignedContracts: number; openComplaints: number }) {
  return [
    { tab: "plans" as const, count: input.pendingPlans },
    { tab: "vault" as const, count: input.unsignedContracts },
    { tab: "complaints" as const, count: input.openComplaints }
  ];
}

export function AdminExecutiveDashboard({
  data,
  session,
  isDemoMode,
  isArabic = true,
  onConfirmAiPlan
}: {
  data: MidyafData;
  session: Session | null;
  isDemoMode?: boolean;
  isArabic?: boolean;
  onApproveVendorQuote?: (quoteId: string) => Promise<void>;
  onApproveContract?: (contractId: string) => Promise<void>;
  onConfirmAiPlan?: (planId: string) => Promise<void>;
}) {
  const toast = useToast();
  const event = data.events[0];
  const intake = event ? data.activityIntakes.find((act) => act.eventId === event.id) ?? data.activityIntakes[0] : undefined;

  const [activeTab, setActiveTab] = useState<AdminTab>("submitters");

  // Complaints (session-local; sample entries only in the scripted demo)
  const [complaints, setComplaints] = useState<ComplaintItem[]>(() => initialComplaints(isDemoMode));
  useEffect(() => setComplaints(initialComplaints(isDemoMode)), [isDemoMode]);
  const [complaintFilter, setComplaintFilter] = useState<"ALL" | ComplaintStatus>("ALL");
  const [newComplaintModal, setNewComplaintModal] = useState(false);
  const [newComplaintText, setNewComplaintText] = useState("");
  const [newComplaintSeverity, setNewComplaintSeverity] = useState<ComplaintSeverity>("HIGH");
  const [newComplaintGuest, setNewComplaintGuest] = useState("");

  // Plans
  const [planFilter, setPlanFilter] = useState<"ALL" | "APPROVED" | "PENDING">("ALL");

  // ── Every number on screen comes from selectors ──
  const kpis = useMemo(() => deriveExecutiveKpis(data, { isDemoMode }), [data, isDemoMode]);
  const fleet = useMemo(() => fleetUtilisation(data.drivers), [data.drivers]);
  const sla = useMemo(() => slaSample(event?.tasks ?? []), [event?.tasks]);
  const openComplaints = complaints.filter((c) => c.status === "OPEN").length;

  const submitterList = adminSubmitterRows(data.activityIntakes, isArabic);
  const plansList = adminPlanRows(data.activityIntakes, data.aiPlans, isArabic);
  const pendingPlans = plansList.filter((p) => p.status === "PENDING").length;
  const filteredPlans = plansList.filter((p) => planFilter === "ALL" || p.status === planFilter);
  const filteredComplaints = complaints.filter((c) => complaintFilter === "ALL" || c.status === complaintFilter);
  const pipeline = data.activityIntakes.filter((act) => act.status !== "OPERATIONS_OPEN");

  const handleResolveComplaint = (id: string) => {
    setComplaints((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: "RESOLVED",
              resolvedAt: new Date().toISOString(),
              resolutionNotes: isArabic ? "تمت المعالجة من قبل إدارة مضياف" : "Resolved by Midyaf management"
            }
          : c
      )
    );
    toast.success(
      isArabic ? "تم تحديث حالة البلاغ" : "Complaint resolved",
      isArabic ? "في سجل هذه الجلسة فقط" : "In this session's log only"
    );
  };

  const handleAddComplaint = (e: FormEvent) => {
    e.preventDefault();
    if (!newComplaintText.trim()) return;
    const newEntry: ComplaintItem = {
      id: `cmp-${Date.now().toString().slice(-6)}`,
      activityName: event?.name ?? (isArabic ? "عام" : "General"),
      complainantName: newComplaintGuest.trim() || (isArabic ? "ملاحظة تنفيذية من المالك" : "Owner escalation note"),
      complainantRole: isArabic ? "إدارة مضياف" : "Midyaf management",
      severity: newComplaintSeverity,
      category: "OTHER",
      description: newComplaintText.trim(),
      status: "OPEN",
      createdAt: new Date().toISOString()
    };
    setComplaints([newEntry, ...complaints]);
    setNewComplaintText("");
    setNewComplaintGuest("");
    setNewComplaintModal(false);
    toast.alert(
      isArabic ? "تم تسجيل البلاغ" : "Escalation logged",
      isArabic ? "في سجل هذه الجلسة فقط" : "In this session's log only"
    );
  };

  const tabs = [
    { id: "submitters" as const, icon: UserCheck, labelEn: "Submitters Log", labelAr: "سجل الجهات المدخلة" },
    {
      id: "plans" as const,
      icon: FileCheck,
      labelEn: "Logistics Plans",
      labelAr: "الخطط اللوجستية",
      badge: pendingPlans ? <Badge size="sm" tone="warn">{pendingPlans}</Badge> : undefined
    },
    {
      id: "complaints" as const,
      icon: MessageSquareWarning,
      labelEn: "Complaints",
      labelAr: "الشكاوى والبلاغات",
      badge: openComplaints ? <Badge size="sm" tone="danger">{openComplaints}</Badge> : undefined
    },
    { id: "activities" as const, icon: Flame, labelEn: "Activities", labelAr: "الفعاليات والأنشطة" },
    { id: "vault" as const, icon: ShieldCheck, labelEn: "Contracts Vault", labelAr: "خزنة العقود والمالية" }
  ];

  const attentionMeta: Record<AdminTab, { icon: ReactNode; label: string; detail: string; tone: "warn" | "danger" | "info" }> = {
    plans: {
      icon: <FileCheck className="size-4" aria-hidden />,
      label: isArabic ? "خطط بانتظار الاعتماد" : "Plans awaiting approval",
      detail: isArabic ? "راجع الخطة قبل فتح التشغيل" : "Review before operations open",
      tone: "warn"
    },
    vault: {
      icon: <ReceiptText className="size-4" aria-hidden />,
      label: isArabic ? "عقود بانتظار التوقيع" : "Contracts awaiting signature",
      detail: isArabic ? "التوقيع قرار المشرف العام فقط" : "Signing is the Super Admin's decision",
      tone: "info"
    },
    complaints: {
      icon: <MessageSquareWarning className="size-4" aria-hidden />,
      label: isArabic ? "بلاغات مفتوحة" : "Open complaints",
      detail: isArabic ? "سجل هذه الجلسة" : "This session's log",
      tone: "danger"
    },
    submitters: { icon: null, label: "", detail: "", tone: "info" },
    activities: { icon: null, label: "", detail: "", tone: "info" }
  };
  const attention = adminAttention({
    pendingPlans,
    unsignedContracts: kpis.pendingReceivables.count,
    openComplaints
  });

  return (
    <div className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <PortalHero
        badge={
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden />
            {isArabic ? "لوحة الملاك والإدارة التنفيذية لمضياف · سري" : "Midyaf owners & executive dashboard · Confidential"}
          </span>
        }
        title={isArabic ? "الرقابة المالية والتنفيذية لمنظومة مضياف" : "Executive oversight, financials & governance"}
        body={
          isArabic
            ? "لوحة خاصة بملاك مضياف: الجهات المدخلة للفعاليات، اعتماد الخطط، الشكاوى، الفعاليات الجارية، والعمولات والعقود. الأرقام مشتقة من البيانات المصرح بها فقط."
            : "Private to Midyaf's owners: intake submitters, plan approvals, complaints, current activities, commissions and contracts. Every figure is derived from the data you are permitted to see."
        }
        action={
          isDemoMode ? (
            <Badge tone="warn" size="lg">
              {isArabic ? "وضع العرض التوضيحي" : "Demo mode"}
            </Badge>
          ) : undefined
        }
      />

      {/* Financial overview */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label={isArabic ? "إجمالي العمولات المحققة لمضياف" : "Platform Commissions"}
          value={kpis.commission.value}
          format="money"
          delta={kpis.commission.delta}
          detail={isArabic ? "مقارنة بالأسبوع السابق" : "vs previous week"}
          sparkline={kpis.commission.series.points}
          source={kpis.commission.source}
          icon={<Banknote className="size-4" aria-hidden />}
          tone="gold"
        />
        <KpiTile
          label={isArabic ? "إجمالي قيمة العقود" : "Total Contracted Spend"}
          value={kpis.contractedSpend.value}
          format="money"
          detail={
            isArabic
              ? `عبر ${integer(kpis.contractedSpend.categories)} فئات موردين`
              : `Across ${integer(kpis.contractedSpend.categories)} vendor categories`
          }
          sparkline={kpis.contractedSpend.series.points}
          source={kpis.contractedSpend.source}
          icon={<ReceiptText className="size-4" aria-hidden />}
        />
        <KpiTile
          label={isArabic ? "معدل هامش عمولة مضياف" : "Avg Commission Margin"}
          value={kpis.marginPercent.value}
          format="percent"
          detail={isArabic ? "العمولات ÷ قيمة العقود" : "Commission ÷ contracted spend"}
          icon={<TrendingUp className="size-4" aria-hidden />}
        />
        <KpiTile
          label={isArabic ? "قيمة عقود غير موقعة" : "Unsigned contract value"}
          value={kpis.pendingReceivables.value}
          format="money"
          detail={
            isArabic
              ? `${integer(kpis.pendingReceivables.count)} عقود بانتظار التوقيع`
              : `${integer(kpis.pendingReceivables.count)} contracts pending signature`
          }
          icon={<Clock className="size-4" aria-hidden />}
          tone={kpis.pendingReceivables.count ? "warn" : "none"}
        />
      </div>

      {/* Owner decisions + live pulse */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Section
          id="section-admin-attention"
          title={isArabic ? "بانتظار قرارك" : "Needs your decision"}
          eyebrow={isArabic ? "من البيانات الحالية" : "From current data"}
        >
          <div className="grid gap-3 sm:grid-cols-3" data-admin-attention>
            {attention.map((item) => {
              const meta = attentionMeta[item.tab];
              return (
                <Surface
                  key={item.tab}
                  padding="sm"
                  tone={item.count ? meta.tone : "none"}
                  onClick={() => setActiveTab(item.tab)}
                  aria-label={`${meta.label}: ${integer(item.count)}`}
                  data-attention={item.tab}
                  className="flex flex-col gap-2"
                >
                  <span className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-label text-ink-muted">
                    {meta.label}
                    <span className="text-gold-500">{meta.icon}</span>
                  </span>
                  <span className={`font-tnum text-2xl font-bold ${item.count ? "text-ink" : "text-ink-faint"}`}>{integer(item.count)}</span>
                  <span className="text-xs text-ink-muted">{item.count ? meta.detail : isArabic ? "لا شيء معلق" : "Nothing pending"}</span>
                </Surface>
              );
            })}
          </div>
        </Section>
        <Section title={isArabic ? "نبض المنظومة" : "System pulse"} eyebrow={isArabic ? "الأحداث المباشرة" : "Live events"}>
          <EventHistogram isArabic={isArabic} />
          <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-surface-1 p-3">
              <dt className="text-xs uppercase tracking-label text-ink-faint">{isArabic ? "الأسطول النشط" : "Fleet active"}</dt>
              <dd className="mt-1 font-tnum text-xl font-bold text-ink">{fleet.percent}%</dd>
            </div>
            <div className="rounded-lg bg-surface-1 p-3">
              <dt className="text-xs uppercase tracking-label text-ink-faint">{isArabic ? "الالتزام بالوقت" : "On-time"}</dt>
              <dd className="mt-1 font-tnum text-xl font-bold text-ok">{sla.onTimePercent}%</dd>
            </div>
            <div className="rounded-lg bg-surface-1 p-3">
              <dt className="text-xs uppercase tracking-label text-ink-faint">{isArabic ? "بلاغات مفتوحة" : "Open issues"}</dt>
              <dd className={`mt-1 font-tnum text-xl font-bold ${openComplaints ? "text-danger" : "text-ink"}`}>{openComplaints}</dd>
            </div>
          </dl>
        </Section>
      </div>

      <Section
        title={isArabic ? "منحنى العمولات وقيمة العقود (30 يوماً)" : "Commission & contract value — 30 days"}
        eyebrow={kpis.commission.source === "derived" ? (isArabic ? "سلسلة مشتقة من الإجمالي" : "Series derived from totals") : (isArabic ? "بيانات حية" : "Live data")}
        action={
          <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-gold-500" /> {isArabic ? "العمولات" : "Commission"}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-ink" /> {isArabic ? "قيمة العقود" : "Contract value"}
            </span>
          </div>
        }
      >
        <AreaTrend
          series={kpis.commission.series}
          secondary={kpis.contractedSpend.series}
          valueFormatter={(v) => compact(v)}
          labels={{ primary: isArabic ? "العمولات" : "Commission", secondary: isArabic ? "قيمة العقود" : "Contract value" }}
        />
      </Section>

      {session?.user.role === "SUPER_ADMIN" && !isDemoMode ? <OnboardingWorkspace session={session} isArabic={isArabic} /> : null}

      <IconTabNav tabs={tabs} value={activeTab} onChange={setActiveTab} layoutId="admin-tabs" ariaLabel={isArabic ? "أقسام لوحة الملاك" : "Admin sections"} />

      {activeTab === "submitters" && (
        <Section
          id="section-admin-submitters"
          title={isArabic ? "سجل الجهات ومسؤولي إدخال الفعاليات" : "Activity Submitter Audit Trail"}
          description={
            isArabic
              ? "الجهة والموظف المسؤولان عن إدخال متطلبات كل فعالية كما سُجلت."
              : "The organizing entity and individual who entered each activity's requirements, as recorded."
          }
        >
          <DataTable
            rows={submitterList}
            rowKey={(r) => r.id}
            defaultSort={{ id: "submittedAt", dir: "desc" }}
            empty={<EmptyState compact title={isArabic ? "لا توجد أنشطة مدخلة بعد" : "No activities entered yet"} />}
            columns={[
              {
                id: "activity",
                header: isArabic ? "اسم الفعالية" : "Activity Name",
                sortValue: (r) => r.activityName,
                cell: (r) => (
                  <>
                    <span className="font-semibold text-ink">{r.activityName}</span>
                    <span className="block text-xs text-ink-muted">{r.activityPlace}</span>
                  </>
                )
              },
              {
                id: "org",
                header: isArabic ? "الجهة المنظمة" : "Organizing Company",
                sortValue: (r) => r.organization,
                cell: (r) => (
                  <span className="inline-flex items-center gap-1.5 text-ink">
                    <Building2 className="size-3.5 text-gold-500" aria-hidden />
                    {r.organization}
                  </span>
                )
              },
              {
                id: "by",
                header: isArabic ? "المسؤول عن الإدخال" : "Submitted By",
                cell: (r) => (
                  <span className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-lg bg-gold-500/15 text-xs font-bold text-gold-500">
                      {r.submittedBy.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <span className="block font-semibold text-ink">{r.submittedBy}</span>
                      {r.contact ? (
                        <span className="block text-xs text-ink-muted" dir="ltr">
                          {r.contact}
                        </span>
                      ) : null}
                    </span>
                  </span>
                )
              },
              {
                id: "submittedAt",
                header: isArabic ? "تاريخ ووقت الإدخال" : "Submission Time",
                sortValue: (r) => r.submittedAt,
                numeric: true,
                cell: (r) => (
                  <span className="text-ink-muted">
                    {r.submittedAt ? `${shortDate(r.submittedAt)} · ${shortTime(r.submittedAt)}` : notRecorded(isArabic)}
                  </span>
                )
              },
              {
                id: "guests",
                header: isArabic ? "إجمالي الحضور" : "Total Guests",
                sortValue: (r) => r.visitors,
                numeric: true,
                align: "end",
                cell: (r) => (
                  <>
                    <span className="font-semibold text-ink">{integer(r.visitors)}</span>
                    <span className="ms-1 text-xs font-semibold text-gold-500">({integer(r.vipCount)} VIP)</span>
                  </>
                )
              },
              { id: "status", header: isArabic ? "حالة الإدخال" : "Intake Status", sortValue: (r) => r.status, cell: (r) => <StatusPill status={r.status} /> }
            ]}
          />
        </Section>
      )}

      {activeTab === "plans" && (
        <Section
          id="section-admin-plans"
          title={isArabic ? "مصفوفة الخطط اللوجستية" : "Logistics Plans Matrix"}
          description={isArabic ? "كل نشاط مع خطته هو فقط؛ الاعتماد يتم على الخطة نفسها." : "Each activity with its own plan; approval applies to that plan only."}
          action={
            <div className="flex items-center gap-1 rounded-lg border border-hairline bg-surface-1 p-1 text-xs" role="group" aria-label={isArabic ? "تصفية الخطط" : "Filter plans"}>
              {(["ALL", "APPROVED", "PENDING"] as const).map((f) => {
                const count = f === "ALL" ? plansList.length : plansList.filter((p) => p.status === f).length;
                const label = f === "ALL" ? (isArabic ? "الكل" : "All") : f === "APPROVED" ? (isArabic ? "المعتمدة" : "Approved") : isArabic ? "قيد الانتظار" : "Pending";
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={planFilter === f}
                    onClick={() => setPlanFilter(f)}
                    className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${planFilter === f ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"}`}
                  >
                    {label} ({integer(count)})
                  </button>
                );
              })}
            </div>
          }
        >
          {filteredPlans.length === 0 ? (
            <EmptyState compact title={isArabic ? "لا توجد خطط في هذا التصنيف" : "No plans in this filter"} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredPlans.map((plan) => (
                <Surface key={plan.id} tone={plan.status === "APPROVED" ? "ok" : "warn"} data-plan-row={plan.id}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-ink">{plan.title}</h3>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {plan.place} · {isArabic ? `إدخال: ${plan.submittedBy}` : `Submitted by: ${plan.submittedBy}`}
                      </p>
                    </div>
                    <StatusPill status={plan.status} />
                  </div>
                  <p className="rounded-lg border border-hairline bg-surface-1 p-3 text-xs leading-relaxed text-ink-muted">{plan.summary}</p>
                  <dl className="my-4 grid grid-cols-3 gap-2 text-center text-xs">
                    {[
                      { l: isArabic ? "الضيوف" : "Guests", v: plan.visitorCount, c: "text-ink" },
                      { l: isArabic ? "الغرف المحجوزة" : "Hotel Rooms", v: plan.hotelRooms, c: "text-info" },
                      { l: isArabic ? "الأسطول والحافلات" : "Fleet Units", v: plan.fleetCount, c: "text-gold-500" }
                    ].map((s) => (
                      <div key={s.l} className="rounded-lg bg-surface-1 p-2">
                        <dt className="text-ink-faint">{s.l}</dt>
                        <dd className={`font-tnum font-bold ${s.c}`}>{integer(s.v)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
                    <span className="text-xs text-ink-faint">
                      {plan.status === "APPROVED"
                        ? isArabic
                          ? "الخطة معتمدة"
                          : "Plan approved"
                        : isArabic
                          ? "شروط الدفع مقفلة لحين الاعتماد"
                          : "Terms locked until approved"}
                    </span>
                    {plan.status === "PENDING" && onConfirmAiPlan && plan.canConfirm && plan.planId ? (
                      <Button size="sm" variant="gold" onClick={() => void onConfirmAiPlan(plan.planId!)}>
                        {isArabic ? "اعتماد هذه الخطة" : "Approve this plan"}
                      </Button>
                    ) : null}
                  </div>
                </Surface>
              ))}
            </div>
          )}
        </Section>
      )}

      {activeTab === "complaints" && (
        <Section
          id="section-admin-complaints"
          title={isArabic ? "الشكاوى والبلاغات" : "Complaints"}
          description={
            isDemoMode
              ? isArabic
                ? "بيانات توضيحية للعرض فقط."
                : "Sample entries for the scripted demo only."
              : isArabic
                ? "البلاغات المضافة هنا تبقى في هذه الجلسة فقط ولا تُحفظ بعد إغلاقها."
                : "Entries added here stay in this browser session only and are not kept after it ends."
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label={isArabic ? "تصفية" : "Filter"}
                value={complaintFilter}
                onChange={(e) => setComplaintFilter(e.target.value as typeof complaintFilter)}
                className="h-9 w-40 py-0"
                options={[
                  { value: "ALL", label: isArabic ? "الكل" : "All" },
                  { value: "OPEN", label: isArabic ? "مفتوح" : "Open" },
                  { value: "IN_REVIEW", label: isArabic ? "قيد التحقيق" : "In review" },
                  { value: "RESOLVED", label: isArabic ? "تم الحل" : "Resolved" }
                ]}
              />
              <Button size="sm" variant="danger" leadingIcon={<Plus className="size-4" aria-hidden />} onClick={() => setNewComplaintModal((v) => !v)}>
                {isArabic ? "تسجيل بلاغ" : "Log incident"}
              </Button>
            </div>
          }
        >
          {newComplaintModal ? (
            <form onSubmit={handleAddComplaint} className="mb-5 rounded-lg border border-danger/30 bg-surface-1 p-4">
              <h4 className="mb-3 text-sm font-semibold text-danger">
                {isArabic ? "تسجيل بلاغ تنفيذي أو شكوى عاجلة" : "Log an incident or executive complaint"}
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={isArabic ? "الجهة الشاكية أو اسم الضيف" : "Complainant or guest name"}>
                  <Input value={newComplaintGuest} onChange={(e) => setNewComplaintGuest(e.target.value)} />
                </Field>
                <Field label={isArabic ? "درجة الخطورة" : "Severity"}>
                  <Select
                    value={newComplaintSeverity}
                    onChange={(e) => setNewComplaintSeverity(e.target.value as ComplaintSeverity)}
                    options={[
                      { value: "NORMAL", label: isArabic ? "عادية" : "Normal" },
                      { value: "HIGH", label: isArabic ? "عالية" : "High" },
                      { value: "CRITICAL", label: isArabic ? "حرجة" : "Critical" }
                    ]}
                  />
                </Field>
              </div>
              <Field label={isArabic ? "التفاصيل" : "Details"} className="mt-3" required>
                <Textarea
                  rows={2}
                  value={newComplaintText}
                  onChange={(e) => setNewComplaintText(e.target.value)}
                  placeholder={isArabic ? "تفاصيل الشكوى أو الملاحظة الميدانية..." : "Describe the incident or complaint..."}
                />
              </Field>
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setNewComplaintModal(false)}>
                  {isArabic ? "إلغاء" : "Cancel"}
                </Button>
                <Button size="sm" variant="danger" type="submit">
                  {isArabic ? "حفظ في سجل الجلسة" : "Save to session log"}
                </Button>
              </div>
            </form>
          ) : null}

          {filteredComplaints.length === 0 ? (
            <EmptyState compact title={isArabic ? "لا توجد بلاغات" : "No complaints"} />
          ) : (
            <ul className="space-y-3">
              {filteredComplaints.map((c) => (
                <li key={c.id}>
                  <Surface tone={c.severity === "CRITICAL" ? "danger" : c.severity === "HIGH" ? "warn" : "none"} padding="sm" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="max-w-2xl space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          {isArabic ? c.complainantNameAr || c.complainantName : c.complainantNameEn || c.complainantName}
                        </span>
                        <span className="text-xs text-ink-faint">({c.complainantRole})</span>
                        <StatusPill status={c.severity} size="sm" showIcon={false} live={c.severity === "CRITICAL" && c.status !== "RESOLVED"} />
                        <span className="font-tnum text-xs text-ink-faint">{shortTime(c.createdAt)}</span>
                      </div>
                      <p className="text-sm leading-relaxed text-ink-muted">{isArabic ? c.descriptionAr || c.description : c.descriptionEn || c.description}</p>
                      {c.resolutionNotes ? (
                        <p className="text-xs font-medium text-ok">
                          ✓ {isArabic ? c.resolutionNotesAr || c.resolutionNotes : c.resolutionNotesEn || c.resolutionNotes}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0">
                      {c.status === "RESOLVED" ? (
                        <Badge tone="ok">
                          <CheckCircle2 className="size-3" aria-hidden />
                          {isArabic ? "تمت المعالجة" : "Resolved"}
                        </Badge>
                      ) : (
                        <Button size="sm" onClick={() => handleResolveComplaint(c.id)}>
                          {isArabic ? "تسوية البلاغ ✓" : "Resolve ✓"}
                        </Button>
                      )}
                    </div>
                  </Surface>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {activeTab === "activities" && (
        <Section id="section-admin-activities" title={isArabic ? "الفعاليات والأنشطة" : "Activities"}>
          <div className="grid gap-4 lg:grid-cols-2">
            {event ? (
              <Surface tone="gold" data-current-event>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-label text-gold-500">
                      {isArabic ? "الفعالية الحالية" : "Current event"}
                    </span>
                    <h3 className="mt-1 text-base font-bold text-ink">{event.name}</h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {event.venue}
                      {event.date ? ` · ${shortDate(event.date)}` : ""}
                    </p>
                  </div>
                  <StatusPill status={event.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                  {[
                    { l: isArabic ? "كبار الشخصيات" : "VIP Guests", v: intake ? integer(intake.vipVisitorCount) : "—", c: "text-ink" },
                    { l: isArabic ? "الكباتن بالخدمة" : "Active Captains", v: `${integer(fleet.active)} / ${integer(fleet.total)}`, c: "text-ok" },
                    { l: isArabic ? "المهام المنجزة" : "Completed Tasks", v: `${integer(sla.completed)} / ${integer(sla.total)}`, c: "text-info" },
                    { l: isArabic ? "الالتزام بالوقت" : "On-time", v: `${sla.onTimePercent}%`, c: "text-gold-500" }
                  ].map((s) => (
                    <div key={s.l} className="rounded-lg bg-surface-1 p-2.5">
                      <dt className="text-ink-faint">{s.l}</dt>
                      <dd className={`mt-0.5 font-tnum text-lg font-bold ${s.c}`}>{s.v}</dd>
                    </div>
                  ))}
                </dl>
              </Surface>
            ) : (
              <Surface>
                <EmptyState compact icon={<Flame className="size-4" aria-hidden />} title={isArabic ? "لا توجد فعالية حالية" : "No current event"} />
              </Surface>
            )}

            <Surface data-activity-pipeline>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-label text-ink-muted">
                <CalendarClock className="size-3.5" aria-hidden />
                {isArabic ? "أنشطة قيد التجهيز" : "Activities in preparation"}
              </span>
              {pipeline.length === 0 ? (
                <EmptyState compact title={isArabic ? "لا توجد أنشطة قيد التجهيز" : "No activities in preparation"} />
              ) : (
                <ul className="mt-3 divide-y divide-hairline">
                  {pipeline.map((act) => (
                    <li key={act.id} className="flex items-start justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{act.activityName}</span>
                        <span className="block text-xs text-ink-muted">
                          {act.activityPlace} · {integer(act.visitorCount)} {isArabic ? "ضيف" : "guests"}
                        </span>
                      </span>
                      <StatusPill status={act.status} size="sm" />
                    </li>
                  ))}
                </ul>
              )}
            </Surface>
          </div>
        </Section>
      )}

      {activeTab === "vault" && (
        <Section id="section-admin-vault" title={isArabic ? "خزنة العقود والمالية" : "Contracts Vault"}>
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-gold-500/30 bg-gold-500/10 p-4 text-sm text-gold-300">
            <Lock className="size-5 shrink-0 text-gold-500" aria-hidden />
            <p>
              {isArabic
                ? "تظهر عقود الموردين المختومة هنا بعد أن يفتح المشرف العام خزنة النشاط الخاص بها."
                : "Sealed supplier contracts appear here after the Super Admin opens that activity's vault."}
            </p>
          </div>
          <DataTable<Contract>
            rows={data.contracts}
            rowKey={(c) => c.id}
            defaultSort={{ id: "value", dir: "desc" }}
            empty={<EmptyState compact title={isArabic ? "لا توجد عقود بعد" : "No contracts yet"} />}
            columns={[
              { id: "number", header: isArabic ? "رقم العقد" : "Contract #", cell: (c) => <span className="font-mono text-xs text-gold-300">{c.contractNumber ?? "—"}</span> },
              { id: "vendor", header: isArabic ? "المورد" : "Vendor", sortValue: (c) => c.vendorName, cell: (c) => <span className="font-semibold">{c.vendorName}</span> },
              { id: "category", header: isArabic ? "التصنيف" : "Category", cell: (c) => <Badge tone="neutral">{localizeCategory(c.category, isArabic)}</Badge> },
              {
                id: "value",
                header: isArabic ? "القيمة الإجمالية" : "Total Value",
                sortValue: (c) => Number(c.amount ?? c.totalValue ?? 0),
                numeric: true,
                align: "end",
                cell: (c) => <span className="font-semibold">{money(Number(c.amount ?? c.totalValue ?? 0))}</span>
              },
              {
                id: "commission",
                header: isArabic ? "عمولة مضياف" : "Midyaf Commission",
                sortValue: (c) => Number(c.commissionAmount ?? 0),
                numeric: true,
                align: "end",
                cell: (c) => <span className="font-semibold text-ok">{money(Number(c.commissionAmount ?? 0))}</span>
              },
              { id: "terms", header: isArabic ? "شروط الدفع" : "Payment Terms", cell: (c) => <span className="text-ink-muted">{localizePaymentTerms(c.paymentTerms, isArabic)}</span> },
              { id: "status", header: isArabic ? "الحالة" : "Status", sortValue: (c) => c.status, cell: (c) => <StatusPill status={c.status} /> },
              {
                id: "seal",
                header: isArabic ? "الختم الرقمي" : "Digital Seal",
                cell: (c) =>
                  c.digitalSeal ? (
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-gold-500" dir="ltr">
                      <ShieldCheck className="size-3.5" aria-hidden />
                      {c.digitalSeal.slice(0, 10) + "…"}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-faint">{isArabic ? "غير مختوم" : "Not sealed"}</span>
                  )
              }
            ]}
          />
        </Section>
      )}
    </div>
  );
}

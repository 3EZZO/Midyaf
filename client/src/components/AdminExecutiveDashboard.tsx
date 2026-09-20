import { useMemo, useState, type FormEvent } from "react";
import {
  Banknote,
  Building2,
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
import type { ComplaintItem, ComplaintSeverity, ComplaintStatus, Contract, MidyafData, Session } from "@shared/domain";
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

type Tab = "submitters" | "plans" | "complaints" | "activities" | "vault";

export function AdminExecutiveDashboard({
  data,
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
  const intake = data.activityIntakes[0];
  const aiPlan = data.aiPlans[0];

  const [activeTab, setActiveTab] = useState<Tab>("submitters");

  // Complaints
  const [complaints, setComplaints] = useState<ComplaintItem[]>(DEFAULT_COMPLAINTS);
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

  const submitterList = data.activityIntakes.map((act) => ({
    id: act.id,
    activityName: act.activityName,
    activityPlace: act.activityPlace,
    submittedBy: act.submittedBy || (isArabic ? "سلطان الراشد (شركة صلة)" : "Sultan Al Rashed (Sila)"),
    organization: act.organizerCompany || (isArabic ? "شركة صلة للتنظيم (Sila)" : "Sila Entertainment"),
    submittedAt: act.submittedAt || act.createdAt || new Date().toISOString(),
    status: act.status,
    visitors: act.visitorCount,
    vipCount: act.vipVisitorCount,
    contact: act.hotelContact || "+966 50 123 4567"
  }));

  const plansList = data.activityIntakes.map((act) => {
    const isApproved = act.status === "PLAN_CONFIRMED" || act.status === "OPERATIONS_OPEN" || aiPlan?.confirmed;
    return {
      id: act.id,
      title: act.activityName,
      place: act.activityPlace,
      status: isApproved ? "APPROVED" : "PENDING",
      submittedBy: act.submittedBy || "صلة",
      visitorCount: act.visitorCount,
      vipCount: act.vipVisitorCount,
      hotelRooms: act.hotels?.reduce((sum, h) => sum + (h.roomsBooked || 0), 0) || act.hotelRoomsBooked || 0,
      fleetCount: act.carRentals?.reduce((sum, r) => sum + (r.fleetCount || 0), 0) || 0,
      aiPlanSummary:
        aiPlan?.summary || (isArabic ? "خطة تشغيلية سيادية معتمدة ومجدولة بالذكاء الاصطناعي" : "Confirmed sovereign AI logistics plan")
    };
  });
  const filteredPlans = plansList.filter((p) => planFilter === "ALL" || p.status === planFilter);
  const filteredComplaints = complaints.filter((c) => complaintFilter === "ALL" || c.status === complaintFilter);

  const handleResolveComplaint = (id: string) => {
    setComplaints((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: "RESOLVED",
              resolvedAt: new Date().toISOString(),
              resolutionNotes: isArabic ? "تم التدخل وحل المشكلة من قبل الإدارة العليا لمضياف" : "Resolved by Midyaf Executive Management"
            }
          : c
      )
    );
    toast.success(
      isArabic ? "تم حل البلاغ واعتماد المعالجة" : "Complaint Resolved",
      isArabic ? "تم تحديث سجل الشكاوى التنفيذي بنجاح" : "Updated in executive complaints log"
    );
  };

  const handleAddComplaint = (e: FormEvent) => {
    e.preventDefault();
    if (!newComplaintText.trim()) return;
    const newEntry: ComplaintItem = {
      id: `cmp-${Date.now().toString().slice(-4)}`,
      activityName: event.name,
      complainantName: newComplaintGuest.trim() || (isArabic ? "ملاحظة تنفيذية من المالك" : "Owner Escalation Note"),
      complainantRole: isArabic ? "إدارة مضياف العليا" : "Midyaf Executive",
      severity: newComplaintSeverity,
      category: "TRANSPORT",
      description: newComplaintText.trim(),
      status: "OPEN",
      createdAt: new Date().toISOString()
    };
    setComplaints([newEntry, ...complaints]);
    setNewComplaintText("");
    setNewComplaintGuest("");
    setNewComplaintModal(false);
    toast.alert(
      isArabic ? "تم تسجيل البلاغ في لوحة الملاك" : "Escalation Registered",
      isArabic ? "تم إدراج الشكوى للمتابعة الفورية" : "Logged for immediate resolution"
    );
  };

  const tabs = [
    { id: "submitters" as const, icon: UserCheck, labelEn: "Submitters Log", labelAr: "سجل الجهات المدخلة" },
    { id: "plans" as const, icon: FileCheck, labelEn: "Logistics Plans", labelAr: "الخطط اللوجستية" },
    {
      id: "complaints" as const,
      icon: MessageSquareWarning,
      labelEn: "Complaints",
      labelAr: "الشكاوى والبلاغات",
      badge: openComplaints ? <Badge size="sm" tone="danger">{openComplaints}</Badge> : undefined
    },
    { id: "activities" as const, icon: Flame, labelEn: "Live Activities", labelAr: "الفعاليات الجارية" },
    { id: "vault" as const, icon: ShieldCheck, labelEn: "Contracts Vault", labelAr: "خزنة العقود والمالية" }
  ];

  return (
    <div className="space-y-6">
      <PortalHero
        badge={
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden />
            {isArabic ? "لوحة الملاك والإدارة التنفيذية لمضياف (سري للغاية)" : "Midyaf Sovereign Ownership & Executive Admin Dashboard"}
          </span>
        }
        title={isArabic ? "الرقابة المالية والتنفيذية الشاملة لمنظومة مضياف" : "Executive Business Oversight, Financials & Commercial Governance"}
        body={
          isArabic
            ? "لوحة خاصة بملاك مضياف فقط: رصد الجهات المدخلة للفعاليات، اعتماد الخطط التشغيلية، سجل الشكاوى، متابعة الفعاليات النشطة، وإدارة العمولات والعقود المالية."
            : "Internal dashboard for Midyaf's owners: monitor activity intake submitters, plan approvals, complaints registry, active event health, and platform commissions & contract financials."
        }
      />

      {/* Financial overview */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          label={isArabic ? "إجمالي قيمة العقود المعتمدة" : "Total Contracted Spend"}
          value={kpis.contractedSpend.value}
          format="money"
          detail={
            isArabic
              ? `عبر ${integer(kpis.contractedSpend.categories)} قطاعات تزويد رسمية معتمدة`
              : `Across ${integer(kpis.contractedSpend.categories)} certified vendor categories`
          }
          sparkline={kpis.contractedSpend.series.points}
          source={kpis.contractedSpend.source}
          icon={<ReceiptText className="size-4" aria-hidden />}
        />
        <KpiTile
          label={isArabic ? "معدل هامش عمولة مضياف" : "Avg Commission Margin"}
          value={kpis.marginPercent.value}
          format="percent"
          detail={isArabic ? "ضمن النطاق السعري السيادي المستهدف" : "Within sovereign pricing target"}
          icon={<TrendingUp className="size-4" aria-hidden />}
          tone="ok"
        />
        <KpiTile
          label={isArabic ? "الدفعات المستحقة والمقدمة" : "Pending Receivables"}
          value={kpis.pendingReceivables.value}
          format="money"
          detail={
            isArabic
              ? `${integer(kpis.pendingReceivables.count)} عقود تنتظر اكتمال التواقيع`
              : `${integer(kpis.pendingReceivables.count)} contracts pending signature`
          }
          icon={<Clock className="size-4" aria-hidden />}
          tone={kpis.pendingReceivables.count ? "warn" : "none"}
        />
      </div>

      {/* Trend + live pulse */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Section
          title={isArabic ? "منحنى العمولات وقيمة العقود (30 يوماً)" : "Commission & contract value — 30 days"}
          eyebrow={kpis.commission.source === "derived" ? (isArabic ? "سلسلة مشتقة من الإجمالي" : "Series derived from totals") : (isArabic ? "بيانات حية" : "Live data")}
          action={
            <div className="flex items-center gap-4 text-xs text-ink-muted">
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

      <IconTabNav tabs={tabs} value={activeTab} onChange={setActiveTab} layoutId="admin-tabs" ariaLabel={isArabic ? "أقسام لوحة الملاك" : "Admin sections"} />

      {activeTab === "submitters" && (
        <Section
          id="section-admin-submitters"
          title={isArabic ? "1. سجل الجهات ومسؤولي إدخال بيانات الفعاليات (Submitter Audit Trail)" : "Activity Submitter Audit Trail"}
          description={
            isArabic
              ? "التتبع الصارم للجهة والموظف المسؤول عن تعبئة متطلبات الفعالية، استيراد بيانات الضيوف، وحجز الفنادق والأسطول."
              : "Audit trail identifying the specific organizer entity and individual who inputted the event specifications, guest lists, and resource requirements."
          }
        >
          <DataTable
            rows={submitterList}
            rowKey={(r) => r.id}
            defaultSort={{ id: "submittedAt", dir: "desc" }}
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
                      <span className="block text-xs text-ink-muted" dir="ltr">
                        {r.contact}
                      </span>
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
                    {shortDate(r.submittedAt)} · {shortTime(r.submittedAt)}
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
          title={isArabic ? "2. مصفوفة الخطط اللوجستية: المعتمدة وقيد الانتظار (Plans Approval Matrix)" : "Approved Plans Matrix"}
          action={
            <div className="flex items-center gap-1 rounded-lg border border-hairline bg-surface-1 p-1 text-xs">
              {(["ALL", "APPROVED", "PENDING"] as const).map((f) => {
                const count = f === "ALL" ? plansList.length : plansList.filter((p) => p.status === f).length;
                const label = f === "ALL" ? (isArabic ? "الكل" : "All") : f === "APPROVED" ? (isArabic ? "المعتمدة" : "Approved") : isArabic ? "قيد الانتظار" : "Pending";
                return (
                  <button
                    key={f}
                    type="button"
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
                <Surface key={plan.id} tone={plan.status === "APPROVED" ? "ok" : "warn"}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-ink">{plan.title}</h3>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {plan.place} · {isArabic ? `إدخال: ${plan.submittedBy}` : `Submitted by: ${plan.submittedBy}`}
                      </p>
                    </div>
                    <StatusPill status={plan.status} />
                  </div>
                  <p className="rounded-lg border border-hairline bg-surface-1 p-3 text-xs leading-relaxed text-ink-muted">{plan.aiPlanSummary}</p>
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
                  <div className="flex items-center justify-between border-t border-hairline pt-3">
                    <span className="text-xs text-ink-faint">
                      {plan.status === "APPROVED"
                        ? isArabic
                          ? "تم قفل شروط الدفع وتوليد العقود"
                          : "Payment terms locked & active"
                        : isArabic
                          ? "شروط الدفع مقفلة لحين الاعتماد"
                          : "Terms locked until approved"}
                    </span>
                    {plan.status === "PENDING" && onConfirmAiPlan && aiPlan ? (
                      <Button size="sm" variant="gold" onClick={() => void onConfirmAiPlan(aiPlan.id)}>
                        {isArabic ? "اعتماد الخطة فوراً ↗" : "Approve Plan Now ↗"}
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
            isArabic
              ? "رصد مباشر لجميع الشكاوى الواردة من ضيوف كبار الشخصيات، منسقي الميدان، أو الشركة المنظمة مع تتبع حالة المعالجة وسرعة الحل."
              : "Direct incident registry of VIP guest concerns, coordinator alerts, and client notes with real-time resolution workflow."
          }
          action={
            <div className="flex items-center gap-2">
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
                {isArabic ? "تسجيل بلاغ جديد" : "Log New Incident"}
              </Button>
            </div>
          }
        >
          {newComplaintModal ? (
            <form onSubmit={handleAddComplaint} className="mb-5 rounded-lg border border-danger/30 bg-surface-1 p-4">
              <h4 className="mb-3 text-sm font-semibold text-danger">
                {isArabic ? "تسجيل بلاغ تنفيذي أو شكوى عاجلة" : "Log New Incident or Executive Complaint"}
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={isArabic ? "الجهة الشاكية أو اسم الضيف" : "Complainant or VIP Guest Name"}>
                  <Input value={newComplaintGuest} onChange={(e) => setNewComplaintGuest(e.target.value)} />
                </Field>
                <Field label={isArabic ? "درجة الخطورة" : "Severity"}>
                  <Select
                    value={newComplaintSeverity}
                    onChange={(e) => setNewComplaintSeverity(e.target.value as ComplaintSeverity)}
                    options={[
                      { value: "NORMAL", label: isArabic ? "درجة عادية (Normal)" : "Normal Severity" },
                      { value: "HIGH", label: isArabic ? "درجة عالية (High)" : "High Severity" },
                      { value: "CRITICAL", label: isArabic ? "حرجة وطارئة (Critical)" : "Critical Severity" }
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
                  {isArabic ? "حفظ البلاغ في اللوحة" : "Save Incident"}
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
                          {isArabic ? "تم الحل والمعالجة" : "Resolved"}
                        </Badge>
                      ) : (
                        <Button size="sm" onClick={() => handleResolveComplaint(c.id)}>
                          {isArabic ? "تسوية البلاغ ✓" : "Resolve Incident ✓"}
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
        <Section id="section-admin-activities" title={isArabic ? "الفعاليات الجارية" : "Live Activities"}>
          <div className="grid gap-4 md:grid-cols-2">
            <Surface tone="gold">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-label text-gold-500">
                    <span className="size-2 rounded-full bg-ok animate-pulse" aria-hidden />
                    {isArabic ? "فعالية قيد التنفيذ المباشر (LIVE)" : "Live In-Execution"}
                  </span>
                  <h3 className="mt-1 text-base font-bold text-ink">{event.name}</h3>
                </div>
                <Badge tone="gold">{isArabic ? `الالتزام بالوقت: ${sla.onTimePercent}%` : `On-time: ${sla.onTimePercent}%`}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                {[
                  { l: isArabic ? "كبار الشخصيات" : "VIP Guests", v: integer(intake?.vipVisitorCount ?? 0), c: "text-ink" },
                  { l: isArabic ? "الكباتن بالخدمة" : "Active Captains", v: `${integer(fleet.active)} / ${integer(fleet.total)}`, c: "text-ok" },
                  { l: isArabic ? "المهام المنجزة" : "Completed Tasks", v: `${integer(sla.completed)} / ${integer(sla.total)}`, c: "text-info" },
                  { l: isArabic ? "البلاغات المفتوحة" : "Open Issues", v: integer(openComplaints), c: openComplaints ? "text-danger" : "text-ink" }
                ].map((s) => (
                  <div key={s.l} className="rounded-lg bg-surface-1 p-2.5">
                    <dt className="text-ink-faint">{s.l}</dt>
                    <dd className={`mt-0.5 font-tnum text-lg font-bold ${s.c}`}>{s.v}</dd>
                  </div>
                ))}
              </dl>
            </Surface>

            <Surface>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-label text-ink-muted">
                    <Clock className="size-3.5" aria-hidden />
                    {isArabic ? "فعالية قادمة — التجهيز اللوجستي" : "Upcoming Pipeline Event"}
                  </span>
                  <h3 className="mt-1 text-base font-bold text-ink">
                    {isArabic ? "ملتقى الدرعية للتراث والضيافة الرفيعة" : "Diriyah Heritage & High Hospitality Forum"}
                  </h3>
                </div>
                <StatusPill status="QUOTING" />
              </div>
              <p className="mb-4 mt-2 text-sm leading-relaxed text-ink-muted">
                {isArabic
                  ? "تم استقبال متطلبات الفعالية وتجهيز الغرف الفندقية في حي الطريف التراثي، بانتظار إغلاق خزنة المنافسة الرقمية واعتماد العقود."
                  : "Requirements received and heritage rooms reserved at At-Turaif. Pending digital vault sealing and contract approvals."}
              </p>
              <div className="flex items-center justify-between border-t border-hairline pt-3 text-xs">
                <span className="font-tnum text-ink-faint">{isArabic ? "الجدول: 18 - 20 أكتوبر 2026" : "Schedule: Oct 18 - 20, 2026"}</span>
                <span className="font-tnum font-semibold text-ink">
                  {money(450000)} <span className="font-normal text-ink-faint">({isArabic ? "تقديري" : "estimate"})</span>
                </span>
              </div>
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
                ? "تم عزل هذه البيانات المالية والتسعيرية بالكامل عن لوحة العمليات الميدانية وفقاً لبروتوكول الحوكمة، وهي متاحة حصراً لملاك وإدارة مضياف."
                : "Financial, pricing, and quotation data has been strictly segregated from field operations per governance protocol, accessible exclusively to Midyaf ownership."}
            </p>
          </div>
          <DataTable<Contract>
            rows={data.contracts}
            rowKey={(c) => c.id}
            defaultSort={{ id: "value", dir: "desc" }}
            empty={<EmptyState compact title={isArabic ? "لا توجد عقود بعد" : "No contracts yet"} />}
            columns={[
              { id: "number", header: isArabic ? "رقم العقد" : "Contract #", cell: (c) => <span className="font-mono text-xs text-gold-300">{c.contractNumber}</span> },
              { id: "vendor", header: isArabic ? "المورد المعتمد" : "Certified Vendor", sortValue: (c) => c.vendorName, cell: (c) => <span className="font-semibold">{c.vendorName}</span> },
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
                cell: (c) => (
                  <span className="inline-flex items-center gap-1 font-mono text-xs text-gold-500" dir="ltr">
                    <ShieldCheck className="size-3.5" aria-hidden />
                    {c.digitalSeal ? c.digitalSeal.slice(0, 10) + "…" : "SHA-256"}
                  </span>
                )
              }
            ]}
          />
        </Section>
      )}
    </div>
  );
}

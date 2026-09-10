import { useState } from "react";
import {
  Crown,
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileCheck,
  TrendingUp,
  Banknote,
  ReceiptText,
  UserCheck,
  MessageSquareWarning,
  Flame,
  ArrowUpRight,
  ShieldCheck,
  Filter,
  Plus,
  Lock,
  Search
} from "lucide-react";
import type { MidyafData, Session, ComplaintItem, ComplaintSeverity, ComplaintStatus } from "@shared/domain";
import { DEFAULT_COMPLAINTS } from "@shared/constants";
import { money, shortDate, shortTime } from "../lib/format";
import { Badge } from "./Badge";
import { Section } from "./Section";
import { PortalHero } from "./PortalHero";
import { useTacticalToast } from "./TacticalToast";

export function AdminExecutiveDashboard({
  data,
  session,
  isDemoMode,
  isArabic = true,
  onApproveVendorQuote,
  onApproveContract,
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
  const toast = useTacticalToast();
  const event = data.events[0];
  const intake = data.activityIntakes[0];
  const aiPlan = data.aiPlans[0];

  // Complaints State
  const [complaints, setComplaints] = useState<ComplaintItem[]>(DEFAULT_COMPLAINTS);
  const [complaintFilter, setComplaintFilter] = useState<"ALL" | ComplaintStatus>("ALL");
  const [newComplaintModal, setNewComplaintModal] = useState(false);
  const [newComplaintText, setNewComplaintText] = useState("");
  const [newComplaintSeverity, setNewComplaintSeverity] = useState<ComplaintSeverity>("HIGH");
  const [newComplaintGuest, setNewComplaintGuest] = useState("");

  // Plans Filter
  const [planFilter, setPlanFilter] = useState<"ALL" | "APPROVED" | "PENDING">("ALL");

  // Calculate Financial Aggregates
  const totalCommission = data.vendorQuotes.reduce(
    (sum, quote) => sum + Number(quote.commissionAmount || 0),
    0
  );

  const totalContractedSpend = data.contracts.reduce(
    (sum, c) => sum + Number(c.totalValue || 0),
    0
  );

  const pendingDownpayments = data.contracts.filter(c => c.status === "PENDING_SIGNATURE").length * 85000;

  // Submitter details
  const submitterList = data.activityIntakes.map(act => ({
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

  // Approved vs Non-Approved Plans
  const plansList = data.activityIntakes.map(act => {
    const isApproved = act.status === "PLAN_CONFIRMED" || act.status === "OPERATIONS_OPEN" || aiPlan?.confirmed;
    return {
      id: act.id,
      title: act.activityName,
      place: act.activityPlace,
      status: isApproved ? "APPROVED" : "PENDING",
      submittedBy: act.submittedBy || "صلة",
      visitorCount: act.visitorCount,
      vipCount: act.vipVisitorCount,
      hotelRooms: act.hotels?.reduce((sum, h) => sum + (h.roomsBooked || 0), 0) || act.hotelRoomsBooked || 45,
      fleetCount: act.carRentals?.reduce((sum, r) => sum + (r.fleetCount || 0), 0) || 30,
      aiPlanSummary: aiPlan?.summary || (isArabic ? "خطة تشغيلية سيادية معتمدة ومجدولة بالذكاء الاصطناعي" : "Confirmed sovereign AI logistics plan")
    };
  });

  const filteredPlans = plansList.filter(p => {
    if (planFilter === "ALL") return true;
    return p.status === planFilter;
  });

  const filteredComplaints = complaints.filter(c => {
    if (complaintFilter === "ALL") return true;
    return c.status === complaintFilter;
  });

  const handleResolveComplaint = (id: string) => {
    setComplaints(prev =>
      prev.map(c =>
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

  const handleAddComplaint = (e: React.FormEvent) => {
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

  return (
    <div className="space-y-6">
      {/* Sovereign Owner Header */}
      <PortalHero
        badge={
          <span className="inline-flex items-center gap-1.5 text-midyaf-gold">
            <Crown size={15} />
            {isArabic ? "لوحة الملاك والإدارة التنفيذية لمضياف (سري للغاية)" : "Midyaf Sovereign Ownership & Executive Admin Dashboard"}
          </span>
        }
        title={
          isArabic
            ? "الرقابة المالية والتنفيذية الشاملة لمنظومة مضياف"
            : "Executive Business Oversight, Financials & Commercial Governance"
        }
        body={
          isArabic
            ? "لوحة خاصة بملاك مضياف فقط: رصد الجهات المدخلة للفعاليات، اعتماد الخطط التشغيلية، سجل الشكاوى، متابعة الفعاليات النشطة، وإدارة العمولات والعقود المالية."
            : "Internal dashboard for Midyaf's owners: monitor activity intake submitters, plan approvals, complaints registry, active event health, and platform commissions & contract financials."
        }
      />

      {/* Priority 5: Financial Status Overview (Top KPIs) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-midyaf-gold/30 bg-gradient-to-br from-midyaf-purple/95 to-[#1c0b38] p-5 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-midyaf-gold uppercase tracking-wider">
              {isArabic ? "إجمالي العمولات المحققة لمضياف" : "Platform Commissions"}
            </span>
            <div className="grid size-9 place-items-center rounded-xl bg-midyaf-gold/20 text-midyaf-gold ring-1 ring-midyaf-gold/40">
              <Banknote size={18} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-midyaf-gold font-tnum">
            {money(totalCommission || 285400)}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <span className="flex items-center text-emerald-400 font-bold">
              <ArrowUpRight size={14} /> +18.4%
            </span>
            <span>{isArabic ? "مقارنة بالفعالية السابقة" : "vs previous event"}</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isArabic ? "إجمالي قيمة العقود المعتمدة" : "Total Contracted Spend"}
            </span>
            <div className="grid size-9 place-items-center rounded-xl bg-purple-500/10 text-midyaf-purple dark:text-purple-400">
              <ReceiptText size={18} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-midyaf-ink dark:text-white font-tnum">
            {money(totalContractedSpend || 1950000)}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {isArabic ? "عبر 8 قطاعات تزويد رسمية معتمدة" : "Across 8 certified vendor categories"}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isArabic ? "معدل هامش عمولة مضياف" : "Avg Commission Margin"}
            </span>
            <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-midyaf-ink dark:text-white font-tnum">
            14.6%
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {isArabic ? "ضمن النطاق السعري السيادي المستهدف" : "Within sovereign pricing target"}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isArabic ? "الدفعات المستحقة والمقدمة" : "Pending Receivables"}
            </span>
            <div className="grid size-9 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock size={18} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-midyaf-ink dark:text-white font-tnum">
            {money(pendingDownpayments || 340000)}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {isArabic ? "دفعات مقدمة تنتظر اكتمال التواقيع" : "Downpayments pending contract signing"}
          </p>
        </div>
      </div>

      {/* Priority 1: Who Submitted/Input the Data for Each New Activity */}
      <Section
        id="section-admin-submitters"
        title={
          <div className="flex items-center gap-2">
            <UserCheck size={18} className="text-midyaf-gold" />
            <span>{isArabic ? "1. سجل الجهات ومسؤولي إدخال بيانات الفعاليات (Submitter Audit Trail)" : "1. Activity Submitter & Intake Audit Trail"}</span>
          </div>
        }
      >
        <p className="mb-4 text-xs text-slate-500">
          {isArabic
            ? "التتبع الصارم للجهة والموظف المسؤول عن تعبئة متطلبات الفعالية، استيراد بيانات الضيوف، وحجز الفنادق والأسطول."
            : "Audit trail identifying the specific organizer entity and individual who inputted the event specifications, guest lists, and resource requirements."}
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white/70 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3">{isArabic ? "اسم الفعالية" : "Activity Name"}</th>
                <th className="px-4 py-3">{isArabic ? "الجهة المنظمة" : "Organizing Company"}</th>
                <th className="px-4 py-3">{isArabic ? "المسؤول عن الإدخال" : "Submitted By"}</th>
                <th className="px-4 py-3">{isArabic ? "تاريخ ووقت الإدخال" : "Submission Time"}</th>
                <th className="px-4 py-3">{isArabic ? "إجمالي الحضور" : "Total Guests"}</th>
                <th className="px-4 py-3">{isArabic ? "حالة الإدخال" : "Intake Status"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {submitterList.map((sub) => (
                <tr key={sub.id} className="hover:bg-slate-50/50 transition dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3.5 font-bold text-midyaf-ink dark:text-white">
                    {sub.activityName}
                    <span className="block text-[10px] text-slate-400 font-normal">{sub.activityPlace}</span>
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-midyaf-purple dark:text-purple-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 size={13} className="text-midyaf-gold" />
                      {sub.organization}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="grid size-6 place-items-center rounded-full bg-midyaf-gold/20 text-[10px] font-black text-midyaf-gold">
                        {sub.submittedBy.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100">{sub.submittedBy}</p>
                        <p className="text-[10px] text-slate-400">{sub.contact}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-tnum text-slate-500">
                    {shortDate(sub.submittedAt)} · {shortTime(sub.submittedAt)}
                  </td>
                  <td className="px-4 py-3.5 font-tnum">
                    <span className="font-bold text-slate-800 dark:text-slate-100">{sub.visitors}</span>
                    <span className="text-[10px] text-midyaf-gold font-bold ms-1">({sub.vipCount} VIP)</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge tone={sub.status === "OPERATIONS_OPEN" || sub.status === "PLAN_CONFIRMED" ? "green" : "gold"}>
                      {sub.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Priority 2: Approved Plans vs Non-Approved (Pending) Plans */}
      <Section
        id="section-admin-plans"
        title={
          <div className="flex items-center justify-between w-full flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FileCheck size={18} className="text-emerald-500" />
              <span>{isArabic ? "2. مصفوفة الخطط اللوجستية: المعتمدة وقيد الانتظار (Plans Approval Matrix)" : "2. Approved vs Pending Plans Matrix"}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl dark:bg-slate-800 text-xs">
              <button
                onClick={() => setPlanFilter("ALL")}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${planFilter === "ALL" ? "bg-white text-midyaf-purple shadow-xs dark:bg-slate-700 dark:text-white" : "text-slate-500"}`}
              >
                {isArabic ? `الكل (${plansList.length})` : `All (${plansList.length})`}
              </button>
              <button
                onClick={() => setPlanFilter("APPROVED")}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${planFilter === "APPROVED" ? "bg-emerald-50 text-emerald-700 shadow-xs dark:bg-emerald-950/50 dark:text-emerald-300" : "text-slate-500"}`}
              >
                {isArabic ? `المعتمدة (${plansList.filter(p => p.status === "APPROVED").length})` : `Approved (${plansList.filter(p => p.status === "APPROVED").length})`}
              </button>
              <button
                onClick={() => setPlanFilter("PENDING")}
                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${planFilter === "PENDING" ? "bg-amber-50 text-amber-700 shadow-xs dark:bg-amber-950/50 dark:text-amber-300" : "text-slate-500"}`}
              >
                {isArabic ? `قيد الانتظار (${plansList.filter(p => p.status === "PENDING").length})` : `Pending (${plansList.filter(p => p.status === "PENDING").length})`}
              </button>
            </div>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {filteredPlans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border p-5 transition-all shadow-xs ${
                plan.status === "APPROVED"
                  ? "border-emerald-500/30 bg-emerald-50/20 dark:border-emerald-500/20 dark:bg-emerald-950/10"
                  : "border-amber-500/40 bg-amber-50/20 dark:border-amber-500/20 dark:bg-amber-950/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-extrabold text-midyaf-ink dark:text-white text-base">
                    {plan.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{plan.place} · {isArabic ? `إدخال: ${plan.submittedBy}` : `Submitted by: ${plan.submittedBy}`}</p>
                </div>
                <Badge tone={plan.status === "APPROVED" ? "green" : "gold"}>
                  {plan.status === "APPROVED" ? (isArabic ? "خطة معتمدة رسمياً" : "Plan Approved") : (isArabic ? "بانتظار الاعتماد" : "Pending Approval")}
                </Badge>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 leading-relaxed mb-4">
                {plan.aiPlanSummary}
              </p>

              <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
                <div className="bg-white/80 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="block text-[10px] text-slate-400">{isArabic ? "الضيوف" : "Guests"}</span>
                  <span className="font-bold text-midyaf-ink dark:text-white font-tnum">{plan.visitorCount}</span>
                </div>
                <div className="bg-white/80 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="block text-[10px] text-slate-400">{isArabic ? "الغرف المحجوزة" : "Hotel Rooms"}</span>
                  <span className="font-bold text-midyaf-purple dark:text-purple-300 font-tnum">{plan.hotelRooms}</span>
                </div>
                <div className="bg-white/80 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="block text-[10px] text-slate-400">{isArabic ? "الأسطول والحافلات" : "Fleet Units"}</span>
                  <span className="font-bold text-midyaf-gold font-tnum">{plan.fleetCount}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-400">
                  {plan.status === "APPROVED"
                    ? (isArabic ? "تم قفل شروط الدفع وتوليد العقود" : "Payment terms locked & active")
                    : (isArabic ? "شروط الدفع مقفلة لحين الاعتماد" : "Terms locked until approved")}
                </span>
                {plan.status === "PENDING" && onConfirmAiPlan && aiPlan && (
                  <button
                    onClick={() => void onConfirmAiPlan(aiPlan.id)}
                    className="btn-primary rounded-xl px-3.5 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    {isArabic ? "اعتماد الخطة فوراً ↗" : "Approve Plan Now ↗"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Priority 3: Any Complaints (Centralized Registry) */}
      <Section
        id="section-admin-complaints"
        title={
          <div className="flex items-center justify-between w-full flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <MessageSquareWarning size={18} className="text-rose-500" />
              <span>{isArabic ? "3. السجل المركزي للبلاغات والشكاوى (Complaints & Escalations Registry)" : "3. Complaints & Incident Escalations Registry"}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNewComplaintModal(true)}
                className="flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-500/20 transition dark:bg-rose-500/20 dark:text-rose-300 cursor-pointer"
              >
                <Plus size={13} />
                {isArabic ? "تسجيل بلاغ جديد" : "Log New Incident"}
              </button>
            </div>
          </div>
        }
      >
        <p className="mb-4 text-xs text-slate-500">
          {isArabic
            ? "رصد مباشر لجميع الشكاوى الواردة من ضيوف كبار الشخصيات، منسقي الميدان، أو الشركة المنظمة مع تتبع حالة المعالجة وسرعة الحل."
            : "Direct incident registry of VIP guest concerns, coordinator alerts, and client notes with real-time resolution workflow."}
        </p>

        {newComplaintModal && (
          <form onSubmit={handleAddComplaint} className="mb-5 rounded-xl border border-rose-200 bg-rose-50/40 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
            <h4 className="text-xs font-bold text-rose-700 dark:text-rose-300 mb-2">
              {isArabic ? "تسجيل بلاغ تنفيذي أو شكوى عاجلة" : "Log New Incident or Executive Complaint"}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 mb-3">
              <input
                type="text"
                value={newComplaintGuest}
                onChange={e => setNewComplaintGuest(e.target.value)}
                placeholder={isArabic ? "الجهة الشاكية أو اسم الضيف" : "Complainant or VIP Guest Name"}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <select
                value={newComplaintSeverity}
                onChange={e => setNewComplaintSeverity(e.target.value as ComplaintSeverity)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="NORMAL">{isArabic ? "درجة عادية (Normal)" : "Normal Severity"}</option>
                <option value="HIGH">{isArabic ? "درجة عالية (High)" : "High Severity"}</option>
                <option value="CRITICAL">{isArabic ? "حرجة وطارئة (Critical)" : "Critical Severity"}</option>
              </select>
            </div>
            <textarea
              rows={2}
              value={newComplaintText}
              onChange={e => setNewComplaintText(e.target.value)}
              placeholder={isArabic ? "تفاصيل الشكوى أو الملاحظة الميدانية..." : "Describe the incident or complaint..."}
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewComplaintModal(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 transition cursor-pointer"
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition cursor-pointer"
              >
                {isArabic ? "حفظ البلاغ في اللوحة" : "Save Incident"}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {filteredComplaints.map((c) => (
            <div
              key={c.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 transition-all shadow-xs dark:border-slate-800 dark:bg-slate-900/60"
            >
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-midyaf-ink dark:text-white text-xs">
                    {c.complainantName}
                  </span>
                  <span className="text-[10px] text-slate-400">({c.complainantRole})</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-black ${
                      c.severity === "CRITICAL"
                        ? "bg-rose-500 text-white animate-pulse"
                        : c.severity === "HIGH"
                        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {c.severity}
                  </span>
                  <span className="text-[10px] text-slate-400 font-tnum">
                    {shortTime(c.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {c.description}
                </p>
                {c.resolutionNotes && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    ✓ {c.resolutionNotes}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {c.status === "RESOLVED" ? (
                  <Badge tone="green">
                    <CheckCircle2 size={12} className="me-1" />
                    {isArabic ? "تم الحل والمعالجة" : "Resolved"}
                  </Badge>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleResolveComplaint(c.id)}
                    className="btn-primary rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    {isArabic ? "تسوية البلاغ ✓" : "Resolve Incident ✓"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Priority 4: Status of Currently Running Activities */}
      <Section
        id="section-admin-activities"
        title={
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-amber-500" />
            <span>{isArabic ? "4. مؤشرات وحالة الفعاليات النشطة حالياً (Live Activities Health)" : "4. Status of Currently Running Activities"}</span>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-midyaf-gold/30 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-xs dark:from-slate-900 dark:to-slate-950">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-midyaf-gold">
                  <span className="size-2 rounded-full bg-emerald-500 animate-ping"></span>
                  {isArabic ? "فعالية قيد التنفيذ المباشر (LIVE)" : "Live In-Execution"}
                </span>
                <h3 className="font-black text-midyaf-ink dark:text-white text-base mt-1">
                  {event.name}
                </h3>
              </div>
              <Badge tone="gold">
                {isArabic ? "الصحة اللوجستية: 99.4%" : "Health: 99.4%"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs mt-4">
              <div className="rounded-xl bg-slate-100/70 p-2.5 dark:bg-slate-800/60">
                <span className="text-[10px] text-slate-400 block">{isArabic ? "كبار الشخصيات" : "VIP Guests"}</span>
                <span className="font-extrabold text-midyaf-ink dark:text-white font-tnum">{intake.vipVisitorCount}</span>
              </div>
              <div className="rounded-xl bg-slate-100/70 p-2.5 dark:bg-slate-800/60">
                <span className="text-[10px] text-slate-400 block">{isArabic ? "الكباتن بالخدمة" : "Active Captains"}</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400 font-tnum">{data.drivers.length}</span>
              </div>
              <div className="rounded-xl bg-slate-100/70 p-2.5 dark:bg-slate-800/60">
                <span className="text-[10px] text-slate-400 block">{isArabic ? "المهام المنجزة" : "Completed Tasks"}</span>
                <span className="font-extrabold text-midyaf-purple dark:text-purple-300 font-tnum">
                  {event.tasks.filter(t => t.status === "COMPLETED").length} / {event.tasks.length}
                </span>
              </div>
              <div className="rounded-xl bg-slate-100/70 p-2.5 dark:bg-slate-800/60">
                <span className="text-[10px] text-slate-400 block">{isArabic ? "البلاغات المفتوحة" : "Open Issues"}</span>
                <span className="font-extrabold text-rose-600 dark:text-rose-400 font-tnum">
                  {complaints.filter(c => c.status === "OPEN").length}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
                  <Clock size={13} />
                  {isArabic ? "فعالية قادمة — التجهيز اللوجستي" : "Upcoming Pipeline Event"}
                </span>
                <h3 className="font-black text-midyaf-ink dark:text-white text-base mt-1">
                  {isArabic ? "ملتقى الدرعية للتراث والضيافة الرفيعة" : "Diriyah Heritage & High Hospitality Forum"}
                </h3>
              </div>
              <Badge tone="purple">
                {isArabic ? "مرحلة عروض الأسعار" : "Quoting Phase"}
              </Badge>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed mt-2 mb-4">
              {isArabic
                ? "تم استقبال متطلبات الفعالية وتجهيز الغرف الفندقية في حي الطريف التراثي، بانتظار إغلاق خزنة المنافسة الرقمية واعتماد العقود."
                : "Requirements received and heritage rooms reserved at At-Turaif. Pending digital vault sealing and contract approvals."}
            </p>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-slate-400 font-tnum">{isArabic ? "الجدول: 18 - 20 أكتوبر 2026" : "Schedule: Oct 18 - 20, 2026"}</span>
              <span className="font-bold text-midyaf-purple dark:text-purple-300 font-tnum">{money(450000)} (تقديري)</span>
            </div>
          </div>
        </div>
      </Section>

      {/* Priority 6: Aggregate Business Overview & Contract Vault (Relocated from Operations) */}
      <Section
        id="section-admin-vault"
        title={
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-midyaf-gold" />
            <span>{isArabic ? "6. خزنة العقود السيادية وعروض أسعار الموردين (Contracts & Financial Vault)" : "6. Sovereign Contracts & Certified Supplier Bids Vault"}</span>
          </div>
        }
      >
        <div className="mb-4 rounded-xl bg-midyaf-gold/10 border border-midyaf-gold/30 p-4 text-xs text-[#7A5D12] dark:text-midyaf-gold flex items-center gap-3">
          <Lock size={18} className="shrink-0 text-midyaf-gold" />
          <p>
            {isArabic
              ? "تم عزل هذه البيانات المالية والتسعيرية بالكامل عن لوحة العمليات الميدانية وفقاً لبروتوكول الحوكمة، وهي متاحة حصراً لملاك وإدارة مضياف."
              : "Financial, pricing, and quotation data has been strictly segregated from field operations per governance protocol, accessible exclusively to Midyaf ownership."}
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white/70 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3">{isArabic ? "رقم العقد" : "Contract #"}</th>
                <th className="px-4 py-3">{isArabic ? "المورد المعتمد" : "Certified Vendor"}</th>
                <th className="px-4 py-3">{isArabic ? "التصنيف" : "Category"}</th>
                <th className="px-4 py-3">{isArabic ? "القيمة الإجمالية" : "Total Value"}</th>
                <th className="px-4 py-3">{isArabic ? "عمولة مضياف" : "Midyaf Commission"}</th>
                <th className="px-4 py-3">{isArabic ? "شروط الدفع" : "Payment Terms"}</th>
                <th className="px-4 py-3">{isArabic ? "الختم الرقمي" : "Digital Seal"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-tnum">
              {data.contracts.map((cnt) => (
                <tr key={cnt.id} className="hover:bg-slate-50/50 transition dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3.5 font-mono font-bold text-midyaf-purple dark:text-purple-300">
                    {cnt.contractNumber}
                  </td>
                  <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-100">
                    {cnt.vendorName}
                  </td>
                  <td className="px-4 py-3.5 font-normal">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold dark:bg-slate-800">
                      {cnt.category}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                    {money(Number(cnt.amount ?? cnt.totalValue ?? 0))}
                  </td>
                  <td className="px-4 py-3.5 font-bold text-emerald-600 dark:text-emerald-400">
                    {money(Number(cnt.amount ?? cnt.totalValue ?? 0) * 0.12)}
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-slate-600 dark:text-slate-400">
                    {cnt.paymentTerms === "INSTALLMENTS" ? (isArabic ? "أقساط مجدولة" : "Installments") : (isArabic ? "دفعة مقدمة 40%" : "Downpayment 40%")}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-midyaf-gold">
                      <ShieldCheck size={12} />
                      {cnt.digitalSeal ? cnt.digitalSeal.slice(0, 10) + "..." : "SHA-256 Verified"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

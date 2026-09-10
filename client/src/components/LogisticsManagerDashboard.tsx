import { useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
  FileText,
  Calendar,
  ReceiptText,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserCheck,
  MessageSquare,
  Users,
  Car,
  Hotel,
  ShieldCheck,
  Plus
} from "lucide-react";
import type { MidyafData, Session, TaskDelegation, ClientMessage } from "@shared/domain";
import { DEFAULT_CLIENT_MESSAGES } from "@shared/constants";
import { shortDate, shortTime } from "../lib/format";
import { Badge } from "./Badge";
import { Section } from "./Section";
import { PortalHero } from "./PortalHero";
import { useTacticalToast } from "./TacticalToast";

export function LogisticsManagerDashboard({
  data,
  session,
  isDemoMode,
  isArabic = true,
  onDownloadReport
}: {
  data: MidyafData;
  session: Session | null;
  isDemoMode?: boolean;
  isArabic?: boolean;
  onDownloadReport?: () => void;
}) {
  const toast = useTacticalToast();
  const event = data.events[0];
  const report = data.companyReports[0];

  // Relayed Tasks state
  const [relayedTasks, setRelayedTasks] = useState<TaskDelegation[]>([
    {
      id: "del-001",
      taskId: "tsk-001",
      taskTitle: isArabic ? "استقبال الوفد البريطاني في الصالة الملكية وتأمين الموكب" : "Royal Terminal VIP Escort for UK Delegation",
      fromRole: "LOGISTICS_MANAGER",
      toRole: "EVENT_MANAGER",
      assignedBy: isArabic ? "مدير العمليات (صلة)" : "Sila Logistics Manager",
      assignedTo: isArabic ? "سعود العتيبي (مدير الفعالية)" : "Saud Al Otaibi (Event Manager)",
      instructions: isArabic ? "التنسيق مع التشريفات وتأمين سيارتي مايباخ وحافلة كبار الشخصيات" : "Coordinate with Protocol and stage two Maybachs and VIP bus",
      priority: "HIGH",
      deadline: "14:00",
      status: "IN_PROGRESS",
      createdAt: new Date().toISOString()
    },
    {
      id: "del-002",
      taskId: "tsk-002",
      taskTitle: isArabic ? "تدقيق أجنحة فندق فورسيزونز وتوزيع بطاقات الضيوف الرقمية" : "Inspect Four Seasons VIP Suites & Hand Over Passes",
      fromRole: "LOGISTICS_MANAGER",
      toRole: "EVENT_MANAGER",
      assignedBy: isArabic ? "مدير العمليات (صلة)" : "Sila Logistics Manager",
      assignedTo: isArabic ? "سعود العتيبي (مدير الفعالية)" : "Saud Al Otaibi (Event Manager)",
      instructions: isArabic ? "التأكد من اكتمال باقات الضيافة والتسكين السريع" : "Ensure hospitality riders are fulfilled and fast check-in enabled",
      priority: "NORMAL",
      deadline: "16:30",
      status: "ASSIGNED",
      createdAt: new Date().toISOString()
    }
  ]);

  // Form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskInstructions, setTaskInstructions] = useState("");
  const [taskPriority, setTaskPriority] = useState<"NORMAL" | "HIGH" | "URGENT">("HIGH");
  const [taskDeadline, setTaskDeadline] = useState("18:00");

  // Client messages
  const [clientMessages, setClientMessages] = useState<ClientMessage[]>(DEFAULT_CLIENT_MESSAGES);
  const [replyText, setReplyText] = useState("");

  const handleRelayTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    const newTask: TaskDelegation = {
      id: `del-${Date.now().toString().slice(-4)}`,
      taskId: `tsk-${Date.now().toString().slice(-4)}`,
      taskTitle: taskTitle.trim(),
      fromRole: "LOGISTICS_MANAGER",
      toRole: "EVENT_MANAGER",
      assignedBy: isArabic ? "مدير العمليات (صلة)" : "Sila Logistics Manager",
      assignedTo: isArabic ? "سعود العتيبي (مدير الفعالية)" : "Saud Al Otaibi (Event Manager)",
      instructions: taskInstructions.trim() || (isArabic ? "مهمة تشغيلية مباشرة" : "Direct operational assignment"),
      priority: taskPriority,
      deadline: taskDeadline,
      status: "ASSIGNED",
      createdAt: new Date().toISOString()
    };

    setRelayedTasks([newTask, ...relayedTasks]);
    setTaskTitle("");
    setTaskInstructions("");
    toast.success(
      isArabic ? "تم ترحيل المهمة إلى مدير الفعالية" : "Task Relayed to Event Manager",
      isArabic ? "وصلت المهمة فوراً إلى لوحة مدير الفعالية لتوزيعها على فريقه" : "Dispatched to Event Manager's incoming queue"
    );
  };

  const handleSendClientReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    const replyMsg: ClientMessage = {
      id: `msg-${Date.now().toString().slice(-4)}`,
      clientId: "cli-sila-gov-2026",
      senderName: isArabic ? "مدير العمليات اللوجستية (صلة)" : "Sila Logistics Manager",
      senderRole: "LOGISTICS_MANAGER",
      message: replyText.trim(),
      timestamp: new Date().toLocaleTimeString(isArabic ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" }),
      isRead: true
    };

    setClientMessages(prev => [...prev, replyMsg]);
    setReplyText("");
    toast.success(
      isArabic ? "تم إرسال الرد إلى العميل" : "Reply Sent to Client",
      isArabic ? "يظهر الرد الآن مباشرة في لوحة العميل المستفيد" : "Visible live on the Client Dashboard"
    );
  };

  return (
    <div className="space-y-6">
      {/* Logistics Manager Hero */}
      <PortalHero
        badge={
          <span className="inline-flex items-center gap-1.5 text-midyaf-gold">
            <BriefcaseBusiness size={15} />
            {isArabic ? "لوحة مدير العمليات اللوجستية — شركة صلة" : "Logistics Manager Dashboard — Sila Operations"}
          </span>
        }
        title={
          isArabic
            ? "إدارة العمليات اللوجستية، العقود، وترحيل المهام لمدير الفعالية"
            : "Logistics Operations, Contracts & Event Manager Task Relaying"
        }
        body={
          isArabic
            ? "اللوحة المخصصة لمدير العمليات التابع لشركة صلة: مراجعة تقارير الفعالية، تتبع الأنشطة، الإشراف على عقود الموردين التشغيلية، وترحيل وتفويض المهام مباشرة لمدير الفعالية الميداني."
            : "Dedicated portal for Sila's Logistics Manager: view reports, oversee activities, manage supplier operational contracts, and relay tasks directly to the Event/Activity Manager."
        }
      />

      {/* Quick Status Pill Bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass-card rounded-2xl p-5 border-midyaf-gold/30">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            {isArabic ? "الأنشطة تحت الإشراف" : "Assigned Activities"}
          </span>
          <p className="mt-2 text-2xl font-black text-midyaf-ink dark:text-white font-tnum">
            {data.activityIntakes.length} {isArabic ? "فعاليات كبرى" : "Major Events"}
          </p>
          <p className="mt-1 text-xs text-midyaf-gold font-bold">
            ✓ {isArabic ? "قمة القيادة السيادية" : "Sovereign Leadership Summit"}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            {isArabic ? "العقود التشغيلية للموردين" : "Active Vendor Contracts"}
          </span>
          <p className="mt-2 text-2xl font-black text-midyaf-purple dark:text-purple-300 font-tnum">
            {data.contracts.length} {isArabic ? "عقود معتمدة" : "Active Contracts"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {isArabic ? "فنادق، أساطيل، طيران، وقوى بشرية" : "Hotels, fleets, airlines & manpower"}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            {isArabic ? "المهام المرحلة لمدير الفعالية" : "Tasks Relayed to Event Mgr"}
          </span>
          <p className="mt-2 text-2xl font-black text-midyaf-ink dark:text-white font-tnum">
            {relayedTasks.length} {isArabic ? "مهام" : "Tasks"}
          </p>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
            ✓ {relayedTasks.filter(t => t.status === "IN_PROGRESS").length} {isArabic ? "قيد التنفيذ الميداني" : "In Progress"}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            {isArabic ? "رسائل واستفسارات العميل" : "Client Messages"}
          </span>
          <p className="mt-2 text-2xl font-black text-sky-600 dark:text-sky-400 font-tnum">
            {clientMessages.length} {isArabic ? "رسائل" : "Messages"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {isArabic ? "تواصل مباشر مع وزارة السياحة" : "Direct line with Ministry Client"}
          </p>
        </div>
      </div>

      {/* Task 3 Core Feature 4: Relay / Assign Tasks to Event/Activity Manager */}
      <Section
        id="section-logistics-relay"
        title={
          <div className="flex items-center gap-2">
            <Send size={18} className="text-midyaf-gold" />
            <span>{isArabic ? "ترحيل وتكليف المهام لمدير الفعالية (Relay Tasks to Event Manager)" : "Relay & Dispatch Tasks to Event/Activity Manager"}</span>
          </div>
        }
      >
        <p className="mb-4 text-xs text-slate-500">
          {isArabic
            ? "يتولى مدير العمليات اللوجستية (صلة) صياغة التوجيهات التشغيلية وترحيلها مباشرة إلى مدير الفعالية، والذي يقوم بدوره بتوزيعها وتفويضها لفريقه الميداني."
            : "The Logistics Manager relays high-level operational directives directly to the designated Event/Activity Manager for field-level delegation."}
        </p>

        {/* Task Relay Form */}
        <form onSubmit={handleRelayTask} className="mb-6 rounded-2xl border border-midyaf-purple/20 bg-midyaf-purple/5 p-4 dark:border-midyaf-purple/30 dark:bg-midyaf-purple/10">
          <h4 className="text-xs font-bold text-midyaf-purple dark:text-purple-300 mb-3 flex items-center gap-2">
            <UserCheck size={14} />
            {isArabic ? "إصدار تكليف جديد لمدير الفعالية (سعود العتيبي)" : "Issue New Directive to Event Manager (Saud Al Otaibi)"}
          </h4>

          <div className="grid gap-3 sm:grid-cols-3 mb-3">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                {isArabic ? "عنوان التكليف التشغيلي" : "Task Directive Title"}
              </label>
              <input
                type="text"
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
                placeholder={isArabic ? "مثال: استلام موكب الوفد الفرنسي من الصالة الملكية وتنسيق المرور" : "e.g., French Delegation VIP Convoy Protocol"}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                {isArabic ? "مستوى الأهمية والسرعة" : "Priority & Urgency"}
              </label>
              <select
                value={taskPriority}
                onChange={e => setTaskPriority(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="NORMAL">{isArabic ? "عادية (Normal)" : "Normal"}</option>
                <option value="HIGH">{isArabic ? "عالية (High Priority)" : "High Priority"}</option>
                <option value="URGENT">{isArabic ? "عاجلة وطارئة (Urgent)" : "Urgent"}</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4 mb-3">
            <div className="sm:col-span-3">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                {isArabic ? "التعليمات والتفاصيل الميدانية" : "Operational Instructions"}
              </label>
              <input
                type="text"
                value={taskInstructions}
                onChange={e => setTaskInstructions(e.target.value)}
                placeholder={isArabic ? "توجيهات محددة لمدير الفعالية للتنسيق والتفويض..." : "Specific operational instructions for the event team..."}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                {isArabic ? "الموعد النهائي" : "Deadline"}
              </label>
              <input
                type="text"
                value={taskDeadline}
                onChange={e => setTaskDeadline(e.target.value)}
                placeholder="18:00"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="btn-primary rounded-xl px-5 py-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Send size={14} />
              <span>{isArabic ? "ترحيل التكليف لمدير الفعالية ↗" : "Relay Task to Event Manager ↗"}</span>
            </button>
          </div>
        </form>

        {/* Live Relayed Tasks List */}
        <div className="space-y-3">
          {relayedTasks.map((t) => (
            <div
              key={t.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-midyaf-ink dark:text-white text-xs">
                    {t.taskTitle}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-black ${
                      t.priority === "URGENT"
                        ? "bg-rose-500 text-white"
                        : t.priority === "HIGH"
                        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {t.priority}
                  </span>
                  <span className="text-[10px] text-slate-400 font-tnum">
                    {isArabic ? `الموعد: ${t.deadline}` : `Due: ${t.deadline}`}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {isArabic ? `التعليمات: ${t.instructions}` : `Instructions: ${t.instructions}`}
                </p>
                <p className="text-[11px] text-midyaf-purple dark:text-purple-300 font-semibold">
                  {isArabic ? `المسند إليه: ${t.assignedTo}` : `Assigned to: ${t.assignedTo}`}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Badge tone={t.status === "IN_PROGRESS" ? "gold" : "purple"}>
                  {t.status === "IN_PROGRESS" ? (isArabic ? "قيد التنفيذ الميداني" : "In Progress") : (isArabic ? "مرحّلة وبانتظار التوزيع" : "Relayed")}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Task 3 Core Feature 2: View Activities */}
      <Section
        id="section-logistics-activities"
        title={
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-midyaf-purple" />
            <span>{isArabic ? "الأنشطة والفعاليات المسندة لشركة صلة (Managed Activities)" : "Activities Managed by Sila"}</span>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {data.activityIntakes.map((act) => (
            <div key={act.id} className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h4 className="font-extrabold text-midyaf-ink dark:text-white text-base">
                    {act.activityName}
                  </h4>
                  <p className="text-xs text-slate-400">{act.activityPlace}</p>
                </div>
                <Badge tone="green">{act.status}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs my-3 bg-slate-50/80 p-2.5 rounded-xl dark:bg-slate-800/60">
                <div>
                  <span className="text-[10px] text-slate-400 block">{isArabic ? "إجمالي الحضور" : "Guests"}</span>
                  <span className="font-bold text-midyaf-ink dark:text-white font-tnum">{act.visitorCount}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">{isArabic ? "كبار الشخصيات" : "VIP Guests"}</span>
                  <span className="font-bold text-midyaf-gold font-tnum">{act.vipVisitorCount}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">{isArabic ? "الفنادق المعتمدة" : "Hotels"}</span>
                  <span className="font-bold text-midyaf-purple dark:text-purple-300 font-tnum">{act.hotels?.length || 2}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span>{isArabic ? "مسؤول الإدخال:" : "Input by:"} {act.submittedBy || "فريق صلة"}</span>
                <span className="font-tnum">{shortDate(act.submittedAt || act.createdAt || new Date().toISOString())}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Task 3 Core Feature 3: View Contracts */}
      <Section
        id="section-logistics-contracts"
        title={
          <div className="flex items-center gap-2">
            <ReceiptText size={18} className="text-midyaf-gold" />
            <span>{isArabic ? "عقود الموردين ومذكرات التزويد المعتمدة (Operational Supplier Contracts)" : "Operational Supplier Contracts & Scopes of Supply"}</span>
          </div>
        }
      >
        <p className="mb-4 text-xs text-slate-500">
          {isArabic
            ? "نطاقات العمل المعتمدة، التزامات التوريد، ومواصفات الأسطول والفنادق للشركات المعتمدة في الفعالية."
            : "Approved scopes of work, vehicle fleet profiles, and delivery commitments across certified vendors for event operations."}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.contracts.map((cnt) => (
            <div key={cnt.id} className="rounded-xl border border-slate-200 bg-white/80 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-mono text-xs font-bold text-midyaf-purple dark:text-purple-300">{cnt.contractNumber}</span>
                <Badge tone="green">{cnt.status}</Badge>
              </div>
              <h5 className="font-bold text-midyaf-ink dark:text-white text-xs">{cnt.vendorName}</h5>
              <p className="text-[11px] text-slate-500 mt-0.5">{isArabic ? "القطاع:" : "Category:"} {cnt.category}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 bg-slate-50 p-2 rounded-lg dark:bg-slate-800 leading-relaxed">
                {cnt.scopeOfWork || (isArabic ? "توفير الأسطول والسائقين المدربين وخدمات الاستقبال السيادية." : "Supply of executive fleets, VIP chauffeurs, and protocol escort.")}
              </p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span>{cnt.paymentTerms === "INSTALLMENTS" ? (isArabic ? "دفع بالأقساط" : "Installments") : (isArabic ? "دفعة مقدمة" : "Downpayment")}</span>
                <span className="font-mono text-[10px] text-midyaf-gold flex items-center gap-1">
                  <ShieldCheck size={12} />
                  {cnt.digitalSeal?.slice(0, 8)}...
                </span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Task 3 Core Feature 1: View Reports & Client Chat Feed */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Reports View */}
        <Section
          title={
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-midyaf-purple" />
                <span>{isArabic ? "تقارير الفعالية التنفيذية" : "Executive Event Reports"}</span>
              </div>
              {onDownloadReport && (
                <button
                  type="button"
                  onClick={onDownloadReport}
                  className="flex items-center gap-1 rounded-lg bg-midyaf-purple/10 px-2.5 py-1 text-xs font-bold text-midyaf-purple hover:bg-midyaf-purple/20 transition dark:bg-midyaf-purple/20 dark:text-purple-300 cursor-pointer"
                >
                  <FileText size={13} />
                  <span>{isArabic ? "تصدير PDF" : "Export PDF"}</span>
                </button>
              )}
            </div>
          }
        >
          <div className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 space-y-3">
            <h5 className="font-bold text-midyaf-ink dark:text-white text-xs">{report?.title || "Sovereign Executive Post-Event Briefing"}</h5>
            <p className="text-xs text-slate-500 leading-relaxed">
              {report?.summary || "Completed operational report ready for client sharing."}
            </p>
            <div className="grid grid-cols-2 gap-2 text-center text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="bg-slate-50 p-2 rounded-lg dark:bg-slate-800 font-tnum">
                <span className="text-[10px] text-slate-400 block">{isArabic ? "الالتزام بالجدول" : "On-Time Rate"}</span>
                <span className="font-bold text-emerald-600">99.4%</span>
              </div>
              <div className="bg-slate-50 p-2 rounded-lg dark:bg-slate-800 font-tnum">
                <span className="text-[10px] text-slate-400 block">{isArabic ? "الملاحظات المغلقة" : "Closed Tasks"}</span>
                <span className="font-bold text-midyaf-purple dark:text-purple-300">100%</span>
              </div>
            </div>
          </div>
        </Section>

        {/* Client Messaging */}
        <Section
          title={
            <div className="flex items-center gap-2">
              <MessageSquare size={18} className="text-sky-500" />
              <span>{isArabic ? "التواصل المباشر مع عميل صلة" : "Live Channel with Client"}</span>
            </div>
          }
        >
          <div className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
            <div className="space-y-3 max-h-52 overflow-y-auto mb-3">
              {clientMessages.map((m) => (
                <div key={m.id} className={`text-xs p-2.5 rounded-xl ${m.senderRole === "CLIENT" ? "bg-slate-100 dark:bg-slate-800" : "bg-midyaf-purple/10 text-midyaf-purple dark:bg-midyaf-purple/20 dark:text-purple-300"}`}>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span className="font-bold">{m.senderName}</span>
                    <span className="font-tnum">{m.timestamp}</span>
                  </div>
                  <p>{m.message}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendClientReply} className="flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={isArabic ? "الرد على استفسار العميل..." : "Reply to client..."}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="submit"
                className="btn-primary rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Send size={13} />
                <span>{isArabic ? "إرسال" : "Reply"}</span>
              </button>
            </form>
          </div>
        </Section>
      </div>
    </div>
  );
}

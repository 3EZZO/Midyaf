import { useState } from "react";
import {
  Users,
  UserPlus,
  ArrowDownRight,
  ClipboardList,
  CheckCircle2,
  Clock,
  Send,
  Phone,
  Mail,
  MapPin,
  Shield,
  Layers,
  ChevronRight,
  Sparkles,
  UserCheck
} from "lucide-react";
import type { MidyafData, Session, TeamMember, TaskDelegation } from "@shared/domain";
import { DEFAULT_TEAM_MEMBERS } from "@shared/constants";
import { Badge } from "./Badge";
import { Section } from "./Section";
import { PortalHero } from "./PortalHero";
import { useTacticalToast } from "./TacticalToast";

export function EventManagerDashboard({
  data,
  session,
  isDemoMode,
  isArabic = true
}: {
  data: MidyafData;
  session: Session | null;
  isDemoMode?: boolean;
  isArabic?: boolean;
}) {
  const toast = useTacticalToast();
  const event = data.events[0];

  // Team state
  const [team, setTeam] = useState<TeamMember[]>(DEFAULT_TEAM_MEMBERS);
  const [newMemberModal, setNewMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("");
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [newMemberZone, setNewMemberZone] = useState("NORTH_ZONE");

  // Tasks relayed from Logistics Manager + Assigned to Team
  const [tasks, setTasks] = useState<TaskDelegation[]>([
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
      deadline: "16:30",
      status: "ASSIGNED",
      createdAt: new Date().toISOString()
    },
    {
      id: "tsk-rel-3",
      taskId: "t-103",
      taskTitle: isArabic ? "إدارة مواكب العشاء الدبلوماسي في مطل البجيري بالدرعية" : "Bujairi Terrace Dinner Convoy Management",
      fromRole: "LOGISTICS_MANAGER",
      toRole: "EVENT_MANAGER",
      assignedBy: isArabic ? "مدير العمليات اللوجستية (صلة)" : "Sila Logistics Manager",
      assignedTo: isArabic ? "سعود العتيبي (مدير الفعالية)" : "Saud Al Otaibi (Event Mgr)",
      instructions: isArabic ? "تأمين تدفق 12 موكباً عبر مسار وادي حنيفة ومنع أي توقف" : "Secure convoy flow via Wadi Hanifah",
      priority: "URGENT",
      deadline: "19:00",
      status: "ASSIGNED",
      createdAt: new Date().toISOString()
    }
  ]);

  // Assignment Modal / State
  const [selectedTaskForAssign, setSelectedTaskForAssign] = useState<TaskDelegation | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [delegationNotes, setDelegationNotes] = useState("");

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberRole.trim()) return;

    const newMem: TeamMember = {
      id: `tm-${Date.now().toString().slice(-4)}`,
      name: newMemberName.trim(),
      roleTitle: newMemberRole.trim(),
      phone: newMemberPhone.trim() || "+966550000000",
      email: `${newMemberName.toLowerCase().replace(/\s+/g, ".")}@sila.com`,
      zone: newMemberZone,
      activeTasksCount: 0,
      status: "AVAILABLE"
    };

    setTeam([...team, newMem]);
    setNewMemberName("");
    setNewMemberRole("");
    setNewMemberPhone("");
    setNewMemberModal(false);
    toast.success(
      isArabic ? "تمت إضافة عضو الفريق الجديد" : "Team Member Added",
      isArabic ? `تم ضم ${newMem.name} إلى فريق إدارة الفعالية بنجاح` : `Enrolled ${newMem.name} in event team`
    );
  };

  const handleAssignTaskToMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForAssign || !selectedMemberId) return;

    const targetMember = team.find(m => m.id === selectedMemberId);
    if (!targetMember) return;

    setTasks(prev =>
      prev.map(t =>
        t.id === selectedTaskForAssign.id
          ? {
              ...t,
              toRole: "TEAM_MEMBER",
              assignedTo: `${targetMember.name} (${targetMember.roleTitle})`,
              teamMemberId: targetMember.id,
              instructions: delegationNotes.trim() || t.instructions,
              status: "IN_PROGRESS"
            }
          : t
      )
    );

    // Increment member task count
    setTeam(prev =>
      prev.map(m =>
        m.id === targetMember.id
          ? { ...m, activeTasksCount: m.activeTasksCount + 1, status: "ON_MISSION" }
          : m
      )
    );

    setSelectedTaskForAssign(null);
    setSelectedMemberId("");
    setDelegationNotes("");

    toast.success(
      isArabic ? "تم تفويض المهمة إلى عضو الفريق" : "Task Delegated Down Chain",
      isArabic ? `تم إسناد المهمة إلى ${targetMember.name} مع تحديث سجل التتبع` : `Assigned to ${targetMember.name}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Event Manager Hero */}
      <PortalHero
        badge={
          <span className="inline-flex items-center gap-1.5 text-midyaf-gold">
            <Users size={15} />
            {isArabic ? "لوحة مدير الفعالية الميداني (سعود العتيبي)" : "Event/Activity Manager Dashboard (Saud Al Otaibi)"}
          </span>
        }
        title={
          isArabic
            ? "تشكيل الفريق الميداني، توزيع المهام، والتفويض الهرمي"
            : "Field Team Formation, Task Assignment & Chain Delegation"
        }
        body={
          isArabic
            ? "اللوحة التشغيلية لمدير الفعالية: إنشاء وإدارة الفريق الميداني الخاص بك، استلام التكليفات من مدير العمليات (صلة)، تفويض المهام للأعضاء ومتابعة الإنجاز خطوة بخطوة."
            : "Operations console for the Event Manager: build your custom field team, receive relayed directives from the Logistics Manager, and delegate down the chain with live telemetry."
        }
      />

      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass-card rounded-2xl p-5 border-midyaf-gold/30">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            {isArabic ? "أعضاء الفريق الميداني" : "Field Team Size"}
          </span>
          <p className="mt-2 text-2xl font-black text-midyaf-ink dark:text-white font-tnum">
            {team.length} {isArabic ? "أعضاء متخصصين" : "Specialists"}
          </p>
          <p className="mt-1 text-xs text-midyaf-gold font-bold">
            ✓ {team.filter(m => m.status === "ON_MISSION").length} {isArabic ? "في مهام ميدانية حالياً" : "Active on missions"}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            {isArabic ? "إجمالي المهام الموزعة" : "Delegated Tasks"}
          </span>
          <p className="mt-2 text-2xl font-black text-midyaf-purple dark:text-purple-300 font-tnum">
            {tasks.length} {isArabic ? "مهام" : "Tasks"}
          </p>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
            ✓ {tasks.filter(t => t.status === "IN_PROGRESS").length} {isArabic ? "قيد التنفيذ النشط" : "In Progress"}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            {isArabic ? "مهام بانتظار التوزيع" : "Awaiting Delegation"}
          </span>
          <p className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400 font-tnum">
            {tasks.filter(t => !t.teamMemberId).length} {isArabic ? "مهام جديدة" : "New Tasks"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {isArabic ? "مرحّلة من مدير العمليات اللوجستية" : "Relayed from Logistics Mgr"}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            {isArabic ? "دقة إنجاز المهام" : "Team Execution SLA"}
          </span>
          <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400 font-tnum">100%</p>
          <p className="mt-1 text-xs text-slate-400">
            {isArabic ? "صفر تأخيرات مسجلة" : "Zero delays recorded"}
          </p>
        </div>
      </div>

      {/* Task 4 Core Feature 1: Create Their Own Team */}
      <Section
        id="section-event-team"
        title={
          <div className="flex items-center justify-between w-full flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-midyaf-purple" />
              <span>{isArabic ? "فريق العمل الميداني للفعالية (Event Field Team)" : "Custom Event Field Team"}</span>
            </div>
            <button
              type="button"
              onClick={() => setNewMemberModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-midyaf-purple/10 px-3 py-1.5 text-xs font-bold text-midyaf-purple hover:bg-midyaf-purple/20 transition dark:bg-midyaf-purple/20 dark:text-purple-300 cursor-pointer"
            >
              <UserPlus size={14} />
              <span>{isArabic ? "+ إضافة عضو جديد للفريق" : "+ Add Team Member"}</span>
            </button>
          </div>
        }
      >
        <p className="mb-4 text-xs text-slate-500">
          {isArabic
            ? "يقوم مدير الفعالية ببناء فريقه الميداني وتعيين مسؤولي المحطات والبروتوكول، وتوزيع التكليفات عليهم مباشرة."
            : "The Event Manager builds and structures their dedicated field team, assigning zone leads and dispatching relayed directives."}
        </p>

        {/* Add Team Member Modal Form */}
        {newMemberModal && (
          <form onSubmit={handleAddMember} className="mb-6 rounded-2xl border border-midyaf-gold/30 bg-midyaf-gold/5 p-4 dark:border-midyaf-gold/20 dark:bg-midyaf-gold/10">
            <h4 className="text-xs font-bold text-[#7A5D12] dark:text-midyaf-gold mb-3 flex items-center gap-1.5">
              <UserPlus size={14} />
              {isArabic ? "إضافة عضو جديد إلى فريق الفعالية" : "Enroll New Member in Event Team"}
            </h4>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                  {isArabic ? "اسم العضو" : "Member Name"}
                </label>
                <input
                  type="text"
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  placeholder={isArabic ? "مثال: عبد العزيز الشهري" : "e.g., Abdulaziz Al Shehri"}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                  {isArabic ? "المسمى والمسؤولية الميدانية" : "Role & Responsibility"}
                </label>
                <input
                  type="text"
                  value={newMemberRole}
                  onChange={e => setNewMemberRole(e.target.value)}
                  placeholder={isArabic ? "مثال: مسؤول مرافقة كبار الشخصيات" : "e.g., VIP Protocol Escort"}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                  {isArabic ? "رقم الهاتف" : "Phone Number"}
                </label>
                <input
                  type="text"
                  value={newMemberPhone}
                  onChange={e => setNewMemberPhone(e.target.value)}
                  placeholder="+966 5X XXX XXXX"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                  {isArabic ? "نطاق العمل / المنطقة" : "Assigned Zone"}
                </label>
                <select
                  value={newMemberZone}
                  onChange={e => setNewMemberZone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="NORTH_ZONE">{isArabic ? "المنطقة الشمالية (المطار)" : "North Zone (Airport)"}</option>
                  <option value="CENTRAL_ZONE">{isArabic ? "المنطقة المركزية (الفنادق)" : "Central Zone (Hotels)"}</option>
                  <option value="SUMMIT_CORRIDOR">{isArabic ? "ممر القمة (الدرعية / مركز الملك عبد الله)" : "Summit Corridor"}</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewMemberModal(false)}
                className="rounded-xl px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 transition cursor-pointer"
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                className="btn-primary rounded-xl px-4 py-1.5 text-xs font-bold cursor-pointer"
              >
                {isArabic ? "تأكيد إضافة العضو" : "Confirm Member Enrollment"}
              </button>
            </div>
          </form>
        )}

        {/* Team Cards Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((mem) => (
            <div key={mem.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 transition-all hover:shadow-md">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="grid size-9 place-items-center rounded-xl bg-midyaf-purple/10 text-midyaf-purple font-black text-xs dark:bg-midyaf-purple/20 dark:text-purple-300">
                  {mem.name.split(" ").map(w => w[0]).filter(Boolean).join("").slice(0, 2)}
                </div>
                <Badge tone={mem.status === "ON_MISSION" ? "gold" : "green"}>
                  {mem.status === "ON_MISSION" ? (isArabic ? "في مهمة ميدانية" : "On Mission") : (isArabic ? "متاح للتكليف" : "Available")}
                </Badge>
              </div>

              <h5 className="font-extrabold text-midyaf-ink dark:text-white text-xs">{mem.name}</h5>
              <p className="text-[11px] text-midyaf-purple dark:text-purple-300 font-semibold mt-0.5">{mem.roleTitle}</p>

              <div className="mt-3 space-y-1 text-[10px] text-slate-400">
                <p className="flex items-center gap-1">
                  <Phone size={11} />
                  <span className="font-tnum">{mem.phone}</span>
                </p>
                <p className="flex items-center gap-1">
                  <MapPin size={11} />
                  <span>{mem.zone}</span>
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">{isArabic ? "المهام الحالية:" : "Active Tasks:"}</span>
                <span className="font-black text-midyaf-gold font-tnum">{mem.activeTasksCount}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Task 4 Core Feature 2 & 3: Assign Tasks to Team Members & Hierarchical Delegation */}
      <Section
        id="section-event-delegation"
        title={
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-midyaf-gold" />
            <span>{isArabic ? "تفويض المهام وسلسلة القيادة الهرمية (Hierarchical Delegation Chain)" : "Task Delegation & Hierarchical Command Chain"}</span>
          </div>
        }
      >
        <p className="mb-4 text-xs text-slate-500">
          {isArabic
            ? "سلسلة التكليف والتفويض المباشر: مدير العمليات اللوجستية (صلة) ➔ مدير الفعالية ➔ مسؤول الفريق الميداني ➔ الكباتن والمنسقين."
            : "Multi-tier operational delegation: Logistics Manager ➔ Event Manager ➔ Field Team Member ➔ Execution & Completion."}
        </p>

        {/* Task Delegation Modal */}
        {selectedTaskForAssign && (
          <form onSubmit={handleAssignTaskToMember} className="mb-5 rounded-2xl border border-midyaf-purple/30 bg-midyaf-purple/5 p-4 dark:border-midyaf-purple/20 dark:bg-midyaf-purple/10">
            <h4 className="text-xs font-bold text-midyaf-purple dark:text-purple-300 mb-2">
              {isArabic ? `تفويض المهمة: ${selectedTaskForAssign.taskTitle}` : `Delegate Task: ${selectedTaskForAssign.taskTitle}`}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 mb-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                  {isArabic ? "اختر عضو الفريق المسؤول عن التنفيذ" : "Select Assignee from Your Team"}
                </label>
                <select
                  value={selectedMemberId}
                  onChange={e => setSelectedMemberId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">{isArabic ? "-- اختر عضواً من الفريق --" : "-- Select Member --"}</option>
                  {team.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.roleTitle} ({m.zone})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                  {isArabic ? "توجيهات إضافية لعضو الفريق" : "Additional Instructions"}
                </label>
                <input
                  type="text"
                  value={delegationNotes}
                  onChange={e => setDelegationNotes(e.target.value)}
                  placeholder={isArabic ? "تعليمات خاصة بالموقع أو التواصل..." : "Special instructions..."}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedTaskForAssign(null)}
                className="rounded-xl px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 transition cursor-pointer"
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                className="btn-primary rounded-xl px-4 py-1.5 text-xs font-bold cursor-pointer"
              >
                {isArabic ? "تأكيد تفويض المهمة ↗" : "Confirm Delegation ↗"}
              </button>
            </div>
          </form>
        )}

        {/* Delegated Tasks Chain List */}
        <div className="space-y-3">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-midyaf-ink dark:text-white text-xs">
                      {t.taskTitle}
                    </span>
                    <Badge tone={t.priority === "URGENT" ? "red" : t.priority === "HIGH" ? "gold" : "purple"}>
                      {t.priority}
                    </Badge>
                    <span className="text-[10px] text-slate-400 font-tnum">
                      {isArabic ? `الموعد: ${t.deadline}` : `Due: ${t.deadline}`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{t.instructions}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {t.teamMemberId ? (
                    <Badge tone="green">
                      <CheckCircle2 size={12} className="me-1" />
                      {isArabic ? "مفوّضة وقيد التنفيذ" : "Delegated & Active"}
                    </Badge>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTaskForAssign(t);
                        setSelectedMemberId(team[0]?.id || "");
                      }}
                      className="btn-primary rounded-xl px-3.5 py-1.5 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowDownRight size={14} />
                      <span>{isArabic ? "تفويض لعضو من فريقي ↗" : "Delegate to Team ↗"}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Chain of Custody Breadcrumb */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap text-[10px] text-slate-400">
                <span className="font-bold text-slate-600 dark:text-slate-300">
                  {isArabic ? "مسار التفويض الهرمي:" : "Command Chain:"}
                </span>
                <span className="bg-slate-100 px-2 py-0.5 rounded-md dark:bg-slate-800 font-semibold text-midyaf-purple dark:text-purple-300">
                  {t.fromRole === "LOGISTICS_MANAGER" ? (isArabic ? "مدير العمليات (صلة)" : "Logistics Manager") : t.fromRole}
                </span>
                <ChevronRight size={12} className="text-slate-400" />
                <span className="bg-midyaf-gold/15 text-[#7A5D12] dark:text-midyaf-gold px-2 py-0.5 rounded-md font-bold">
                  {isArabic ? "مدير الفعالية (سعود العتيبي)" : "Event Manager"}
                </span>
                <ChevronRight size={12} className="text-slate-400" />
                <span className={`px-2 py-0.5 rounded-md font-bold ${t.teamMemberId ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-600"}`}>
                  {t.teamMemberId ? t.assignedTo : (isArabic ? "بانتظار التفويض لعضو ميداني" : "Pending Field Assignee")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

import { useState, FormEvent } from "react";
import {
  Map,
  FileText,
  CarFront,
  Send,
  TrendingUp,
  Layers,
  ChevronRight,
  ClipboardList,
  Mail
} from "lucide-react";
import type { MidyafData, Session, TaskStatus, TaskDelegation } from "@shared/domain";
import { Section } from "./Section";
import { Badge } from "./Badge";
import { PortalHero } from "./PortalHero";



function shortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SilaOperationsDashboard({
  data,
  session,
  isDemoMode,
  isArabic,
  onDownloadReport
}: {
  data: MidyafData;
  session: Session | null;
  isDemoMode: boolean;
  isArabic: boolean;
  onDownloadReport?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"intake" | "fleet" | "contracts" | "delegation" | "reports">("intake");

  // State from Logistics
  const [replyText, setReplyText] = useState("");
  const [clientMessages, setClientMessages] = useState(() => [
    { id: "1", senderName: "Ministry of Culture (Client)", senderRole: "CLIENT", messageEn: "Are the VIP executive fleets staged at the Royal Terminal?", messageAr: "هل سيارات كبار الشخصيات جاهزة في الصالة الملكية؟", timestamp: "09:14 AM" },
    { id: "2", senderName: "Sila Logistics Command", senderRole: "LOGISTICS_MANAGER", messageEn: "Yes, all 12 vehicles are staged and drivers are briefed on protocol.", messageAr: "نعم، تم تجهيز جميع السيارات والسائقين بالبروتوكول.", timestamp: "09:16 AM" }
  ]);

  const intakes = [...data.activityIntakes];
  const report = data.companyReports[0];

  const [delegationTasks, setDelegationTasks] = useState<TaskDelegation[]>([
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
    setClientMessages(prev => [...prev, {
      id: Date.now().toString(),
      senderName: "Sila Operations Command",
      senderRole: "LOGISTICS_MANAGER",
      messageEn: replyText,
      messageAr: replyText,
      timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    }]);
    setReplyText("");
  }

  const tabs = [
    { id: "intake", icon: ClipboardList, labelEn: "Activity Intake", labelAr: "استقبال الأنشطة" },
    { id: "delegation", icon: Layers, labelEn: "Task Delegation", labelAr: "تفويض المهام" },
    { id: "fleet", icon: CarFront, labelEn: "Fleet Telemetry", labelAr: "تتبع الأسطول" },
    { id: "contracts", icon: FileText, labelEn: "Supplier Contracts", labelAr: "عقود الموردين" },
    { id: "reports", icon: TrendingUp, labelEn: "Executive Reports", labelAr: "التقارير التنفيذية" },
  ] as const;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PortalHero
          badge={isArabic ? "صلة" : "Sila"}
          title={isArabic ? "منصة عمليات صلة (لوجستيات وفعاليات)" : "Sila Operations Command (Logistics & Events Unified)"}
          body={isArabic 
            ? "تتبع الأسطول، تفويض المهام، إدارة العقود، والتواصل مع العميل في لوحة واحدة." 
            : "Analyze metrics, track fleet telemetry, delegate tasks, and prepare executive reports in one unified dashboard."}
        />
        
        {/* Investor Demo Trigger */}
        <button
          onClick={() => {
            // Dispatch the Ctrl+Shift+D key event to trigger App.tsx simulation toggle
            const event = new KeyboardEvent('keydown', {
              key: 'D',
              code: 'KeyD',
              ctrlKey: true,
              shiftKey: true,
              bubbles: true
            });
            window.dispatchEvent(event);
          }}
          className={`flex items-center gap-2 rounded-2xl px-5 py-3 font-bold shadow-lg transition-all cursor-pointer border ${
            isDemoMode 
              ? "bg-red-500 text-white border-red-600 hover:bg-red-600" 
              : "bg-gradient-to-r from-midyaf-gold to-amber-500 text-white border-amber-600 hover:brightness-110"
          }`}
        >
          <Map size={20} className={isDemoMode ? "animate-spin" : "animate-pulse"} />
          <span>{isDemoMode ? (isArabic ? "إيقاف العرض التوضيحي" : "Stop Investor Demo") : (isArabic ? "بدء العرض التوضيحي الحي" : "Start Investor Demo")}</span>
        </button>
      </div>

      {/* ICON-BASED DRILL-DOWN NAVIGATION */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${
                isActive 
                  ? "bg-midyaf-purple text-white border-midyaf-purple shadow-md scale-[1.02]" 
                  : "bg-white/80 border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Icon size={28} className={isActive ? "text-white" : "text-midyaf-purple dark:text-purple-400"} />
              <span className="text-[11px] font-bold text-center leading-tight">
                {isArabic ? tab.labelAr : tab.labelEn}
              </span>
            </button>
          );
        })}
      </div>

      {/* DRILL-DOWN CONTENT */}
      <div className="mt-6 bg-white/40 dark:bg-slate-900/40 rounded-3xl p-1 shadow-sm border border-slate-200/50 dark:border-slate-800/50">
        
        {/* TAB: INTAKE */}
        {activeTab === "intake" && (
          <Section
            id="section-intake"
            title={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <ClipboardList size={18} className="text-midyaf-purple" />
                  <span>{isArabic ? "استقبال الأنشطة وإدارة الضيوف" : "Sila Intake & Guest Management"}</span>
                </div>
                <button
                  onClick={() => {
                    const url = window.location.origin + window.location.pathname + "#onboarding";
                    navigator.clipboard.writeText(url);
                    alert(isArabic ? "تم نسخ رابط التسجيل للضيوف!" : "Guest invite link copied to clipboard!");
                  }}
                  className="flex items-center gap-1.5 text-[10px] font-bold bg-midyaf-purple/10 text-midyaf-purple hover:bg-midyaf-purple/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <Mail size={12} />
                  {isArabic ? "نسخ رابط دعوة الضيوف" : "Copy Guest Invite Link"}
                </button>
              </div>
            }
          >
            <div className="grid gap-3 lg:grid-cols-2">
              {intakes.map((act) => (
                <div key={act.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h4 className="font-bold text-midyaf-ink dark:text-white text-sm leading-tight">{act.activityName}</h4>
                    <Badge tone={act.status === "PLAN_CONFIRMED" ? "green" : act.status === "DRAFT" ? "red" : "purple"}>
                      {act.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">{act.activityPlace}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                    <span>{isArabic ? "الزوار:" : "Visitors:"} {act.visitorCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* TAB: FLEET */}
        {activeTab === "fleet" && (
          <Section
            id="section-fleet"
            title={
              <div className="flex items-center gap-2">
                <CarFront size={18} className="text-midyaf-gold" />
                <span>{isArabic ? "تتبع الأسطول المباشر" : "Live Fleet Telemetry"}</span>
              </div>
            }
          >
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center dark:border-amber-500/10 dark:bg-amber-500/5">
              <Map size={32} className="mx-auto text-amber-500 mb-2 opacity-50" />
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                {isArabic 
                  ? "سيتم عرض الخريطة الحية للأسطول عند تفعيل محاكاة العرض التوضيحي (Investor Demo)."
                  : "Fleet mapping is accessible via the live demo simulation. Trigger the simulation to view active convoys."}
              </p>
            </div>
          </Section>
        )}

        {/* TAB: DELEGATION */}
        {activeTab === "delegation" && (
          <Section
            id="section-delegation"
            title={
              <div className="flex items-center gap-2">
                <Layers size={18} className="text-midyaf-gold" />
                <span>{isArabic ? "تفويض المهام وسلسلة الأوامر" : "Task Delegation & Command Chain"}</span>
              </div>
            }
          >
            <div className="space-y-4">
              {delegationTasks.map((t) => (
                <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                    <div>
                      <h5 className="font-bold text-midyaf-ink dark:text-white text-xs">{t.taskTitle}</h5>
                      <p className="text-[11px] text-slate-500 mt-1">{t.instructions}</p>
                    </div>
                    {t.teamMemberId ? (
                      <Badge tone="green">{isArabic ? "مفوضة" : "Delegated"}</Badge>
                    ) : (
                      <button className="btn-primary rounded-xl px-3 py-1.5 text-[10px] font-bold cursor-pointer">
                        {isArabic ? "تفويض لشخص +-" : "Delegate +-"}
                      </button>
                    )}
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="font-bold">{isArabic ? "سلسلة الأوامر:" : "Command Chain:"}</span>
                    <span className="bg-slate-100 px-2 py-0.5 rounded-md dark:bg-slate-800 text-midyaf-purple">
                      {t.fromRole}
                    </span>
                    <ChevronRight size={12} />
                    <span className="bg-midyaf-gold/15 text-[#7A5D12] px-2 py-0.5 rounded-md font-bold">
                      {t.teamMemberId ? t.assignedTo : (isArabic ? "بانتظار التعيين" : "Pending Assignee")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* TAB: CONTRACTS */}
        {activeTab === "contracts" && (
          <Section
            id="section-contracts"
            title={
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-midyaf-purple" />
                <span>{isArabic ? "عقود الموردين التشغيلية" : "Operational Supplier Contracts"}</span>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.contracts.map((cnt) => (
                <div key={cnt.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] font-bold text-midyaf-purple">{cnt.contractNumber}</span>
                    <Badge tone="green">{cnt.status}</Badge>
                  </div>
                  <h5 className="font-bold text-xs">{cnt.vendorName}</h5>
                  <p className="text-[11px] text-slate-500 mt-0.5">{cnt.category}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* TAB: REPORTS & CHAT */}
        {activeTab === "reports" && (
          <Section
            id="section-reports"
            title={
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-midyaf-gold" />
                <span>{isArabic ? "التقارير التنفيذية ومحادثة العميل" : "Executive Reports & Client Chat"}</span>
              </div>
            }
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-bold text-xs">
                    {report?.title || (isArabic ? "تقرير تنفيذي" : "Executive Briefing")}
                  </h5>
                  {onDownloadReport && (
                    <button onClick={onDownloadReport} className="flex items-center gap-1 rounded-lg bg-midyaf-purple/10 px-2 py-1 text-[10px] font-bold text-midyaf-purple cursor-pointer hover:bg-midyaf-purple/20">
                      <FileText size={12} /> {isArabic ? "تصدير PDF" : "Export PDF"}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">{report?.summary}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="bg-slate-50 p-2 rounded-lg dark:bg-slate-800"><span className="block text-[10px] text-slate-400">On-Time Rate</span><span className="font-bold text-emerald-600">99.4%</span></div>
                  <div className="bg-slate-50 p-2 rounded-lg dark:bg-slate-800"><span className="block text-[10px] text-slate-400">Closed Tasks</span><span className="font-bold text-midyaf-purple">100%</span></div>
                </div>
              </div>
              
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 flex flex-col h-[250px]">
                <div className="flex-1 space-y-3 overflow-y-auto mb-3 pr-2">
                  {clientMessages.map((m) => (
                    <div key={m.id} className={`text-[11px] p-2.5 rounded-xl ${m.senderRole === "CLIENT" ? "bg-slate-100 dark:bg-slate-800" : "bg-midyaf-purple/10 text-midyaf-purple dark:bg-midyaf-purple/20"}`}>
                      <div className="flex justify-between text-[9px] opacity-70 mb-1 font-bold"><span>{m.senderName}</span><span>{m.timestamp}</span></div>
                      <p>{isArabic ? m.messageAr : m.messageEn}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleSendClientReply} className="flex gap-2 shrink-0">
                  <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={isArabic ? "رد..." : "Reply..."} className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900" />
                  <button type="submit" className="btn-primary rounded-lg px-3 py-1.5 text-xs font-bold flex items-center gap-1 cursor-pointer"><Send size={12} /></button>
                </form>
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

// Logistics command dashboard.
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { useEffect, useState } from "react";
import { BriefcaseBusiness, Car, CheckCircle2, ClipboardCheck, FileText, Key, Plane, ShieldCheck, Sparkles, Users, Radio, Send, AlertTriangle, BarChart2, Coffee, Shield } from "lucide-react";
import { Badge } from "../../components/Badge";
import { MetricCard } from "../../components/MetricCard";
import { LogisticsMetricModal } from "../../components/LogisticsMetricModal";
import { useTacticalToast } from "../../components/TacticalToast";
import { RiyadhMap } from "../../components/map";
import { Section } from "../../components/Section";
import { localAiReply } from "../../components/AiPanel";
import { DashboardJumpDock } from "../../components/DashboardJumpDock";
import { apiFetch } from "../../lib/api";
import { DEMO_HOTSPOTS } from "../../lib/useLiveDemoSimulation";
import type { DemoHotspot } from "../../lib/useLiveDemoSimulation";
import type { PortalProps } from "../types";
import type { Driver, FileAssetType, Task } from "@shared/domain";
import { AuditLogPanel, DeliveryLog, Field, FileAssetList, FileUploadButton, MiniStat, PortalHero, RouteLine, canConfirmReports, canManageOperations, canManageVendorWorkflow, latestFileAsset, uploadAcceptByType, useOpsText } from "./shared";
import { AirportExpressSection, HospitalityRidersSection } from "./RiderSections";
import { TaskAssignmentBoard } from "./TaskAssignmentBoard";
import { OperationsSetup } from "./OperationsSetup";
import { PlanPhases } from "./PlanPhases";

function LiveCommandCenterSection({ session }: { session?: PortalProps["session"] }) {
  const ui = useOpsText();
  const toast = useTacticalToast();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiFetch<any>("/operations/live-command-center", session.accessToken).then((res) => {
      if (res.ok) setData(res);
    });
  }, [session?.accessToken]);

  async function handleDivert() {
    if (!data?.activeAlert?.actionEndpoint || !session?.accessToken) return;
    await apiFetch<any>(data.activeAlert.actionEndpoint, session.accessToken, { method: "POST" });
    toast.success(ui.l("Fleet successfully diverted."));
    setData({ ...data, activeAlert: null });
  }

  if (!data) return null;

  return (
    <div className="border-l-4 border-amber-500 bg-slate-50 shadow-sm rounded-lg p-6">
      <h2 className="text-xl font-bold mb-4">{ui.l("Live Command Center")}</h2>
      {data.activeAlert && (
        <div className="mb-4 rounded bg-amber-50 p-4 border border-amber-200">
          <div className="flex items-center gap-2 text-amber-800 font-bold mb-2">
            <Sparkles size={18} /> {ui.l(data.activeAlert.title)}
          </div>
          <p className="text-amber-900 mb-3">{ui.l(data.activeAlert.message)}</p>
          <button 
            onClick={handleDivert}
            className="bg-amber-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-amber-700 transition"
          >
            {ui.l(data.activeAlert.actionPrompt)}
          </button>
        </div>
      )}
      <div className="grid sm:grid-cols-3 gap-4">
        {data.flaggedTasks?.map((task: any) => (
          <div key={task.id} className="rounded border border-red-100 bg-red-50 p-3 text-sm">
            <div className="font-bold text-red-700 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-red-600 shrink-0" />
              <span>{ui.l("At Risk")}: {task.ownerName}</span>
            </div>
            <div className="text-red-600 mt-1">{ui.l(task.reason)}</div>
            <div className="text-red-800 font-medium mt-2 text-xs">{ui.l("Recommendation")}: {ui.l(task.recommendedAction)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderOpsChipIcon(iconType: string) {
  switch (iconType) {
    case "alert":
      return <AlertTriangle size={12} className="text-amber-400 shrink-0" />;
    case "shield":
      return <ShieldCheck size={12} className="text-emerald-400 shrink-0" />;
    case "plane":
      return <Plane size={12} className="text-cyan-400 shrink-0" />;
    case "clipboard":
      return <ClipboardCheck size={12} className="text-midyaf-gold shrink-0" />;
    case "coffee":
      return <Coffee size={12} className="text-amber-400 shrink-0" />;
    case "chart":
      return <BarChart2 size={12} className="text-purple-400 shrink-0" />;
    default:
      return <Sparkles size={12} className="text-midyaf-gold shrink-0" />;
  }
}

function SmartAssistantSection({
  session,
  data,
  refreshData
}: {
  session?: PortalProps["session"];
  data?: PortalProps["data"];
  refreshData?: () => Promise<void>;
}) {
  const ui = useOpsText();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      author: "user" | "ai";
      message: string;
      actions?: any[];
      executedActionId?: string;
      widget?: any;
    }>
  >([
    {
      id: "welcome-op",
      author: "ai",
      message: ui.isArabic
        ? "أهلاً بك في منصة مِضياف الذكية لإدارة العمليات الميدانية (FII 2027). أتابع تدفق الأسطول، الحضور الجغرافي للموردين بالقاعة أ، تنبيهات وصول المطار، والخزنة الأمنية الثلاثية. كيف يمكنني مساعدتك اليوم؟"
        : "Welcome to the Midyaf AI Operations Brain for Future Investment Initiative 2027 (FII). I monitor fleet telemetry, vendor geofencing, flight arrivals, and the Triple-Key Security Vault. How can I assist you?",
      actions: [
        {
          label: "Check Missing Vendors",
          labelAr: "فحص الموردين المتأخرين",
          actionId: "send_vendor_sms"
        },
        {
          label: "Check Triple-Key Vault",
          labelAr: "فحص الخزنة الثلاثية",
          actionId: "scroll_to_vault"
        },
        {
          label: "Terminal 2 Flight Surge",
          labelAr: "تنبيه ازدحام الصالة 2",
          actionId: "divert_fleet"
        }
      ]
    }
  ]);

  const quickChips = [
    { en: "Which vendors are missing from Hall A right now?", ar: "الموردين المتأخرين بالقاعة أ", icon: "alert" },
    { en: "Triple-Key Security Vault status & sealed bids", ar: "حالة الخزنة الثلاثية والعروض المشفرة", icon: "shield" },
    { en: "Terminal 2 flight surge & fleet capacity", ar: "تنبيه ازدحام الصالة 2 وتحويل الحافلات", icon: "plane" },
    { en: "VIP Hospitality Riders & room status", ar: "مذكرات الضيافة الملكية في الريتز", icon: "clipboard" },
    { en: "Crowd surge at Hall B coffee station", ar: "ازدحام محطة القهوة قاعة ب", icon: "coffee" },
    { en: "Automated post-event analytics & savings", ar: "تقرير الوفورات والتحليل الذكي", icon: "chart" }
  ];

  async function handleExecuteAction(messageId: string, action: any) {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, executedActionId: action.actionId } : msg
      )
    );

    if (action.actionId === "divert_fleet" || action.actionId === "command_center_divert_vans") {
      if (session?.accessToken) {
        try {
          await apiFetch("/operations/divert-fleet", session.accessToken, { method: "POST" });
          if (refreshData) await refreshData();
        } catch {
          // Continue with fallback simulation
        }
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          author: "ai",
          message: ui.isArabic
            ? "تم بنجاح: تم تحويل 5 حافلات تنفيذية فوراً من الصالة 1 إلى الصالة 2 بمطار الملك خالد الدولي. تم تحديث غرفة العمليات وتوجيه السائقين."
            : "Action Executed: 5 executive vans successfully diverted from Terminal 1 to KKIA Terminal 2. Drivers notified via mobile telemetry and operations updated."
        }
      ]);
      return;
    }

    if (action.actionId === "scroll_to_vault") {
      const el = document.getElementById("triple-key-vault");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        el.classList.add("ring-4", "ring-emerald-400");
        setTimeout(() => el.classList.remove("ring-4", "ring-emerald-400"), 3000);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          author: "ai",
          message: ui.isArabic
            ? "تم نقلك مباشرة إلى لوحة الخزنة الثلاثية لمكافحة الفساد وتدقيق العروض المختومة."
            : "Navigated directly to the Triple-Key Anti-Corruption Security Vault."
        }
      ]);
      return;
    }

    if (action.actionId === "inspect_riders") {
      const el = document.getElementById("hospitality-riders");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        el.classList.add("ring-4", "ring-amber-400");
        setTimeout(() => el.classList.remove("ring-4", "ring-amber-400"), 3000);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          author: "ai",
          message: ui.isArabic
            ? "تم نقلك إلى قسم مذكرات الضيافة الملكية (VIP Riders)."
            : "Navigated to VIP Hospitality Riders section."
        }
      ]);
      return;
    }

    if (action.actionId === "view_airport") {
      const el = document.getElementById("airport-express");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        el.classList.add("ring-4", "ring-amber-400");
        setTimeout(() => el.classList.remove("ring-4", "ring-amber-400"), 3000);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          author: "ai",
          message: ui.isArabic
            ? "تم نقلك إلى قائمة رحلات الاستقبال بمطار الملك خالد."
            : "Navigated to Airport Express flight arrivals manifest."
        }
      ]);
      return;
    }

    if (action.actionId === "generate_report") {
      let reportData: any = null;
      if (session?.accessToken) {
        try {
          const res = await apiFetch<any>("/ai/post-event-report", session.accessToken, { method: "POST" });
          reportData = res?.report;
        } catch {
          // fallback
        }
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          author: "ai",
          message: ui.isArabic
            ? "تم توليد التقرير التنفيذي الذكي لما بعد الفعالية بنجاح:"
            : "Automated Executive Post-Event Report successfully generated:",
          widget: {
            type: "report",
            title: reportData?.title || "Executive Post-Event Telemetry Analysis",
            metrics: reportData?.metrics || {
              totalGuestsServed: 420,
              averagePickupWaitMinutes: 4.2,
              fleetIdlePercentage: 40,
              estimatedCostSavingsSAR: 145000,
              npsScore: 88
            }
          }
        }
      ]);
      return;
    }

    if (action.actionId === "track_driver" || action.actionId === "track_driver_khaled") {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          author: "ai",
          message: ui.isArabic
            ? "تم الاتصال بالرادار المباشر: الكابتن سلطان العتيبي (مرسيدس مايباخ S680 · لوحة أ د ن 9119) متوقف أمام رصيف كبار الشخصيات بوابة 2."
            : "Live telemetry connected: Capt. Sultan Al-Otaibi (Mercedes Maybach S680 · Plate KSA 9119) is staged at KKIA Terminal 2 VIP Curb Gate 2.",
          widget: {
            type: "driver",
            driverName: "Capt. Sultan Al-Otaibi",
            vehicle: "Mercedes Maybach S680",
            plate: "KSA 9119",
            status: ui.p("Staged at VIP Curb Gate 2", "متوقف عند رصيف كبار الشخصيات بوابة 2"),
            speed: "0 km/h · A/C 20°C",
            coords: "24.9576° N, 46.6988° E"
          }
        }
      ]);
      return;
    }

    if (session?.accessToken) {
      try {
        await apiFetch("/ai/execute-action", session.accessToken, {
          method: "POST",
          body: JSON.stringify({ actionId: action.actionId })
        });
      } catch {
        // fallback
      }
    }

    const defaultConfirmation = ui.isArabic
      ? `تم تنفيذ الإجراء (${action.labelAr || action.label}) بنجاح وتوثيقه في سجل النظام.`
      : `Action executed (${action.label}) and logged in Midyaf event stream.`;

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        author: "ai",
        message: defaultConfirmation
      }
    ]);
  }

  async function handleSend(text?: string) {
    const q = (text || query).trim();
    if (!q || loading) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), author: "user", message: q }
    ]);
    if (!text) setQuery("");
    setLoading(true);

    try {
      if (!session?.accessToken) {
        throw new Error("No session");
      }
      const res = await apiFetch<any>("/ai/assistant", session.accessToken, {
        method: "POST",
        body: JSON.stringify({ query: q, language: ui.isArabic ? "ar" : "en" })
      });
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          author: "ai",
          message: res.reply.message,
          actions: res.reply.actions,
          data: res.reply.data
        }
      ]);
    } catch {
      // Offline / fallback dynamic intelligence
      const fallback = localAiReply(q, ui.isArabic ? "ar" : "en", "Smart Assistant");
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          author: "ai",
          message: fallback.body,
          actions: fallback.actions
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-950 text-white shadow-sm rounded-lg p-5 sm:p-6 border border-emerald-500/30">
      <div className="flex items-center justify-between border-b border-emerald-500/20 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/20 text-emerald-400 p-3 rounded-xl ring-1 ring-emerald-500/40 shadow-inner">
            <Sparkles size={22} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-white tracking-wide">
                {ui.l("Midyaf Autonomous Operations Brain")}
              </h3>
              <Badge tone="green">
                <Radio size={12} className="animate-ping inline me-1" />
                {ui.l("Live Active")}
              </Badge>
            </div>
            <p className="text-xs text-emerald-300/70 mt-0.5">
              {ui.l("FII 2027 Telemetry · Multi-Party Security Vault · Dynamic Fleet Routing")}
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Chat Stream */}
      <div className="max-h-80 space-y-3 overflow-y-auto p-4 rounded-xl bg-slate-950/60 border border-emerald-500/20 backdrop-blur-sm mb-3">
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-2">
            <div
              className={`p-3 rounded-xl text-sm leading-relaxed ${
                msg.author === "user"
                  ? "ms-auto max-w-[85%] bg-emerald-600/90 text-white shadow-sm"
                  : "max-w-[92%] bg-slate-900/90 border border-emerald-500/20 text-emerald-50 shadow-sm"
              }`}
            >
              <div className="whitespace-pre-line">{msg.message}</div>

              {msg.widget && msg.widget.type === "report" && (
                <div className="mt-3 rounded-xl bg-slate-950 p-3.5 border border-amber-500/30 text-white">
                  <div className="text-xs font-bold text-amber-300 mb-2 border-b border-white/10 pb-1">
                    {msg.widget.title}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="rounded bg-white/5 p-2 border border-white/10">
                      <div className="text-base font-black text-emerald-400">{msg.widget.metrics.totalGuestsServed}</div>
                      <div className="text-xs text-slate-400">{ui.p("VIPs Served", "الضيوف المخدومين")}</div>
                    </div>
                    <div className="rounded bg-white/5 p-2 border border-white/10">
                      <div className="text-base font-black text-amber-400">{msg.widget.metrics.npsScore}</div>
                      <div className="text-xs text-slate-400">{ui.p("NPS Score", "مؤشر الرضا")}</div>
                    </div>
                    <div className="rounded bg-white/5 p-2 border border-white/10">
                      <div className="text-base font-black text-cyan-400">SAR {msg.widget.metrics.estimatedCostSavingsSAR.toLocaleString()}</div>
                      <div className="text-xs text-slate-400">{ui.p("Fleet Savings", "وفورات الأسطول")}</div>
                    </div>
                    <div className="rounded bg-white/5 p-2 border border-white/10">
                      <div className="text-base font-black text-purple-400">-{msg.widget.metrics.fleetIdlePercentage}%</div>
                      <div className="text-xs text-slate-400">{ui.p("Idle Time Cut", "خفض الهدر")}</div>
                    </div>
                  </div>
                </div>
              )}

              {msg.widget && msg.widget.type === "driver" && (
                <div className="mt-3 rounded-xl bg-slate-950 p-3.5 border border-emerald-500/40 text-white">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-400 mb-2 border-b border-emerald-500/20 pb-1">
                    <span className="flex items-center gap-1"><Radio size={14} className="animate-pulse" /> {msg.widget.vehicle}</span>
                    <span className="font-mono text-xs text-amber-300">{msg.widget.plate}</span>
                  </div>
                  <div className="text-xs text-slate-300">
                    <div>{ui.p("Chauffeur", "السائق")}: <strong className="text-white">{msg.widget.driverName}</strong></div>
                    <div>{ui.p("Status", "الحالة")}: <span className="text-emerald-300">{msg.widget.status} ({msg.widget.speed})</span></div>
                    <div className="text-xs font-mono text-slate-400 mt-1">{msg.widget.coords}</div>
                  </div>
                </div>
              )}
            </div>

            {msg.author === "ai" && msg.actions && msg.actions.length > 0 && (
              <div className="flex flex-wrap gap-2 ps-2">
                {msg.actions.map((act) => {
                  const isDone = msg.executedActionId === act.actionId;
                  return (
                    <button
                      key={act.actionId}
                      disabled={isDone}
                      onClick={() => void handleExecuteAction(msg.id, act)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-sm ${
                        isDone
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default"
                          : "bg-amber-500 hover:bg-amber-400 text-slate-950 hover:scale-105 active:scale-95 cursor-pointer shadow-amber-500/20"
                      }`}
                    >
                      {isDone ? <CheckCircle2 size={13} /> : <Sparkles size={13} />}
                      {ui.isArabic ? act.labelAr : act.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="p-3 rounded-xl bg-slate-900/90 border border-emerald-500/20 max-w-[85%] text-xs text-emerald-300 flex items-center gap-2 animate-pulse">
            <Sparkles size={14} />
            <span>{ui.l("Midyaf AI Brain is evaluating operational telemetry...")}</span>
          </div>
        )}
      </div>

      {/* Suggested Prompt Chips */}
      <div className="mb-3 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
          <span className="text-emerald-400/80 font-bold shrink-0 flex items-center gap-1">
            <Sparkles size={12} className="text-midyaf-gold" />
            <span>{ui.p("Quick Prompts:", "مقترحات سريعة:")}</span>
          </span>
          {quickChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              disabled={loading}
              onClick={() => void handleSend(ui.p(chip.en, chip.ar))}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-emerald-500/30 px-3 py-1 text-emerald-200 text-xs transition cursor-pointer hover:border-amber-400 hover:text-amber-300"
            >
              {renderOpsChipIcon(chip.icon)}
              <span>{ui.p(chip.en, chip.ar)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input bar */}
      <form onSubmit={(e) => { e.preventDefault(); void handleSend(); }} className="flex gap-2">
        <input 
          className="flex-1 bg-slate-950/80 border border-emerald-700/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
          placeholder={ui.l("Ask about vendors in Hall A, triple-key vault, flight surges, riders...")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 px-5 py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-40 flex items-center gap-1.5 shadow-md"
        >
          <Send size={15} />
          <span>{loading ? ui.l("Analyzing...") : ui.l("Ask AI")}</span>
        </button>
      </form>
    </div>
  );
}

function LiveSummitHotspotsRadar({ hotspots }: { hotspots: DemoHotspot[] }) {
  const ui = useOpsText();

  return (
    <Section title={ui.p("Live Summit Hotspots & Telemetry Radar", "رادار المواقع الحية وعمليات التتبع التكتيكية")}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hotspots.map((spot) => (
          <div
            key={spot.id}
            className="rounded-xl border border-white/5 bg-[#121626] p-3.5 shadow-card-sm transition hover:shadow-card dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-midyaf-gold">
                  {spot.category}
                </span>
                <h4 className="mt-0.5 text-sm font-black text-slate-900 dark:text-white">
                  {ui.p(spot.nameEn, spot.nameAr)}
                </h4>
              </div>
              <span className="live-dot" />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs border-t border-white/5 pt-2.5 dark:border-slate-800">
              <div>
                <span className="text-slate-400">{ui.p("Fleet:", "الأسطول:")} </span>
                <span className="font-bold text-midyaf-pearl dark:text-midyaf-gold">
                  {spot.activeFleet} {ui.p("Vehicles", "مركبات")}
                </span>
              </div>
              {spot.vipGuestsCount > 0 && (
                <div>
                  <span className="text-slate-400">{ui.p("VIPs:", "كبار الشخصيات:")} </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {spot.vipGuestsCount} {ui.p("Guests", "ضيوف")}
                  </span>
                </div>
              )}
            </div>

            <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
              ● {ui.p(spot.statusEn, spot.statusAr)}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function LogisticsDashboard({
  data,
  session,
  isDemoMode,
  refreshData,
  inviteGuests,
  importGuests,
  createDriver,
  createSupplier,
  createUser,
  createTask,
  assignTask,
  confirmAiPlan,
  approveVendorQuote,
  approveContract,
  confirmCompanyReport,
  updateTaskStatus,
  updateGuestJourney,
  uploadFile
}: PortalProps) {
  const ui = useOpsText();
  const toast = useTacticalToast();
  const event = data.events[0];
  const report = data.companyReports[0];
  const canManage = canManageOperations(session);
  const canManageVendors = canManageVendorWorkflow(session);
  const canConfirmReport = canConfirmReports(session);
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
  const [activeMetricModal, setActiveMetricModal] = useState<"visitors" | "tasks" | "contracts" | "commission" | "reports" | null>(null);
  const totalCommission = data.vendorQuotes.reduce(
    (sum, quote) => sum + Number(quote.commissionAmount),
    0
  );

  async function handleGuestAssetUpload(
    guest: (typeof event.guests)[number],
    type: "VISA" | "TICKET" | "GUEST_PHOTO" | "PROMO_VIDEO",
    file: File
  ) {
    const uploadKey = `${guest.id}:${type}`;
    setUploadingAsset(uploadKey);

    try {
      await uploadFile(file, {
        type,
        guestId: guest.id,
        userId: guest.userId,
        eventId: event.id
      });

      const journey = data.guestJourneys.find(
        (item) => item.guestId === guest.id
      );

      if (journey?.id && type === "VISA") {
        await updateGuestJourney(journey.id, { visaStatus: "SENT" });
      }

      if (journey?.id && type === "TICKET") {
        await updateGuestJourney(journey.id, { ticketStatus: "SENT" });
      }

      toast.success(
        ui.isArabic ? "تم رفع وتحديث المستند بنجاح" : "Asset Uploaded & Sent",
        `${ui.l(guest.user.name)} · ${type}`
      );
    } catch {
      toast.alert(
        ui.isArabic ? "فشل رفع المستند" : "Asset Upload Failed",
        file.name
      );
    } finally {
      setUploadingAsset(null);
    }
  }

  async function handleDriverPhotoUpload(
    driver: (typeof data.drivers)[number],
    file: File
  ) {
    const uploadKey = `${driver.id}:DRIVER_PHOTO`;
    setUploadingAsset(uploadKey);

    try {
      const asset = await uploadFile(file, {
        type: "DRIVER_PHOTO",
        driverId: driver.id,
        userId: driver.userId,
        eventId: event.id
      });
      const guestIds = event.tasks
        .filter((task) => task.driverId === driver.id && task.guestId)
        .map((task) => task.guestId);
      const journeys = data.guestJourneys.filter((journey) =>
        guestIds.includes(journey.guestId)
      );

      for (const journey of journeys) {
        if (journey.id) {
          await updateGuestJourney(journey.id, {
            driverName: driver.user.name,
            driverPhoto: asset.url,
            driverPhone: driver.user.phone
          });
        }
      }
    } finally {
      setUploadingAsset(null);
    }
  }

  return (
    <div className="space-y-4">
      <PortalHero
        badge={ui.isArabic ? "لوحة العمليات والتحكم الميداني" : "Operations Dashboard"}
        title={ui.isArabic ? "لوحة العمليات والتحكم الميداني الموحد" : "Unified Operations & Field Command Dashboard"}
        body={ui.isArabic
          ? "المركز التشغيلي الميداني لإدارة الفعاليات: رادار الوصول، خريطة الأسطول، توزيع المهام، وتفويج الضيوف والخدمات الميدانية (تنفيذ تشغيلي حصراً بدون بيانات مالية)."
          : "Operational command center for event delivery: live radar, fleet map, task dispatch, and guest logistics (strictly operational execution, zero financial data)."}
      />

      <DashboardJumpDock isArabic={ui.isArabic} isDemoMode={isDemoMode} />

      {canManage && (
        <>
          <LiveCommandCenterSection session={session} />
          <div id="section-smart-assistant">
            <SmartAssistantSection session={session} data={data} refreshData={refreshData} />
          </div>
        </>
      )}

      <HospitalityRidersSection data={data} session={session} refreshData={refreshData} />
      <AirportExpressSection data={data} session={session} refreshData={refreshData} />
      {isDemoMode && (
        <div id="section-hotspots-radar">
          <LiveSummitHotspotsRadar hotspots={DEMO_HOTSPOTS} />
        </div>
      )}

      <div id="section-metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={ui.l("Visitors")}
          value={data.activityIntakes[0].visitorCount}
          detail={`${data.activityIntakes[0].vipVisitorCount} ${ui.l("VIP")}`}
          icon={<Users size={17} />}
          onClick={() => setActiveMetricModal("visitors")}
        />
        <MetricCard
          label={ui.l("Open tasks")}
          value={event.tasks.length}
          detail={ui.l("Owners and deadlines assigned")}
          icon={<ClipboardCheck size={17} />}
          onClick={() => setActiveMetricModal("tasks")}
        />
        <MetricCard
          label={ui.isArabic ? "الكباتن بالخدمة" : "Active Captains"}
          value={data.drivers.length}
          detail={ui.isArabic ? "جاهزون للتفويج والمواكب" : "Ready for VIP dispatch"}
          icon={<Car size={17} />}
          onClick={() => setActiveMetricModal("tasks")}
        />
        <MetricCard
          label={ui.l("Reports")}
          value={data.companyReports.length}
          detail={ui.l("Manager confirmed")}
          icon={<FileText size={17} />}
          onClick={() => setActiveMetricModal("reports")}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div id="section-tactical-map">
          <RiyadhMap event={event} drivers={data.drivers} tasks={event.tasks} />
        </div>
        <div id="section-contracts-phases">
          <PlanPhases
            data={data}
            canManage={canManage}
            onConfirmAiPlan={confirmAiPlan}
          />
        </div>
      </div>

      {canManage ? (
        <div id="section-operations-setup">
          <OperationsSetup
            data={data}
            event={event}
            session={session}
            inviteGuests={inviteGuests}
            importGuests={importGuests}
            createDriver={createDriver}
            createSupplier={createSupplier}
            createUser={createUser}
            createTask={createTask}
          />
        </div>
      ) : null}

      <div id="section-task-board">
        <TaskAssignmentBoard
          event={event}
          drivers={data.drivers}
          canManage={canManage}
          assignTask={assignTask}
          updateTaskStatus={updateTaskStatus}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Section title={ui.l("Task ownership and deadlines")}>
          <div className="space-y-3">
            {event.tasks.map((task) => (
              <RouteLine
                key={task.id}
                title={ui.l(task.type)}
                route={`${ui.l("Owner")}: ${ui.l(task.ownerName)} · ${ui.l(
                  "Deadline"
                )} ${ui.time(task.deadlineAt ?? task.scheduledAt)}`}
                badge={ui.l(task.status)}
                danger={task.status === "DELAYED"}
              />
            ))}
          </div>
        </Section>

        <Section title={ui.l("Managers and supervisors")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Procurement Manager", "Vendor quotation and contracts"],
              ["Airport Supervisor", "Arrival gates and captain handoff"],
              ["North Zone Supervisor", "VIP trips and personal requests"],
              ["Departure Supervisor", "Flight confirmation and pickup timing"]
            ].map(([role, scope]) => (
              <div key={role} className="rounded-lg bg-slate-50 p-4">
                <BriefcaseBusiness
                  className="mb-3 text-midyaf-pearl"
                  size={18}
                />
                <p className="font-semibold text-slate-900 dark:text-white">{ui.l(role)}</p>
                <p className="mt-1 text-xs text-slate-500">{ui.l(scope)}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title={ui.l("Guest document dispatch")}>
        <div className="grid gap-3 lg:grid-cols-2">
          {event.guests.map((guest) => {
            const guestAssets = data.fileAssets.filter(
              (asset) =>
                asset.guestId === guest.id ||
                (asset.type === "PROMO_VIDEO" && asset.eventId === event.id)
            );
            const latestGuestPhoto = latestFileAsset(
              data.fileAssets,
              "GUEST_PHOTO",
              (asset) => asset.guestId === guest.id
            );

            return (
              <div key={guest.id} className="rounded-lg bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <img
                    src={latestGuestPhoto?.url ?? "/midyaf-logo.jpeg"}
                    alt={ui.l(guest.user.name)}
                    className="size-14 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {ui.l(guest.user.name)}
                      </p>
                      <Badge tone={guest.isVIP ? "gold" : "purple"}>
                        {guest.isVIP ? ui.l("VIP") : ui.l("NORMAL")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {guest.qrCode}
                    </p>
                  </div>
                </div>

                <FileAssetList assets={guestAssets.slice(0, 4)} />

                {canManage ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {[
                      ["VISA", "Upload visa"],
                      ["TICKET", "Upload ticket"],
                      ["GUEST_PHOTO", "Upload guest photo"],
                      ["PROMO_VIDEO", "Upload promo video"]
                    ].map(([type, label]) => (
                      <FileUploadButton
                        key={type}
                        label={ui.l(label)}
                        accept={uploadAcceptByType[type as FileAssetType]}
                        isUploading={uploadingAsset === `${guest.id}:${type}`}
                        disabled={uploadingAsset !== null}
                        onUpload={(file) =>
                          void handleGuestAssetUpload(
                            guest,
                            type as "VISA" | "TICKET" | "GUEST_PHOTO" | "PROMO_VIDEO",
                            file
                          )
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>

      <DeliveryLog
        title={ui.l("Notification delivery log")}
        notifications={data.notifications.slice(0, 8)}
        users={data.users}
      />

      <AuditLogPanel auditLogs={data.auditLogs.slice(0, 10)} />

      <Section title={ui.l("Captains and priorities")}>
        <div className="grid gap-3 md:grid-cols-2">
          {data.drivers.map((driver) => {
            const driverPhoto = latestFileAsset(
              data.fileAssets,
              "DRIVER_PHOTO",
              (asset) => asset.driverId === driver.id
            );

            return (
              <div key={driver.id} className="rounded-lg bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <img
                      src={driverPhoto?.url ?? "/midyaf-logo.jpeg"}
                      alt={ui.l(driver.user.name)}
                      className="size-14 rounded-lg object-cover"
                    />
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {ui.l(driver.user.name)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {driver.licenseNo} · {ui.l(driver.zone)}
                      </p>
                    </div>
                  </div>
                  <Badge tone="gold">
                    {ui.l(driver.captainType ?? "SHUTTLE")}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <MiniStat
                    label={ui.l("Driver status")}
                    value={ui.l(driver.status)}
                  />
                  <MiniStat label={ui.l("Zone")} value={ui.l(driver.zone)} />
                </div>
                {canManage ? (
                  <div className="mt-3">
                    <FileUploadButton
                      label={ui.l("Upload driver photo")}
                      accept={uploadAcceptByType.DRIVER_PHOTO}
                      isUploading={
                        uploadingAsset === `${driver.id}:DRIVER_PHOTO`
                      }
                      disabled={uploadingAsset !== null}
                      onUpload={(file) =>
                        void handleDriverPhotoUpload(driver, file)
                      }
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Governance Notice: Financials Isolated in Admin Dashboard */}
      <div className="rounded-lg border border-midyaf-gold/30 bg-midyaf-gold/10 p-4 text-xs text-[#7A5D12] dark:text-midyaf-gold flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-midyaf-gold shrink-0" />
          <span className="font-semibold">
            {ui.isArabic
              ? "ملاحظة الحوكمة والسرية: تم عزل وحجب كافة البيانات المالية، عروض أسعار الموردين، والعمولات ونقلها حصرياً إلى لوحة الملاك والإدارة (Admin Dashboard)."
              : "Governance & Confidentiality Notice: All financial metrics, supplier quotations, and platform commissions are strictly isolated in the Admin Dashboard."}
          </span>
        </div>
      </div>

      <Section title={ui.l("Confirmed report package")}>
        {report ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              {report.kpis.map((kpi) => (
                <MiniStat
                  key={kpi.label}
                  label={ui.l(kpi.label)}
                  value={ui.l(kpi.value)}
                />
              ))}
            </div>
            <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
              {ui.l(
                "PDF report can be sent only after logistics manager confirmation."
              )}
            </div>
            {canConfirmReport && report.status !== "MANAGER_CONFIRMED" ? (
              <button
                onClick={() => void confirmCompanyReport(report.id)}
                className="mt-4 rounded-lg bg-midyaf-purple px-4 py-2 text-sm font-bold text-white"
              >
                {ui.l("Confirm report")}
              </button>
            ) : null}
          </>
        ) : (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            {ui.l("No report package is available yet.")}
          </p>
        )}
      </Section>

      {/* Interactive Full-Screen Metrics Details Modal */}
      {activeMetricModal && (
        <LogisticsMetricModal
          modal={activeMetricModal}
          onClose={() => setActiveMetricModal(null)}
          data={data}
          event={event}
          session={session}
          isDemoMode={isDemoMode}
          onApproveContract={approveContract}
          onApproveVendorQuote={approveVendorQuote}
          onUpdateTaskStatus={updateTaskStatus}
          onAssignTask={assignTask}
        />
      )}
    </div>
  );
}

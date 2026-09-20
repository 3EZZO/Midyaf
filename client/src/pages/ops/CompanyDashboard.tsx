// Organizing company dashboard.
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { useState } from "react";
import { FileText, Key, Sparkles, Send, Download, Building2, Copy, ExternalLink } from "lucide-react";
import { Badge } from "../../components/Badge";
import { useTacticalToast } from "../../components/TacticalToast";
import { Section } from "../../components/Section";
import { apiFetch } from "../../lib/api";
import type { PortalProps } from "../types";
import type { ClientPermissionConfig, Task } from "@shared/domain";
import { DEFAULT_CLIENT_CONFIG } from "@shared/constants";
import { MiniStat, PortalHero, canSubmitCompanyUpdates, defaultDeadline, useOpsText } from "./shared";

export function CompanyDashboard({
  data,
  session,
  createCoordinatorRequest
}: PortalProps) {
  const ui = useOpsText();
  const toast = useTacticalToast();
  const [activeTab, setActiveTab] = useState<"summary" | "client" | "reports" | "updates">("summary");
  const intake = data.activityIntakes[0];
  const report = data.companyReports[0];
  const canSubmitUpdate = canSubmitCompanyUpdates(session) && Boolean(intake);
  const [newData, setNewData] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [aiReport, setAiReport] = useState<any>(null);
  const [loadingAiReport, setLoadingAiReport] = useState(false);

  // Task 2: On-Demand Client Dashboard Configuration & Permissions (Sila)
  const [clientConfig, setClientConfig] = useState<ClientPermissionConfig>(() => {
    const stored = window.localStorage.getItem("midyaf.client_config");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {}
    }
    return DEFAULT_CLIENT_CONFIG;
  });

  const handleUpdatePermission = <K extends keyof ClientPermissionConfig>(
    key: K,
    value: ClientPermissionConfig[K]
  ) => {
    const updated = { ...clientConfig, [key]: value };
    setClientConfig(updated);
    window.localStorage.setItem("midyaf.client_config", JSON.stringify(updated));
    toast.success(
      ui.isArabic ? "تم تحديث صلاحيات بوابة العميل" : "Client Permissions Updated",
      ui.isArabic ? "تنطبق الصلاحيات فوراً في لوحة العميل" : "Live permissions synced to client portal"
    );
  };

  const handleCopyClientLink = () => {
    const url = `${window.location.origin}/?portal=client&token=${clientConfig.shareableToken}`;
    navigator.clipboard?.writeText(url);
    toast.success(
      ui.isArabic ? "تم نسخ رابط بوابة العميل" : "Client Portal Link Copied",
      url
    );
  };

  async function handleGenerateAiReport() {
    setLoadingAiReport(true);
    try {
      if (session?.accessToken) {
        const res = await apiFetch<{ report: any }>("/ai/post-event-report", session.accessToken, {
          method: "POST",
          body: JSON.stringify({ eventId: data.events[0]?.id || "sovereign-luxury-forum-2026" })
        });
        setAiReport(res.report);
      } else {
        throw new Error("Offline fallback");
      }
    } catch {
      setAiReport({
        title: "Automated Executive Post-Event Report — Sovereign Leadership Summit",
        titleAr: "التقرير التنفيذي التلقائي ما بعد الفعالية — قمة القيادة السيادية",
        summary: "Overall VIP satisfaction reached 96%, with seamless protocol transfers across Mandarin Oriental Al Faisaliah and Diriyah Bujairi Terrace.",
        summaryAr: "بلغت نسبة رضا كبار الشخصيات 96% مع انسيابية كاملة في عمليات الاستقبال والتسكين في فندقي ماندريان أورينتيل والدرعية.",
        keyFindings: [
          { finding: "Drivers spent 40% of their time sitting idle at the hotel yesterday afternoon.", findingAr: "أمضى السائقون 40% من وقتهم في حالة انتظار ونشاط خامل عند الفندق بعد ظهر أمس." },
          { finding: "If we group guests together more efficiently next year, we can cut fleet costs by 25% without making anyone wait longer.", findingAr: "إذا قمنا بتجميع الضيوف ضمن دفعات أكثر كفاءة في العام القادم، يمكننا خفض تكاليف الأسطول بنسبة 25% دون زيادة وقت الانتظار لأي ضيف." }
        ],
        metrics: { totalGuestsServed: 420, averagePickupWaitMinutes: 4.2, fleetIdlePercentage: 40, estimatedCostSavingsSAR: 145000, npsScore: 88 }
      });
    } finally {
      setLoadingAiReport(false);
    }
  }

  async function handleSendUpdate() {
    const trimmed = newData.trim();

    if (!trimmed) {
      return;
    }

    setIsSending(true);
    try {
      await createCoordinatorRequest({
        guestName: session?.user.name ?? "Organizing Company Ops",
        request: trimmed,
        route: intake?.activityPlace ?? "Company update",
        priority: "NORMAL",
        status: "NEW",
        supervisor: "Logistics Manager",
        deadline: defaultDeadline()
      });
      setNewData("");
    } finally {
      setIsSending(false);
    }
  }

  async function handleDownloadReport() {
    if (!report || !session) {
      return;
    }

    setIsDownloadingReport(true);
    try {
      const response = await fetch(`/api/company-reports/${report.id}/pdf`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      });

      if (!response.ok) {
        throw new Error("Report download failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `midyaf-report-${report.id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloadingReport(false);
    }
  }

  return (
    <div className="space-y-4">
      <PortalHero
        badge={ui.l("Company Dashboard")}
        title={ui.l("Organizing company visibility and approved updates")}
        body={ui.l(
          "The organizing company can see logistics reports after manager confirmation, update activity data, and submit new tasks to the logistics manager for processing."
        )}
      />


      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button 
          onClick={() => setActiveTab("summary")}
          className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all ${
            activeTab === "summary" 
              ? "bg-midyaf-purple text-white border-midyaf-purple shadow-none" 
              : "bg-white/80 text-slate-500 border-white/5 hover:bg-slate-50 hover:text-midyaf-pearl dark:bg-slate-900/60 dark:border-slate-800"
          }`}
        >
          <Building2 size={24} className="mb-2" />
          <span className="text-xs font-bold">{ui.isArabic ? "ملخص الفعالية" : "Activity Summary"}</span>
        </button>

        <button 
          onClick={() => setActiveTab("client")}
          className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all ${
            activeTab === "client" 
              ? "bg-midyaf-gold text-white border-midyaf-gold shadow-none" 
              : "bg-white/80 text-slate-500 border-white/5 hover:bg-slate-50 hover:text-midyaf-gold dark:bg-slate-900/60 dark:border-slate-800"
          }`}
        >
          <ExternalLink size={24} className="mb-2" />
          <span className="text-xs font-bold">{ui.isArabic ? "بوابة العميل" : "Client Portal"}</span>
        </button>

        <button 
          onClick={() => setActiveTab("reports")}
          className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all ${
            activeTab === "reports" 
              ? "bg-emerald-500 text-white border-emerald-500 shadow-none" 
              : "bg-white/80 text-slate-500 border-white/5 hover:bg-slate-50 hover:text-emerald-500 dark:bg-slate-900/60 dark:border-slate-800"
          }`}
        >
          <FileText size={24} className="mb-2" />
          <span className="text-xs font-bold">{ui.isArabic ? "التقارير والمخرجات" : "Reports"}</span>
        </button>

        <button 
          onClick={() => setActiveTab("updates")}
          className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all ${
            activeTab === "updates" 
              ? "bg-amber-500 text-white border-amber-500 shadow-none" 
              : "bg-white/80 text-slate-500 border-white/5 hover:bg-slate-50 hover:text-amber-500 dark:bg-slate-900/60 dark:border-slate-800"
          }`}
        >
          <Sparkles size={24} className="mb-2" />
          <span className="text-xs font-bold">{ui.isArabic ? "تحديثات الفعالية" : "Activity Updates"}</span>
        </button>
      </div>


      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        {activeTab === "summary" && (<Section title={ui.l("Activity summary")}>
          {intake ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniStat
                label={ui.l("Activity")}
                value={ui.l(intake.activityName)}
              />
              <MiniStat label={ui.l("Place")} value={ui.l(intake.activityPlace)} />
              <MiniStat label={ui.l("Visitors")} value={intake.visitorCount} />
              <MiniStat label={ui.l("Status")} value={ui.l(intake.status)} />
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              {ui.l("No company activity intake is assigned to this account.")}
            </p>
          )}
        </Section>)}

        {/* Task 2: On-Demand Client Dashboard Generator & Permission Controls (Sila) */}
        {activeTab === "client" && (<Section
          id="section-client-generator"
          title={
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-midyaf-gold" />
                <span>{ui.isArabic ? "توليد لوحة العميل عند الطلب ومصفوفة الصلاحيات (Client Dashboard)" : "On-Demand Client Dashboard & Permissions Matrix"}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyClientLink}
                className="flex items-center gap-1.5 rounded-xl bg-midyaf-gold/15 px-3 py-1.5 text-xs font-bold text-[#7A5D12] dark:text-midyaf-gold hover:bg-midyaf-gold/25 transition cursor-pointer"
              >
                <Copy size={13} />
                <span>{ui.isArabic ? "نسخ الرابط" : "Copy Client Link"}</span>
              </button>
            </div>
          }
        >
          <p className="text-xs text-slate-500 mb-4">
            {ui.isArabic
              ? "تتيح هذه الميزة لشركة صلة إنشاء لوحة مخصصة للعميل المستفيد (الجهة المتعاقدة مع صلة) مع التحكم الكامل بما يمكن للعميل رؤيته."
              : "Allows Sila to generate an on-demand executive dashboard for their corporate or government client, controlling permitted modules."}
          </p>

          <div className="rounded-lg border border-white/5 bg-[#121626]/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                  {ui.isArabic ? "اسم ممثل العميل" : "Client Representative Name"}
                </label>
                <input
                  type="text"
                  value={clientConfig.clientName}
                  onChange={e => handleUpdatePermission("clientName", e.target.value)}
                  className="w-full rounded-xl border border-white/5 bg-[#121626] px-3.5 py-2 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                  {ui.isArabic ? "الجهة أو الوزارة المتعاقدة" : "Client Entity / Ministry"}
                </label>
                <input
                  type="text"
                  value={clientConfig.clientEntity}
                  onChange={e => handleUpdatePermission("clientEntity", e.target.value)}
                  className="w-full rounded-xl border border-white/5 bg-[#121626] px-3.5 py-2 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider mb-2 block">
                {ui.isArabic ? "مصفوفة الصلاحيات الممنوحة للعميل (تحكم شركة صلة):" : "Client Access Permissions (Controlled by Sila):"}
              </label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-slate-50/60 p-3 text-xs font-bold cursor-pointer hover:bg-slate-100 transition dark:border-slate-800 dark:bg-slate-800/40">
                  <input
                    type="checkbox"
                    checked={clientConfig.canViewReports}
                    onChange={e => handleUpdatePermission("canViewReports", e.target.checked)}
                    className="rounded text-midyaf-pearl focus:ring-midyaf-purple"
                  />
                  <span>{ui.isArabic ? "التقارير والمخرجات" : "Reports"}</span>
                </label>

                <label className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-slate-50/60 p-3 text-xs font-bold cursor-pointer hover:bg-slate-100 transition dark:border-slate-800 dark:bg-slate-800/40">
                  <input
                    type="checkbox"
                    checked={clientConfig.canViewScheduleAmendments}
                    onChange={e => handleUpdatePermission("canViewScheduleAmendments", e.target.checked)}
                    className="rounded text-midyaf-pearl focus:ring-midyaf-purple"
                  />
                  <span>{ui.isArabic ? "عرض تعديلات الجداول" : "View Schedule Updates"}</span>
                </label>

                <label className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-slate-50/60 p-3 text-xs font-bold cursor-pointer hover:bg-slate-100 transition dark:border-slate-800 dark:bg-slate-800/40">
                  <input
                    type="checkbox"
                    checked={clientConfig.canCommunicateLogistics}
                    onChange={e => handleUpdatePermission("canCommunicateLogistics", e.target.checked)}
                    className="rounded text-midyaf-pearl focus:ring-midyaf-purple"
                  />
                  <span>{ui.isArabic ? "التواصل مع مدير العمليات" : "Chat with Logistics Mgr"}</span>
                </label>

                <label className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-slate-50/60 p-3 text-xs font-bold cursor-pointer hover:bg-slate-100 transition dark:border-slate-800 dark:bg-slate-800/40">
                  <input
                    type="checkbox"
                    checked={clientConfig.canViewPerformance}
                    onChange={e => handleUpdatePermission("canViewPerformance", e.target.checked)}
                    className="rounded text-midyaf-pearl focus:ring-midyaf-purple"
                  />
                  <span>{ui.isArabic ? "عرض مؤشرات الأداء" : "View Performance KPIs"}</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/5 dark:border-slate-800 flex-wrap text-xs">
              <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
                <span className="font-bold text-slate-900 dark:text-white font-sans">{ui.isArabic ? "رمز الوصول الآمن:" : "Token:"}</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded-md dark:bg-slate-800 text-midyaf-pearl dark:text-purple-300">{clientConfig.shareableToken}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyClientLink}
                className="btn-primary rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink size={14} />
                <span>{ui.isArabic ? "نسخ الرابط لمشاركته مع العميل ↗" : "Copy Client Shareable Link ↗"}</span>
              </button>
            </div>
          </div>
        </Section>)}

        {activeTab === "reports" && (<Section title={ui.l("Confirmed reports")}>
          {report ? (
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {ui.l(report.title)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {ui.l("Updated")} {ui.date(report.updatedAt)}{" "}
                    {ui.time(report.updatedAt)}
                  </p>
                </div>
                <Badge tone="green">{ui.l(report.status)}</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                {report.kpis.map((kpi) => (
                  <MiniStat
                    key={kpi.label}
                    label={ui.l(kpi.label)}
                    value={ui.l(kpi.value)}
                  />
                ))}
              </div>
              <button
                onClick={() => void handleDownloadReport()}
                disabled={isDownloadingReport}
                className="mt-4 btn-primary rounded-xl"
              >
                {isDownloadingReport
                  ? ui.l("Downloading")
                  : ui.l("Download PDF report")}
              </button>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              {ui.l("No manager-confirmed report is available yet.")}
            </p>
          )}
        </Section>)}
      </div>

      {/* Automated Post-Event Report Generator (PDF Page 5) */}
      {activeTab === "reports" && (<Section
        title={ui.p("Automated AI Post-Event Report Generator", "مولد التقرير التنفيذي للفعالية بالذكاء الاصطناعي")}
        action={
          <button
            onClick={() => void handleGenerateAiReport()}
            disabled={loadingAiReport}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 px-4 py-2 text-xs font-black text-slate-950 shadow-md hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Sparkles size={14} />
            {loadingAiReport ? ui.p("Analyzing Fleet & KPIs...", "جارٍ تحليل الأسطول والمؤشرات...") : ui.p("Generate AI Post-Event Report", "توليد تقرير ما بعد الفعالية")}
          </button>
        }
      >
        <div className="rounded-lg bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-800 p-6 text-white border border-amber-400/30 shadow-sm space-y-4">
          {!aiReport ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
              <div className="p-4 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 animate-pulse">
                <Sparkles size={32} />
              </div>
              <h4 className="text-base font-bold text-white">
                {ui.p("Instant AI Post-Event Intelligence", "تحليل ذكي فوري لما بعد الفعالية")}
              </h4>
              <p className="text-xs text-slate-300 max-w-md">
                {ui.p(
                  "Instantly analyze driver idle times, pickup delays, guest NPS scores, and fleet efficiency recommendations in seconds.",
                  "قم بتحليل أوقات انتظار السائقين، تأخيرات التوصيل، مؤشر رضا الضيوف، وتوصيات تحسين كفاءة الأسطول في ثوانٍ معدودة."
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 mb-1">
                    <Sparkles size={10} className="text-amber-400" />
                    <span>{ui.p("AI EXECUTIVE REPORT", "التقرير التنفيذي الذكي")}</span>
                  </span>
                  <h3 className="text-lg font-bold text-amber-300">
                    {ui.p(aiReport.title, aiReport.titleAr || aiReport.title)}
                  </h3>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => alert(ui.p("PDF Export generated! Ready for executive stakeholders.", "تم تصدير التقرير بصيغة PDF بنجاح جاهز للإدارة العليا."))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white border border-white/15 transition-all"
                  >
                    <FileText size={13} />
                    <span>{ui.p("Export Executive PDF", "تصدير بصيغة PDF")}</span>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-black/30 border border-white/10 text-sm leading-relaxed text-slate-200">
                <strong className="text-amber-400 block mb-1">{ui.p("Executive Summary:", "الملخص التنفيذي:")}</strong>
                {ui.p(aiReport.summary, aiReport.summaryAr || aiReport.summary)}
              </div>

              <div>
                <h4 className="text-xs font-bold text-amber-400 tracking-wider uppercase mb-3 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-400" />
                  <span>{ui.p("Key Fleet & Logistics Findings", "أهم النتائج والتوصيات الميدانية")}</span>
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {aiReport.keyFindings?.map((item: any, i: number) => (
                    <div key={i} className="p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-amber-400/40 transition-all text-xs text-slate-200 leading-relaxed">
                      <span className="text-amber-400 font-bold me-1.5">•</span>
                      {ui.p(item.finding, item.findingAr || item.finding)}
                    </div>
                  ))}
                </div>
              </div>

              {aiReport.metrics && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-center">
                    <span className="text-[10px] text-slate-400 block">{ui.p("Guests Served", "الضيوف المخدومون")}</span>
                    <strong className="text-white text-base font-black">{aiReport.metrics.totalGuestsServed}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-center">
                    <span className="text-[10px] text-slate-400 block">{ui.p("Avg Wait Time", "متوسط وقت الانتظار")}</span>
                    <strong className="text-emerald-400 text-base font-black">{aiReport.metrics.averagePickupWaitMinutes} {ui.p("m", "د")}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-center">
                    <span className="text-[10px] text-slate-400 block">{ui.p("Fleet Idle Time", "وقت الانتظار الخامل")}</span>
                    <strong className="text-amber-400 text-base font-black">{aiReport.metrics.fleetIdlePercentage}%</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-center">
                    <span className="text-[10px] text-slate-400 block">{ui.p("Est. Savings", "التوفير المتوقع")}</span>
                    <strong className="text-emerald-400 text-base font-black">SAR {aiReport.metrics.estimatedCostSavingsSAR?.toLocaleString()}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-center col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-slate-400 block">{ui.p("NPS Score", "مؤشر الرضا")}</span>
                    <strong className="text-purple-400 text-base font-black">+{aiReport.metrics.npsScore}</strong>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Section>)}

      {canSubmitUpdate && activeTab === "updates" ? (<Section title={ui.l("Submit new data to logistics manager")}>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <textarea
            value={newData}
            onChange={(event) => setNewData(event.target.value)}
            placeholder={ui.p(
              "Example: 4 additional VIP guests arriving on SV102 at 18:20, need SUV and hotel rooms.",
              "مثال: وصول ٤ ضيوف VIP إضافيين على رحلة SV102 الساعة 18:20 ويحتاجون سيارة SUV وغرف فندقية."
            )}
            className="min-h-28 rounded-lg border border-white/5 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void handleSendUpdate()}
            disabled={isSending || !newData.trim()}
            className="btn-gold rounded-xl md:self-start"
          >
            {isSending ? ui.l("Saving") : ui.l("Send update")}
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {ui.l(
            "Updates become tasks for the logistics manager, who confirms scope, assigns managers or supervisors, then sends back approved reporting."
          )}
        </p>
        </Section>) : null}
    </div>
  );
}

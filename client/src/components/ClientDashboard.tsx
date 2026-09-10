import { useState } from "react";
import {
  Building2,
  FileText,
  Clock,
  MessageSquare,
  TrendingUp,
  ShieldCheck,
  Send,
  Download,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Lock,
  UserCheck,
  Plane,
  Sparkles
} from "lucide-react";
import type { MidyafData, ClientPermissionConfig, ClientMessage, ScheduleAmendment } from "@shared/domain";
import { DEFAULT_CLIENT_CONFIG, DEFAULT_CLIENT_MESSAGES, DEFAULT_SCHEDULE_AMENDMENTS } from "@shared/constants";
import { shortDate, shortTime } from "../lib/format";
import { localizeAmendmentType } from "../lib/localizeDomain";
import { Badge } from "./Badge";
import { Section } from "./Section";
import { PortalHero } from "./PortalHero";
import { useTacticalToast } from "./TacticalToast";

export function ClientDashboard({
  data,
  isArabic = true,
  config = DEFAULT_CLIENT_CONFIG,
  onDownloadReport
}: {
  data: MidyafData;
  isArabic?: boolean;
  config?: ClientPermissionConfig;
  onDownloadReport?: () => void;
}) {
  const toast = useTacticalToast();
  const event = data.events[0];
  const report = data.companyReports[0];

  const [messages, setMessages] = useState<ClientMessage[]>(DEFAULT_CLIENT_MESSAGES);
  const [newMessageText, setNewMessageText] = useState("");
  const [amendments, setAmendments] = useState<ScheduleAmendment[]>(DEFAULT_SCHEDULE_AMENDMENTS);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim()) return;

    const newMsg: ClientMessage = {
      id: `msg-${Date.now().toString().slice(-4)}`,
      clientId: config.clientId,
      senderName: config.clientName,
      senderRole: "CLIENT",
      message: newMessageText.trim(),
      timestamp: new Date().toLocaleTimeString(isArabic ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" }),
      isRead: true
    };

    setMessages(prev => [...prev, newMsg]);
    setNewMessageText("");
    toast.success(
      isArabic ? "تم إرسال رسالتك لمدير العمليات" : "Message Dispatched",
      isArabic ? "سيتولى مدير العمليات اللوجستية (صلة) الرد فوراً" : "Sila Logistics Manager will respond shortly"
    );
  };

  return (
    <div className="space-y-6">
      {/* Client Welcome Hero */}
      <PortalHero
        badge={
          <span className="inline-flex items-center gap-1.5 text-midyaf-gold">
            <Building2 size={15} />
            {isArabic ? "بوابة العميل المستفيد المخصصة" : "Dedicated Client Executive Portal"}
          </span>
        }
        title={
          isArabic
            ? `مرحباً بك: ${config.clientName} — ${config.clientEntity}`
            : `Welcome: ${config.clientName} — ${config.clientEntity}`
        }
        body={
          isArabic
            ? `لوحة المتابعة الخاصة بفعالية (${config.eventTitle}) تحت إشراف الشركة المنظمة (صلة)، تتيح لك الاطلاع الفوري على التقارير، تعديلات الجداول، والتواصل مع العمليات.`
            : `Executive dashboard for (${config.eventTitle}) managed by Sila, providing verified reports, live schedule adjustments, and direct communication with logistics.`
        }
      />

      {/* Permissions Transparency Pill */}
      <div className="rounded-xl border border-slate-200 bg-white/70 p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-midyaf-gold" />
          <span className="font-bold text-slate-700 dark:text-slate-200">
            {isArabic ? "مستوى الصلاحيات المصرح به من شركة صلة:" : "Authorized Access Privileges from Sila:"}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={config.canViewReports ? "green" : "slate"}>
            {config.canViewReports ? "✓ " : "✕ "}
            {isArabic ? "التقارير" : "Reports"}
          </Badge>
          <Badge tone={config.canViewScheduleAmendments ? "green" : "slate"}>
            {config.canViewScheduleAmendments ? "✓ " : "✕ "}
            {isArabic ? "تعديلات الجداول" : "Schedule Updates"}
          </Badge>
          <Badge tone={config.canCommunicateLogistics ? "green" : "slate"}>
            {config.canCommunicateLogistics ? "✓ " : "✕ "}
            {isArabic ? "التواصل المباشر" : "Direct Chat"}
          </Badge>
          <Badge tone={config.canViewPerformance ? "green" : "slate"}>
            {config.canViewPerformance ? "✓ " : "✕ "}
            {isArabic ? "مؤشرات الأداء" : "Performance KPIs"}
          </Badge>
        </div>
      </div>

      {/* Feature 4: View Performance Data */}
      {config.canViewPerformance ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-card rounded-2xl p-5 border-midyaf-gold/30">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              {isArabic ? "دقة الالتزام بالمواعيد" : "Punctuality SLA"}
            </span>
            <p className="mt-2 text-3xl font-black text-midyaf-ink dark:text-white font-tnum">99.2%</p>
            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
              ✓ {isArabic ? "ضمن المعايير السيادية المعتمدة" : "Within sovereign protocol standard"}
            </p>
          </div>
          <div className="glass-card rounded-2xl p-5 border-midyaf-gold/30">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              {isArabic ? "معدل رضا الضيوف VIP" : "VIP Satisfaction NPS"}
            </span>
            <p className="mt-2 text-3xl font-black text-midyaf-gold font-tnum">98 / 100</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {isArabic ? "بناءً على تقييمات كبار الشخصيات" : "Based on guest feedback"}
            </p>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              {isArabic ? "الضيوف المستقبلون" : "Guests Welcomed"}
            </span>
            <p className="mt-2 text-3xl font-black text-midyaf-purple dark:text-purple-300 font-tnum">
              420 / 420
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              {isArabic ? "اكتمال وصول جميع الوفود" : "All delegations arrived safely"}
            </p>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              {isArabic ? "الحوادث الحرجة" : "Critical Incidents"}
            </span>
            <p className="mt-2 text-3xl font-black text-emerald-600 dark:text-emerald-400 font-tnum">0</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {isArabic ? "سجل تشغيلي نظيف 100%" : "100% clean incident record"}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 flex items-center gap-2">
          <Lock size={15} />
          <span>{isArabic ? "عرض مؤشرات الأداء مقفل حالياً بناءً على إعدادات شركة صلة." : "Performance data view is currently restricted by Sila."}</span>
        </div>
      )}

      {/* Feature 2: View Schedule Amendments / Changes */}
      {config.canViewScheduleAmendments ? (
        <Section
          id="section-client-amendments"
          title={
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-midyaf-gold" />
              <span>{isArabic ? "سجل تعديلات الجداول والمواعيد الحية (Live Schedule Amendments)" : "Live Schedule Amendments & Flight Updates"}</span>
            </div>
          }
        >
          <div className="space-y-3">
            {amendments.map((amd) => (
              <div
                key={amd.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-midyaf-ink dark:text-white text-xs">
                      {isArabic ? (amd.titleAr || amd.title) : (amd.titleEn || amd.title)}
                    </span>
                    <Badge tone="purple">{localizeAmendmentType(amd.type, isArabic)}</Badge>
                    <span className="text-[10px] text-slate-400 font-tnum">{amd.updatedAt}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {isArabic
                      ? `الأطراف المعنية: ${amd.affectedGuestsAr || amd.affectedGuests}`
                      : `Affected: ${amd.affectedGuestsEn || amd.affectedGuests}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right text-xs">
                    <span className="text-[10px] text-slate-400 block line-through">{amd.originalTime}</span>
                    <span className="font-extrabold text-midyaf-gold text-sm font-tnum">{amd.revisedTime}</span>
                  </div>
                  <Badge tone="green">
                    <CheckCircle2 size={12} className="me-1" />
                    {isArabic ? "معتمد ومنفذ" : "Confirmed"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 flex items-center gap-2">
          <Lock size={15} />
          <span>{isArabic ? "عرض تعديلات الجداول مقفل حالياً بناءً على إعدادات شركة صلة." : "Schedule amendments view is currently restricted by Sila."}</span>
        </div>
      )}

      {/* Feature 3: Communicate with the Logistics Manager */}
      {config.canCommunicateLogistics ? (
        <Section
          id="section-client-chat"
          title={
            <div className="flex items-center gap-2">
              <MessageSquare size={18} className="text-sky-500" />
              <span>{isArabic ? "القناة المباشرة مع مدير العمليات اللوجستية (صلة)" : "Direct Channel with Sila Logistics Manager"}</span>
            </div>
          }
        >
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
            <div className="space-y-3 max-h-72 overflow-y-auto p-2 mb-4">
              {messages.map((m) => {
                const isFromClient = m.senderRole === "CLIENT";
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isFromClient ? "items-start" : "items-end"}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-400">
                      <span className="font-bold">{m.senderName}</span>
                      <span>·</span>
                      <span className="font-tnum">{m.timestamp}</span>
                    </div>
                    <div
                      className={`max-w-xl rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                        isFromClient
                          ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100 rounded-ss-none"
                          : "bg-midyaf-purple text-white dark:bg-midyaf-purple/90 rounded-se-none"
                      }`}
                    >
                      {isArabic ? (m.messageAr || m.message) : (m.messageEn || m.message)}
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                placeholder={
                  isArabic
                    ? "اكتب رسالة أو استفساراً لمدير العمليات اللوجستية (صلة)..."
                    : "Send a note or request to Sila Logistics Manager..."
                }
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs outline-none focus:border-midyaf-purple dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="btn-primary rounded-xl px-5 py-2.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Send size={14} />
                <span>{isArabic ? "إرسال" : "Send"}</span>
              </button>
            </form>
          </div>
        </Section>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 flex items-center gap-2">
          <Lock size={15} />
          <span>{isArabic ? "التواصل المباشر مع مدير العمليات مقفل حالياً بناءً على إعدادات شركة صلة." : "Direct communication with Logistics Manager is currently restricted by Sila."}</span>
        </div>
      )}

      {/* Feature 1: View Reports */}
      {config.canViewReports ? (
        <Section
          id="section-client-reports"
          title={
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-midyaf-purple" />
                <span>{isArabic ? "حزمة التقارير التنفيذية للفعالية (Executive Reports Package)" : "Executive Event Reports Package"}</span>
              </div>
              {onDownloadReport && (
                <button
                  type="button"
                  onClick={onDownloadReport}
                  className="flex items-center gap-1.5 rounded-xl bg-midyaf-purple/10 px-3 py-1.5 text-xs font-bold text-midyaf-purple hover:bg-midyaf-purple/20 transition dark:bg-midyaf-purple/20 dark:text-purple-300 cursor-pointer"
                >
                  <Download size={14} />
                  <span>{isArabic ? "تحميل التقرير التنفيذي PDF" : "Download PDF Report"}</span>
                </button>
              )}
            </div>
          }
        >
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-extrabold text-midyaf-ink dark:text-white text-base">
                  {report?.title || (isArabic ? "التقرير الختامي المعتمد للفعالية — قمة القيادة والضيافة السيادية" : "Confirmed Event Report — Sovereign Leadership Summit")}
                </h4>
                <p className="text-xs text-slate-400 mt-1 font-tnum">
                  {isArabic ? "تاريخ الإصدار: 10 سبتمبر 2026 · اعتماد مدير العمليات (صلة)" : "Issued: Sep 10, 2026 · Confirmed by Sila Logistics Manager"}
                </p>
              </div>
              <Badge tone="green">
                <CheckCircle2 size={12} className="me-1" />
                {isArabic ? "معتمد ومصدق" : "Manager Confirmed"}
              </Badge>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50/80 p-3.5 rounded-xl dark:bg-slate-800/60">
              {report?.summary || (isArabic
                ? "حقق المؤتمر نجاحاً لوجستياً مبهراً بمعدل إشغال فندقي 100% وتفويج كامل للوفود عبر الصالة الملكية بمطار الملك خالد الدولي، مع تسجيل نسبة رضا 98% لكبار الشخصيات دون تسجيل أي تأخير يذكر."
                : "The summit achieved flawless logistics execution with 100% hotel occupancy, seamless VIP terminal handoffs, and 98% VIP satisfaction with zero recorded schedule delays.")}
            </p>

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: isArabic ? "إجمالي الحضور" : "Total Guests", val: "420" },
                { label: isArabic ? "ساعات الانتظار" : "Avg Wait Time", val: "3.8 min" },
                { label: isArabic ? "انضباط المسارات" : "Route Adherence", val: "99.8%" },
                { label: isArabic ? "تقييم الخدمة" : "Service Rating", val: "5.0 / 5.0" }
              ].map((stat, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">{stat.label}</span>
                  <span className="text-base font-extrabold text-midyaf-ink dark:text-white font-tnum">{stat.val}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 flex items-center gap-2">
          <Lock size={15} />
          <span>{isArabic ? "عرض التقارير مقفل حالياً بناءً على إعدادات شركة صلة." : "Reports view is currently restricted by Sila."}</span>
        </div>
      )}
    </div>
  );
}

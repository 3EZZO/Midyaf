import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Send,
  Sparkles,
  Car,
  Phone,
  Bus,
  FileText,
  Navigation,
  ShieldCheck,
  Radio,
  Hotel,
  Calendar,
  Utensils,
  Wifi,
  AlertTriangle,
  Plane,
  ClipboardList,
  Coffee,
  BarChart2
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Session } from "@shared/domain";
import { apiFetch } from "../lib/api";
import { Badge } from "./Badge";
import {
  isArabicLanguage,
  localizeText,
  pickText
} from "../lib/localize";

type ChatAction = {
  label: string;
  labelAr: string;
  actionId: string;
};

type ChatWidget =
  | {
      type: "driver_radar";
      driverName: string;
      vehicle: string;
      plate: string;
      status: string;
      speed: string;
      coords: string;
      phone: string;
    }
  | {
      type: "shuttle_tracker";
      route: string;
      eta: string;
      capacity: string;
      status: string;
    }
  | {
      type: "executive_scorecard";
      satisfaction: string;
      nps: string;
      savingsSAR: string;
      idleReduction: string;
    };

type ChatMessage = {
  id: string;
  author: "user" | "ai";
  body: string;
  actions?: ChatAction[];
  executedActionId?: string;
  widget?: ChatWidget;
};

function getChipIcon(iconType: string) {
  switch (iconType) {
    case "car":
      return <Car size={12} className="text-midyaf-gold shrink-0" />;
    case "building":
      return <Hotel size={12} className="text-purple-400 shrink-0" />;
    case "calendar":
      return <Calendar size={12} className="text-cyan-400 shrink-0" />;
    case "utensils":
      return <Utensils size={12} className="text-emerald-400 shrink-0" />;
    case "wifi":
      return <Wifi size={12} className="text-sky-400 shrink-0" />;
    case "alert":
      return <AlertTriangle size={12} className="text-amber-400 shrink-0" />;
    case "shield":
      return <ShieldCheck size={12} className="text-emerald-400 shrink-0" />;
    case "plane":
      return <Plane size={12} className="text-cyan-400 shrink-0" />;
    case "clipboard":
      return <ClipboardList size={12} className="text-midyaf-gold shrink-0" />;
    case "coffee":
      return <Coffee size={12} className="text-amber-400 shrink-0" />;
    case "chart":
      return <BarChart2 size={12} className="text-purple-400 shrink-0" />;
    default:
      return <Sparkles size={12} className="text-midyaf-gold shrink-0" />;
  }
}

export function AiPanel({
  persona = "Noura",
  initialMessage,
  session,
  context
}: {
  persona?: "Noura" | "Saif & Munirah" | "Ops Manager";
  initialMessage?: string;
  session?: Session;
  context?: Record<string, any>;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const p = (en: string, ar: string) => pickText(isArabic, en, ar);
  const l = (text: string) => localizeText(text, isArabic);

  const assistantName =
    persona === "Saif & Munirah"
      ? p("Saif & Munirah (VIP Concierge)", "سيف ومنيرة (المساعد الملكي للضيوف)")
      : persona === "Ops Manager"
      ? p("Ops Manager AI", "مدير العمليات الذكي")
      : p("Noura (Operations Copilot)", "نورة (الذكاء السيادي لإدارة العمليات)");

  const welcomeMessage = useMemo<ChatMessage>(() => {
    const isGuest = persona === "Saif & Munirah";
    return {
      id: "welcome",
      author: "ai",
      body: isGuest
        ? p(
            `Ahlan wa Sahlan, Your Excellency. I am Saif & Munirah, your personal executive concierge for FII 2027. Your luxury transport, hospitality suite, and agenda are fully synchronized. How may I assist you today?`,
            `أهلاً وسهلاً بمعاليكم وسعادتكم. أنا سيف ومنيرة، مساعدكم الشخصي لخدمات كبار الشخصيات لمبادرة مستقبل الاستثمار 2027. جدولكم وموكبكم وجناحكم الملكي في خدمتكم على مدار الساعة. كيف يمكنني مساندتكم الآن؟`
          )
        : p(
            `Welcome to Midyaf Sovereign Operations Brain. I am Noura, actively monitoring live telemetry for Future Investment Initiative 2027 (FII) across Riyadh. Ask me about vendor geofencing, sealed vault status, flight surges, or active VIP riders.`,
            `مرحباً بكم في العقل التشغيلي السيادي لمنصة مِضياف. أنا نورة، أراقب حالياً التغطية الحية لفعاليات مبادرة مستقبل الاستثمار 2027 (FII) في الرياض. يمكنكم سؤالي عن فحص الموردين بالقاعة أ، الخزنة الثلاثية، تنبيهات وصول المطار، أو مذكرات الضيافة الملكية.`
          )
    };
  }, [persona, i18n.language]);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeMessage]);
  const [input, setInput] = useState(initialMessage ?? "");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    setMessages((current) =>
      current[0]?.id === "welcome"
        ? [welcomeMessage, ...current.slice(1)]
        : current
    );
  }, [welcomeMessage]);

  const suggestedPrompts = useMemo(() => {
    if (persona === "Saif & Munirah") {
      return [
        { en: "Where is my driver?", ar: "أين سائقي؟", icon: "car" },
        { en: "My room & hospitality rider", ar: "جناحي ومذكرة الضيافة", icon: "building" },
        { en: "Today's FII 2027 Schedule", ar: "جدول الفعالية اليوم", icon: "calendar" },
        { en: "Recommend dinner in Diriyah", ar: "مطعم عشاء في الدرعية", icon: "utensils" },
        { en: "VIP Wi-Fi & Lounge access", ar: "بيانات الواي فاي والاستراحة", icon: "wifi" }
      ];
    }
    return [
      { en: "Which vendors are missing from Hall A right now?", ar: "الموردين المتأخرين بالقاعة أ", icon: "alert" },
      { en: "Triple-Key Security Vault status", ar: "حالة الخزنة الثلاثية", icon: "shield" },
      { en: "Terminal 2 flight surge alert", ar: "تنبيه ازدحام الصالة 2", icon: "plane" },
      { en: "VIP Hospitality Riders status", ar: "مذكرات الضيافة الملكية", icon: "clipboard" },
      { en: "Crowd surge at Hall B coffee station", ar: "ازدحام محطة القهوة قاعة ب", icon: "coffee" },
      { en: "Post-event analytics & savings", ar: "تقرير الوفورات والتقييم", icon: "chart" }
    ];
  }, [persona]);

  async function handleActionClick(messageId: string, action: ChatAction) {
    setMessages((current) =>
      current.map((msg) =>
        msg.id === messageId ? { ...msg, executedActionId: action.actionId } : msg
      )
    );

    // Call backend execution endpoint if authenticated
    if (session?.accessToken) {
      try {
        await apiFetch("/ai/execute-action", session.accessToken, {
          method: "POST",
          body: JSON.stringify({ actionId: action.actionId })
        });
      } catch {
        // Fallback to local execution
      }
    }

    if (action.actionId === "track_driver" || action.actionId === "track_driver_khaled") {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          author: "ai",
          body: p(
            `${assistantName}: Telemetry radar connected to Capt. Sultan Al-Otaibi. Vehicle staged at VIP Curb Gate 2.`,
            `${assistantName}: تم الاتصال برادار الكابتن سلطان العتيبي. السيارة متوقفة أمام رصيف كبار الشخصيات بوابة 2.`
          ),
          widget: {
            type: "driver_radar",
            driverName: "Capt. Sultan Al-Otaibi",
            vehicle: "Mercedes Maybach S680",
            plate: "KSA 9119",
            status: p("Staged at VIP Curb Gate 2", "متوقف عند رصيف كبار الشخصيات بوابة 2"),
            speed: "0 km/h · A/C 20°C",
            coords: "24.9576° N, 46.6988° E",
            phone: "+966 50 811 9119"
          }
        }
      ]);
      return;
    }

    if (action.actionId === "view_shuttle_gps") {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          author: "ai",
          body: p(
            `${assistantName}: Live Shuttle Telemetry connected. Route: The Ritz-Carlton -> KAICC Plenary Hall 1.`,
            `${assistantName}: تم ربط تتبع حافلات النقل المباشر. المسار: الريتز-كارلتون -> قاعة المؤتمرات KAICC.`
          ),
          widget: {
            type: "shuttle_tracker",
            route: "The Ritz-Carlton -> KAICC Plenary Hall 1",
            eta: p("12 mins (King Khalid Rd)", "12 دقيقة (طريق الملك خالد)"),
            capacity: "14 / 20 Seats Available",
            status: p("En Route (Smooth Flow)", "في الطريق (انسيابية تامة)")
          }
        }
      ]);
      return;
    }

    if (action.actionId === "generate_report") {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          author: "ai",
          body: p(
            `${assistantName}: Automated Post-Event Intelligence generated.`,
            `${assistantName}: تم توليد التقرير التنفيذي الذكي لما بعد الفعالية.`
          ),
          widget: {
            type: "executive_scorecard",
            satisfaction: "96%",
            nps: "88",
            savingsSAR: "SAR 145,000",
            idleReduction: "-40%"
          }
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
    }

    const confirmationText = p(
      `${assistantName}: Action executed (${action.label}). Notification dispatched to relevant team.`,
      `${assistantName}: تم تنفيذ الإجراء (${action.labelAr}). تم إرسال التنبيه للفريق المعني فوراً.`
    );

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        author: "ai",
        body: confirmationText
      }
    ]);
  }

  async function handleSend(textToSend?: string) {
    const messageText = (textToSend || input).trim();

    if (!messageText || isSending) {
      return;
    }

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), author: "user", body: messageText }
    ]);
    if (!textToSend) setInput("");
    setIsSending(true);

    try {
      if (!session) {
        throw new Error("Sign in required");
      }

      const data = await apiFetch<{
        reply: {
          content: string;
          persona: string;
          toolIntent?: string;
          actions?: ChatAction[];
        };
      }>("/ai/chat", session.accessToken, {
        method: "POST",
        body: JSON.stringify({
          message: messageText,
          language: i18n.language,
          persona,
          context
        })
      });

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          author: "ai",
          body: data.reply.content,
          actions: data.reply.actions
        }
      ]);
    } catch {
      const fallback = localAiReply(messageText, i18n.language, assistantName);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          author: "ai",
          body: fallback.body,
          actions: fallback.actions
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="glass-card rounded-xl overflow-hidden animate-fadeInUp shadow-luxury border border-purple-500/20">
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-midyaf-purple to-midyaf-purple-dark text-white">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-xl bg-white/15 text-white backdrop-blur-sm shadow-inner">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              {persona === "Ops Manager"
                ? t("organizer.aiPlan", "Ops Manager AI Brain")
                : persona === "Saif & Munirah"
                ? t("guest.concierge", "Saif & Munirah · Digital Concierge")
                : t("guest.guide", "Midyaf AI Guide")}
            </h3>
            <p className="text-xs text-white/60">Midyaf Intelligence · {assistantName}</p>
          </div>
        </div>
        <Badge tone="gold">
          <Sparkles size={13} />
          {l("AI Live")}
        </Badge>
      </div>

      <div className="max-h-80 space-y-3 overflow-y-auto p-4 bg-gradient-to-b from-midyaf-pearl/40 to-white dark:from-dark-surface dark:to-dark-bg">
        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <div
              className={
                message.author === "user"
                  ? "ms-auto max-w-[86%] rounded-2xl rounded-se-sm bg-gradient-to-br from-midyaf-purple to-midyaf-purple-dark px-4 py-2.5 text-sm text-white shadow-sm animate-slideInRight"
                  : "max-w-[90%] rounded-2xl rounded-ss-sm bg-white dark:bg-dark-surface px-4 py-2.5 text-sm text-midyaf-ink dark:text-dark-text shadow-sm ring-1 ring-slate-100 dark:ring-white/10 animate-slideInLeft"
              }
            >
              <div className="whitespace-pre-line leading-relaxed">{message.body}</div>

              {/* Rich Interactive Widgets */}
              {message.widget && message.widget.type === "driver_radar" && (() => {
                const radar = message.widget;
                return (
                  <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950 p-3.5 text-white shadow-md">
                    <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <Radio size={16} className="text-emerald-400 animate-pulse" />
                        <span className="text-xs font-bold tracking-wide uppercase text-emerald-300">
                          {p("Live Telemetry Radar", "رادار التتبع المباشر")}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-emerald-400">
                        {radar.coords}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-emerald-300/70 uppercase block">{p("Chauffeur", "السائق")}</span>
                        <strong className="text-white font-bold">{radar.driverName}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-emerald-300/70 uppercase block">{p("Vehicle & Plate", "المركبة واللوحة")}</span>
                        <span className="text-amber-300 font-bold">{radar.vehicle} ({radar.plate})</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[10px] text-emerald-300/70 uppercase block">{p("Status & Climate", "الحالة والتكييف")}</span>
                        <span className="text-emerald-100 font-medium">{radar.status} · {radar.speed}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-emerald-500/20 flex gap-2">
                      <button
                        onClick={() => alert(p(`Calling ${radar.driverName} at ${radar.phone}...`, `جاري الاتصال بالسائق ${radar.driverName}...`))}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition shadow-sm"
                      >
                        <Phone size={13} />
                        {p("Call Chauffeur", "اتصال بالسائق")}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {message.widget && message.widget.type === "shuttle_tracker" && (
                <div className="mt-3 rounded-xl border border-purple-500/30 bg-slate-900 p-3.5 text-white shadow-md">
                  <div className="flex items-center justify-between border-b border-purple-500/20 pb-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <Bus size={16} className="text-purple-400 animate-bounce" />
                      <span className="text-xs font-bold tracking-wide uppercase text-purple-300">
                        {p("VIP Shuttle Status", "حالة حافلة كبار الشخصيات")}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-amber-400">
                      {message.widget.eta}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">{p("Route", "المسار")}</span>
                      <strong className="text-white">{message.widget.route}</strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-300 pt-1">
                      <span>{message.widget.capacity}</span>
                      <span className="text-emerald-400 font-medium">{message.widget.status}</span>
                    </div>
                  </div>
                </div>
              )}

              {message.widget && message.widget.type === "executive_scorecard" && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-gradient-to-br from-slate-900 to-slate-950 p-3.5 text-white shadow-md">
                  <div className="flex items-center gap-2 border-b border-amber-500/20 pb-2 mb-2.5">
                    <Sparkles size={16} className="text-amber-400" />
                    <span className="text-xs font-bold tracking-wide uppercase text-amber-300">
                      {p("Executive Post-Event Telemetry", "التقرير التنفيذي الذكي")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-white/5 p-2 border border-white/10">
                      <div className="text-lg font-black text-emerald-400">{message.widget.satisfaction}</div>
                      <div className="text-[10px] text-slate-400">{p("VIP Satisfaction", "رضا الضيوف")}</div>
                    </div>
                    <div className="rounded-lg bg-white/5 p-2 border border-white/10">
                      <div className="text-lg font-black text-amber-400">{message.widget.nps}</div>
                      <div className="text-[10px] text-slate-400">{p("Net Promoter Score", "مؤشر NPS")}</div>
                    </div>
                    <div className="rounded-lg bg-white/5 p-2 border border-white/10">
                      <div className="text-lg font-black text-cyan-400">{message.widget.savingsSAR}</div>
                      <div className="text-[10px] text-slate-400">{p("Direct Cost Savings", "الوفورات المالية")}</div>
                    </div>
                    <div className="rounded-lg bg-white/5 p-2 border border-white/10">
                      <div className="text-lg font-black text-purple-400">{message.widget.idleReduction}</div>
                      <div className="text-[10px] text-slate-400">{p("Idle Fleet Reduced", "خفض هدر الأسطول")}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Action Buttons */}
            {message.author === "ai" && message.actions && message.actions.length > 0 ? (
              <div className="flex flex-wrap gap-2 ps-2 pt-1 animate-fadeIn">
                {message.actions.map((action) => {
                  const isExecuted = message.executedActionId === action.actionId;
                  return (
                    <button
                      key={action.actionId}
                      disabled={isExecuted}
                      onClick={() => void handleActionClick(message.id, action)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all shadow-xs ${
                        isExecuted
                          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 cursor-default"
                          : "bg-gradient-to-r from-midyaf-gold to-midyaf-gold-dark text-white hover:shadow-glow hover:scale-105 active:scale-95 cursor-pointer"
                      }`}
                    >
                      {isExecuted ? <CheckCircle2 size={13} /> : <Sparkles size={13} />}
                      {p(action.label, action.labelAr)}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
        {isSending ? (
          <div className="max-w-[88%] rounded-2xl rounded-ss-sm bg-white dark:bg-dark-surface px-4 py-3 shadow-sm ring-1 ring-slate-100 dark:ring-white/10 animate-slideInLeft">
            <div className="flex gap-1.5">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        ) : null}
      </div>

      {/* Suggested Prompt Chips */}
      <div className="px-3 pt-2 pb-1 bg-slate-50/80 dark:bg-dark-surface/80 border-t border-slate-200/60 dark:border-white/10 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap">
          <span className="text-slate-400 font-semibold shrink-0 flex items-center gap-1">
            <Sparkles size={12} className="text-midyaf-gold" />
            <span>{p("Try:", "جرّب:")}</span>
          </span>
          {suggestedPrompts.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => void handleSend(p(chip.en, chip.ar))}
              disabled={isSending}
              className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 px-2.5 py-1 text-slate-700 dark:text-slate-300 hover:border-midyaf-gold hover:text-midyaf-gold transition-all cursor-pointer shadow-2xs"
            >
              {getChipIcon(chip.icon)}
              <span>{p(chip.en, chip.ar)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 border-t border-slate-100/80 dark:border-white/10 p-3 bg-white/50 dark:bg-dark-surface/50">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleSend();
            }
          }}
          placeholder={t("ai.placeholder", "Ask anything about fleet, riders, venues, or vault...")}
          className="min-w-0 flex-1 m-input rounded-xl"
        />
        <button
          onClick={() => void handleSend()}
          className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-midyaf-gold to-midyaf-gold-dark text-white shadow-sm hover:shadow-glow hover:-translate-y-0.5 active:scale-95"
          aria-label={t("common.send", "Send")}
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}

export function localAiReply(
  message: string,
  language: string,
  persona: string
): { body: string; actions?: ChatAction[] } {
  const lower = message.toLowerCase();
  const isArabic = isArabicLanguage(language);

  // 1. Missing vendors geofence check
  if (
    lower.includes("missing") ||
    lower.includes("hall a") ||
    lower.includes("vendor") ||
    lower.includes("late") ||
    lower.includes("delayed") ||
    lower.includes("av team") ||
    lower.includes("غائب") ||
    lower.includes("مورد") ||
    lower.includes("متأخر") ||
    lower.includes("القاعة") ||
    lower.includes("الصوتيات")
  ) {
    return {
      body: isArabic
        ? `${persona}: تنبيه فحص التواجد الجغرافي للموردين: فريق الصوتيات والمرئيات (شركة الفيصل) فقط هو المتأخر عن القاعة (أ). يوضح نظام الـ GPS أن شاحنة المعدات عالقة في زحمة طريق الملك فهد وتبعد حوالي 10-12 دقيقة. جميع الموردين الـ 6 الآخرين متواجدون في مواقعهم.`
        : `${persona}: Vendor Geofence Alert: Only the AV team (Al-Faisal Lighting & AV) is missing from Hall A right now. Real-time GPS telemetry shows their equipment truck is navigating heavy traffic on King Fahd Rd (~10–12 minutes away). All other 6 registered vendors are checked in at their designated bays.`,
      actions: [
        {
          label: "Dispatch Urgent SMS to AV Team",
          labelAr: "إرسال تنبيه SMS عاجل لفريق الصوتيات",
          actionId: "send_vendor_sms"
        },
        {
          label: "Pinpoint on Fleet Map",
          labelAr: "تتبع الموقع على الخريطة",
          actionId: "view_vendor_map"
        }
      ]
    };
  }

  // 2. Triple-Key Security Vault & Sealed Bids
  if (
    lower.includes("vault") ||
    lower.includes("seal") ||
    lower.includes("bid") ||
    lower.includes("quote") ||
    lower.includes("corruption") ||
    lower.includes("anti-corruption") ||
    lower.includes("key") ||
    lower.includes("auditor") ||
    lower.includes("unseal") ||
    lower.includes("sila") ||
    lower.includes("خزنة") ||
    lower.includes("مظاريف") ||
    lower.includes("عروض") ||
    lower.includes("مفاتيح") ||
    lower.includes("فساد") ||
    lower.includes("مدقق") ||
    lower.includes("صلة")
  ) {
    return {
      body: isArabic
        ? `${persona}: خزنة مِضياف الأمنية الثلاثية لمكافحة تسريب العروض نَشِطة حالياً لمبادرة مستقبل الاستثمار 2027 (FII). عروض الأسعار المقدمة من فندق الريتز-كارلتون (1,250,000 ر.س) والأسطول الملكي (450,000 ر.س) مشفرة ومختومة بالكامل. يتطلب فتحها تفعيل 3 مفاتيح أمنية في آن واحد (2 من صلة + 1 من مدقق مِضياف) خلال نافذة 5 دقائق لمنع أي تسريب للموردين المفضلين.`
        : `${persona}: Midyaf Triple-Key Anti-Corruption Security Vault is ACTIVE for Future Investment Initiative 2027 (FII). Vendor bids from The Ritz-Carlton (SAR 1,250,000) and Royal Fleet VIP (SAR 450,000) remain cryptographically sealed. Viewing unsealed quotations requires simultaneous authentication from 2 Sila Organizers and 1 Midyaf Independent Auditor within a strict 5-minute window.`,
      actions: [
        {
          label: "Access Triple-Key Vault",
          labelAr: "الانتقال إلى الخزنة الثلاثية",
          actionId: "scroll_to_vault"
        }
      ]
    };
  }

  // 3. Flight Arrivals, Airport Surge & Standby Fleet
  if (
    lower.includes("flight") ||
    lower.includes("terminal 2") ||
    lower.includes("airport") ||
    lower.includes("surge") ||
    lower.includes("divert") ||
    lower.includes("landed") ||
    lower.includes("van") ||
    lower.includes("shuttle") ||
    lower.includes("مطار") ||
    lower.includes("رحلات") ||
    lower.includes("صالة 2") ||
    lower.includes("تحويل") ||
    lower.includes("حافلات")
  ) {
    return {
      body: isArabic
        ? `${persona}: تنبيه غرفة العمليات المباشرة: 3 رحلات دولية (SV102 من لندن، EK817 من دبي، QR1164 من الدوحة) هبطت في نفس التوقيت بمطار الملك خالد الدولي - الصالة 2. يوجد 40 ضيفاً بحاجة لنقل فوري، بينما يتوفر 15 حافلة فقط في الصالة 2. يتوفر 8 حافلات في وضع الاستعداد بالصالة 1 يمكن تحويلها فوراً.`
        : `${persona}: Live Command Center Alert: 3 international flights (SV102 from London, EK817 from Dubai, QR1164 from Doha) touched down simultaneously at KKIA Terminal 2. 40 VIP delegates require immediate curbside pickup, but only 15 vans are staged there. Terminal 1 currently has 8 idle standby vans ready for immediate reallocation.`,
      actions: [
        {
          label: "Divert 5 Vans to Terminal 2",
          labelAr: "تحويل 5 حافلات فوراً إلى الصالة 2",
          actionId: "divert_fleet"
        }
      ]
    };
  }

  // 4. VIP Hospitality & Hotel Riders
  if (
    lower.includes("rider") ||
    lower.includes("hospitality") ||
    lower.includes("hotel") ||
    lower.includes("ritz") ||
    lower.includes("suite") ||
    lower.includes("amenities") ||
    lower.includes("dietary") ||
    lower.includes("dates") ||
    lower.includes("gahwa") ||
    lower.includes("pillow") ||
    lower.includes("oud") ||
    lower.includes("فندق") ||
    lower.includes("ريتز") ||
    lower.includes("جناح") ||
    lower.includes("ضيافة") ||
    lower.includes("تمور") ||
    lower.includes("قهوة سعودية") ||
    lower.includes("عود")
  ) {
    return {
      body: isArabic
        ? `${persona}: مذكرات الضيافة الملكية (VIP Riders) معتمدة في فندق الريتز-كارلتون الرياض: 1) معالي ياسر الرميان (الجناح الملكي 1: قهوة سعودية بورد الطائف، تمر سكري فاخر، وجبات حلال خالية من الغلوتين)؛ 2) سارة التويجري (جناح تنفيذي 204: وسائد ريش متماسكة، دهن عود ملكي معتق)؛ 3) طارق منصور (غرفة ديلوكس 310: قهوة بدون كافيين ومياه فوارة). تم تأكيد كافة التجهيزات مسبقاً.`
        : `${persona}: VIP Hospitality Riders Verified at The Ritz-Carlton Riyadh: 1) H.E. Yasir Al-Rumayyan (Royal Suite 1: Taif Rose Gahwa, Sukkari Dates, Strictly Halal & Gluten-Free dietary rider); 2) Sarah Al-Tuwaijri (Executive Suite 204: Firm Feather Pillow, Royal Arabian Oud amenities); 3) Tariq Mansoor (Deluxe King 310: Decaf Saudi Gahwa, Sparkling Water). All riders pre-cleared by Midyaf Protocol.`,
      actions: [
        {
          label: "Inspect Hospitality Riders",
          labelAr: "استعراض مذكرات الضيافة",
          actionId: "inspect_riders"
        }
      ]
    };
  }

  // 5. Driver & Chauffeur Match / VIP Pickup
  if (
    lower.includes("driver") ||
    lower.includes("chauffeur") ||
    lower.includes("sultan") ||
    lower.includes("khaled") ||
    lower.includes("ahmed") ||
    lower.includes("car") ||
    lower.includes("maybach") ||
    lower.includes("gmc") ||
    lower.includes("mercedes") ||
    lower.includes("plate") ||
    lower.includes("pickup") ||
    lower.includes("curb") ||
    lower.includes("gate 2") ||
    lower.includes("exit 4") ||
    lower.includes("سائق") ||
    lower.includes("سيارة") ||
    lower.includes("مايباخ") ||
    lower.includes("سلطان") ||
    lower.includes("خالد") ||
    lower.includes("أحمد") ||
    lower.includes("لوحة")
  ) {
    return {
      body: isArabic
        ? `${persona}: السائق التنفيذي المخصص: الكابتن سلطان العتيبي بانتظارك عند رصيف كبار الشخصيات بوابة 2 بالصالة 2 في سيارة مرسيدس مايباخ S680 سوداء (لوحة: أ د ن 9119). التصريح الأمني: مرافقة تنفيذية #819. مكيف السيارة مضبوط على 20° مئوية مع ماء ورد طائفي ومناشف باردة جاهزة. يمكنك التوجه للسيارة مباشرة دون الحاجة للاتصال.`
        : `${persona}: Assigned VIP Chauffeur: Captain Sultan Al-Otaibi is waiting at KKIA Terminal 2 VIP Curb Gate 2 in an all-black Mercedes Maybach S680 (Plate: KSA 9119). Security clearance: Executive Escort #819. In-cabin climate set to 20°C with cold Taif rose water ready. You can walk straight to the vehicle without phone calls.`,
      actions: [
        {
          label: "Track Chauffeur Live on Radar",
          labelAr: "تتبع السائق مباشرة على الرادار",
          actionId: "track_driver"
        }
      ]
    };
  }

  // 6. Event Schedule, Keynote & Shuttle
  if (
    lower.includes("schedule") ||
    lower.includes("agenda") ||
    lower.includes("keynote") ||
    lower.includes("timetable") ||
    lower.includes("sessions") ||
    lower.includes("gala") ||
    lower.includes("today") ||
    lower.includes("time") ||
    lower.includes("جدول") ||
    lower.includes("أجندة") ||
    lower.includes("الكلمة") ||
    lower.includes("مؤتمر") ||
    lower.includes("عشاء") ||
    lower.includes("فعالية")
  ) {
    return {
      body: isArabic
        ? `${persona}: جدول مبادرة مستقبل الاستثمار 2027 اليوم: \n• 08:30 - إفطار واستقبال كبار الشخصيات (بهو الريتز-كارلتون) \n• 10:00 - الكلمة الافتتاحية: 'الآفاق الاقتصادية القادمة' (مركز المؤتمرات KAICC قاعة 1) \n• 13:00 - غداء قادة الأعمال الدوليين \n• 20:00 - العشاء الملكي الاحتفالي (مطل البجيري - الدرعية التاريخية). \n[تنبيه مروري]: يستغرق الانتقال إلى الدرعية حوالي 35 دقيقة، وتنطلق حافلات الضيوف في تمام 19:15.`
        : `${persona}: FII 2027 Schedule & Travel Advisory: \n• 08:30 - VIP Networking Breakfast (The Ritz-Carlton Lobby) \n• 10:00 - Opening Keynote: 'The Next Economic Horizon' (KAICC Plenary Hall 1) \n• 13:00 - Global Leaders Networking Luncheon \n• 20:00 - Royal Gala Dinner (Diriyah Bujairi Terrace). \n[Traffic Advisory]: Transit to Diriyah will take ~35 minutes during evening peak. Executive lobby shuttles depart promptly at 19:15.`,
      actions: [
        {
          label: "View Shuttle Route & GPS",
          labelAr: "عرض مسار الحافلة ونظام GPS",
          actionId: "view_shuttle_gps"
        }
      ]
    };
  }

  // 7. Coffee Station Surge & Catering Restock
  if (
    lower.includes("coffee") ||
    lower.includes("pastries") ||
    lower.includes("hall b") ||
    lower.includes("rush") ||
    lower.includes("crowd") ||
    lower.includes("restock") ||
    lower.includes("catering") ||
    lower.includes("قهوة") ||
    lower.includes("مخبوزات") ||
    lower.includes("قاعة ب") ||
    lower.includes("تموين") ||
    lower.includes("ازدحام")
  ) {
    return {
      body: isArabic
        ? `${persona}: تنبيه تموين عاجل: حساسات الحركة في استراحة كبار الشخصيات بالقاعة (ب) تسجل ازدحاماً بنسبة 85% بعد انتهاء الجلسة الصباحية. انخفض مخزون القهوة والمخبوزات الفاخرة إلى 18%. يوصى بإرسال 2 باريستا إضافيين وعربة إعادة تعبئة فوراً لتفادي أي انقطاع.`
        : `${persona}: Urgent Catering Alert: Footfall monitors at Hall B Executive Lounge report an 85% capacity surge following the morning panel. Artisan pastries and premium Gahwa beans have dropped to 18% inventory. Immediate dispatch of 2 standby baristas and a replenishment cart recommended.`,
      actions: [
        {
          label: "Dispatch 2 Baristas & Restock",
          labelAr: "إرسال 2 باريستا وإعادة التعبئة",
          actionId: "confirm_dispatch_staff"
        }
      ]
    };
  }

  // 8. Automated Post-Event Analytics & Cost Savings
  if (
    lower.includes("report") ||
    lower.includes("analytics") ||
    lower.includes("saving") ||
    lower.includes("post-event") ||
    lower.includes("kpi") ||
    lower.includes("nps") ||
    lower.includes("cost") ||
    lower.includes("metric") ||
    lower.includes("تقرير") ||
    lower.includes("وفورات") ||
    lower.includes("إحصائيات") ||
    lower.includes("تقييم") ||
    lower.includes("تكاليف")
  ) {
    return {
      body: isArabic
        ? `${persona}: ملخص تقرير ما بعد الفعالية الذكي: بلغت نسبة رضا كبار الشخصيات 96% (مؤشر NPS 88). أبرز المكاسب التشغيلية: جدولة رحلات الوصول في مطار الملك خالد ألغت أوقات انتظار الرصيف وخفّضت هدر الأسطول بنسبة 40%، محققة وفراً مالياً قدره 145,000 ريال سعودي.`
        : `${persona}: Automated Post-Event Intelligence Summary: Overall VIP satisfaction reached 96% (NPS 88). Key operational efficiency: Intelligent flight batching at KKIA Terminal 2 eliminated 18-minute curb wait times and cut idle vehicle duration by 40%, delivering SAR 145,000 in direct fleet cost savings.`,
      actions: [
        {
          label: "View Executive PDF Report",
          labelAr: "استعراض التقرير التنفيذي الكامل",
          actionId: "generate_report"
        }
      ]
    };
  }

  // 9. Wi-Fi, Lounge Access & VIP Pass
  if (
    lower.includes("wifi") ||
    lower.includes("internet") ||
    lower.includes("network") ||
    lower.includes("password") ||
    lower.includes("lounge") ||
    lower.includes("pass") ||
    lower.includes("credential") ||
    lower.includes("واي فاي") ||
    lower.includes("إنترنت") ||
    lower.includes("شبكة") ||
    lower.includes("كلمة المرور") ||
    lower.includes("استراحة")
  ) {
    return {
      body: isArabic
        ? `${persona}: بيانات شبكة كبار الشخصيات المشفرة: \n• اسم الشبكة: Midyaf-VIP-5G \n• كلمة المرور: SaudiVision2030! \n• التغطية: قاعات مركز المؤتمرات، أجنحة واستراحات الريتز-كارلتون. سرعة تتجاوز 450 ميغابت مع أولوية اتصال مخصصة.`
        : `${persona}: VIP Encrypted Network Credentials: \n• Network (SSID): Midyaf-VIP-5G \n• Passphrase: SaudiVision2030! \n• Coverage: KAICC Plenary Halls, Ritz-Carlton Royal Lounges & Media Suite. Dedicated 450 Mbps fiber uplink with encrypted channel.`
    };
  }

  // 10. Diriyah & Fine Dining
  if (
    lower.includes("diriyah") ||
    lower.includes("dinner") ||
    lower.includes("restaurant") ||
    lower.includes("reserve") ||
    lower.includes("bujairi") ||
    lower.includes("food") ||
    lower.includes("عشاء") ||
    lower.includes("مطعم") ||
    lower.includes("الدرعية") ||
    lower.includes("البجيري") ||
    lower.includes("حجز")
  ) {
    return {
      body: isArabic
        ? `${persona}: توصية العشاء الفاخر في الرياض: مطل البجيري في الدرعية التاريخية يضم نخبة من أرقى المطاعم العالمية المطلة على حي الطريف التاريخي المسجل باليونسكو. المطاعم الموصى بها: مطعم ميز (المطبخ السعودي الفاخر) أو هاكاسان. أنصح بالتحرك في تمام 19:15 لتفادي الذروة المرورية.`
        : `${persona}: VIP Riyadh Dining Recommendation: Bujairi Terrace in Historic Diriyah offers premier gastronomy overlooking the UNESCO World Heritage site of At-Turaif. Top recommendations: Maiz (refined Saudi dining) or Hakkasan. Recommended departure time is 19:15 to bypass corridor congestion.`
    };
  }

  return {
    body: isArabic
      ? `${persona}: أهلاً بك في منصة مِضياف الذكية لإدارة العمليات والضيافة في الرياض. أتابع حالياً فعاليات مبادرة مستقبل الاستثمار 2027 (FII). يمكنني مساعدتك فوراً في: فحص الموردين بالقاعة أ، التحقق من الخزنة الثلاثية، تنبيهات وصول المطار، مذكرات الضيافة، وتتبع السائقين.`
      : `${persona}: Welcome to Midyaf AI Operations Brain. I am actively monitoring telemetry for Future Investment Initiative 2027 (FII). I can help with real-time vendor geofencing, the Triple-Key Security Vault, Terminal 2 flight surges, VIP hospitality riders, and driver tracking.`,
    actions: [
      {
        label: "Check Missing Vendors",
        labelAr: "فحص الموردين المتأخرين",
        actionId: "send_vendor_sms"
      },
      {
        label: "Check Security Vault",
        labelAr: "فحص الخزنة الثلاثية",
        actionId: "scroll_to_vault"
      },
      {
        label: "Flight Arrivals Surge",
        labelAr: "تنبيه وصول المطار",
        actionId: "divert_fleet"
      },
      {
        label: "Where is my Driver?",
        labelAr: "أين سائقي؟",
        actionId: "track_driver"
      }
    ]
  };
}

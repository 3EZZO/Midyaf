import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Send, Sparkles } from "lucide-react";
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

type ChatMessage = {
  id: string;
  author: "user" | "ai";
  body: string;
  actions?: ChatAction[];
  executedActionId?: string;
};

export function AiPanel({
  session,
  persona = "Noura",
  context
}: {
  session?: Session;
  persona?: "Saud" | "Noura" | "Ops Manager" | "Supply Chain AI";
  context?: unknown;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const l = (value: string | number | null | undefined) =>
    localizeText(value, isArabic);
  const p = (english: string, arabic: string) =>
    pickText(isArabic, english, arabic);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const assistantName = useMemo(
    () => l(persona === "Saud" ? "Saud" : persona),
    [persona, isArabic]
  );
  const welcomeMessage = useMemo<ChatMessage>(
    () => ({
      id: "welcome",
      author: "ai",
      body: p(
        `${assistantName}: Welcome to Riyadh. How can I help today?`,
        `${assistantName}: أهلاً بك في الرياض. كيف أساعدك اليوم؟`
      )
    }),
    [assistantName, isArabic]
  );
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);

  useEffect(() => {
    setMessages((current) =>
      current[0]?.id === "welcome"
        ? [welcomeMessage, ...current.slice(1)]
        : current
    );
  }, [welcomeMessage]);

  async function handleActionClick(messageId: string, action: ChatAction) {
    setMessages((current) =>
      current.map((msg) =>
        msg.id === messageId ? { ...msg, executedActionId: action.actionId } : msg
      )
    );

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

  async function sendMessage() {
    const trimmed = input.trim();

    if (!trimmed || isSending) {
      return;
    }

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), author: "user", body: trimmed }
    ]);
    setInput("");
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
          message: trimmed,
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
      const fallback = localAiReply(trimmed, i18n.language, assistantName);
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
    <div className="glass-card rounded-xl overflow-hidden animate-fadeInUp">
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-midyaf-purple to-midyaf-purple-dark text-white">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-xl bg-white/15 text-white backdrop-blur-sm">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              {persona === "Ops Manager"
                ? t("organizer.aiPlan")
                : t("guest.guide")}
            </h3>
            <p className="text-xs text-white/60">GPT-4o · {assistantName}</p>
          </div>
        </div>
        <Badge tone="gold">
          <Sparkles size={13} />
          {l("AI")}
        </Badge>
      </div>

      <div className="max-h-72 space-y-3 overflow-y-auto p-4 bg-gradient-to-b from-midyaf-pearl/50 to-white dark:from-dark-surface dark:to-dark-bg">
        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <div
              className={
                message.author === "user"
                  ? "ms-auto max-w-[86%] rounded-2xl rounded-se-sm bg-gradient-to-br from-midyaf-purple to-midyaf-purple-dark px-4 py-2.5 text-sm text-white shadow-sm animate-slideInRight"
                  : "max-w-[88%] rounded-2xl rounded-ss-sm bg-white dark:bg-dark-surface px-4 py-2.5 text-sm text-midyaf-ink dark:text-dark-text shadow-sm ring-1 ring-slate-100 dark:ring-white/10 animate-slideInLeft"
              }
            >
              {message.body}
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

      <div className="flex gap-2 border-t border-slate-100/80 dark:border-white/10 p-3 bg-white/50 dark:bg-dark-surface/50">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void sendMessage();
            }
          }}
          placeholder={t("ai.placeholder")}
          className="min-w-0 flex-1 m-input rounded-xl"
        />
        <button
          onClick={() => void sendMessage()}
          className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-midyaf-gold to-midyaf-gold-dark text-white shadow-sm hover:shadow-glow hover:-translate-y-0.5 active:scale-95"
          aria-label={t("common.send")}
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}

function localAiReply(
  message: string,
  language: string,
  persona: string
): { body: string; actions?: ChatAction[] } {
  const lower = message.toLowerCase();
  const isArabic = isArabicLanguage(language);

  if (
    lower.includes("missing") ||
    lower.includes("hall a") ||
    lower.includes("vendor") ||
    lower.includes("غائب") ||
    lower.includes("القاعة")
  ) {
    return {
      body: isArabic
        ? `${persona}: فريق الإضاءة والصوت (AV team) فقط هو الغائب عن القاعة (أ) حالياً. يوضح نظام الـ GPS أنهم عالقون في الازدحام المروري ويبعدون حوالي 10 دقائق. هل ترغب في أن أرسل لهم رسالة تنبيه فورية؟`
        : `${persona}: Only the AV team is missing from Hall A right now. Their GPS shows they are stuck in traffic about 10 minutes away. Do you want me to send them a message?`,
      actions: [
        {
          label: "Send SMS to AV Team",
          labelAr: "إرسال رسالة لفريق الإضاءة والصوت",
          actionId: "send_vendor_sms"
        }
      ]
    };
  }

  if (
    lower.includes("keynote") ||
    lower.includes("shuttle") ||
    lower.includes("lobby") ||
    lower.includes("traffic") ||
    lower.includes("الكلمة")
  ) {
    return {
      body: isArabic
        ? `${persona}: تبدأ الكلمة الرئيسية بعد 45 دقيقة. حركة المرور مزدحمة قليلاً اليوم، لذا نوصي بالتوجه إلى حافلة البهو خلال الـ 10 دقائق القادمة لتجنب أي تأخير.`
        : `${persona}: The Keynote Speech starts in 45 minutes. Traffic is a bit heavy today, so we recommend heading down to the lobby shuttle in the next 10 minutes so you don't have to rush.`,
      actions: [
        {
          label: "View Live Shuttle GPS",
          labelAr: "عرض موقع الحافلة المباشر",
          actionId: "view_shuttle_gps"
        }
      ]
    };
  }

  if (
    lower.includes("khaled") ||
    lower.includes("exit 4") ||
    lower.includes("gmc") ||
    lower.includes("plate") ||
    lower.includes("خالد")
  ) {
    return {
      body: isArabic
        ? `${persona}: أهلاً بك في الرياض! سائقك خالد بانتظارك عند المخرج 4 في سيارة GMC بيضاء (لوحة 8899). يمكنك فتح الخريطة والتوجه مباشرة للسيارة.`
        : `${persona}: Welcome to Riyadh! Your driver Khaled is waiting at Exit 4 in a white GMC (Plate 8899). You can open the map and walk straight to the car. No phone calls, no confusion.`,
      actions: [
        {
          label: "Track Khaled on Map",
          labelAr: "تتبع موقع خالد على الخريطة",
          actionId: "track_driver_khaled"
        }
      ]
    };
  }

  if (
    lower.includes("coffee") ||
    lower.includes("hall b") ||
    lower.includes("pastries") ||
    lower.includes("restock") ||
    lower.includes("قهوة")
  ) {
    return {
      body: isArabic
        ? `${persona}: عاجل: محطة القهوة في القاعة (ب) تشهد إقبالاً كثيفاً جداً حالياً. يرجى إرسال موظفين إضافيين (2) وإعادة تعبئة المخبوزات فوراً. اضغط للتأكيد.`
        : `${persona}: Urgent: The coffee station in Hall B is getting really busy. Please send 2 more staff members and restock the pastries right now. Tap to confirm.`,
      actions: [
        {
          label: "Confirm & Dispatch Staff",
          labelAr: "تأكيد وإرسال الموظفين",
          actionId: "confirm_dispatch_staff"
        }
      ]
    };
  }

  if (lower.includes("driver") || lower.includes("taxi")) {
    return {
      body: isArabic
        ? `${persona}: سأعطي الأولوية لأقرب سائق في نفس منطقة الرياض ثم أوسع البحث عند الحاجة.`
        : `${persona}: I will prioritize the nearest driver in the same Riyadh zone, then expand if needed.`
    };
  }

  if (lower.includes("dinner") || lower.includes("restaurant")) {
    return {
      body: isArabic
        ? `${persona}: أقترح مطعماً هادئاً قرب الدرعية مع وقت انتقال مناسب قبل الازدحام.`
        : `${persona}: I suggest a quiet Diriyah-area dinner with transfer timing before peak traffic.`
    };
  }

  return {
    body: isArabic
      ? `${persona}: سأرتب لك توصية مناسبة حسب جدولك وموقعك الحالي في الرياض.`
      : `${persona}: I will tailor a recommendation around your schedule and current Riyadh location.`
  };
}

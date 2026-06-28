import { useEffect, useMemo, useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Session } from "@shared/domain";
import { apiFetch } from "../lib/api";
import { Badge } from "./Badge";
import {
  isArabicLanguage,
  localizeText,
  pickText
} from "../lib/localize";

type ChatMessage = {
  id: string;
  author: "user" | "ai";
  body: string;
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
        reply: { content: string; persona: string; toolIntent?: string };
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
          body: data.reply.content
        }
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          author: "ai",
          body: localAiReply(trimmed, i18n.language, assistantName)
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

      <div className="max-h-72 space-y-3 overflow-y-auto p-4 bg-gradient-to-b from-midyaf-pearl/50 to-white">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.author === "user"
                ? "ms-auto max-w-[86%] rounded-2xl rounded-se-sm bg-gradient-to-br from-midyaf-purple to-midyaf-purple-dark px-4 py-2.5 text-sm text-white shadow-sm animate-slideInRight"
                : "max-w-[88%] rounded-2xl rounded-ss-sm bg-white px-4 py-2.5 text-sm text-midyaf-ink shadow-sm ring-1 ring-slate-100 animate-slideInLeft"
            }
          >
            {message.body}
          </div>
        ))}
        {isSending ? (
          <div className="max-w-[88%] rounded-2xl rounded-ss-sm bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100 animate-slideInLeft">
            <div className="flex gap-1.5">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex gap-2 border-t border-slate-100/80 p-3 bg-white/50">
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

function localAiReply(message: string, language: string, persona: string) {
  const lower = message.toLowerCase();
  const isArabic = isArabicLanguage(language);

  if (lower.includes("driver") || lower.includes("taxi")) {
    return isArabic
      ? `${persona}: سأعطي الأولوية لأقرب سائق في نفس منطقة الرياض ثم أوسع البحث عند الحاجة.`
      : `${persona}: I will prioritize the nearest driver in the same Riyadh zone, then expand if needed.`;
  }

  if (lower.includes("dinner") || lower.includes("restaurant")) {
    return isArabic
      ? `${persona}: أقترح مطعماً هادئاً قرب الدرعية مع وقت انتقال مناسب قبل الازدحام.`
      : `${persona}: I suggest a quiet Diriyah-area dinner with transfer timing before peak traffic.`;
  }

  return isArabic
    ? `${persona}: سأرتب لك توصية مناسبة حسب جدولك وموقعك الحالي في الرياض.`
    : `${persona}: I will tailor a recommendation around your schedule and current Riyadh location.`;
}

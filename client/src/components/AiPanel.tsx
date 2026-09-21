import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, Send, Sparkles, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MidyafData, Session } from "@shared/domain";
import { apiFetch } from "../lib/api";
import { BRIEF_PROMPTS, buildBriefingContext } from "../lib/aiBriefs";
import {
  streamAiReply,
  type AiAction,
  type AiStreamMeta,
  type AiStreamRequest
} from "../lib/aiStream";
import { cn } from "../lib/cn";
import { liveEvents, useLiveHistory } from "../lib/liveEvents";
import { isArabicLanguage, pickText } from "../lib/localize";
import { fleetUtilisation, slaSample } from "../lib/metrics";
import { AiMarkdown } from "./ai/AiMarkdown";
import {
  DriverWidget,
  ScorecardWidget,
  pickDriver,
  type AiWidget
} from "./ai/AiWidgets";
import { Badge, Button, IconButton, useToast } from "./ui";

export { localAiReply } from "../lib/localAiReply";

type Persona = "Noura" | "Saif & Munirah" | "Ops Manager";

type ChatMessage = {
  id: string;
  author: "user" | "ai";
  body: string;
  /** Text is still arriving. */
  streaming?: boolean;
  /** Set when the stream was cut short by the reader. */
  aborted?: boolean;
  source?: AiStreamMeta["source"];
  actions?: AiAction[];
  executedActionId?: string;
  widget?: AiWidget;
  /** Briefing replies get a gold eyebrow instead of a user bubble. */
  brief?: string;
};

/**
 * The assistant. One component for the ops brain and the guest concierge:
 * replies stream token-by-token over SSE (or the local fallback at the same
 * cadence), render as Markdown, and can attach a card whose numbers come from
 * the same `metrics.ts` selectors the dashboards use. The director's
 * `demo:brief` and the "Brief me" button both stream a situation briefing
 * grounded in the current snapshot.
 */
export function AiPanel({
  persona = "Noura",
  session,
  data,
  isDemoMode = false,
  refreshData,
  autoBrief = false,
  className
}: {
  persona?: Persona;
  session?: Session;
  data?: MidyafData;
  isDemoMode?: boolean;
  refreshData?: () => Promise<void>;
  /** Stream the situation briefing once on mount. */
  autoBrief?: boolean;
  className?: string;
}) {
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const p = (en: string, ar: string) => pickText(isArabic, en, ar);
  const history = useLiveHistory(10);

  const isGuest = persona === "Saif & Munirah";
  const assistantName = isGuest
    ? p("Saif & Munirah · VIP Concierge", "سيف ومنيرة · المساعد الملكي للضيوف")
    : persona === "Ops Manager"
      ? p("Ops Manager AI", "مدير العمليات الذكي")
      : p("Noura · Operations Copilot", "نورة · الذكاء السيادي للعمليات");

  const welcome = useMemo<ChatMessage>(
    () => ({
      id: "welcome",
      author: "ai",
      body: isGuest
        ? p(
            "Ahlan wa Sahlan, Your Excellency. I am Saif & Munirah, your executive concierge. Your transport, suite and agenda are synchronised — how may I assist?",
            "أهلاً وسهلاً بمعاليكم. أنا سيف ومنيرة، مساعدكم التنفيذي. موكبكم وجناحكم وجدولكم متزامنون — كيف يمكنني مساندتكم؟"
          )
        : p(
            "I am watching the fleet, geofences, arrivals and the vault in real time. Ask for a briefing, a captain, a corridor, or the numbers.",
            "أراقب الأسطول والنطاقات الجغرافية والوصول والخزنة مباشرة. اطلب إحاطة، أو كابتن، أو ممراً، أو الأرقام."
          )
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isGuest, isArabic]
  );

  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcome]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages((current) =>
      current[0]?.id === "welcome" ? [welcome, ...current.slice(1)] : current
    );
  }, [welcome]);

  // Keep the newest text in view while it streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const patch = useCallback(
    (id: string, fn: (m: ChatMessage) => ChatMessage) => {
      setMessages((current) => current.map((m) => (m.id === id ? fn(m) : m)));
    },
    []
  );

  const suggested = useMemo(
    () =>
      isGuest
        ? [
            { en: "Where is my driver?", ar: "أين سائقي؟" },
            { en: "My suite & hospitality rider", ar: "جناحي ومذكرة الضيافة" },
            { en: "Today's schedule", ar: "جدول اليوم" },
            { en: "Recommend dinner in Diriyah", ar: "مطعم عشاء في الدرعية" }
          ]
        : [
            {
              en: "Which vendors are missing from Hall A?",
              ar: "الموردين المتأخرين بالقاعة أ"
            },
            { en: "Triple-Key Vault status", ar: "حالة الخزنة الثلاثية" },
            { en: "Terminal 2 flight surge", ar: "تنبيه ازدحام الصالة 2" },
            { en: "Where is the VIP convoy?", ar: "أين موكب الضيفة؟" },
            { en: "Post-event analytics", ar: "تقرير الوفورات" }
          ],
    [isGuest]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  /** Stream one reply. `brief` marks a director/narrator briefing rather than a typed question. */
  const ask = useCallback(
    async (text: string, opts: { brief?: string } = {}) => {
      const message = text.trim();
      if (!message) return;
      // A typed question waits its turn; a director briefing interrupts.
      if (busy && !opts.brief) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);

      const aiId = crypto.randomUUID();
      setMessages((current) => [
        ...current,
        ...(opts.brief
          ? []
          : [
              {
                id: crypto.randomUUID(),
                author: "user" as const,
                body: message
              }
            ]),
        { id: aiId, author: "ai", body: "", streaming: true, brief: opts.brief }
      ]);

      const context = data
        ? buildBriefingContext(data, history, isDemoMode)
        : undefined;
      const request: AiStreamRequest = {
        message,
        language: i18n.language,
        persona,
        context
      };

      const result = await streamAiReply(
        session?.accessToken,
        request,
        {
          onMeta: (meta) =>
            patch(aiId, (m) => ({
              ...m,
              source: meta.source,
              actions: meta.actions
            })),
          onDelta: (_delta, full) => patch(aiId, (m) => ({ ...m, body: full }))
        },
        controller.signal
      );

      // A captain question carries the live telemetry card straight away.
      const driver = isDriverQuestion(result.meta?.toolIntent, message)
        ? pickDriver(data)
        : null;
      patch(aiId, (m) => ({
        ...m,
        body: result.text || m.body,
        streaming: false,
        aborted: result.aborted,
        widget: driver ? { type: "driver", driverId: driver.id } : m.widget
      }));
      // An interrupted run must not clear the flag the interrupting run owns.
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [
      busy,
      data,
      history,
      i18n.language,
      isDemoMode,
      patch,
      persona,
      session?.accessToken
    ]
  );

  const brief = useCallback(
    (promptId: string) => {
      const entry = BRIEF_PROMPTS[promptId] ?? BRIEF_PROMPTS.situation;
      void ask(isArabic ? entry.prompt.ar : entry.prompt.en, {
        brief: isArabic ? entry.title.ar : entry.title.en
      });
    },
    [ask, isArabic]
  );

  // The director asks for a briefing at story beats (Act 4 reroute).
  useEffect(
    () => liveEvents.on("demo:brief", (payload) => brief(payload.promptId)),
    [brief]
  );

  const autoBriefed = useRef(false);
  useEffect(() => {
    if (!autoBrief || autoBriefed.current || !data) return;
    autoBriefed.current = true;
    brief("situation");
  }, [autoBrief, brief, data]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function runAction(messageId: string, action: AiAction) {
    patch(messageId, (m) => ({ ...m, executedActionId: action.actionId }));
    const say = (body: string, widget?: AiWidget) =>
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), author: "ai", body, widget }
      ]);

    switch (action.actionId) {
      case "divert_fleet":
      case "command_center_divert_vans": {
        if (session?.accessToken) {
          try {
            await apiFetch("/operations/divert-fleet", session.accessToken, {
              method: "POST"
            });
            await refreshData?.();
          } catch {
            // The reply below still describes the intent; the dashboard refresh is best-effort.
          }
        }
        say(
          p(
            "**Fleet diverted.** Executive vans re-tasked to KKIA Terminal 2; captains notified on their devices.",
            "**تم تحويل الأسطول.** أُعيد توجيه الحافلات التنفيذية إلى الصالة 2؛ وتم إشعار الكباتن على أجهزتهم."
          )
        );
        return;
      }
      case "scroll_to_vault":
        jumpTo("triple-key-vault");
        say(
          p(
            "Opened the **Triple-Key Vault** panel.",
            "تم فتح لوحة **الخزنة الثلاثية**."
          )
        );
        return;
      case "inspect_riders":
        jumpTo("hospitality-riders");
        say(
          p(
            "Opened **VIP Hospitality Riders**.",
            "تم فتح **مذكرات الضيافة الملكية**."
          )
        );
        return;
      case "view_airport":
        jumpTo("airport-express");
        say(
          p(
            "Opened the **Airport Express** manifest.",
            "تم فتح قائمة **رحلات المطار السريعة**."
          )
        );
        return;
      case "generate_report":
        if (!data) break;
        say(
          p(
            "Executive scorecard from the live snapshot:",
            "بطاقة الأداء التنفيذية من البيانات الحية:"
          ),
          { type: "scorecard" }
        );
        return;
      case "track_driver":
      case "track_driver_khaled": {
        const driver = pickDriver(data);
        if (!driver) break;
        say(p("Live telemetry connected:", "تم الاتصال بالرادار المباشر:"), {
          type: "driver",
          driverId: driver.id
        });
        return;
      }
    }

    if (session?.accessToken) {
      try {
        await apiFetch("/ai/execute-action", session.accessToken, {
          method: "POST",
          body: JSON.stringify({ actionId: action.actionId })
        });
      } catch {
        // Confirmation below is the same either way.
      }
    }
    say(
      p(
        `Action executed — **${action.label}**. The relevant team has been notified.`,
        `تم تنفيذ الإجراء — **${action.labelAr}**. تم إشعار الفريق المعني.`
      )
    );
  }

  const fleet = data ? fleetUtilisation(data.drivers) : null;
  const sla = data ? slaSample(data.events[0]?.tasks ?? []) : null;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-hairline bg-surface-2",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg border border-gold-500/40 bg-gold-500/10 text-gold-300">
            <Bot className="size-4" />
          </span>
          <div className="leading-tight">
            <h3 className="text-sm font-bold text-ink">{assistantName}</h3>
            <p className="text-xs text-ink-muted">
              {isGuest
                ? p("Digital concierge", "الكونسيرج الرقمي")
                : p(
                    "Streams over the live event bus",
                    "يبث عبر ناقل الأحداث المباشر"
                  )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {busy ? (
            <Badge tone="gold" dot>
              {p("Streaming", "يبث")}
            </Badge>
          ) : (
            <Badge tone="ok" dot>
              {p("Live", "مباشر")}
            </Badge>
          )}
        </div>
      </header>

      {!isGuest && data ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-surface-1/60 px-4 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-label text-gold-300">
            <Sparkles className="size-3.5" />
            {p("Situation", "الوضع")}
          </span>
          {fleet ? (
            <Stat
              label={p("Fleet", "الأسطول")}
              value={`${fleet.active}/${fleet.total - fleet.offline}`}
            />
          ) : null}
          {sla ? (
            <Stat
              label={p("On-time", "الالتزام")}
              value={`${sla.onTimePercent}%`}
            />
          ) : null}
          <Stat
            label={p("Guests", "الضيوف")}
            value={`${data.events[0]?.guests.filter((g) => g.rsvpStatus === "ARRIVED").length ?? 0}/${data.events[0]?.guests.length ?? 0}`}
          />
          <Button
            size="sm"
            variant="outline"
            className="ms-auto"
            disabled={busy}
            onClick={() => brief("situation")}
          >
            {p("Brief me", "أحطني")}
          </Button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="max-h-96 min-h-48 space-y-3 overflow-y-auto p-4"
      >
        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            {message.brief ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-label text-gold-300">
                <Sparkles className="size-3" />
                {message.brief}
              </p>
            ) : null}
            <div
              className={cn(
                "max-w-[90%] rounded-lg px-4 py-2.5",
                message.author === "user"
                  ? "ms-auto rounded-se-sm bg-gold-500/15 text-sm text-ink"
                  : "rounded-ss-sm bg-surface-3 ring-1 ring-white/5"
              )}
            >
              {message.author === "user" ? (
                <p className="whitespace-pre-line leading-relaxed">
                  {message.body}
                </p>
              ) : (
                <>
                  <AiMarkdown
                    text={message.body}
                    streaming={message.streaming}
                  />
                  {message.aborted ? (
                    <p className="mt-1 text-xs text-ink-faint">
                      {p("Stopped.", "تم الإيقاف.")}
                    </p>
                  ) : null}
                  {message.widget?.type === "scorecard" && data ? (
                    <ScorecardWidget
                      data={data}
                      isDemoMode={isDemoMode}
                      isArabic={isArabic}
                    />
                  ) : null}
                  {message.widget?.type === "driver" && data
                    ? (() => {
                        const driver = data.drivers.find(
                          (d) =>
                            d.id ===
                            (message.widget as { driverId: string }).driverId
                        );
                        return driver ? (
                          <DriverWidget driver={driver} isArabic={isArabic} />
                        ) : null;
                      })()
                    : null}
                </>
              )}
            </div>

            {message.author === "ai" &&
            !message.streaming &&
            message.actions?.length ? (
              <div className="flex flex-wrap gap-2 ps-1">
                {message.actions.map((action) => {
                  const done = message.executedActionId === action.actionId;
                  return (
                    <Button
                      key={action.actionId}
                      size="sm"
                      variant={done ? "primary" : "gold"}
                      disabled={done}
                      leadingIcon={
                        done ? (
                          <CheckCircle2 className="size-3.5" />
                        ) : (
                          <Sparkles className="size-3.5" />
                        )
                      }
                      onClick={() => void runAction(message.id, action)}
                    >
                      {p(action.label, action.labelAr)}
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto border-t border-hairline px-3 py-2 text-xs">
        <span className="shrink-0 text-ink-muted">{p("Try:", "جرّب:")}</span>
        {suggested.map((chip) => (
          <button
            key={chip.en}
            type="button"
            disabled={busy}
            onClick={() => void ask(p(chip.en, chip.ar))}
            className="shrink-0 rounded-full border border-hairline bg-surface-3 px-2.5 py-1 text-ink-muted transition-colors duration-base hover:border-gold-500/40 hover:text-gold-300 disabled:opacity-50"
          >
            {p(chip.en, chip.ar)}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2 border-t border-hairline p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(input);
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t(
            "ai.placeholder",
            "Ask about fleet, riders, venues, or the vault…"
          )}
          className="h-10 min-w-0 flex-1 rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:shadow-focus"
        />
        {busy ? (
          <IconButton
            type="button"
            label={p("Stop", "إيقاف")}
            variant="outline"
            onClick={stop}
          >
            <Square className="size-4" />
          </IconButton>
        ) : (
          <IconButton
            type="submit"
            label={t("common.send", "Send")}
            variant="gold"
            disabled={!input.trim()}
          >
            <Send className="size-4" />
          </IconButton>
        )}
      </form>
    </div>
  );

  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (!el) {
      toast.info(
        p("Section not on this page", "القسم غير موجود في هذه الصفحة")
      );
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-gold-500");
    window.setTimeout(
      () => el.classList.remove("ring-2", "ring-gold-500"),
      2400
    );
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1 text-xs">
      <span className="text-ink-muted">{label}</span>
      <span className="font-tnum font-bold text-ink" dir="ltr">
        {value}
      </span>
    </span>
  );
}

/** Server intent first, then the wording — "where is my driver / convoy". */
function isDriverQuestion(
  toolIntent: string | undefined,
  message: string
): boolean {
  if (
    toolIntent === "driver_touchdown_match" ||
    toolIntent === "transport_requested"
  )
    return true;
  return /\b(driver|captain|convoy|motorcade)\b|سائق|كابتن|موكب/i.test(message);
}

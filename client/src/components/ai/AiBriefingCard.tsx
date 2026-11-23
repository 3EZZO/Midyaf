import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { MidyafData, Session } from "@shared/domain";
import { BRIEF_PROMPTS, buildBriefingContext } from "../../lib/aiBriefs";
import { streamAiReply, type AiStreamMeta } from "../../lib/aiStream";
import { cn } from "../../lib/cn";
import { liveEvents } from "../../lib/liveEvents";
import { cinematic } from "../../lib/motion";
import { Badge, IconButton } from "../ui";
import { AiMarkdown } from "./AiMarkdown";

type Brief = {
  promptId: string;
  title: string;
  text: string;
  streaming: boolean;
  source?: AiStreamMeta["source"];
};

export function briefingTickerPreview(text: string, isArabic: boolean): string {
  const cleaned = text
    .replace(/[#*_`>-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return isArabic ? "جارٍ تحديث الإحاطة المباشرة…" : "Updating live briefing…";
  }
  return cleaned.length > 92 ? `${cleaned.slice(0, 91).trimEnd()}…` : cleaned;
}

/**
 * The War Room's AI surface: a card over the map that streams a briefing —
 * the situation summary when the room opens, and whatever the director asks
 * for at a story beat (`demo:brief`, e.g. the Act 4 reroute rationale). The
 * context is the same snapshot the panels render, so the words match the
 * numbers on screen. Operators can collapse it to a 1-line live ticker pill
 * to view the full Riyadh map unobstructed.
 */
export function AiBriefingCard({
  isArabic,
  session,
  data,
  isDemoMode,
  autoBrief = true,
  defaultCollapsed = false,
  className
}: {
  isArabic: boolean;
  session?: Session;
  data?: MidyafData;
  isDemoMode: boolean;
  autoBrief?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
}) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (promptId: string) => {
      const entry = BRIEF_PROMPTS[promptId] ?? BRIEF_PROMPTS.situation;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const title = isArabic ? entry.title.ar : entry.title.en;
      setBrief({ promptId, title, text: "", streaming: true });

      // The last ten narrative events, read straight off the bus.
      const history = liveEvents.history();
      const result = await streamAiReply(
        session?.accessToken,
        {
          message: isArabic ? entry.prompt.ar : entry.prompt.en,
          language: isArabic ? "ar" : "en",
          persona: "Noura",
          context: data
            ? buildBriefingContext(data, history, isDemoMode)
            : undefined
        },
        {
          onMeta: (meta) =>
            setBrief((b) =>
              b && b.promptId === promptId ? { ...b, source: meta.source } : b
            ),
          onDelta: (_d, text) =>
            setBrief((b) => (b && b.promptId === promptId ? { ...b, text } : b))
        },
        controller.signal
      );
      if (abortRef.current !== controller) return;
      abortRef.current = null;
      setBrief((b) =>
        b && b.promptId === promptId
          ? { ...b, text: result.text || b.text, streaming: false }
          : b
      );
    },
    [data, isArabic, isDemoMode, session?.accessToken]
  );

  useEffect(
    () => liveEvents.on("demo:brief", (payload) => void run(payload.promptId)),
    [run]
  );

  // Runs on `hasData`, not `data`, so live updates never restart the brief;
  // re-arms on cleanup so a StrictMode double-mount still briefs once.
  const runRef = useRef(run);
  runRef.current = run;
  const started = useRef(false);
  const hasData = Boolean(data);
  useEffect(() => {
    if (!autoBrief || !hasData || started.current) return;
    started.current = true;
    void runRef.current("situation");
    return () => {
      abortRef.current?.abort();
      started.current = false;
    };
  }, [autoBrief, hasData]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <AnimatePresence>
      {brief ? (
        collapsed ? (
          <motion.button
            key={`${brief.promptId}-pill`}
            type="button"
            variants={cinematic}
            initial="initial"
            animate="animate"
            exit="exit"
            data-briefing-pill
            data-briefing-collapsed="true"
            aria-expanded="false"
            aria-label={isArabic ? "توسيع إحاطة نورة المباشرة" : "Expand Noura AI situation briefing"}
            onClick={() => setCollapsed(false)}
            className={cn(
              "pointer-events-auto inline-flex max-w-[min(30rem,calc(100%-1rem))] items-center gap-2 rounded-full border border-gold-500/45 bg-surface-1/95 px-3.5 py-2 text-start shadow-dropdown backdrop-blur transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:shadow-focus",
              className
            )}
          >
            <Sparkles className="size-3.5 shrink-0 text-gold-300" aria-hidden />
            <span className="shrink-0 text-xs font-bold uppercase tracking-label text-gold-300">
              {brief.title}
            </span>
            <span className="min-w-0 truncate text-xs text-ink-muted">
              {briefingTickerPreview(brief.text, isArabic)}
            </span>
            <ChevronUp className="size-3.5 shrink-0 text-gold-300" aria-hidden />
          </motion.button>
        ) : (
          <motion.aside
            key={brief.promptId}
            variants={cinematic}
            initial="initial"
            animate="animate"
            exit="exit"
            data-briefing-card
            data-briefing-collapsed="false"
            className={cn(
              "pointer-events-auto flex max-h-[45%] w-[min(28rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border border-gold-500/40 bg-surface-1/95 shadow-dropdown backdrop-blur",
              className
            )}
            aria-live="polite"
          >
            <header className="flex h-9 shrink-0 items-center gap-2 border-b border-hairline px-3">
              <Sparkles className="size-3.5 text-gold-300" aria-hidden />
              <span className="truncate text-xs font-bold uppercase tracking-label text-gold-300">
                {brief.title}
              </span>
              <span className="ms-auto flex items-center gap-1">
                {brief.source ? (
                  <Badge
                    tone={brief.source === "openai" ? "gold" : "neutral"}
                    size="sm"
                  >
                    {brief.source === "openai"
                      ? isArabic
                        ? "نموذج"
                        : "Model"
                      : isArabic
                        ? "محلي"
                        : "Local"}
                  </Badge>
                ) : null}
                <IconButton
                  label={isArabic ? "تصغير إلى شريط مباشر" : "Minimize to live pill"}
                  variant="ghost"
                  size="sm"
                  data-briefing-collapse
                  aria-expanded="true"
                  onClick={() => setCollapsed(true)}
                >
                  <ChevronDown className="size-3.5" />
                </IconButton>
                {brief.streaming ? (
                  <IconButton
                    label={isArabic ? "إيقاف" : "Stop"}
                    variant="ghost"
                    size="sm"
                    onClick={() => abortRef.current?.abort()}
                  >
                    <Square className="size-3.5" />
                  </IconButton>
                ) : (
                  <IconButton
                    label={isArabic ? "إغلاق" : "Dismiss"}
                    variant="ghost"
                    size="sm"
                    onClick={() => setBrief(null)}
                  >
                    <X className="size-3.5" />
                  </IconButton>
                )}
              </span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              <AiMarkdown text={brief.text} streaming={brief.streaming} />
            </div>
          </motion.aside>
        )
      ) : null}
    </AnimatePresence>
  );
}

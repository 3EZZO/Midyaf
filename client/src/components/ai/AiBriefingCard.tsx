import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Square, X } from "lucide-react";
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

/**
 * The War Room's AI surface: a card over the map that streams a briefing —
 * the situation summary when the room opens, and whatever the director asks
 * for at a story beat (`demo:brief`, e.g. the Act 4 reroute rationale). The
 * context is the same snapshot the panels render, so the words match the
 * numbers on screen.
 */
export function AiBriefingCard({
  isArabic,
  session,
  data,
  isDemoMode,
  autoBrief = true,
  className
}: {
  isArabic: boolean;
  session?: Session;
  data?: MidyafData;
  isDemoMode: boolean;
  autoBrief?: boolean;
  className?: string;
}) {
  const [brief, setBrief] = useState<Brief | null>(null);
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

  const started = useRef(false);
  useEffect(() => {
    if (!autoBrief || started.current || !data) return;
    started.current = true;
    void run("situation");
  }, [autoBrief, data, run]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <AnimatePresence>
      {brief ? (
        <motion.aside
          key={brief.promptId}
          variants={cinematic}
          initial="initial"
          animate="animate"
          exit="exit"
          className={cn(
            "pointer-events-auto flex max-h-[45%] w-[min(28rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border border-gold-500/40 bg-surface-1/95 shadow-dropdown backdrop-blur",
            className
          )}
          aria-live="polite"
        >
          <header className="flex h-9 shrink-0 items-center gap-2 border-b border-hairline px-3">
            <Sparkles className="size-3.5 text-gold-300" />
            <span className="truncate text-xs font-bold uppercase tracking-label text-gold-300">
              {brief.title}
            </span>
            <span className="ms-auto flex items-center gap-1.5">
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
      ) : null}
    </AnimatePresence>
  );
}

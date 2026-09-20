import {
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Pause,
  Play,
  RotateCcw
} from "lucide-react";
import { cn } from "../../lib/cn";
import type { Director, DirectorState } from "../../lib/demo/director";
import { sovereignArrival } from "../../lib/demo/scripts/sovereignArrival";
import { Button, IconButton, Kbd, Tooltip } from "../ui";
import { clock, pick } from "./shared";

/**
 * Footer transport for the narrator: act segments (click = jump), play/pause,
 * prev/next, restart, elapsed / total and the hotkey card. Without a
 * rehearsal armed it explains how to arm one and otherwise stays quiet.
 */
export function NarratorBar({
  isArabic,
  isDemoMode,
  director,
  state
}: {
  isArabic: boolean;
  isDemoMode: boolean;
  director: Director;
  state: DirectorState;
}) {
  const acts = sovereignArrival.acts;
  const playing = state.status === "playing";
  const Prev = isArabic ? ChevronRight : ChevronLeft;
  const Next = isArabic ? ChevronLeft : ChevronRight;

  if (!isDemoMode) {
    return (
      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-hairline bg-surface-1/90 px-4 py-2 text-xs text-ink-muted backdrop-blur">
        <span>
          {isArabic
            ? "عمليات مباشرة — لا يوجد سيناريو محمّل."
            : "Live operations — no script loaded."}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {isArabic ? "لتجهيز بروفة" : "Arm a rehearsal"} <Kbd>Ctrl</Kbd>+
          <Kbd>Shift</Kbd>+<Kbd>D</Kbd>
        </span>
      </footer>
    );
  }

  return (
    <footer className="flex shrink-0 items-center gap-4 border-t border-gold-500/25 bg-surface-1/90 px-4 py-2 backdrop-blur">
      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          variant="ghost"
          size="sm"
          label={isArabic ? "إعادة (R)" : "Restart (R)"}
          onClick={() => director.restart()}
        >
          <RotateCcw className="size-4" />
        </IconButton>
        <IconButton
          variant="ghost"
          size="sm"
          label={isArabic ? "الفصل السابق" : "Previous act"}
          onClick={() => director.prev()}
          disabled={state.actIndex === 0}
        >
          <Prev className="size-4" />
        </IconButton>
        <Button
          variant="gold"
          size="sm"
          leadingIcon={
            playing ? <Pause className="size-4" /> : <Play className="size-4" />
          }
          onClick={() => director.toggle()}
          aria-pressed={playing}
          className="min-w-24"
        >
          {playing
            ? isArabic
              ? "إيقاف مؤقت"
              : "Pause"
            : state.status === "ended"
              ? isArabic
                ? "من البداية"
                : "Replay"
              : isArabic
                ? "تشغيل"
                : "Play"}
        </Button>
        <IconButton
          variant="ghost"
          size="sm"
          label={isArabic ? "الفصل التالي" : "Next act"}
          onClick={() => director.next()}
        >
          <Next className="size-4" />
        </IconButton>
      </div>

      <ol
        className="flex min-w-0 flex-1 items-stretch gap-1"
        aria-label={isArabic ? "الفصول" : "Acts"}
      >
        {acts.map((act, i) => {
          const current = i === state.actIndex;
          const done = i < state.actIndex || state.status === "ended";
          const progress =
            current && state.status !== "ended"
              ? Math.min(
                  1,
                  state.actElapsedMs / Math.max(1, state.actDurationMs)
                )
              : done
                ? 1
                : 0;
          return (
            <li key={act.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => director.seekAct(i)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "group flex w-full flex-col gap-1 rounded-md px-2 py-1 text-start transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus",
                  current ? "bg-gold-500/10" : "hover:bg-white/[0.04]"
                )}
                title={pick(act.subtitle, isArabic)}
              >
                <span
                  className={cn(
                    "truncate text-xs font-semibold",
                    current
                      ? "text-gold-300"
                      : done
                        ? "text-ink-muted"
                        : "text-ink-faint"
                  )}
                >
                  <span className="font-tnum me-1.5 text-ink-faint">
                    {i + 1}
                  </span>
                  {pick(act.title, isArabic).replace(/^[^·]*·\s*/, "")}
                </span>
                <span className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <span
                    className={cn(
                      "block h-full rounded-full transition-[width] duration-base ease-linear",
                      current ? "bg-gold-500" : "bg-ink-faint/60"
                    )}
                    style={{ width: `${progress * 100}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex shrink-0 items-center gap-3">
        <span className="font-tnum text-xs text-ink-muted" dir="ltr">
          {clock(state.totalElapsedMs / 1000)} /{" "}
          {clock(state.totalDurationMs / 1000)}
        </span>
        <Tooltip
          side="top"
          content={
            <dl
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"
              dir={isArabic ? "rtl" : "ltr"}
            >
              <dt>
                <Kbd>Space</Kbd>
              </dt>
              <dd>{isArabic ? "تشغيل / إيقاف" : "Play / pause"}</dd>
              <dt>
                <Kbd>{isArabic ? "←" : "→"}</Kbd>{" "}
                <Kbd>{isArabic ? "→" : "←"}</Kbd>
              </dt>
              <dd>
                {isArabic ? "الفصل التالي / السابق" : "Next / previous act"}
              </dd>
              <dt>
                <Kbd>1</Kbd>–<Kbd>5</Kbd>
              </dt>
              <dd>{isArabic ? "الانتقال إلى فصل" : "Jump to act"}</dd>
              <dt>
                <Kbd>R</Kbd>
              </dt>
              <dd>{isArabic ? "إعادة من البداية" : "Restart"}</dd>
              <dt>
                <Kbd>M</Kbd>
              </dt>
              <dd>{isArabic ? "كتم الصوت" : "Mute"}</dd>
              <dt>
                <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>P</Kbd>
              </dt>
              <dd>{isArabic ? "كثافة العرض" : "Projector density"}</dd>
              <dt>
                <Kbd>Esc</Kbd>
              </dt>
              <dd>{isArabic ? "إغلاق غرفة العمليات" : "Close War Room"}</dd>
            </dl>
          }
        >
          <span
            className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-white/5"
            tabIndex={0}
            aria-label={
              isArabic ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts"
            }
          >
            <Keyboard className="size-4" />
          </span>
        </Tooltip>
      </div>
    </footer>
  );
}

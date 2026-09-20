import { useEffect, useState } from "react";
import { Crown, Volume2, VolumeX, X } from "lucide-react";
import type { Driver } from "@shared/domain";
import { Badge, ConnectionDot, IconButton, Kbd, Tooltip } from "../ui";
import { ArcGauge } from "../charts";
import { fleetUtilisation } from "../../lib/metrics";
import type { DirectorState } from "../../lib/demo/director";
import { formatClock, formatTMinus } from "./format";

/**
 * War Room masthead: Riyadh clock with seconds, T-minus to VIP landing,
 * live/demo pill, socket dot and the fleet gauge. Every number here is a
 * clock or a selector — nothing is typed in.
 */
export function WarRoomHeader({
  isArabic,
  isDemoMode,
  state,
  drivers,
  muted,
  onToggleMute,
  onClose
}: {
  isArabic: boolean;
  isDemoMode: boolean;
  state: DirectorState;
  drivers: Driver[];
  muted: boolean;
  onToggleMute: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const fleet = fleetUtilisation(drivers);
  const tminus = formatTMinus(state.landingAt, now);
  const scripted = isDemoMode && state.scriptId !== null;

  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b border-hairline bg-surface-1/90 px-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg border border-gold-500/40 bg-gold-500/10 text-gold-300">
          <Crown className="size-4" />
        </span>
        <div className="leading-tight">
          <p className="text-xs font-bold uppercase tracking-label text-gold-300">
            {isArabic ? "غرفة العمليات السيادية" : "Sovereign War Room"}
          </p>
          <p className="text-xs text-ink-muted">
            {isArabic
              ? "الرياض · المملكة العربية السعودية"
              : "Riyadh · Kingdom of Saudi Arabia"}
          </p>
        </div>
      </div>

      <div className="flex items-baseline gap-3" dir="ltr">
        <time className="font-tnum text-display-md text-ink" aria-live="off">
          {formatClock(now)}
        </time>
        <span className="text-xs font-semibold uppercase tracking-label text-ink-muted">
          AST
        </span>
      </div>

      <div className="flex flex-col leading-tight">
        <span className="text-xs font-semibold uppercase tracking-label text-ink-muted">
          {isArabic ? "الهبوط الملكي" : "VIP landing"}
        </span>
        <span
          className={`font-tnum text-xl font-bold ${tminus.phase === "after" ? "text-ok" : tminus.phase === "before" ? "text-gold-300" : "text-ink-muted"}`}
          dir="ltr"
        >
          {tminus.text}
        </span>
      </div>

      <div className="ms-auto flex items-center gap-4">
        {scripted ? (
          <Badge tone="gold" dot>
            {isArabic ? "عرض موجّه" : "Directed demo"}
          </Badge>
        ) : (
          <Badge tone="ok" dot>
            {isArabic ? "بث حي" : "Live"}
          </Badge>
        )}
        <ConnectionDot showLabel />

        <div className="flex items-center gap-2">
          <ArcGauge value={fleet.percent} size={44} tone="gold" />
          <div className="leading-tight">
            <p className="text-xs font-semibold uppercase tracking-label text-ink-muted">
              {isArabic ? "الأسطول" : "Fleet"}
            </p>
            <p className="font-tnum text-sm font-bold text-ink">
              {fleet.active}/{fleet.total - fleet.offline}
            </p>
          </div>
        </div>

        <Tooltip
          content={
            <span className="flex items-center gap-2">
              {isArabic ? "كتم الصوت" : "Mute audio"} <Kbd>M</Kbd>
            </span>
          }
        >
          <IconButton
            label={
              muted
                ? isArabic
                  ? "تشغيل الصوت"
                  : "Unmute"
                : isArabic
                  ? "كتم الصوت"
                  : "Mute"
            }
            variant="ghost"
            size="sm"
            aria-pressed={muted}
            onClick={onToggleMute}
          >
            {muted ? (
              <VolumeX className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip
          content={
            <span className="flex items-center gap-2">
              {isArabic ? "إغلاق" : "Close"} <Kbd>Esc</Kbd>
            </span>
          }
        >
          <IconButton
            label={isArabic ? "إغلاق غرفة العمليات" : "Close War Room"}
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <X className="size-4" />
          </IconButton>
        </Tooltip>
      </div>
    </header>
  );
}

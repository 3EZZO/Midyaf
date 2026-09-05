import type { ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RoyalCard } from "./RoyalCard";
import { tacticalAudio } from "../lib/tacticalAudio";
import { isArabicLanguage } from "../lib/localize";

export function MetricCard({
  label,
  value,
  detail,
  icon,
  onClick
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const { i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const isClickable = Boolean(onClick);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      tacticalAudio.playTacticalPing();
      onClick();
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`select-none ${isClickable ? "cursor-pointer group active:scale-95 transition-transform" : ""}`}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          tacticalAudio.playTacticalPing();
          onClick?.();
        }
      }}
    >
      <RoyalCard
        tone="default"
        interactive={true}
        onClick={handleClick}
        className={`card-gradient-border animate-fadeInUp transition-all duration-300 relative overflow-hidden ${
          isClickable ? "group-hover:scale-[1.03] group-hover:shadow-glow group-hover:border-midyaf-gold/80" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            <span>{label}</span>
            {isClickable && (
              <span className="inline-flex items-center gap-1 rounded bg-midyaf-gold/15 px-1.5 py-0.5 text-[10px] font-black text-midyaf-gold ring-1 ring-midyaf-gold/30">
                <Maximize2 size={10} />
                <span>{isArabic ? "شاشة كاملة" : "Fullscreen"}</span>
              </span>
            )}
          </p>
          {icon ? (
            <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-midyaf-purple/20 to-midyaf-purple/5 text-midyaf-purple shadow-sm ring-1 ring-midyaf-gold/30 dark:from-midyaf-purple/40 dark:text-midyaf-gold-light group-hover:ring-midyaf-gold">
              {icon}
            </div>
          ) : null}
        </div>
        <div className="mt-3 text-3xl font-black tabular-nums tracking-tight text-midyaf-ink dark:text-white transition-colors group-hover:text-midyaf-gold">
          {value}
        </div>
        {detail ? (
          <div className="mt-1.5 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{detail}</span>
            {isClickable && (
              <span className="text-[10px] text-midyaf-gold font-bold opacity-80 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                <span>{isArabic ? "انقر للتوسيع" : "Click to expand"}</span>
                <span>↗</span>
              </span>
            )}
          </div>
        ) : null}
      </RoyalCard>
    </div>
  );
}

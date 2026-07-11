import type { ReactNode } from "react";
import { RoyalCard } from "./RoyalCard";

export function MetricCard({
  label,
  value,
  detail,
  icon
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: ReactNode;
}) {
  return (
    <RoyalCard tone="default" interactive={true} className="card-gradient-border animate-fadeInUp">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{label}</p>
        {icon ? (
          <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-midyaf-purple/20 to-midyaf-purple/5 text-midyaf-purple shadow-sm ring-1 ring-midyaf-gold/30 dark:from-midyaf-purple/40 dark:text-midyaf-gold-light">
            {icon}
          </div>
        ) : null}
      </div>
      <div className="mt-3 text-3xl font-black tabular-nums tracking-tight text-midyaf-ink dark:text-white">{value}</div>
      {detail ? <p className="mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{detail}</p> : null}
    </RoyalCard>
  );
}

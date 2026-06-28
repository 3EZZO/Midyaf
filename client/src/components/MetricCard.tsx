import type { ReactNode } from "react";

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
    <div className="glass-card card-hover-lift card-gradient-border animate-fadeInUp rounded-xl p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon ? (
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-midyaf-purple/15 to-midyaf-purple/5 text-midyaf-purple shadow-sm">
            {icon}
          </div>
        ) : null}
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-midyaf-ink">{value}</div>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

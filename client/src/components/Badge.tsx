import { clsx } from "clsx";
import type { ReactNode } from "react";

type Tone = "purple" | "gold" | "green" | "red" | "slate";

const tones: Record<Tone, string> = {
  purple: "bg-midyaf-purple/10 text-midyaf-purple ring-midyaf-purple/15 shadow-[0_2px_8px_rgba(45,10,95,0.10)]",
  gold: "bg-midyaf-gold/15 text-[#7A5D12] ring-midyaf-gold/30 shadow-[0_2px_8px_rgba(201,168,76,0.12)]",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100 shadow-[0_2px_8px_rgba(5,150,105,0.10)]",
  red: "bg-rose-50 text-rose-700 ring-rose-100 shadow-[0_2px_8px_rgba(220,38,38,0.10)]",
  slate: "bg-slate-100 text-slate-700 ring-slate-200"
};

export function Badge({
  children,
  tone = "slate",
  className
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide ring-1 animate-scaleIn",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

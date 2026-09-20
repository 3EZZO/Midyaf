import { clsx } from "clsx";
import type { ReactNode } from "react";

type Tone = "purple" | "gold" | "green" | "red" | "slate" | "blue";

const tones: Record<Tone, string> = {
  purple: "bg-midyaf-purple-light/30 text-white ring-white/10",
  gold: "bg-midyaf-gold/10 text-midyaf-gold ring-midyaf-gold/20",
  green: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  red: "bg-rose-500/10 text-rose-400 ring-rose-500/20",
  slate: "bg-white/5 text-slate-300 ring-white/10",
  blue: "bg-sky-500/10 text-sky-400 ring-sky-500/20"
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
        "inline-flex items-center gap-1 rounded px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold tracking-wide ring-1 animate-scaleIn",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

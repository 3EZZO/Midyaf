import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import type { StatusTone } from "@shared/statusMeta";

/**
 * Tone vocabulary: semantic tones (ok/warn/danger/info/neutral/gold) plus the
 * legacy names (purple/green/red/slate/blue) still used at ~77 call sites.
 */
export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-label ring-1 ring-inset whitespace-nowrap",
  {
    variants: {
      tone: {
        ok: "bg-ok/10 text-ok ring-ok/25",
        warn: "bg-warn/10 text-warn ring-warn/25",
        danger: "bg-danger/10 text-danger ring-danger/25",
        info: "bg-info/10 text-info ring-info/25",
        neutral: "bg-white/5 text-ink-muted ring-white/10",
        gold: "bg-gold-500/10 text-gold-300 ring-gold-500/25",
        // legacy aliases
        purple: "bg-surface-3 text-ink ring-white/10",
        green: "bg-ok/10 text-ok ring-ok/25",
        red: "bg-danger/10 text-danger ring-danger/25",
        slate: "bg-white/5 text-ink-muted ring-white/10",
        blue: "bg-info/10 text-info ring-info/25"
      },
      size: {
        sm: "px-1.5 py-0 text-xs",
        md: "px-2 py-0.5 text-xs",
        lg: "px-2.5 py-1 text-sm"
      }
    },
    defaultVariants: { tone: "neutral", size: "md" }
  }
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({
  children,
  tone,
  size,
  className,
  dot
}: {
  children: ReactNode;
  tone?: BadgeTone | StatusTone;
  size?: VariantProps<typeof badgeVariants>["size"];
  className?: string;
  /** Leading status dot. */
  dot?: boolean;
}) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

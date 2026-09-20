import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-hairline bg-surface-1 px-1.5",
        "font-mono text-xs font-medium text-ink-muted",
        className
      )}
      dir="ltr"
    >
      {children}
    </kbd>
  );
}

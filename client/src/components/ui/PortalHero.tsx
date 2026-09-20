import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Badge } from "./Badge";

/**
 * Page title block. No background — it sits directly on the page surface so
 * the first thing on screen is the title, not another card.
 */
export function PortalHero({
  badge,
  title,
  body,
  action,
  className
}: {
  badge?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4 py-2", className)}>
      <div className="min-w-0">
        {badge ? <Badge tone="gold">{badge}</Badge> : null}
        <h1 className="mt-3 text-display-sm text-ink">{title}</h1>
        {body ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{body}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

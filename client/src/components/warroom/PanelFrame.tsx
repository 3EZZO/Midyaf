import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { usePanelHighlight } from "./usePanelHighlight";

/**
 * One War Room panel: eyebrow title, optional trailing slot, scrollable
 * body. Subscribes to the director's `highlight(panelId)` and answers with a
 * gold ring — the only motion a panel frame ever does.
 */
export function PanelFrame({
  panelId,
  title,
  icon,
  trailing,
  children,
  className,
  bodyClassName
}: {
  panelId: string;
  title: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const highlighted = usePanelHighlight(panelId);
  return (
    <section
      data-panel={panelId}
      className={cn(
        "flex min-h-0 flex-col rounded-lg border border-hairline bg-surface-2/80 transition-shadow duration-slow",
        highlighted &&
          "border-gold-500/60 shadow-[0_0_0_1px_rgba(212,175,55,0.5),0_0_32px_rgba(212,175,55,0.25)]",
        className
      )}
    >
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-label text-ink-muted">
          {icon ? (
            <span className="text-gold-300 [&>svg]:size-3.5">{icon}</span>
          ) : null}
          <span className="truncate">{title}</span>
        </h3>
        {trailing ? (
          <div className="flex shrink-0 items-center gap-2 text-xs text-ink-muted">
            {trailing}
          </div>
        ) : null}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

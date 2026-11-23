import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import "../../styles/signature.css";
import { usePanelSpotlight, type PanelSpotlightState } from "./usePanelHighlight";

/**
 * One War Room panel: eyebrow title, optional trailing slot, scrollable body.
 * Subscribes to the director's `demo:highlight(panelId)`: the focused panel
 * illuminates with a brass hairline & halo while sibling panels dim 20%.
 */
export function PanelFrame({
  panelId,
  title,
  icon,
  trailing,
  children,
  spotlightOverride,
  className,
  bodyClassName
}: {
  panelId: string;
  title: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  /** Optional override for SSR tests or static previews. */
  spotlightOverride?: PanelSpotlightState;
  className?: string;
  bodyClassName?: string;
}) {
  const liveSpotlight = usePanelSpotlight(panelId);
  const spotlight = spotlightOverride ?? liveSpotlight;

  return (
    <section
      data-panel={panelId}
      data-panel-spotlight={spotlight}
      className={cn(
        "qasr-warroom-panel relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-hairline bg-surface-2/85",
        className
      )}
    >
      {spotlight === "focused" ? (
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-gold-500 to-transparent"
          aria-hidden
        />
      ) : null}
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-label text-ink-muted rtl:normal-case rtl:tracking-normal">
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

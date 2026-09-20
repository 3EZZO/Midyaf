import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function SectionHeader({
  title,
  eyebrow,
  description,
  action,
  className
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-label text-gold-500">{eyebrow}</p>
        ) : null}
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-ink">
          <span className="inline-block size-1.5 rounded-full bg-gold-500" aria-hidden />
          <span className="truncate">{title}</span>
        </h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Content section: surface-2 panel with a titled header. Same signature as the legacy Section. */
export function Section({
  title,
  eyebrow,
  description,
  action,
  children,
  id,
  className,
  bodyClassName
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      id={id}
      className={cn("rounded-lg border border-hairline bg-surface-2 p-5 shadow-sm scroll-mt-24", className)}
    >
      <SectionHeader title={title} eyebrow={eyebrow} description={description} action={action} />
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

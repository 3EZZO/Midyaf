import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { sectionStorageKey, usePersistedCollapse } from "../../lib/collapsibleStorage";
import { isArabicLanguage } from "../../lib/localize";

export function sectionToggleCopy(collapsed: boolean, isArabic: boolean) {
  return collapsed
    ? isArabic
      ? "توسيع القسم"
      : "Expand section"
    : isArabic
      ? "طي القسم"
      : "Collapse section";
}

export function SectionHeader({
  title,
  eyebrow,
  description,
  action,
  className,
  collapsible = false,
  collapsed = false,
  bodyId,
  onToggle,
  isArabic
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  bodyId?: string;
  onToggle?: () => void;
  isArabic?: boolean;
}) {
  const { i18n } = useTranslation();
  const ar = isArabic ?? isArabicLanguage(i18n?.language);
  const toggleLabel = sectionToggleCopy(collapsed, ar);

  const headingContent = (
    <>
      <span className="inline-block size-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />
      <span className="truncate">{title}</span>
    </>
  );

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4",
        collapsed ? "mb-0" : "mb-5",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-label text-gold-500">{eyebrow}</p>
        ) : null}
        <h2 className="text-base font-bold tracking-tight text-ink">
          {collapsible && onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              aria-label={typeof title === "string" ? `${toggleLabel}: ${title}` : toggleLabel}
              title={toggleLabel}
              data-section-toggle
              className={cn(
                "group/sec-btn inline-flex max-w-full items-center gap-2 rounded-md text-start text-ink",
                "transition-colors duration-base hover:text-gold-300",
                "focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
              )}
            >
              {headingContent}
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-ink-muted transition-transform duration-base ease-out group-hover/sec-btn:text-gold-500 motion-reduce:transition-none",
                  collapsed && "-rotate-90 rtl:rotate-90"
                )}
                aria-hidden
              />
            </button>
          ) : (
            <span className="flex items-center gap-2">{headingContent}</span>
          )}
        </h2>
        {description && !collapsed ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * Content section: surface-2 panel with a titled, collapsible header.
 * Persists collapsed state under `midyaf.section.<storageId ?? id>` when an id is provided.
 */
export function Section({
  title,
  eyebrow,
  description,
  action,
  children,
  id,
  storageId,
  collapsible = true,
  defaultCollapsed = false,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  isArabic,
  className,
  bodyClassName
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  /** Optional explicit persistence id; defaults to `id` when omitted. */
  storageId?: string;
  /** Whether the section can be collapsed by the user (default: true). */
  collapsible?: boolean;
  /** Initial collapsed state when no persisted preference exists (default: false). */
  defaultCollapsed?: boolean;
  /** Controlled collapsed state override. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Explicit Arabic flag override for toggle labels/tooltips. */
  isArabic?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const reactId = useId();
  const persistTarget = storageId ?? id;
  const storageKey = collapsible && persistTarget ? sectionStorageKey(persistTarget) : null;
  const persisted = usePersistedCollapse(storageKey, defaultCollapsed);
  const isCollapsed = collapsible ? (controlledCollapsed ?? persisted.collapsed) : false;
  const bodyId = `${id ?? `section-${reactId.replace(/:/g, "")}`}-body`;

  const handleToggle = () => {
    const next = !isCollapsed;
    if (controlledCollapsed === undefined) {
      persisted.setCollapsed(next);
    }
    onCollapsedChange?.(next);
  };

  return (
    <section
      id={id}
      data-section-collapsed={collapsible ? (isCollapsed ? "true" : "false") : undefined}
      className={cn(
        "rounded-lg border border-hairline bg-surface-2 p-5 shadow-sm scroll-mt-24",
        className
      )}
    >
      <SectionHeader
        title={title}
        eyebrow={eyebrow}
        description={description}
        action={action}
        collapsible={collapsible}
        collapsed={isCollapsed}
        bodyId={bodyId}
        onToggle={collapsible ? handleToggle : undefined}
        isArabic={isArabic}
      />
      <div
        id={bodyId}
        aria-hidden={isCollapsed || undefined}
        className={cn(
          "grid transition-[grid-template-rows,opacity,visibility] duration-base ease-out motion-reduce:transition-none",
          isCollapsed ? "grid-rows-[0fr] opacity-0 invisible" : "grid-rows-[1fr] opacity-100 visible"
        )}
      >
        <div className={cn("overflow-hidden", bodyClassName)}>{children}</div>
      </div>
    </section>
  );
}

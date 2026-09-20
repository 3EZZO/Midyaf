import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { isArabicLanguage } from "../../lib/localize";

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
  className
}: {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className
      )}
    >
      <span
        className={cn(
          "grid place-items-center rounded-lg border border-hairline bg-surface-1 text-ink-faint",
          compact ? "size-9" : "size-12"
        )}
        aria-hidden
      >
        {icon ?? <Inbox className={compact ? "size-4" : "size-5"} />}
      </span>
      <p className={cn("font-semibold text-ink", compact ? "text-sm" : "text-base")}>
        {title ?? (isArabic ? "لا توجد بيانات بعد" : "Nothing here yet")}
      </p>
      {description ? <p className="max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

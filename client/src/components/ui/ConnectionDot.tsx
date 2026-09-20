import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { isArabicLanguage } from "../../lib/localize";
import { useSocketContext, type SocketStatus } from "../../lib/useSocket";
import { Tooltip } from "./Tooltip";

const meta: Record<SocketStatus, { color: string; en: string; ar: string; pulse?: boolean }> = {
  idle: { color: "bg-neutral", en: "Not connected", ar: "غير متصل" },
  connecting: { color: "bg-warn", en: "Connecting…", ar: "جارٍ الاتصال…", pulse: true },
  connected: { color: "bg-ok", en: "Live", ar: "مباشر", pulse: true },
  reconnecting: { color: "bg-warn", en: "Reconnecting…", ar: "إعادة الاتصال…", pulse: true },
  offline: { color: "bg-danger", en: "Offline", ar: "غير متصل بالخادم" }
};

/** Live-connection indicator. Reads the single socket's status from context. */
export function ConnectionDot({ showLabel = false, className }: { showLabel?: boolean; className?: string }) {
  const { status } = useSocketContext();
  const { i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const m = meta[status];
  const label = isArabic ? m.ar : m.en;

  const dot = (
    <span className="relative inline-flex size-2.5" aria-hidden>
      {m.pulse ? <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", m.color)} /> : null}
      <span className={cn("relative inline-flex size-2.5 rounded-full", m.color)} />
    </span>
  );

  return (
    <Tooltip content={label}>
      <span
        role="status"
        aria-label={label}
        className={cn("inline-flex items-center gap-2 text-xs font-medium text-ink-muted", className)}
      >
        {dot}
        {showLabel ? <span>{label}</span> : null}
      </span>
    </Tooltip>
  );
}

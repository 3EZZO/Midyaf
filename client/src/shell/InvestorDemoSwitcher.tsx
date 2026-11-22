import { useEffect, useId, useRef, useState } from "react";
import { BookmarkCheck, Check, ChevronDown, RotateCcw, Sparkles } from "lucide-react";
import type { DemoPersonaDto, DemoStatusDto } from "@shared/demo";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { cn } from "../lib/cn";
import { activePersonaForStatus, formatDemoTimestamp } from "../lib/investorDemoApi";
import { portalIcons } from "./portalMeta";

/**
 * SIX-TASKS #6: Compact top-bar Investor Demo persona switcher + discreet
 * Baseline Save & Reset controls (each guarded by an in-app confirmation modal,
 * never window.confirm). Works in AR/RTL and EN/LTR on desktop and mobile (390px).
 */
export function InvestorDemoSwitcher({
  status,
  isArabic,
  busy = false,
  defaultOpen = false,
  onSwitchPersona,
  onCaptureBaseline,
  onResetDemo
}: {
  status: DemoStatusDto | null | undefined;
  isArabic: boolean;
  busy?: boolean;
  /** Allows SSR tests to render the expanded menu state directly. */
  defaultOpen?: boolean;
  onSwitchPersona: (persona: DemoPersonaDto) => Promise<void> | void;
  onCaptureBaseline: () => Promise<void> | void;
  onResetDemo: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [confirmKind, setConfirmKind] = useState<"reset" | "baseline" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = `investor-demo-menu-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!status || !status.enabled || !status.canSwitch) return null;

  const active = activePersonaForStatus(status);
  const activeLabel = active
    ? isArabic
      ? active.labelAr
      : active.labelEn
    : isArabic
      ? "العرض المباشر"
      : "Investor Demo";
  const lastResetLabel = formatDemoTimestamp(status.lastResetAt, isArabic);
  const baselineLabel = formatDemoTimestamp(status.baselineCapturedAt, isArabic);
  const hasBaseline = Boolean(status.baselineCapturedAt);
  const canResetNow = hasBaseline && status.canReset;

  return (
    <div ref={containerRef} className="relative" data-investor-demo-switcher>
      <button
        type="button"
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        data-investor-demo-trigger
        title={isArabic ? `العرض المباشر · ${activeLabel}` : `Investor Demo · ${activeLabel}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-8 max-w-[148px] items-center gap-1.5 rounded-lg border border-gold-500/40 bg-gold-500/10 px-2.5 text-xs font-semibold text-gold-300",
          "transition-colors duration-base hover:border-gold-500/70 hover:bg-gold-500/20",
          "focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50 motion-reduce:transition-none sm:max-w-[230px]"
        )}
      >
        <Sparkles className="size-3.5 shrink-0 text-gold-500" aria-hidden />
        <span className="hidden shrink-0 text-[11px] uppercase tracking-wider text-gold-500 md:inline">
          {isArabic ? "العرض" : "Demo"}
        </span>
        <span className="min-w-0 truncate text-ink">{activeLabel}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-gold-500 transition-transform duration-base motion-reduce:transition-none",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={isArabic ? "مبدّل أدوار العرض المباشر" : "Investor Demo switcher"}
          data-investor-demo-menu
          className={cn(
            "fixed inset-x-3 top-16 z-palette rounded-lg border border-hairline bg-surface-2 p-2 shadow-dropdown",
            "sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-80"
          )}
        >
          <div className="border-b border-hairline px-2 pb-2 pt-1">
            <p className="flex items-center gap-1.5 text-xs font-bold text-gold-500">
              <Sparkles className="size-3.5" aria-hidden />
              {isArabic ? "العرض المباشر للمستثمرين" : "Investor Demo"}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {status.origin
                ? isArabic
                  ? `تبديل فوري دون خروج · بإدارة ${status.origin.name}`
                  : `Instant role switch · Host: ${status.origin.name}`
                : isArabic
                  ? "انتقل فوراً لأي دور دون تسجيل خروج"
                  : "Switch instantly to any role without logging out"}
            </p>
          </div>

          <ul className="my-1.5 max-h-72 space-y-0.5 overflow-y-auto" role="none">
            {status.personas.map((persona) => {
              const Icon = portalIcons[persona.portal];
              const isActive = persona.key === status.activePersona;
              const label = isArabic ? persona.labelAr : persona.labelEn;
              return (
                <li key={persona.key} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    disabled={!persona.available || busy}
                    data-demo-persona={persona.key}
                    onClick={() => {
                      setOpen(false);
                      void onSwitchPersona(persona);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-xs",
                      "transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
                      isActive
                        ? "bg-surface-3 font-semibold text-ink ring-1 ring-inset ring-gold-500/40"
                        : "text-ink-muted hover:bg-white/5 hover:text-ink"
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", isActive ? "text-gold-500" : "text-ink-muted")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{label}</span>
                      {!persona.available ? (
                        <span className="block text-[11px] text-ink-faint">
                          {isArabic ? "غير متاح في قاعدة البيانات" : "Unavailable"}
                        </span>
                      ) : null}
                    </span>
                    {isActive ? <Check className="size-3.5 shrink-0 text-gold-500" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="space-y-1.5 border-t border-hairline px-1 pt-2">
            {baselineLabel ? (
              <p className="px-1.5 text-[11px] text-ink-faint" data-demo-baseline-at>
                {isArabic ? `نقطة العرض المحفوظة: ${baselineLabel}` : `Saved start point: ${baselineLabel}`}
              </p>
            ) : null}
            {lastResetLabel ? (
              <p className="px-1.5 text-[11px] text-ink-faint" data-demo-last-reset>
                {isArabic ? `آخر إعادة ضبط: ${lastResetLabel}` : `Last reset: ${lastResetLabel}`}
              </p>
            ) : null}

            <button
              type="button"
              role="menuitem"
              disabled={busy}
              data-demo-baseline-trigger
              onClick={() => {
                setOpen(false);
                setConfirmKind("baseline");
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-xs font-medium text-ink-muted",
                "transition-colors duration-base hover:bg-white/5 hover:text-ink focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-40 motion-reduce:transition-none"
              )}
            >
              <BookmarkCheck className="size-3.5 shrink-0 text-gold-500" aria-hidden />
              <span className="truncate">
                {isArabic ? "حفظ الحالة الحالية كنقطة العرض" : "Save current state as demo start point"}
              </span>
            </button>

            {canResetNow ? (
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                data-demo-reset-trigger
                onClick={() => {
                  setOpen(false);
                  setConfirmKind("reset");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-xs font-medium text-danger",
                  "transition-colors duration-base hover:bg-danger/10 focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-40 motion-reduce:transition-none"
                )}
              >
                <RotateCcw className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {isArabic ? "إعادة ضبط بيانات العرض" : "Reset Demo Data"}
                </span>
              </button>
            ) : !hasBaseline ? (
              <p
                data-demo-reset-unavailable
                className="rounded-md bg-surface-1 px-2.5 py-1.5 text-[11px] text-ink-faint"
              >
                {isArabic
                  ? "إعادة الضبط غير متاحة: احفظ نقطة البداية أولاً"
                  : "Reset unavailable: save a start point first"}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* In-app confirmation modal for saving demo baseline */}
      <Dialog
        open={confirmKind === "baseline"}
        onOpenChange={(next) => {
          if (!next) setConfirmKind(null);
        }}
        size="sm"
        title={isArabic ? "حفظ الحالة الحالية كنقطة العرض" : "Save current state as demo start point"}
        description={
          isArabic
            ? "سيتم اعتماد البيانات الحالية كمرجع تعود إليه المنصة عند تنفيذ «إعادة ضبط بيانات العرض» لاحقاً."
            : "The current workspace data will become the snapshot every future “Reset Demo Data” returns to."
        }
        closeLabel={isArabic ? "إغلاق" : "Close"}
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmKind(null)}>
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              variant="gold"
              loading={busy}
              data-demo-baseline-confirm
              onClick={async () => {
                await onCaptureBaseline();
                setConfirmKind(null);
              }}
            >
              {isArabic ? "تأكيد الحفظ" : "Save start point"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">
          {isArabic
            ? "تأكد من جاهزية الفعاليات والخطط قبل حفظ نقطة البداية للعرض."
            : "Make sure your demo events and plans look ready before saving this baseline."}
        </p>
      </Dialog>

      {/* In-app confirmation modal for resetting demo data */}
      <Dialog
        open={confirmKind === "reset"}
        onOpenChange={(next) => {
          if (!next) setConfirmKind(null);
        }}
        size="sm"
        title={isArabic ? "إعادة ضبط بيانات العرض" : "Reset Demo Data"}
        description={
          isArabic
            ? "ستُستعاد جميع بيانات العرض إلى نقطة البداية المحفوظة، وسيتم تحديث جميع الشاشات المفتوحة."
            : "All demo changes will be rolled back to the saved start point and open views will refresh."
        }
        closeLabel={isArabic ? "إغلاق" : "Close"}
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmKind(null)}>
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={busy}
              data-demo-reset-confirm
              onClick={async () => {
                await onResetDemo();
                setConfirmKind(null);
              }}
            >
              {isArabic ? "تأكيد إعادة الضبط" : "Reset demo data"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">
          {baselineLabel
            ? isArabic
              ? `سيتم الرجوع إلى نقطة البداية المحفوظة بتاريخ ${baselineLabel}.`
              : `This will restore the start point saved at ${baselineLabel}.`
            : isArabic
              ? "هل تريد بالتأكيد إعادة ضبط بيانات العرض الآن؟"
              : "Are you sure you want to reset demo data now?"}
        </p>
      </Dialog>
    </div>
  );
}

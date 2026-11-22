import { useEffect, useId, useRef, useState } from "react";
import { BookmarkCheck, Check, ChevronDown, Keyboard, RotateCcw, Sparkles } from "lucide-react";
import type { DemoPersonaDto, DemoPersonaKey, DemoStatusDto } from "@shared/demo";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { cn } from "../lib/cn";
import { activePersonaForStatus, formatDemoTimestamp } from "../lib/investorDemoApi";
import { portalIcons } from "./portalMeta";

export type DemoResetPhase = "idle" | "restoring" | "refreshing";

const PERSONA_SCOPE_COPY: Record<DemoPersonaKey, { en: string; ar: string }> = {
  admin: {
    en: "Full platform governance · Audits, approvals & contracts",
    ar: "حوكمة شاملة للمنصة · التدقيق، الاعتمادات وخزنة العقود"
  },
  company: {
    en: "Organizing company admin · Events, plans & team access",
    ar: "مدير الشركة المنظمة · الفعاليات، الخطط وصلاحيات الفريق"
  },
  eventLead: {
    en: "Assigned organizer events · AI plan editing & RFQ dispatch",
    ar: "الفعاليات المسندة · تعديل الخطة الذكية وإرسال طلبات التسعير"
  },
  logistics: {
    en: "Operations command · Fleet telemetry, dispatch & War Room",
    ar: "قيادة العمليات · تتبع الأسطول، التوزيع وغرفة العمليات"
  },
  client: {
    en: "Client-scoped events · One-click approval · Vendor quotes hidden",
    ar: "فعاليات العميل فقط · اعتماد بضغطة واحدة · عروض الموردين مخفية"
  },
  supplier: {
    en: "Category RFQs & sealed quotes only · Event names & plans hidden",
    ar: "طلبات التسعير والعروض المختومة فقط · أسماء الفعاليات والخطط مخفية"
  },
  coordinator: {
    en: "Field zone supervision · Ground protocol & incident relay",
    ar: "إشراف ميداني · بروتوكول الاستقبال وتنسيق الحركة"
  },
  driver: {
    en: "Captain field view · Assigned trips, manifest & live GPS",
    ar: "واجهة الكابتن الميدانية · الرحلات المسندة، البيان والموقع المباشر"
  },
  guestVip: {
    en: "VIP guest experience · Digital arrival pass & chauffeur ETA",
    ar: "تجربة ضيف كبار الشخصيات · بطاقة الوصول وتتبع الكابتن"
  }
};

export function demoPersonaScopeCopy(key: DemoPersonaKey | null | undefined, isArabic: boolean): string {
  if (!key) return "";
  const entry = PERSONA_SCOPE_COPY[key];
  return isArabic ? entry.ar : entry.en;
}

/** Returns true when keyboard input belongs to a form control, editable region, or modal dialog. */
export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
    closest?: (selector: string) => unknown;
  };
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.("role");
  if (role === "textbox" || role === "combobox" || role === "searchbox") return true;
  if (typeof el.closest === "function") {
    if (el.closest('[contenteditable="true"], [role="textbox"], [role="dialog"]')) return true;
  }
  return false;
}

export type PersonaHotkeyEventLike = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target: EventTarget | null;
};

/**
 * Pure resolver for 1–9 Investor Demo persona hotkeys.
 * Ignored while typing in inputs, when modifiers are held, when busy/disabled,
 * or when the target persona is unavailable or already active.
 */
export function resolvePersonaHotkey(
  event: PersonaHotkeyEventLike,
  personas: DemoPersonaDto[],
  activePersona: DemoPersonaKey | null,
  options: { busy?: boolean; disabled?: boolean } = {}
): DemoPersonaDto | null {
  if (options.busy || options.disabled) return null;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  if (isEditableEventTarget(event.target)) return null;
  if (!/^[1-9]$/.test(event.key)) return null;
  const idx = Number(event.key) - 1;
  const persona = personas[idx];
  if (!persona || !persona.available || persona.key === activePersona) return null;
  return persona;
}

/**
 * Qasr Obsidian P2 / SIX-TASKS #6:
 * Compact top-bar Investor Demo persona switcher with 2-column grid,
 * 1–9 keyboard hotkeys, and discreet Baseline Save & Reset controls
 * (guarded by in-app confirmation dialogs, never window.confirm).
 * Strictly >= 12px typography and logical RTL/LTR spacing.
 */
export function InvestorDemoSwitcher({
  status,
  isArabic,
  busy = false,
  hotkeysDisabled = false,
  defaultOpen = false,
  onSwitchPersona,
  onCaptureBaseline,
  onResetDemo
}: {
  status: DemoStatusDto | null | undefined;
  isArabic: boolean;
  busy?: boolean;
  /** Disable 1–9 global hotkeys while overlays like War Room or QuickNav are active. */
  hotkeysDisabled?: boolean;
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

  const enabled = Boolean(status && status.enabled && status.canSwitch);

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

  // Global 1–9 persona switch hotkeys (ignored while typing or while dialogs/overlays are open).
  useEffect(() => {
    if (!enabled || !status) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const matched = resolvePersonaHotkey(event, status.personas, status.activePersona, {
        busy,
        disabled: hotkeysDisabled || confirmKind !== null
      });
      if (!matched) return;
      event.preventDefault();
      setOpen(false);
      void onSwitchPersona(matched);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, status, busy, hotkeysDisabled, confirmKind, onSwitchPersona]);

  if (!enabled || !status) return null;

  const active = activePersonaForStatus(status);
  const activeLabel = active
    ? isArabic
      ? active.labelAr
      : active.labelEn
    : isArabic
      ? "العرض المباشر"
      : "Investor Demo";
  const ActiveIcon = active ? portalIcons[active.portal] : Sparkles;
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
          "inline-flex h-9 max-w-[148px] items-center gap-1.5 rounded-lg border border-gold-500/40 bg-gold-500/10 px-2.5 text-xs font-semibold text-gold-300",
          "transition-colors duration-base hover:border-gold-500/70 hover:bg-gold-500/20",
          "focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50 motion-reduce:transition-none sm:max-w-[236px]"
        )}
      >
        <ActiveIcon className="size-3.5 shrink-0 text-gold-500" strokeWidth={1.6} aria-hidden />
        <span
          className={cn(
            "hidden shrink-0 text-xs font-semibold text-gold-500 2xl:inline",
            !isArabic && "uppercase tracking-wider"
          )}
        >
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
            "fixed inset-x-3 top-16 z-palette rounded-lg border border-hairline bg-surface-2 p-2.5 shadow-dropdown",
            "sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-[29rem]"
          )}
        >
          <div className="flex items-start justify-between gap-2 border-b border-hairline px-1.5 pb-2.5 pt-0.5">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-bold text-gold-500">
                <Sparkles className="size-3.5 shrink-0" aria-hidden />
                {isArabic ? "العرض المباشر للمستثمرين" : "Investor Demo"}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {status.origin
                  ? isArabic
                    ? `تبديل فوري دون خروج · بإدارة ${status.origin.name}`
                    : `Instant role switch · Host: ${status.origin.name}`
                  : isArabic
                    ? "انتقل فوراً لأي دور دون تسجيل خروج"
                    : "Switch instantly to any role without logging out"}
              </p>
            </div>
            <span
              className="hidden shrink-0 items-center gap-1 rounded-md border border-hairline bg-surface-1 px-2 py-1 text-xs font-medium text-ink-muted sm:inline-flex"
              dir="ltr"
              data-demo-hotkey-hint
            >
              <Keyboard className="size-3.5 text-gold-500" aria-hidden />
              1–9
            </span>
          </div>

          <ul
            className="my-2 grid max-h-80 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2"
            role="none"
            data-demo-persona-grid
          >
            {status.personas.map((persona, index) => {
              const Icon = portalIcons[persona.portal];
              const isActive = persona.key === status.activePersona;
              const label = isArabic ? persona.labelAr : persona.labelEn;
              const hotkey = index < 9 ? String(index + 1) : null;
              return (
                <li key={persona.key} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    disabled={!persona.available || busy}
                    data-demo-persona={persona.key}
                    data-demo-hotkey={hotkey ?? undefined}
                    onClick={() => {
                      setOpen(false);
                      void onSwitchPersona(persona);
                    }}
                    className={cn(
                      "flex h-full w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-start text-xs",
                      "transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
                      isActive
                        ? "border-gold-500/45 bg-surface-3 font-semibold text-ink"
                        : "border-transparent bg-surface-1/60 text-ink-muted hover:border-hairline hover:bg-surface-3/70 hover:text-ink"
                    )}
                  >
                    <Icon
                      className={cn("size-4 shrink-0", isActive ? "text-gold-500" : "text-ink-muted")}
                      strokeWidth={1.6}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{label}</span>
                      {!persona.available ? (
                        <span className="block text-xs text-ink-faint">
                          {isArabic ? "غير متاح في قاعدة البيانات" : "Unavailable"}
                        </span>
                      ) : null}
                    </span>
                    {isActive ? (
                      <Check className="size-3.5 shrink-0 text-gold-500" aria-hidden />
                    ) : hotkey ? (
                      <kbd
                        dir="ltr"
                        className="hidden size-5 shrink-0 place-items-center rounded border border-hairline bg-surface-2 font-mono text-xs text-ink-faint sm:grid"
                        aria-hidden
                      >
                        {hotkey}
                      </kbd>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="space-y-1.5 border-t border-hairline px-1 pt-2">
            {baselineLabel ? (
              <p className="px-1.5 text-xs text-ink-faint" data-demo-baseline-at>
                {isArabic ? `نقطة العرض المحفوظة: ${baselineLabel}` : `Saved start point: ${baselineLabel}`}
              </p>
            ) : null}
            {lastResetLabel ? (
              <p className="px-1.5 text-xs text-ink-faint" data-demo-last-reset>
                {isArabic ? `آخر إعادة ضبط: ${lastResetLabel}` : `Last reset: ${lastResetLabel}`}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
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
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start text-xs font-medium text-ink-muted",
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
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start text-xs font-medium text-danger",
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
                  className="rounded-md bg-surface-1 px-2.5 py-2 text-xs text-ink-faint"
                >
                  {isArabic
                    ? "إعادة الضبط غير متاحة: احفظ نقطة البداية أولاً"
                    : "Reset unavailable: save a start point first"}
                </p>
              ) : null}
            </div>
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
              onClick={() => {
                setConfirmKind(null);
                void onResetDemo();
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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";

export type ToastType = "success" | "info" | "warning" | "alert";

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  type?: ToastType;
  duration?: number;
  /** Persistent toasts (or duration === 0) survive transient locale clears (e.g. PWA update). */
  persistent?: boolean;
  /** Optional call-to-action rendered as a button inside the toast. */
  action?: { label: string; onClick: () => void };
}

export type ToastInput = Omit<ToastItem, "id"> & { id?: string };

export interface ToastApi {
  show: (toast: ToastInput) => void;
  success: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  alert: (title: string, message?: string) => void;
  dismiss: (id: string) => void;
  /** Dismisses transient toasts (e.g. on language switch) while keeping persistent toasts intact. */
  clearTransient: () => void;
}

const MAX_VISIBLE_TOASTS = 4;

export function isPersistentToast(toast: Pick<ToastItem, "persistent" | "duration">): boolean {
  return Boolean(toast.persistent) || toast.duration === 0;
}

/**
 * Pure toast-list updater: replaces an existing toast with the same `id` in place
 * (deduplication), otherwise appends while capping the stack to MAX_VISIBLE_TOASTS
 * without evicting persistent toasts when avoidable.
 */
export function upsertToastList(prev: ToastItem[], next: ToastItem): ToastItem[] {
  const existingIndex = prev.findIndex((item) => item.id === next.id);
  if (existingIndex >= 0) {
    return prev.map((item, idx) => (idx === existingIndex ? next : item));
  }
  const combined = [...prev, next];
  if (combined.length <= MAX_VISIBLE_TOASTS) return combined;

  // Drop oldest non-persistent toast first so persistent notices (like PWA updates) survive.
  const result = [...combined];
  while (result.length > MAX_VISIBLE_TOASTS) {
    const dropIdx = result.findIndex((item) => !isPersistentToast(item));
    if (dropIdx >= 0) {
      result.splice(dropIdx, 1);
    } else {
      result.shift();
    }
  }
  return result;
}

/** Retains only persistent toasts (e.g. PWA update prompt) when clearing transient notices on locale switch. */
export function retainPersistentToasts(prev: ToastItem[]): ToastItem[] {
  return prev.filter((item) => isPersistentToast(item));
}

const ToastContext = createContext<ToastApi | null>(null);

const styles: Record<ToastType, { icon: typeof Info; ring: string; color: string }> = {
  success: { icon: CheckCircle2, ring: "border-ok/40", color: "text-ok" },
  info: { icon: Info, ring: "border-gold-500/40", color: "text-gold-500" },
  warning: { icon: AlertTriangle, ring: "border-warn/40", color: "text-warn" },
  alert: { icon: ShieldAlert, ring: "border-danger/40", color: "text-danger" }
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reduced = useReducedMotion();

  const clearTimer = useCallback((id: string) => {
    const handle = timersRef.current.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      timersRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const handle of timers.values()) clearTimeout(handle);
      timers.clear();
    };
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const clearTransient = useCallback(() => {
    setToasts((prev) => {
      for (const item of prev) {
        if (!isPersistentToast(item)) clearTimer(item.id);
      }
      return retainPersistentToasts(prev);
    });
  }, [clearTimer]);

  const show = useCallback(
    ({
      id: explicitId,
      title,
      message,
      type = "success",
      duration = 3400,
      persistent,
      action
    }: ToastInput) => {
      const id = explicitId ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const item: ToastItem = {
        id,
        title,
        message,
        type,
        duration,
        persistent: persistent ?? duration === 0,
        action
      };
      clearTimer(id);
      setToasts((prev) => upsertToastList(prev, item));
      if (duration > 0) {
        const handle = setTimeout(() => {
          timersRef.current.delete(id);
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
        timersRef.current.set(id, handle);
      }
    },
    [clearTimer]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      clearTransient,
      success: (title, message) => show({ title, message, type: "success" }),
      info: (title, message) => show({ title, message, type: "info" }),
      warning: (title, message) => show({ title, message, type: "warning" }),
      alert: (title, message) => show({ title, message, type: "alert", duration: 6000 })
    }),
    [show, dismiss, clearTransient]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <aside
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-6 end-6 z-toast flex w-[calc(100vw-2rem)] max-w-md flex-col gap-2.5"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const s = styles[toast.type ?? "success"];
            const Icon = s.icon;
            return (
              <motion.div
                key={toast.id}
                layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                role="status"
                data-toast-id={toast.id}
                className={cn(
                  "pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface-2/95 p-3.5 shadow-dropdown backdrop-blur",
                  s.ring
                )}
              >
                <Icon className={cn("mt-0.5 size-5 shrink-0", s.color)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-ink">{toast.title}</p>
                  {toast.message ? (
                    <p className="mt-0.5 break-words text-xs leading-relaxed text-ink-muted">
                      {toast.message}
                    </p>
                  ) : null}
                  {toast.action ? (
                    <button
                      type="button"
                      onClick={() => {
                        toast.action?.onClick();
                        dismiss(toast.id);
                      }}
                      className="mt-2 inline-flex h-8 items-center rounded-lg bg-gold-500 px-3 text-xs font-semibold text-surface-0 transition-colors hover:bg-gold-300 focus-visible:outline-none focus-visible:shadow-focus"
                    >
                      {toast.action.label}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss"
                  className="grid size-7 shrink-0 place-items-center rounded text-ink-faint transition-colors hover:text-ink focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <X className="size-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </aside>
    </ToastContext.Provider>
  );
}

const noop: ToastApi = {
  show: () => {},
  success: () => {},
  info: () => {},
  warning: () => {},
  alert: () => {},
  dismiss: () => {},
  clearTransient: () => {}
};

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? noop;
}

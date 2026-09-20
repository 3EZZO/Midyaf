import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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
}

export interface ToastApi {
  show: (toast: Omit<ToastItem, "id">) => void;
  success: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  alert: (title: string, message?: string) => void;
  dismiss: (id: string) => void;
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
  const reduced = useReducedMotion();

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    ({ title, message, type = "success", duration = 3400 }: Omit<ToastItem, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, message, type, duration }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (title, message) => show({ title, message, type: "success" }),
      info: (title, message) => show({ title, message, type: "info" }),
      warning: (title, message) => show({ title, message, type: "warning" }),
      alert: (title, message) => show({ title, message, type: "alert", duration: 6000 })
    }),
    [show, dismiss]
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
                className={cn(
                  "pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface-2/95 p-3.5 shadow-dropdown backdrop-blur",
                  s.ring
                )}
              >
                <Icon className={cn("mt-0.5 size-5 shrink-0", s.color)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-ink">{toast.title}</p>
                  {toast.message ? <p className="mt-0.5 break-words text-xs leading-relaxed text-ink-muted">{toast.message}</p> : null}
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

const noop: ToastApi = { show: () => {}, success: () => {}, info: () => {}, warning: () => {}, alert: () => {}, dismiss: () => {} };

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? noop;
}

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, ShieldCheck, X } from "lucide-react";
import { tacticalAudio } from "../lib/tacticalAudio";

export type ToastType = "success" | "info" | "warning" | "alert";

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  type?: ToastType;
  duration?: number;
}

interface ToastContextType {
  show: (toast: Omit<ToastItem, "id">) => void;
  success: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  alert: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function TacticalToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    ({ title, message, type = "success", duration = 3400 }: Omit<ToastItem, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newToast: ToastItem = { id, title, message, type, duration };

      setToasts((prev) => [...prev.slice(-3), newToast]); // keep at most 4 toasts

      // Play tactical audio cue
      if (type === "success") {
        tacticalAudio.playChime();
      } else if (type === "alert" || type === "warning") {
        tacticalAudio.playAlert();
      } else {
        tacticalAudio.playTacticalPing();
      }

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }
    },
    [dismiss]
  );

  const success = useCallback(
    (title: string, message?: string) => show({ title, message, type: "success" }),
    [show]
  );
  const info = useCallback(
    (title: string, message?: string) => show({ title, message, type: "info" }),
    [show]
  );
  const warning = useCallback(
    (title: string, message?: string) => show({ title, message, type: "warning" }),
    [show]
  );
  const alert = useCallback(
    (title: string, message?: string) => show({ title, message, type: "alert" }),
    [show]
  );

  return (
    <ToastContext.Provider value={{ show, success, info, warning, alert }}>
      {children}
      {/* Toast Render Portal */}
      <aside
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-6 right-6 z-[99999] flex flex-col gap-2.5 max-w-md w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isWarning = toast.type === "warning";
          const isAlert = toast.type === "alert";

          const borderColor = isAlert
            ? "border-rose-500/50 shadow-[0_8px_32px_rgba(244,63,94,0.25)]"
            : isWarning
            ? "border-amber-500/50 shadow-[0_8px_32px_rgba(245,158,11,0.25)]"
            : "border-[#C9A84C]/45 shadow-[0_8px_32px_rgba(45,10,95,0.45)]";

          return (
            <div
              key={toast.id}
              role="alert"
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl bg-[#131020]/95 backdrop-blur-xl border ${borderColor} text-[#F0EDE6] transition-all duration-300 animate-in fade-in slide-in-from-bottom-3`}
            >
              <div className="shrink-0 mt-0.5">
                {isAlert ? (
                  <AlertTriangle className="w-5 h-5 text-rose-400 animate-pulse" />
                ) : isWarning ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                ) : isSuccess ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-[#C9A84C]" />
                )}
              </div>

              <div className="flex-1 min-w-0 pr-1">
                <p className="text-xs font-bold tracking-wide text-white leading-snug">
                  {toast.title}
                </p>
                {toast.message && (
                  <p className="text-[11px] text-[#F0EDE6]/75 mt-0.5 leading-relaxed break-words">
                    {toast.message}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 p-1 text-[#F0EDE6]/40 hover:text-[#C9A84C] transition-colors rounded"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </aside>
    </ToastContext.Provider>
  );
}

export function useTacticalToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    // Graceful fallback if invoked outside provider
    return {
      show: () => {},
      success: () => {},
      info: () => {},
      warning: () => {},
      alert: () => {},
    };
  }
  return context;
}

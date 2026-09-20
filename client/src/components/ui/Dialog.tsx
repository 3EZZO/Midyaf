import type { ReactNode } from "react";
import * as DialogPrimitive from "radix-ui/dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

/**
 * Radix dialog: focus trap, scroll lock, Escape, aria wiring. Two shapes —
 * `Dialog` (centred, sized) and `Sheet` (side panel, inline-end).
 */

const overlayClass = "fixed inset-0 z-dialog bg-surface-0/70 backdrop-blur-sm animate-fade-in";

const sizes = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  full: "max-w-[calc(100vw-2rem)] h-[calc(100vh-2rem)]"
};

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: keyof typeof sizes;
  /** Slot rendered in the header's end side (e.g. actions). */
  headerAction?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  closeLabel?: string;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "md",
  headerAction,
  footer,
  className,
  bodyClassName,
  closeLabel = "Close"
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClass} />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-dialog m-auto flex h-fit max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] flex-col",
            "rounded-lg border border-hairline bg-surface-2 shadow-dropdown animate-scale-in",
            "focus:outline-none",
            sizes[size],
            className
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-bold tracking-tight text-ink">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-ink-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {headerAction}
              <DialogPrimitive.Close
                aria-label={closeLabel}
                className="grid size-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-white/5 hover:text-ink focus-visible:outline-none focus-visible:shadow-focus"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
          </header>
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>
          {footer ? <footer className="border-t border-hairline px-5 py-3">{footer}</footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
  closeLabel = "Close",
  width = "max-w-lg"
}: Omit<DialogProps, "size" | "headerAction"> & { width?: string }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn(overlayClass, "z-sheet")} />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 end-0 z-sheet flex w-full flex-col border-s border-hairline bg-surface-2 shadow-dropdown",
            "animate-fade-in focus:outline-none",
            width,
            className
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4 pt-[calc(1rem+env(safe-area-inset-top))]">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-bold tracking-tight text-ink">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-ink-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-white/5 hover:text-ink focus-visible:outline-none focus-visible:shadow-focus"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </header>
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>
          {footer ? (
            <footer className="border-t border-hairline px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

import type { ReactNode } from "react";
import * as TooltipPrimitive from "radix-ui/tooltip";
import { cn } from "../../lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
  className
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-palette rounded-lg border border-hairline bg-surface-3 px-2.5 py-1.5",
            "text-xs font-medium text-ink shadow-dropdown",
            "animate-fade-in",
            className
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-surface-3" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

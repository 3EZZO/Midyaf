import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

/**
 * The one card. Flat surface-2 panel with a hairline border. `tone` adds a
 * semantic inline-start bar (RTL-aware) for KPI/alert cards.
 */
export const surfaceVariants = cva("relative rounded-lg border border-hairline bg-surface-2 shadow-sm", {
  variants: {
    padding: { none: "p-0", sm: "p-3", md: "p-5", lg: "p-6" },
    tone: {
      none: "",
      gold: "border-s-2 border-s-gold-500",
      ok: "border-s-2 border-s-ok",
      warn: "border-s-2 border-s-warn",
      danger: "border-s-2 border-s-danger",
      info: "border-s-2 border-s-info"
    },
    interactive: {
      true: "cursor-pointer transition-colors duration-base hover:bg-surface-3 focus-visible:outline-none focus-visible:shadow-focus",
      false: ""
    },
    level: {
      2: "bg-surface-2",
      3: "bg-surface-3"
    }
  },
  defaultVariants: { padding: "md", tone: "none", interactive: false, level: 2 }
});

export type SurfaceProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof surfaceVariants> & { children?: ReactNode };

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { className, padding, tone, interactive, level, onClick, ...rest },
  ref
) {
  const clickable = Boolean(onClick) || interactive === true;
  return (
    <div
      ref={ref}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable && onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
              }
            }
          : undefined
      }
      className={cn(surfaceVariants({ padding, tone, interactive: clickable, level }), className)}
      {...rest}
    />
  );
});

export const Card = Surface;

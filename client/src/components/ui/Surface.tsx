import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

/**
 * The one card (Qasr Obsidian): a basalt surface-2 panel with a warm hairline
 * and a 6% top highlight. `tone` draws a 2px rule along the top edge (brass or
 * a status colour); `focal` gives the one element per screen that should draw
 * the eye a soft brass aura.
 */
const topRule =
  "before:pointer-events-none before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-full before:content-['']";

export const surfaceVariants = cva("relative rounded-lg border border-hairline bg-surface-2 shadow-card", {
  variants: {
    padding: { none: "p-0", sm: "p-3", md: "p-5", lg: "p-6" },
    tone: {
      none: "",
      gold: `${topRule} before:bg-gold-500`,
      ok: `${topRule} before:bg-ok`,
      warn: `${topRule} before:bg-warn`,
      danger: `${topRule} before:bg-danger`,
      info: `${topRule} before:bg-info`
    },
    interactive: {
      true: "cursor-pointer transition-colors duration-base hover:bg-surface-3 focus-visible:outline-none focus-visible:shadow-focus",
      false: ""
    },
    level: {
      2: "bg-surface-2",
      3: "bg-surface-3"
    },
    focal: {
      true: "border-gold-500/30 shadow-luxury",
      false: ""
    }
  },
  defaultVariants: { padding: "md", tone: "none", interactive: false, level: 2, focal: false }
});

export type SurfaceProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof surfaceVariants> & { children?: ReactNode };

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { className, padding, tone, interactive, level, focal, onClick, ...rest },
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
      className={cn(surfaceVariants({ padding, tone, interactive: clickable, level, focal }), className)}
      {...rest}
    />
  );
});

export const Card = Surface;

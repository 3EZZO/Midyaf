import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { Tooltip } from "./Tooltip";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 select-none whitespace-nowrap",
    "rounded-lg font-semibold tracking-tight",
    "transition-colors duration-base ease-out",
    "focus-visible:outline-none focus-visible:shadow-focus",
    "disabled:pointer-events-none disabled:opacity-50"
  ],
  {
    variants: {
      variant: {
        primary: "bg-surface-3 text-ink border border-hairline hover:bg-surface-4",
        gold: "bg-gold-500 text-surface-0 hover:bg-gold-300",
        outline: "border border-gold-500/40 text-gold-300 hover:bg-gold-500/10",
        ghost: "text-ink-muted hover:text-ink hover:bg-white/5",
        danger: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25"
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-base",
        xl: "h-14 px-7 text-lg"
      }
    },
    defaultVariants: { variant: "primary", size: "md" }
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    leadingIcon?: ReactNode;
    trailingIcon?: ReactNode;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, leadingIcon, trailingIcon, children, type = "button", disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
});

const iconSizes = { sm: "size-8", md: "size-10", lg: "size-12", xl: "size-14" } as const;

export type IconButtonProps = Omit<ButtonProps, "children" | "leadingIcon" | "trailingIcon"> & {
  /** Accessible name; also shown as a tooltip. */
  label: string;
  children: ReactNode;
};

/** Icon-only button. `label` is mandatory so it is never unnamed. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, size = "md", children, ...rest },
  ref
) {
  return (
    <Tooltip content={label}>
      <Button
        ref={ref}
        size={size}
        aria-label={label}
        className={cn("px-0", iconSizes[size ?? "md"], className)}
        {...rest}
      >
        {children}
      </Button>
    </Tooltip>
  );
});

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

/**
 * Field owns the label / hint / error wiring; the input inside it reads the
 * ids from context so aria-describedby and aria-invalid are always right.
 */

type FieldContextValue = {
  id: string;
  describedBy?: string;
  invalid: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label htmlFor={id} className="text-xs font-semibold uppercase tracking-label text-ink-muted">
          {label}
          {required ? <span className="ms-1 text-gold-500" aria-hidden>*</span> : null}
        </label>
        {children}
        {error ? (
          <p id={errorId} role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-xs text-ink-faint">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

function useFieldA11y(explicitId?: string) {
  const ctx = useContext(FieldContext);
  return {
    id: explicitId ?? ctx?.id,
    "aria-describedby": ctx?.describedBy,
    "aria-invalid": ctx?.invalid || undefined
  };
}

export const inputClass = cn(
  "w-full rounded-lg border border-hairline bg-surface-1 px-3.5 py-2.5",
  "text-sm text-ink placeholder:text-ink-faint",
  "transition-colors duration-base",
  "hover:border-white/15",
  "focus:outline-none focus:border-gold-500/60 focus:shadow-focus",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  "aria-[invalid=true]:border-danger/60"
);

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, id, ...rest },
  ref
) {
  const a11y = useFieldA11y(id);
  return <input ref={ref} className={cn(inputClass, className)} {...a11y} {...rest} />;
});

export type NumberInputProps = Omit<InputProps, "type" | "onChange" | "value"> & {
  value: number | "";
  onChange: (value: number | "") => void;
};

/** Numeric input that always emits a number (or "" while empty). Western digits enforced. */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { className, value, onChange, ...rest },
  ref
) {
  return (
    <Input
      ref={ref}
      type="number"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      className={cn("font-tnum", className)}
      {...rest}
    />
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  options: ReadonlyArray<{ value: string; label: ReactNode; disabled?: boolean }>;
  placeholder?: string;
};

/** Native select — reliable on touch and in RTL; styled to match Input. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, id, options, placeholder, ...rest },
  ref
) {
  const a11y = useFieldA11y(id);
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(inputClass, "appearance-none pe-9 cursor-pointer", className)}
        {...a11y}
        {...rest}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
    </div>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, id, rows = 3, ...rest },
  ref
) {
  const a11y = useFieldA11y(id);
  return (
    <textarea ref={ref} rows={rows} className={cn(inputClass, "resize-y", className)} {...a11y} {...rest} />
  );
});

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
  className
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-3 select-none", disabled && "opacity-50", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border border-hairline transition-colors duration-base",
          "focus-visible:outline-none focus-visible:shadow-focus",
          checked ? "bg-gold-500" : "bg-surface-3"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-ink transition-transform duration-base",
            "start-0.5",
            checked ? "translate-x-5 rtl:-translate-x-5 bg-surface-0" : "translate-x-0"
          )}
        />
      </button>
      <span className="text-sm text-ink">{label}</span>
    </label>
  );
}

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "./ui/Button";

type Props = {
  children: ReactNode;
  /** Resetting this key (e.g. the portal id) clears the error automatically. */
  resetKey?: string;
  isArabic?: boolean;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = { error: Error | null };

/** Per-portal error boundary: one broken panel never blanks the whole shell. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const ar = this.props.isArabic ?? document.documentElement.lang.startsWith("ar");
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-lg border border-danger/30 bg-surface-2 p-8 text-center"
      >
        <span className="grid size-12 place-items-center rounded-lg bg-danger/10 text-danger">
          <AlertTriangle className="size-6" />
        </span>
        <div>
          <p className="text-base font-bold text-ink">{ar ? "تعذر عرض هذه اللوحة" : "This panel could not be displayed"}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {ar ? "بقية النظام يعمل بشكل طبيعي." : "The rest of the system is unaffected."}
          </p>
          <p className="mt-3 max-w-full truncate font-mono text-xs text-ink-faint" dir="ltr">
            {this.state.error.message}
          </p>
        </div>
        <Button variant="outline" leadingIcon={<RotateCcw className="size-4" />} onClick={() => this.setState({ error: null })}>
          {ar ? "إعادة المحاولة" : "Retry"}
        </Button>
      </div>
    );
  }
}

import { useEffect, useRef, useState } from "react";
import { Lock, MessageSquareText, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import type { Session, SupplierSubmissionsView } from "@shared/domain";
import { ApiError, apiFetch } from "../lib/api";
import { shortDate, shortTime } from "../lib/format";
import { allCurrent, createRequestGeneration } from "../lib/requestGeneration";
import { Badge, Button, EmptyState, Surface, Textarea } from "./ui";
import { categoryLabel, quoteStatusLabel } from "./SupplierDashboard";

/**
 * SUPPLIER-001 logistics review panel: supplier-portal submissions for one
 * intake, with origin, item, quantity, status and the suppliers' notes.
 * Prices, scores and commission are never fetched (D-011 pending). These
 * submissions are separate from, and excluded from, the legacy quote totals.
 */

export type SubmissionsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: SupplierSubmissionsView };

export function submissionsCopy(isArabic: boolean) {
  const p = (en: string, ar: string) => (isArabic ? ar : en);
  return {
    title: p("Supplier portal submissions", "عروض بوابة الموردين"),
    loading: p("Loading supplier submissions…", "جاري تحميل عروض الموردين…"),
    loadFailed: p("Supplier submissions could not be loaded.", "تعذر تحميل عروض الموردين."),
    retry: p("Retry", "إعادة المحاولة"),
    empty: p("No supplier has submitted through the portal yet", "لم يقدّم أي مورد عرضاً عبر البوابة بعد"),
    sealedCount: p("Sealed submissions", "عروض مختومة"),
    policyPending: p(
      "Prices stay sealed and cannot be approved or contracted until an approved key-holder policy exists (D-011).",
      "تبقى الأسعار مختومة ولا يمكن اعتمادها أو التعاقد عليها حتى تُعتمد سياسة حاملي المفاتيح (D-011)."
    ),
    excluded: p(
      "Not included in the legacy quote totals above.",
      "غير مشمولة في إجماليات العروض السابقة أعلاه."
    ),
    priceSealed: p("Price sealed", "السعر مختوم"),
    notes: p("Supplier notes", "ملاحظات الموردين"),
    noNotes: p("No supplier notes yet", "لا توجد ملاحظات من الموردين بعد"),
    reject: p("Reject submission", "رفض العرض"),
    confirmReject: p("Confirm rejection", "تأكيد الرفض"),
    cancel: p("Cancel", "إلغاء"),
    reason: p("Reason (optional, recorded in the audit log)", "السبب (اختياري، يُسجل في سجل التدقيق)"),
    rejectFailed: p("The rejection could not be saved.", "تعذر حفظ الرفض."),
    unavailable: p("This record changed or is no longer available. Refresh to see its current status.", "تغيّر هذا السجل أو لم يعد متاحاً. حدّث لرؤية حالته الحالية."),
    by: p("by", "بواسطة"),
    quantity: p("Qty", "الكمية")
  };
}

export function rejectErrorMessage(error: unknown, isArabic: boolean) {
  const copy = submissionsCopy(isArabic);
  const status = error instanceof ApiError ? error.status : 0;
  return status === 409 || status === 404 ? copy.unavailable : copy.rejectFailed;
}

export type SubmissionsApi = {
  load: (intakeId: string) => Promise<SupplierSubmissionsView>;
  reject: (quoteId: string, reason: string) => Promise<void>;
};

/**
 * Async rules of the review panel, independent of React: results belong to
 * the intake and session they were requested for (`open` starts a new scope,
 * `close` ends it on logout/unmount), and only the latest load may paint.
 */
export function createSubmissionsController(
  api: SubmissionsApi,
  on: { ready: (value: SupplierSubmissionsView) => void; failed: () => void }
) {
  const scope = createRequestGeneration();
  const loads = createRequestGeneration();
  let intakeId: string | null = null;

  async function load() {
    const id = intakeId;
    if (!id) return;
    const current = allCurrent(scope.capture(), loads.begin());
    try {
      const value = await api.load(id);
      if (current()) on.ready(value);
    } catch {
      if (current()) on.failed();
    }
  }

  /** Errors propagate; the panel refreshes only if still on the same scope. */
  async function reject(quoteId: string, reason: string) {
    const sameScope = scope.capture();
    try {
      await api.reject(quoteId, reason);
    } finally {
      if (sameScope()) await load();
    }
  }

  function open(id: string | null) {
    intakeId = id;
    scope.invalidate();
    loads.invalidate();
  }

  return { load, reject, open, close: () => open(null) };
}

export function SupplierSubmissions({
  intakeId,
  session,
  isArabic,
  canManage
}: {
  intakeId?: string;
  session?: Session;
  isArabic: boolean;
  canManage: boolean;
}) {
  const [state, setState] = useState<SubmissionsState>({ status: "loading" });
  const tokenRef = useRef(session?.accessToken);
  tokenRef.current = session?.accessToken;
  const isArabicRef = useRef(isArabic);
  isArabicRef.current = isArabic;
  const copy = submissionsCopy(isArabic);

  const [controller] = useState(() => {
    const token = () => {
      const value = tokenRef.current;
      if (!value) throw new ApiError("Not signed in", 401);
      return value;
    };
    return createSubmissionsController(
      {
        load: (id) =>
          apiFetch<SupplierSubmissionsView>(
            `/supplier-submissions?intakeId=${encodeURIComponent(id)}`,
            token()
          ),
        reject: async (quoteId, reason) => {
          await apiFetch(`/supplier-submissions/${encodeURIComponent(quoteId)}/reject`, token(), {
            method: "POST",
            body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {})
          });
        }
      },
      {
        ready: (value) => setState({ status: "ready", value }),
        failed: () =>
          setState({ status: "error", message: submissionsCopy(isArabicRef.current).loadFailed })
      }
    );
  });

  useEffect(() => {
    setState({ status: "loading" });
    if (!intakeId || !session?.accessToken) {
      controller.close();
      return;
    }
    controller.open(intakeId);
    void controller.load();
    // Intake switch, logout or unmount: earlier results must not paint.
    return () => controller.close();
  }, [intakeId, session?.accessToken, controller]);

  if (!intakeId || !session) return null;

  async function reject(quoteId: string, reason: string) {
    try {
      await controller.reject(quoteId, reason);
      return null;
    } catch (error) {
      return rejectErrorMessage(error, isArabic);
    }
  }

  return (
    <SupplierSubmissionsView
      state={state}
      isArabic={isArabic}
      canManage={canManage}
      onRetry={() => {
        setState({ status: "loading" });
        void controller.load();
      }}
      onReject={reject}
    />
  );
}

export function SupplierSubmissionsView({
  state,
  isArabic,
  canManage,
  onRetry,
  onReject
}: {
  state: SubmissionsState;
  isArabic: boolean;
  canManage: boolean;
  onRetry: () => void;
  onReject: (quoteId: string, reason: string) => Promise<string | null>;
}) {
  const copy = submissionsCopy(isArabic);
  const locale = isArabic ? "ar" : "en";

  return (
    <div id="supplier-submissions" className="mt-6 space-y-3 rounded-lg border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Lock className="size-4 text-gold-300" aria-hidden />
          {copy.title}
        </h4>
        {state.status === "ready" ? (
          <Badge tone="gold">
            {copy.sealedCount}: {state.value.sealedCount}
          </Badge>
        ) : null}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-ink-muted">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
        <span>
          {copy.policyPending} {copy.excluded}
        </span>
      </p>

      {state.status === "loading" ? (
        <p aria-busy className="text-sm text-ink-muted">
          {copy.loading}
        </p>
      ) : state.status === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">
          {state.message}
          <Button size="sm" variant="outline" onClick={onRetry} leadingIcon={<RotateCcw className="size-3.5" aria-hidden />}>
            {copy.retry}
          </Button>
        </div>
      ) : (
        <>
          {state.value.submissions.length ? (
            <ul className="space-y-2">
              {state.value.submissions.map((submission) => (
                <li key={submission.quoteId}>
                  <SubmissionRow
                    submission={submission}
                    isArabic={isArabic}
                    canManage={canManage}
                    onReject={onReject}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title={copy.empty} />
          )}

          <div className="space-y-2 border-t border-hairline pt-3">
            <h5 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-label text-ink-muted">
              <MessageSquareText className="size-3.5" aria-hidden />
              {copy.notes}
            </h5>
            {state.value.notes.length ? (
              <ul className="space-y-1.5">
                {state.value.notes.map((note) => (
                  <li key={note.id} className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink">
                    <p className="whitespace-pre-wrap">{note.text}</p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {note.supplier.name} · {copy.by} {note.author.name} ·{" "}
                      {shortDate(note.createdAt, locale)} {shortTime(note.createdAt, locale)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-faint">{copy.noNotes}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SubmissionRow({
  submission,
  isArabic,
  canManage,
  onReject
}: {
  submission: SupplierSubmissionsView["submissions"][number];
  isArabic: boolean;
  canManage: boolean;
  onReject: (quoteId: string, reason: string) => Promise<string | null>;
}) {
  const copy = submissionsCopy(isArabic);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = isArabic ? "ar" : "en";

  return (
    <Surface padding="sm" className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {submission.supplier?.name ?? "—"}{" "}
            <span className="text-xs font-normal text-ink-muted">
              · {categoryLabel(submission.category, isArabic)}
            </span>
          </p>
          <p className="text-xs text-ink-muted">
            {submission.item} · {copy.quantity} {submission.quantity} ·{" "}
            {shortDate(submission.submittedAt, locale)} {shortTime(submission.submittedAt, locale)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gold">
            <Lock className="size-3" aria-hidden />
            {copy.priceSealed}
          </Badge>
          <Badge tone={submission.status === "REJECTED" ? "danger" : "info"}>
            {quoteStatusLabel(submission.status, isArabic)}
          </Badge>
        </div>
      </div>

      {canManage && submission.status === "RECEIVED" ? (
        rejecting ? (
          <form
            className="space-y-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              const failure = await onReject(submission.quoteId, reason);
              setPending(false);
              setError(failure);
              if (!failure) setRejecting(false);
            }}
          >
            <label className="block text-xs font-semibold text-ink-muted">
              {copy.reason}
              <Textarea
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={pending}>
                {copy.cancel}
              </Button>
              <Button size="sm" variant="danger" type="submit" loading={pending}>
                {copy.confirmReject}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRejecting(true)}
              leadingIcon={<XCircle className="size-3.5" aria-hidden />}
            >
              {copy.reject}
            </Button>
          </div>
        )
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </Surface>
  );
}

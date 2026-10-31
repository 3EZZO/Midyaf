import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, FileSignature, KeyRound, Lock, LockOpen, MessageSquareText, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import type { Session, SupplierSubmissionsView } from "@shared/domain";
import { ApiError, apiFetch } from "../lib/api";
import { money, shortDate, shortTime } from "../lib/format";
import { allCurrent, createRequestGeneration } from "../lib/requestGeneration";
import { Badge, Button, EmptyState, Surface, Textarea } from "./ui";
import { categoryLabel, quoteStatusLabel } from "./SupplierDashboard";

/**
 * SUPPLIER-001 logistics review panel: supplier-portal submissions for one
 * intake, with origin, item, quantity, status and the suppliers' notes.
 * D-011 (approved 2026-10-31): the Midyaf Super Admin is the single key
 * holder. Only the Super Admin opens the vault, sees prices, approves one
 * quote per category and drafts/signs its contract; the server sends terms
 * to no one else. These submissions are excluded from the legacy totals.
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
    keyHolderSealed: p(
      "Prices are sealed. Only the Midyaf Super Admin holds the key, opens the vault and approves a quote.",
      "الأسعار مختومة. المشرف العام لمضياف وحده يحمل المفتاح ويفتح الخزنة ويعتمد العرض."
    ),
    keyHolderOpen: p(
      "The vault is open. Prices are shown to the Midyaf Super Admin only.",
      "الخزنة مفتوحة. تظهر الأسعار للمشرف العام لمضياف فقط."
    ),
    openVault: p("Open vault · Super Admin key", "فتح الخزنة · مفتاح المشرف العام"),
    confirmOpen: p("Confirm: open and show all prices", "تأكيد: فتح الخزنة وإظهار جميع الأسعار"),
    reseal: p("Re-seal vault", "إعادة ختم الخزنة"),
    vaultOpenBadge: p("Vault open", "الخزنة مفتوحة"),
    vaultSealedBadge: p("Vault sealed", "الخزنة مختومة"),
    total: p("Total", "الإجمالي"),
    unit: p("Unit", "سعر الوحدة"),
    commission: p("Midyaf commission", "عمولة مضياف"),
    approve: p("Approve this quote", "اعتماد هذا العرض"),
    confirmApprove: p(
      "Confirm approval (other quotes in this category become not selected)",
      "تأكيد الاعتماد (تصبح العروض الأخرى في هذه الفئة غير مختارة)"
    ),
    createContract: p("Create contract", "إنشاء العقد"),
    signContract: p("Sign contract", "توقيع العقد"),
    contract: p("Contract", "العقد"),
    actionFailed: p("The action could not be completed.", "تعذر إتمام الإجراء."),
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

export function decisionErrorMessage(error: unknown, isArabic: boolean) {
  const copy = submissionsCopy(isArabic);
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 409 && error instanceof ApiError && error.message) return error.message;
  return status === 404 ? copy.unavailable : copy.actionFailed;
}

const CONTRACT_STATUS_LABELS: Record<string, [string, string]> = {
  DRAFT: ["Draft", "مسودة"],
  UNDER_REVIEW: ["Under review", "قيد المراجعة"],
  PENDING_SIGNATURE: ["Awaiting signature", "بانتظار التوقيع"],
  SIGNED: ["Signed", "موقّع"],
  ACTIVE: ["Active", "ساري"]
};

export function contractStatusLabel(status: string, isArabic: boolean) {
  const label = CONTRACT_STATUS_LABELS[status];
  return label ? (isArabic ? label[1] : label[0]) : status;
}

/** Super Admin decisions (D-011). `id` is the intake, quote or contract id. */
export type SubmissionDecision =
  | { kind: "open" | "reseal"; id: string }
  | { kind: "approve" | "contract"; id: string }
  | { kind: "sign"; id: string };

export type SubmissionsApi = {
  load: (intakeId: string) => Promise<SupplierSubmissionsView>;
  reject: (quoteId: string, reason: string) => Promise<void>;
  decide?: (decision: SubmissionDecision) => Promise<void>;
};

/** The HTTP call behind each decision; the server enforces the key holder. */
export function decisionRequest(decision: SubmissionDecision): { path: string; method: "POST" | "PUT" } {
  const id = encodeURIComponent(decision.id);
  switch (decision.kind) {
    case "open":
      return { path: `/vault/${id}/authorize`, method: "POST" };
    case "reseal":
      return { path: `/vault/${id}/reset`, method: "POST" };
    case "approve":
      return { path: `/supplier-submissions/${id}/approve`, method: "POST" };
    case "contract":
      return { path: `/supplier-submissions/${id}/contract`, method: "POST" };
    case "sign":
      return { path: `/contracts/${id}/approve`, method: "PUT" };
  }
}

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

  /** Same scope rule as reject: errors propagate, refresh only in scope. */
  async function decide(decision: SubmissionDecision) {
    const sameScope = scope.capture();
    try {
      if (!api.decide) throw new Error("Decisions are not available");
      await api.decide(decision);
    } finally {
      if (sameScope()) await load();
    }
  }

  function open(id: string | null) {
    intakeId = id;
    scope.invalidate();
    loads.invalidate();
  }

  return { load, reject, decide, open, close: () => open(null) };
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
        },
        decide: async (decision) => {
          const { path, method } = decisionRequest(decision);
          await apiFetch(path, token(), { method, body: JSON.stringify({}) });
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

  async function decide(decision: SubmissionDecision) {
    try {
      await controller.decide(decision);
      return null;
    } catch (error) {
      return decisionErrorMessage(error, isArabic);
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
      onDecide={decide}
    />
  );
}

/** Two-step confirm button for an irreversible or revealing decision. */
function ConfirmAction({
  label,
  confirmLabel,
  icon,
  variant = "outline",
  onConfirm
}: {
  label: string;
  confirmLabel?: string;
  icon: ReactNode;
  variant?: "outline" | "ghost" | "primary";
  onConfirm: () => Promise<string | null>;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={armed ? "gold" : variant}
        loading={pending}
        leadingIcon={icon}
        onClick={async () => {
          if (confirmLabel && !armed) {
            setArmed(true);
            return;
          }
          setPending(true);
          const failure = await onConfirm();
          setPending(false);
          setArmed(false);
          setError(failure);
        }}
      >
        {armed && confirmLabel ? confirmLabel : label}
      </Button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function SupplierSubmissionsView({
  state,
  isArabic,
  canManage,
  onRetry,
  onReject,
  onDecide = async () => null
}: {
  state: SubmissionsState;
  isArabic: boolean;
  canManage: boolean;
  onRetry: () => void;
  onReject: (quoteId: string, reason: string) => Promise<string | null>;
  onDecide?: (decision: SubmissionDecision) => Promise<string | null>;
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
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={state.value.vault.opened ? "ok" : "gold"}>
              {state.value.vault.opened ? (
                <LockOpen className="size-3" aria-hidden />
              ) : (
                <Lock className="size-3" aria-hidden />
              )}
              {state.value.vault.opened ? copy.vaultOpenBadge : copy.vaultSealedBadge}
            </Badge>
            <Badge tone="gold">
              {copy.sealedCount}: {state.value.sealedCount}
            </Badge>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-start gap-1.5 text-xs text-ink-muted">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
          <span>
            {state.status === "ready" && state.value.vault.opened ? copy.keyHolderOpen : copy.keyHolderSealed}{" "}
            {copy.excluded}
          </span>
        </p>
        {state.status === "ready" && state.value.vault.canOpen ? (
          state.value.vault.opened ? (
            <ConfirmAction
              label={copy.reseal}
              icon={<Lock className="size-3.5" aria-hidden />}
              variant="ghost"
              onConfirm={() => onDecide({ kind: "reseal", id: state.value.intakeId })}
            />
          ) : (
            <ConfirmAction
              label={copy.openVault}
              confirmLabel={copy.confirmOpen}
              icon={<KeyRound className="size-3.5" aria-hidden />}
              onConfirm={() => onDecide({ kind: "open", id: state.value.intakeId })}
            />
          )
        ) : null}
      </div>

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
                    canDecide={state.value.vault.canApprove}
                    onReject={onReject}
                    onDecide={onDecide}
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
  canDecide,
  onReject,
  onDecide
}: {
  submission: SupplierSubmissionsView["submissions"][number];
  isArabic: boolean;
  canManage: boolean;
  canDecide: boolean;
  onReject: (quoteId: string, reason: string) => Promise<string | null>;
  onDecide: (decision: SubmissionDecision) => Promise<string | null>;
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
          {submission.terms ? null : (
            <Badge tone="gold">
              <Lock className="size-3" aria-hidden />
              {copy.priceSealed}
            </Badge>
          )}
          <Badge
            tone={
              submission.status === "REJECTED" ? "danger" : submission.status === "APPROVED" ? "ok" : "info"
            }
          >
            {quoteStatusLabel(submission.status, isArabic)}
          </Badge>
          {submission.contract ? (
            <Badge tone="neutral">
              <FileSignature className="size-3" aria-hidden />
              {copy.contract}: {contractStatusLabel(submission.contract.status, isArabic)}
            </Badge>
          ) : null}
        </div>
      </div>

      {submission.terms ? (
        <dl data-supplier-terms className="grid gap-2 rounded-md bg-surface-2 p-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-ink-muted">{copy.total}</dt>
            <dd className="font-tnum font-semibold text-ink">{money(submission.terms.totalPrice, submission.terms.currency)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{copy.unit}</dt>
            <dd className="font-tnum text-ink">{money(submission.terms.unitPrice, submission.terms.currency)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{copy.commission}</dt>
            <dd className="font-tnum text-ink">
              {submission.terms.commissionPercent}% · {money(submission.terms.commissionAmount, submission.terms.currency)}
            </dd>
          </div>
        </dl>
      ) : null}

      {canDecide ? (
        <div className="flex flex-wrap justify-end gap-2">
          {submission.status === "RECEIVED" ? (
            <ConfirmAction
              label={copy.approve}
              confirmLabel={copy.confirmApprove}
              icon={<CheckCircle2 className="size-3.5" aria-hidden />}
              onConfirm={() => onDecide({ kind: "approve", id: submission.quoteId })}
            />
          ) : null}
          {submission.status === "APPROVED" && !submission.contract ? (
            <ConfirmAction
              label={copy.createContract}
              icon={<FileSignature className="size-3.5" aria-hidden />}
              onConfirm={() => onDecide({ kind: "contract", id: submission.quoteId })}
            />
          ) : null}
          {submission.contract &&
          ["DRAFT", "UNDER_REVIEW", "PENDING_SIGNATURE"].includes(submission.contract.status) ? (
            <ConfirmAction
              label={copy.signContract}
              confirmLabel={copy.signContract + " ✓"}
              icon={<FileSignature className="size-3.5" aria-hidden />}
              onConfirm={() => onDecide({ kind: "sign", id: submission.contract!.id })}
            />
          ) : null}
        </div>
      ) : null}

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

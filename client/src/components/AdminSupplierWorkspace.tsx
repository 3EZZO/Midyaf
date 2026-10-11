import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BedDouble,
  CalendarDays,
  Car,
  ClipboardList,
  Eye,
  FileSignature,
  Link2,
  Link2Off,
  Lock,
  Package,
  RotateCcw,
  ShieldCheck,
  Ticket
} from "lucide-react";
import type {
  AdminSupplierDirectoryEntry,
  AdminSupplierDirectoryResponse,
  AdminSupplierQuoteView,
  AdminSupplierRequestView,
  AdminSupplierWorkspaceView,
  Session,
  SupplierDemandScope,
  SupplierQuoteStatus
} from "@shared/domain";
import { ApiError, apiFetch } from "../lib/api";
import { shortDate } from "../lib/format";
import { allCurrent, createRequestGeneration } from "../lib/requestGeneration";
import { categoryLabel, estimateLabel, quoteStatusLabel, sar, scopeLabel } from "./SupplierDashboard";
import { Badge, Button, EmptyState, Section, Surface } from "./ui";
import { PortalHero } from "./ui/PortalHero";

/**
 * ADMIN-PORTALS-001 read-only Super Admin supplier workspace (Arabic RTL /
 * English). The super admin picks a supplier profile from the directory and
 * sees what that supplier's workspace contains, from the SUPER_ADMIN-only
 * /suppliers/admin/workspaces DTOs. Nothing here acts as the supplier: no
 * quote or note forms, no sign-in as the supplier, and quote prices stay
 * sealed (D-011 pending).
 */

export type DirectoryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: AdminSupplierDirectoryResponse };

export type AdminWorkspaceState =
  | { status: "idle" }
  | { status: "loading"; supplierId: string }
  | { status: "error"; supplierId: string; message: string }
  | { status: "ready"; supplierId: string; value: AdminSupplierWorkspaceView };

export function adminSupplierCopy(isArabic: boolean) {
  const p = (en: string, ar: string) => (isArabic ? ar : en);
  return {
    badge: p("Supplier workspace · Super Admin view", "مساحة المورد · عرض المشرف العام"),
    title: p("Supplier workspaces", "مساحات الموردين"),
    readOnlyTitle: p("Read-only administrative view", "عرض إداري للقراءة فقط"),
    readOnlyBody: p(
      "You are viewing supplier workspaces as the super admin. You are not signed in as any supplier, and nothing can be submitted or changed from this view.",
      "أنت تطّلع على مساحات الموردين بصفتك المشرف العام. لم تسجّل الدخول كأي مورد، ولا يمكن إرسال أو تعديل أي شيء من هذا العرض."
    ),
    directory: p("Supplier directory", "دليل الموردين"),
    directoryLoading: p("Loading the supplier directory…", "جاري تحميل دليل الموردين…"),
    directoryFailed: p("The supplier directory could not be loaded.", "تعذر تحميل دليل الموردين."),
    noSuppliers: p("No supplier profiles exist yet", "لا توجد ملفات موردين بعد"),
    truncated: p("Showing the first 100 suppliers by name.", "يُعرض أول 100 مورد حسب الاسم."),
    chooseSupplier: p("Choose a supplier to view its workspace", "اختر مورداً لعرض مساحته"),
    workspaceLoading: p("Loading the supplier's workspace…", "جاري تحميل مساحة المورد…"),
    workspaceFailed: p("This supplier's workspace could not be loaded.", "تعذر تحميل مساحة هذا المورد."),
    workspaceMissing: p("This supplier profile no longer exists.", "ملف هذا المورد لم يعد موجوداً."),
    workspaceForbidden: p("Only the super admin can open this view.", "هذا العرض متاح للمشرف العام فقط."),
    retry: p("Retry", "إعادة المحاولة"),
    accountLinked: p("Supplier account linked", "حساب المورد مرتبط"),
    accountUnlinked: p("No supplier account linked", "لا يوجد حساب مورد مرتبط"),
    unlinkedBody: p(
      "This profile exists without a supplier sign-in account, so the supplier cannot see this workspace yet.",
      "هذا الملف موجود دون حساب دخول للمورد، لذلك لا يستطيع المورد رؤية هذه المساحة بعد."
    ),
    verified: p("Verified supplier", "مورد موثّق"),
    unverified: p("Verification pending", "التوثيق قيد المراجعة"),
    eligibleRequests: p("Eligible open requests", "الطلبات المفتوحة المؤهلة"),
    supplierQuotes: p("Supplier quotations", "عروض أسعار المورد"),
    supplierBookings: p("Supplier bookings", "حجوزات المورد"),
    supplierServices: p("Supplier services", "خدمات المورد"),
    noRequests: p("No open request matches this supplier's category", "لا يوجد طلب مفتوح يطابق تصنيف هذا المورد"),
    noQuotes: p("This supplier has not submitted a quotation", "لم يقدّم هذا المورد أي عرض سعر"),
    noQuoteForRequest: p("No quotation submitted for this request", "لم يُقدَّم عرض سعر لهذا الطلب"),
    noServices: p("No services are listed on this profile", "لا توجد خدمات مسجلة في هذا الملف"),
    noBookings: p("No bookings for this supplier", "لا توجد حجوزات لهذا المورد"),
    estimate: p("Demo estimate, not a confirmed order", "تقدير تجريبي وليس طلباً مؤكداً"),
    eventDate: p("Event date", "تاريخ الفعالية"),
    quoting: p("Collecting quotations", "جمع عروض الأسعار"),
    supplierQuote: p("Supplier's quotation", "عرض سعر المورد"),
    sealedNote: p(
      "Sealed: the quoted price is not shown to administrators. Opening rules are still pending approval.",
      "مختوم: لا يظهر السعر المعروض للمشرفين. قواعد فتح العروض لا تزال بانتظار الاعتماد."
    ),
    policyPending: p("Opening policy pending", "سياسة الفتح قيد الاعتماد"),
    supplierNotes: p("Supplier notes and recommendations", "ملاحظات المورد وتوصياته"),
    noNotes: p("No notes from this supplier", "لا توجد ملاحظات من هذا المورد"),
    submitted: p("Submitted", "تاريخ الإرسال"),
    available: p("Available", "متاح"),
    unavailable: p("Unavailable", "غير متاح"),
    reference: p("Reference", "المرجع"),
    quantity: p("Quantity", "الكمية")
  };
}

const STATUS_TONES: Record<SupplierQuoteStatus, "info" | "ok" | "danger" | "gold" | "neutral"> = {
  REQUESTED: "neutral",
  RECEIVED: "info",
  RECOMMENDED: "gold",
  APPROVED: "ok",
  REJECTED: "danger"
};

export function adminSupplierErrorMessage(error: unknown, isArabic: boolean, kind: "directory" | "workspace") {
  const copy = adminSupplierCopy(isArabic);
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 403) return copy.workspaceForbidden;
  if (kind === "workspace" && status === 404) return copy.workspaceMissing;
  return kind === "directory" ? copy.directoryFailed : copy.workspaceFailed;
}

export function loadAdminSupplierDirectory(accessToken: string) {
  return apiFetch<AdminSupplierDirectoryResponse>("/suppliers/admin/workspaces", accessToken);
}

export function loadAdminSupplierWorkspace(accessToken: string, supplierId: string) {
  return apiFetch<AdminSupplierWorkspaceView>(
    `/suppliers/admin/workspaces/${encodeURIComponent(supplierId)}`,
    accessToken
  );
}

/**
 * Async rules of the admin view, independent of React. Only the latest
 * directory load and the latest selection may paint, and nothing from an
 * older session (logout/account switch/unmount, via `reset`) paints at all.
 * Selecting a supplier reports loading at once so the previous supplier's
 * data is cleared before the new reply arrives.
 */
export function createAdminSupplierController(
  api: {
    loadDirectory: () => Promise<AdminSupplierDirectoryResponse>;
    loadWorkspace: (supplierId: string) => Promise<AdminSupplierWorkspaceView>;
  },
  on: {
    directoryLoading: () => void;
    directoryReady: (value: AdminSupplierDirectoryResponse) => void;
    directoryFailed: (error: unknown) => void;
    workspaceLoading: (supplierId: string) => void;
    workspaceReady: (supplierId: string, value: AdminSupplierWorkspaceView) => void;
    workspaceFailed: (supplierId: string, error: unknown) => void;
  }
) {
  const session = createRequestGeneration();
  const directoryLoads = createRequestGeneration();
  const workspaceLoads = createRequestGeneration();
  let selected: string | null = null;

  async function loadDirectory() {
    const current = allCurrent(session.capture(), directoryLoads.begin());
    on.directoryLoading();
    try {
      const value = await api.loadDirectory();
      if (current()) on.directoryReady(value);
    } catch (error) {
      if (current()) on.directoryFailed(error);
    }
  }

  async function select(supplierId: string) {
    selected = supplierId;
    const current = allCurrent(session.capture(), workspaceLoads.begin());
    on.workspaceLoading(supplierId);
    try {
      const value = await api.loadWorkspace(supplierId);
      if (current()) on.workspaceReady(supplierId, value);
    } catch (error) {
      if (current()) on.workspaceFailed(supplierId, error);
    }
  }

  /** Retries the current selection, never an older one. */
  async function retryWorkspace() {
    if (selected) await select(selected);
  }

  function reset() {
    session.invalidate();
    directoryLoads.invalidate();
    workspaceLoads.invalidate();
    selected = null;
  }

  return { loadDirectory, select, retryWorkspace, reset, selection: () => selected };
}

export function AdminSupplierWorkspace({ session, isArabic }: { session?: Session; isArabic: boolean }) {
  const [directory, setDirectory] = useState<DirectoryState>({ status: "loading" });
  const [workspace, setWorkspace] = useState<AdminWorkspaceState>({ status: "idle" });
  const tokenRef = useRef(session?.accessToken);
  tokenRef.current = session?.accessToken;
  const isArabicRef = useRef(isArabic);
  isArabicRef.current = isArabic;

  const [controller] = useState(() => {
    const token = () => {
      const value = tokenRef.current;
      if (!value) throw new ApiError("Not signed in", 401);
      return value;
    };
    return createAdminSupplierController(
      {
        loadDirectory: async () => loadAdminSupplierDirectory(token()),
        loadWorkspace: async (supplierId) => loadAdminSupplierWorkspace(token(), supplierId)
      },
      {
        directoryLoading: () => setDirectory({ status: "loading" }),
        directoryReady: (value) => setDirectory({ status: "ready", value }),
        directoryFailed: (error) =>
          setDirectory({
            status: "error",
            message: adminSupplierErrorMessage(error, isArabicRef.current, "directory")
          }),
        workspaceLoading: (supplierId) => setWorkspace({ status: "loading", supplierId }),
        workspaceReady: (supplierId, value) => setWorkspace({ status: "ready", supplierId, value }),
        workspaceFailed: (supplierId, error) =>
          setWorkspace({
            status: "error",
            supplierId,
            message: adminSupplierErrorMessage(error, isArabicRef.current, "workspace")
          })
      }
    );
  });

  useEffect(() => {
    controller.reset();
    setDirectory({ status: "loading" });
    setWorkspace({ status: "idle" });
    if (!session?.accessToken) return;
    void controller.loadDirectory();
    // A reply for an older session, or after unmount, must not paint.
    return () => controller.reset();
  }, [session?.accessToken, controller]);

  return (
    <AdminSupplierWorkspaceView
      directory={directory}
      workspace={workspace}
      isArabic={isArabic}
      onSelect={(supplierId) => void controller.select(supplierId)}
      onRetryDirectory={() => void controller.loadDirectory()}
      onRetryWorkspace={() => void controller.retryWorkspace()}
    />
  );
}

export function AdminSupplierWorkspaceView({
  directory,
  workspace,
  isArabic,
  onSelect,
  onRetryDirectory,
  onRetryWorkspace
}: {
  directory: DirectoryState;
  workspace: AdminWorkspaceState;
  isArabic: boolean;
  onSelect: (supplierId: string) => void;
  onRetryDirectory: () => void;
  onRetryWorkspace: () => void;
}) {
  const copy = adminSupplierCopy(isArabic);
  const selectedId = workspace.status === "idle" ? null : workspace.supplierId;

  return (
    <div className="space-y-6">
      <PortalHero
        badge={copy.badge}
        title={copy.title}
        body={copy.readOnlyBody}
        action={
          <Badge tone="warn" size="lg">
            <Eye className="size-3.5" aria-hidden />
            {copy.readOnlyTitle}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <Section title={copy.directory}>
          <DirectoryPanel
            state={directory}
            selectedId={selectedId}
            isArabic={isArabic}
            onSelect={onSelect}
            onRetry={onRetryDirectory}
          />
        </Section>

        <div className="min-w-0">
          <WorkspacePanel state={workspace} isArabic={isArabic} onRetry={onRetryWorkspace} />
        </div>
      </div>
    </div>
  );
}

function DirectoryPanel({
  state,
  selectedId,
  isArabic,
  onSelect,
  onRetry
}: {
  state: DirectoryState;
  selectedId: string | null;
  isArabic: boolean;
  onSelect: (supplierId: string) => void;
  onRetry: () => void;
}) {
  const copy = adminSupplierCopy(isArabic);

  if (state.status === "loading") {
    return (
      <p aria-busy className="py-6 text-center text-sm text-ink-muted">
        {copy.directoryLoading}
      </p>
    );
  }

  if (state.status === "error") {
    return <ErrorPanel message={state.message} retry={copy.retry} onRetry={onRetry} />;
  }

  const { suppliers, truncated } = state.value;
  if (!suppliers.length) {
    return <EmptyState compact icon={<Package className="size-5" />} title={copy.noSuppliers} />;
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {suppliers.map((supplier) => (
          <li key={supplier.id}>
            <DirectoryEntry
              supplier={supplier}
              selected={supplier.id === selectedId}
              isArabic={isArabic}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
      {truncated ? <p className="text-xs text-ink-faint">{copy.truncated}</p> : null}
    </div>
  );
}

function DirectoryEntry({
  supplier,
  selected,
  isArabic,
  onSelect
}: {
  supplier: AdminSupplierDirectoryEntry;
  selected: boolean;
  isArabic: boolean;
  onSelect: (supplierId: string) => void;
}) {
  const copy = adminSupplierCopy(isArabic);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(supplier.id)}
      className={
        "flex w-full flex-col items-start gap-1 rounded-lg border px-3 py-2 text-start transition-colors " +
        (selected ? "border-gold-500/60 bg-gold-500/10" : "border-hairline bg-surface-1 hover:bg-surface-2")
      }
    >
      <span className="text-sm font-semibold text-ink">{supplier.name}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
        {categoryLabel(supplier.category, isArabic)}
        <LinkBadge linked={supplier.accountLinked} isArabic={isArabic} />
      </span>
    </button>
  );
}

function LinkBadge({ linked, isArabic }: { linked: boolean; isArabic: boolean }) {
  const copy = adminSupplierCopy(isArabic);
  const Icon = linked ? Link2 : Link2Off;
  return (
    <Badge tone={linked ? "ok" : "neutral"} size="sm">
      <Icon className="size-3" aria-hidden />
      {linked ? copy.accountLinked : copy.accountUnlinked}
    </Badge>
  );
}

function ErrorPanel({ message, retry, onRetry }: { message: string; retry: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-sm font-bold text-ink">{message}</p>
      <Button variant="outline" onClick={onRetry} leadingIcon={<RotateCcw className="size-4" aria-hidden />}>
        {retry}
      </Button>
    </div>
  );
}

function WorkspacePanel({
  state,
  isArabic,
  onRetry
}: {
  state: AdminWorkspaceState;
  isArabic: boolean;
  onRetry: () => void;
}) {
  const copy = adminSupplierCopy(isArabic);

  if (state.status === "idle") {
    return (
      <Surface>
        <EmptyState icon={<Eye className="size-5" />} title={copy.chooseSupplier} description={copy.readOnlyTitle} />
      </Surface>
    );
  }

  if (state.status === "loading") {
    return (
      <div aria-busy className="rounded-lg border border-hairline bg-surface-2 p-8 text-center text-sm text-ink-muted">
        {copy.workspaceLoading}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <Surface>
        <ErrorPanel message={state.message} retry={copy.retry} onRetry={onRetry} />
      </Surface>
    );
  }

  return <WorkspaceDetail value={state.value} isArabic={isArabic} />;
}

function WorkspaceDetail({ value, isArabic }: { value: AdminSupplierWorkspaceView; isArabic: boolean }) {
  const copy = adminSupplierCopy(isArabic);
  const { profile, services, bookings, requests, quotes } = value;
  const city = profile.city ? (isArabic ? profile.city.nameAr : profile.city.nameEn) : null;
  const locale = isArabic ? "ar" : "en";

  return (
    <div className="space-y-6">
      <Surface className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink">{profile.name}</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              {[categoryLabel(profile.category, isArabic), city].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={profile.verified ? "ok" : "warn"}>
              <ShieldCheck className="size-3.5" aria-hidden />
              {profile.verified ? copy.verified : copy.unverified}
            </Badge>
            <LinkBadge linked={value.accountLinked} isArabic={isArabic} />
          </div>
        </div>
        {value.accountLinked ? null : <p className="text-xs text-ink-faint">{copy.unlinkedBody}</p>}
      </Surface>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label={copy.eligibleRequests} value={requests.length} icon={<ClipboardList className="size-4" />} />
        <StatTile label={copy.supplierQuotes} value={quotes.length} icon={<FileSignature className="size-4" />} />
        <StatTile label={copy.supplierBookings} value={bookings.length} icon={<CalendarDays className="size-4" />} />
      </div>

      <Section title={copy.eligibleRequests}>
        {requests.length ? (
          <div className="space-y-4">
            {requests.map((request) => (
              <RequestCard key={request.intakeId} request={request} isArabic={isArabic} />
            ))}
          </div>
        ) : (
          <EmptyState compact title={copy.noRequests} />
        )}
      </Section>

      <Section title={copy.supplierQuotes}>
        {quotes.length ? (
          <ul className="space-y-2">
            {quotes.map((quote) => (
              <li key={quote.id}>
                <SealedQuoteSummary quote={quote} isArabic={isArabic} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title={copy.noQuotes} />
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={copy.supplierServices}>
          {services.length ? (
            <ul className="space-y-2">
              {services.map((service) => (
                <li key={service.id}>
                  <Surface padding="sm" className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{service.name}</p>
                      {service.description ? (
                        <p className="mt-0.5 text-xs text-ink-muted">{service.description}</p>
                      ) : null}
                    </div>
                    <div className="text-end text-xs">
                      <p className="font-tnum font-semibold text-ink">
                        {sar(service.listedPrice, isArabic)} / {service.unit}
                      </p>
                      <Badge tone={service.available ? "ok" : "neutral"} size="sm">
                        {service.available ? copy.available : copy.unavailable}
                      </Badge>
                    </div>
                  </Surface>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title={copy.noServices} />
          )}
        </Section>

        <Section title={copy.supplierBookings}>
          {bookings.length ? (
            <ul className="space-y-2">
              {bookings.map((booking) => (
                <li key={booking.id}>
                  <Surface padding="sm" className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {booking.quantity} × {booking.serviceName}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {copy.reference}: {booking.event.reference} · {shortDate(booking.event.date, locale)}
                      </p>
                    </div>
                    <div className="text-end text-xs">
                      <p className="font-tnum font-semibold text-ink">{sar(booking.totalPrice, isArabic)}</p>
                      <Badge tone="info" size="sm">
                        {booking.status}
                      </Badge>
                    </div>
                  </Surface>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title={copy.noBookings} />
          )}
        </Section>
      </div>
    </div>
  );
}

function ScopeIcon({ scope }: { scope: SupplierDemandScope }) {
  const Icon = scope === "VEHICLES" ? Car : scope === "TICKETS" ? Ticket : BedDouble;
  return <Icon className="size-4 text-gold-300" aria-hidden />;
}

function StatTile({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <Surface padding="sm" className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-lg bg-gold-500/10 text-gold-300" aria-hidden>
        {icon}
      </span>
      <div>
        <p className="text-xs text-ink-muted">{label}</p>
        <p className="font-tnum text-xl font-bold text-ink">{value}</p>
      </div>
    </Surface>
  );
}

/** Origin, quantity and status only: there is no price field to show. */
function SealedQuoteSummary({ quote, isArabic }: { quote: AdminSupplierQuoteView; isArabic: boolean }) {
  const copy = adminSupplierCopy(isArabic);
  return (
    <Surface padding="sm" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{quote.item}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONES[quote.status]}>{quoteStatusLabel(quote.status, isArabic)}</Badge>
          <Badge tone="neutral" size="sm">
            <Lock className="size-3" aria-hidden />
            {copy.policyPending}
          </Badge>
        </div>
      </div>
      <p className="font-tnum text-xs text-ink-muted">
        {copy.quantity}: {quote.quantity} · {quote.currency} · {copy.reference}: {quote.requestReference} ·{" "}
        {copy.submitted}: {shortDate(quote.submittedAt, isArabic ? "ar" : "en")}
      </p>
      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Lock className="size-3" aria-hidden />
        {copy.sealedNote}
      </p>
    </Surface>
  );
}

function RequestCard({ request, isArabic }: { request: AdminSupplierRequestView; isArabic: boolean }) {
  const copy = adminSupplierCopy(isArabic);
  return (
    <Surface tone="gold" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-label text-gold-500">
            {request.eventCode} · {request.reference}
          </p>
          <h3 className="mt-1 flex items-center gap-2 text-base font-bold text-ink">
            <ScopeIcon scope={request.scope} />
            {scopeLabel(request.scope, isArabic)}: {estimateLabel(request, isArabic)}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">{copy.estimate}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-ink-muted">
          <Badge tone="info">{copy.quoting}</Badge>
          <span>
            {copy.eventDate}: {shortDate(request.eventDate, isArabic ? "ar" : "en")} · {request.currency}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-label text-ink-muted">{copy.supplierQuote}</h4>
        {request.quote ? (
          <SealedQuoteSummary quote={request.quote} isArabic={isArabic} />
        ) : (
          <p className="text-xs text-ink-faint">{copy.noQuoteForRequest}</p>
        )}
      </div>

      <div className="space-y-2 border-t border-hairline pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-label text-ink-muted">{copy.supplierNotes}</h4>
        {request.notes.length ? (
          <ul className="space-y-1.5">
            {request.notes.map((note) => (
              <li key={note.id} className="whitespace-pre-wrap rounded-lg bg-surface-1 px-3 py-2 text-sm text-ink">
                {note.text}
                <span className="mt-1 block text-xs text-ink-faint">
                  {shortDate(note.createdAt, isArabic ? "ar" : "en")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-faint">{copy.noNotes}</p>
        )}
      </div>
    </Surface>
  );
}

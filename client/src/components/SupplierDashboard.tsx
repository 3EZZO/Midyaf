import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  BedDouble,
  CalendarDays,
  Car,
  ClipboardList,
  FileSignature,
  Lock,
  MessageSquarePlus,
  Package,
  RotateCcw,
  Send,
  ShieldCheck,
  Ticket
} from "lucide-react";
import type {
  Session,
  SupplierDashboardView,
  SupplierDemandScope,
  SupplierOwnQuote,
  SupplierQuoteStatus,
  SupplierQuotesResponse,
  SupplierRequestView,
  SupplierRequestsResponse
} from "@shared/domain";
import { ApiError, apiFetch } from "../lib/api";
import { shortDate } from "../lib/format";
import { Badge, Button, EmptyState, Field, Input, Section, Surface, Textarea } from "./ui";
import { PortalHero } from "./ui/PortalHero";

/**
 * SUPPLIER-001 supplier workspace (Arabic RTL / English). Everything comes
 * from the supplier-only /suppliers/me/* DTOs: the supplier's own profile,
 * services and bookings, the sanitized demo request matching its stored
 * category, its own sealed quote and its own notes. Quotes are initial and
 * immutable; there is no realtime connection, so the page refreshes over
 * HTTP after each action.
 */

export type SupplierWorkspace = {
  dashboard: SupplierDashboardView;
  requests: SupplierRequestView[];
  quotes: SupplierOwnQuote[];
};

export type WorkspaceState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: SupplierWorkspace };

export type QuoteDraft = { item: string; quantity: string; unitPrice: string };
export type QuoteValue = { item: string; quantity: number; unitPrice: number };

const MAX_TOTAL_CENTS = 999_999_999_999;

export function supplierCopy(isArabic: boolean) {
  const p = (en: string, ar: string) => (isArabic ? ar : en);
  return {
    badge: p("Supplier workspace", "مساحة المورد"),
    loading: p("Loading your supplier workspace…", "جاري تحميل مساحة المورد…"),
    loadFailed: p("Your supplier workspace could not be loaded.", "تعذر تحميل مساحة المورد."),
    retry: p("Retry", "إعادة المحاولة"),
    unlinkedTitle: p("No supplier profile is linked to this account", "لا يوجد ملف مورد مرتبط بهذا الحساب"),
    unlinkedBody: p(
      "Ask Midyaf operations to link your company profile. Nothing else is shown until then.",
      "اطلب من فريق عمليات مضياف ربط ملف شركتك. لن يظهر أي محتوى قبل ذلك."
    ),
    verified: p("Verified supplier", "مورد موثّق"),
    unverified: p("Verification pending", "التوثيق قيد المراجعة"),
    openRequests: p("Open requests", "الطلبات المفتوحة"),
    myQuotes: p("My quotations", "عروض أسعاري"),
    myBookings: p("My bookings", "حجوزاتي"),
    myServices: p("My services", "خدماتي"),
    noRequests: p("No open requests match your category right now", "لا توجد طلبات مفتوحة تطابق تصنيفك حالياً"),
    noRequestsBody: p(
      "Requests appear here while an event is collecting quotations for your category.",
      "تظهر الطلبات هنا عندما تجمع فعالية عروض أسعار لتصنيفك."
    ),
    noQuotes: p("You have not submitted a quotation yet", "لم تقدّم أي عرض سعر بعد"),
    noServices: p("No services are listed on your profile", "لا توجد خدمات مسجلة في ملفك"),
    noBookings: p("No bookings yet", "لا توجد حجوزات بعد"),
    estimate: p("Demo estimate, not a confirmed order", "تقدير تجريبي وليس طلباً مؤكداً"),
    eventDate: p("Event date", "تاريخ الفعالية"),
    quoting: p("Collecting quotations", "جمع عروض الأسعار"),
    yourQuote: p("Your quotation", "عرض سعرك"),
    sealedNote: p(
      "Sealed: operations see your offer's origin and status, not its price, until an approved opening policy exists.",
      "مختوم: يرى فريق العمليات مصدر عرضك وحالته دون السعر إلى أن تُعتمد سياسة فتح العروض."
    ),
    immutable: p("Initial quotations cannot be edited after submission.", "لا يمكن تعديل العرض الأولي بعد إرساله."),
    item: p("Offer description", "وصف العرض"),
    quantity: p("Quantity", "الكمية"),
    unitPrice: p("Unit price (SAR, VAT included)", "سعر الوحدة (ريال، شامل الضريبة)"),
    total: p("Total", "الإجمالي"),
    submitQuote: p("Submit sealed quotation", "إرسال عرض سعر مختوم"),
    notes: p("Notes and recommendations", "الملاحظات والتوصيات"),
    noNotes: p("No notes yet", "لا توجد ملاحظات بعد"),
    addNote: p("Add note", "إضافة ملاحظة"),
    notePlaceholder: p("Share a recommendation for this request", "شارك توصية بخصوص هذا الطلب"),
    notesAppendOnly: p("Notes are added, never edited or deleted.", "تُضاف الملاحظات ولا تُعدّل أو تُحذف."),
    submitted: p("Submitted", "تاريخ الإرسال"),
    listedPrice: p("Listed price", "السعر المعلن"),
    available: p("Available", "متاح"),
    unavailable: p("Unavailable", "غير متاح"),
    reference: p("Reference", "المرجع")
  };
}

const SCOPES: Record<SupplierDemandScope, { en: string; ar: string; unitEn: string; unitAr: string }> = {
  HOTEL_ROOMS: { en: "Hotel rooms", ar: "غرف فندقية", unitEn: "rooms", unitAr: "غرفة" },
  VEHICLES: { en: "Vehicles", ar: "مركبات", unitEn: "vehicles", unitAr: "مركبة" },
  TICKETS: { en: "Tickets", ar: "تذاكر", unitEn: "tickets", unitAr: "تذكرة" }
};

const STATUSES: Record<SupplierQuoteStatus, { en: string; ar: string; tone: "info" | "ok" | "danger" | "gold" | "neutral" }> = {
  REQUESTED: { en: "Requested", ar: "مطلوب", tone: "neutral" },
  RECEIVED: { en: "Received, under review", ar: "مستلم، قيد المراجعة", tone: "info" },
  RECOMMENDED: { en: "Recommended", ar: "موصى به", tone: "gold" },
  APPROVED: { en: "Approved", ar: "معتمد", tone: "ok" },
  REJECTED: { en: "Not selected", ar: "لم يتم اختياره", tone: "danger" }
};

const CATEGORIES: Record<string, { en: string; ar: string }> = {
  HOTEL: { en: "Hotels", ar: "الفنادق" },
  CAR: { en: "Transport", ar: "النقل" },
  TICKET: { en: "Tickets", ar: "التذاكر" },
  CATERING: { en: "Catering", ar: "الضيافة والتموين" },
  EQUIPMENT: { en: "Equipment", ar: "المعدات" },
  TOURISM: { en: "Tourism", ar: "السياحة" }
};

export function scopeLabel(scope: SupplierDemandScope, isArabic: boolean) {
  return isArabic ? SCOPES[scope].ar : SCOPES[scope].en;
}

export function estimateLabel(request: Pick<SupplierRequestView, "scope" | "estimatedQuantity">, isArabic: boolean) {
  const scope = SCOPES[request.scope];
  return `${request.estimatedQuantity} ${isArabic ? scope.unitAr : scope.unitEn}`;
}

export function quoteStatusLabel(status: SupplierQuoteStatus, isArabic: boolean) {
  return isArabic ? STATUSES[status].ar : STATUSES[status].en;
}

export function categoryLabel(category: string, isArabic: boolean) {
  const known = CATEGORIES[category];
  return known ? (isArabic ? known.ar : known.en) : category;
}

/** SAR with two decimals and Western digits in both languages. */
export function sar(value: string | number, isArabic: boolean) {
  const amount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value));
  return isArabic ? `${amount} ر.س` : `SAR ${amount}`;
}

function twoDecimals(value: number) {
  const scaled = value * 100;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** Mirrors the server's strict quote rules so mistakes are caught before sending. */
export function validateQuoteDraft(
  draft: QuoteDraft,
  isArabic: boolean
): { errors: Partial<Record<keyof QuoteDraft, string>>; value?: QuoteValue; totalCents?: number } {
  const errors: Partial<Record<keyof QuoteDraft, string>> = {};
  const item = draft.item.trim();
  if (item.length < 2 || item.length > 200) {
    errors.item = isArabic ? "اكتب وصفاً من 2 إلى 200 حرف" : "Use 2 to 200 characters";
  }
  const quantity = Number(draft.quantity);
  if (!draft.quantity.trim() || !Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
    errors.quantity = isArabic ? "عدد صحيح من 1 إلى 1,000,000" : "A whole number from 1 to 1,000,000";
  }
  const unitPrice = Number(draft.unitPrice);
  if (
    !draft.unitPrice.trim() ||
    !Number.isFinite(unitPrice) ||
    unitPrice < 0 ||
    unitPrice > 9_999_999.99 ||
    !twoDecimals(unitPrice)
  ) {
    errors.unitPrice = isArabic
      ? "سعر من 0 إلى 9,999,999.99 بخانتين عشريتين كحد أقصى"
      : "A price from 0 to 9,999,999.99 with at most two decimals";
  }
  if (Object.keys(errors).length) return { errors };

  const totalCents = Math.round(unitPrice * 100) * quantity;
  if (totalCents > MAX_TOTAL_CENTS) {
    return {
      errors: {
        quantity: isArabic ? "الإجمالي يتجاوز الحد المسموح" : "The total exceeds the supported maximum"
      }
    };
  }
  return { errors, value: { item, quantity, unitPrice }, totalCents };
}

export function supplierErrorMessage(error: unknown, isArabic: boolean) {
  const status = error instanceof ApiError ? error.status : 0;
  const p = (en: string, ar: string) => (isArabic ? ar : en);
  switch (status) {
    case 409:
      return p(
        "A quotation was already submitted for this request, or it can no longer be accepted.",
        "تم إرسال عرض لهذا الطلب مسبقاً أو لم يعد بالإمكان قبوله."
      );
    case 404:
      return p("This request is no longer open.", "هذا الطلب لم يعد مفتوحاً.");
    case 422:
      return p("The total exceeds the supported maximum.", "الإجمالي يتجاوز الحد المسموح.");
    case 403:
      return p("Your account cannot submit for this request.", "لا يمكن لحسابك الإرسال لهذا الطلب.");
    case 400:
      return p("Please check the entered values.", "يرجى التحقق من القيم المدخلة.");
    default:
      return p("Something went wrong. Try again.", "حدث خطأ. حاول مجدداً.");
  }
}

export async function loadSupplierWorkspace(accessToken: string): Promise<SupplierWorkspace> {
  const [dashboard, requests, quotes] = await Promise.all([
    apiFetch<SupplierDashboardView>("/suppliers/me/dashboard", accessToken),
    apiFetch<SupplierRequestsResponse>("/suppliers/me/requests", accessToken),
    apiFetch<SupplierQuotesResponse>("/suppliers/me/quotes?limit=100", accessToken)
  ]);
  return { dashboard, requests: requests.requests, quotes: quotes.quotes };
}

export function SupplierDashboard({ session, isArabic }: { session?: Session; isArabic: boolean }) {
  const [state, setState] = useState<WorkspaceState>({ status: "loading" });
  const tokenRef = useRef(session?.accessToken);
  tokenRef.current = session?.accessToken;
  const copy = supplierCopy(isArabic);

  const load = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      const value = await loadSupplierWorkspace(token);
      // A reply for an older session must not paint over the current one.
      if (tokenRef.current === token) setState({ status: "ready", value });
    } catch {
      if (tokenRef.current === token) setState({ status: "error", message: copy.loadFailed });
    }
  }, [copy.loadFailed]);

  useEffect(() => {
    setState({ status: "loading" });
    void load();
  }, [session?.accessToken]);

  async function submitQuote(intakeId: string, value: QuoteValue) {
    const token = tokenRef.current;
    if (!token) return copy.loadFailed;
    try {
      await apiFetch(`/suppliers/me/requests/${encodeURIComponent(intakeId)}/quotes`, token, {
        method: "POST",
        body: JSON.stringify(value)
      });
      await load();
      return null;
    } catch (error) {
      await load();
      return supplierErrorMessage(error, isArabic);
    }
  }

  async function addNote(intakeId: string, text: string) {
    const token = tokenRef.current;
    if (!token) return copy.loadFailed;
    try {
      await apiFetch(`/suppliers/me/requests/${encodeURIComponent(intakeId)}/notes`, token, {
        method: "POST",
        body: JSON.stringify({ text })
      });
      await load();
      return null;
    } catch (error) {
      return supplierErrorMessage(error, isArabic);
    }
  }

  return (
    <SupplierWorkspaceView
      state={state}
      isArabic={isArabic}
      onRetry={() => {
        setState({ status: "loading" });
        void load();
      }}
      onSubmitQuote={submitQuote}
      onAddNote={addNote}
    />
  );
}

export function SupplierWorkspaceView({
  state,
  isArabic,
  onRetry,
  onSubmitQuote,
  onAddNote
}: {
  state: WorkspaceState;
  isArabic: boolean;
  onRetry: () => void;
  onSubmitQuote: (intakeId: string, value: QuoteValue) => Promise<string | null>;
  onAddNote: (intakeId: string, text: string) => Promise<string | null>;
}) {
  const copy = supplierCopy(isArabic);

  if (state.status === "loading") {
    return (
      <div aria-busy className="rounded-lg border border-hairline bg-surface-2 p-8 text-center text-sm text-ink-muted">
        {copy.loading}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-lg border border-danger/30 bg-surface-2 p-8 text-center">
        <p className="text-base font-bold text-ink">{state.message}</p>
        <Button variant="outline" onClick={onRetry} leadingIcon={<RotateCcw className="size-4" aria-hidden />}>
          {copy.retry}
        </Button>
      </div>
    );
  }

  const { dashboard, requests, quotes } = state.value;
  if (!dashboard.linked || !dashboard.profile) {
    return (
      <Surface>
        <EmptyState
          icon={<Package className="size-5" />}
          title={copy.unlinkedTitle}
          description={copy.unlinkedBody}
        />
      </Surface>
    );
  }

  const profile = dashboard.profile;
  const city = profile.city ? (isArabic ? profile.city.nameAr : profile.city.nameEn) : null;
  const locale = isArabic ? "ar" : "en";

  return (
    <div className="space-y-6">
      <PortalHero
        badge={copy.badge}
        title={profile.name}
        body={[categoryLabel(profile.category, isArabic), city].filter(Boolean).join(" · ")}
        action={
          <Badge tone={profile.verified ? "ok" : "warn"} size="lg">
            <ShieldCheck className="size-3.5" aria-hidden />
            {profile.verified ? copy.verified : copy.unverified}
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label={copy.openRequests} value={requests.length} icon={<ClipboardList className="size-4" />} />
        <StatTile label={copy.myQuotes} value={quotes.length} icon={<FileSignature className="size-4" />} />
        <StatTile label={copy.myBookings} value={dashboard.bookings.length} icon={<CalendarDays className="size-4" />} />
      </div>

      <Section title={copy.openRequests}>
        {requests.length ? (
          <div className="space-y-4">
            {requests.map((request) => (
              <RequestCard
                key={request.intakeId}
                request={request}
                isArabic={isArabic}
                onSubmitQuote={onSubmitQuote}
                onAddNote={onAddNote}
              />
            ))}
          </div>
        ) : (
          <EmptyState compact title={copy.noRequests} description={copy.noRequestsBody} />
        )}
      </Section>

      <Section title={copy.myQuotes}>
        {quotes.length ? (
          <ul className="space-y-2">
            {quotes.map((quote) => (
              <li key={quote.id}>
                <OwnQuoteSummary quote={quote} isArabic={isArabic} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title={copy.noQuotes} />
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={copy.myServices}>
          {dashboard.services.length ? (
            <ul className="space-y-2">
              {dashboard.services.map((service) => (
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

        <Section title={copy.myBookings}>
          {dashboard.bookings.length ? (
            <ul className="space-y-2">
              {dashboard.bookings.map((booking) => (
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

function OwnQuoteSummary({ quote, isArabic }: { quote: SupplierOwnQuote; isArabic: boolean }) {
  const copy = supplierCopy(isArabic);
  const status = STATUSES[quote.status];
  return (
    <Surface padding="sm" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{quote.item}</p>
        <Badge tone={status.tone}>{quoteStatusLabel(quote.status, isArabic)}</Badge>
      </div>
      <p className="font-tnum text-xs text-ink-muted">
        {quote.quantity} × {sar(quote.unitPrice, isArabic)} = {sar(quote.totalPrice, isArabic)} ·{" "}
        {copy.reference}: {quote.requestReference} · {copy.submitted}:{" "}
        {shortDate(quote.submittedAt, isArabic ? "ar" : "en")}
      </p>
      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Lock className="size-3" aria-hidden />
        {copy.sealedNote}
      </p>
    </Surface>
  );
}

export function RequestCard({
  request,
  isArabic,
  onSubmitQuote,
  onAddNote
}: {
  request: SupplierRequestView;
  isArabic: boolean;
  onSubmitQuote: (intakeId: string, value: QuoteValue) => Promise<string | null>;
  onAddNote: (intakeId: string, text: string) => Promise<string | null>;
}) {
  const copy = supplierCopy(isArabic);
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

      {request.ownQuote ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-label text-ink-muted">{copy.yourQuote}</h4>
          <OwnQuoteSummary quote={request.ownQuote} isArabic={isArabic} />
        </div>
      ) : (
        <QuoteForm
          isArabic={isArabic}
          defaultQuantity={request.estimatedQuantity}
          onSubmit={(value) => onSubmitQuote(request.intakeId, value)}
        />
      )}

      <NotesPanel
        notes={request.notes}
        isArabic={isArabic}
        onAdd={(text) => onAddNote(request.intakeId, text)}
      />
    </Surface>
  );
}

export function QuoteForm({
  isArabic,
  defaultQuantity,
  onSubmit
}: {
  isArabic: boolean;
  defaultQuantity: number;
  onSubmit: (value: QuoteValue) => Promise<string | null>;
}) {
  const copy = supplierCopy(isArabic);
  const [draft, setDraft] = useState<QuoteDraft>({
    item: "",
    quantity: String(defaultQuantity),
    unitPrice: ""
  });
  const [errors, setErrors] = useState<Partial<Record<keyof QuoteDraft, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const preview = validateQuoteDraft(draft, isArabic);

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        const result = validateQuoteDraft(draft, isArabic);
        setErrors(result.errors);
        if (!result.value) return;
        setPending(true);
        setSubmitError(await onSubmit(result.value));
        setPending(false);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label={copy.item} required error={errors.item}>
          <Input
            value={draft.item}
            maxLength={200}
            onChange={(event) => setDraft({ ...draft, item: event.target.value })}
          />
        </Field>
        <Field label={copy.quantity} required error={errors.quantity}>
          <Input
            inputMode="numeric"
            value={draft.quantity}
            className="font-tnum"
            onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
          />
        </Field>
        <Field label={copy.unitPrice} required error={errors.unitPrice}>
          <Input
            inputMode="decimal"
            value={draft.unitPrice}
            className="font-tnum"
            onChange={(event) => setDraft({ ...draft, unitPrice: event.target.value })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {copy.total}:{" "}
          <span className="font-tnum font-semibold text-ink">
            {preview.totalCents !== undefined ? sar(preview.totalCents / 100, isArabic) : "—"}
          </span>
          <span className="ms-2 text-xs text-ink-faint">{copy.immutable}</span>
        </p>
        <Button type="submit" variant="gold" loading={pending} leadingIcon={<Send className="size-4" aria-hidden />}>
          {copy.submitQuote}
        </Button>
      </div>
      {submitError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {submitError}
        </p>
      ) : null}
    </form>
  );
}

export function NotesPanel({
  notes,
  isArabic,
  onAdd
}: {
  notes: SupplierRequestView["notes"];
  isArabic: boolean;
  onAdd: (text: string) => Promise<string | null>;
}) {
  const copy = supplierCopy(isArabic);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-2 border-t border-hairline pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-label text-ink-muted">{copy.notes}</h4>
      {notes.length ? (
        <ul className="space-y-1.5">
          {notes.map((note) => (
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
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={async (event) => {
          event.preventDefault();
          const trimmed = text.trim();
          if (!trimmed || trimmed.length > 2000) {
            setError(isArabic ? "اكتب ملاحظة من 1 إلى 2000 حرف" : "Write 1 to 2,000 characters");
            return;
          }
          setPending(true);
          const failure = await onAdd(trimmed);
          setPending(false);
          setError(failure);
          if (!failure) setText("");
        }}
      >
        <Field label={copy.addNote} hint={copy.notesAppendOnly} className="flex-1" error={error ?? undefined}>
          <Textarea
            rows={2}
            maxLength={2000}
            value={text}
            placeholder={copy.notePlaceholder}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="outline" loading={pending} leadingIcon={<MessageSquarePlus className="size-4" aria-hidden />}>
          {copy.addNote}
        </Button>
      </form>
    </div>
  );
}

import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, LogOut, Package } from "lucide-react";
import type { Session } from "@shared/domain";
import {
  ONBOARDING_DOCUMENT_KINDS,
  SUPPLIER_CATEGORIES,
  type OnboardingApplicationDto,
  type OnboardingKind,
  type OnboardingStatus
} from "@shared/overhaul";
import { useWorkspaceResource, workspaceDownload, workspaceRequest } from "../lib/workspaceApi";
import { Section } from "./Section";
import { Badge, Button } from "./ui";

const input = "w-full rounded-md border border-hairline bg-surface-1 p-2 text-ink";
const button =
  "rounded-md border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40";
const statuses: Record<OnboardingStatus, [string, string]> = {
  SUBMITTED: ["Submitted", "تم التقديم"],
  UNDER_REVIEW: ["Under review", "تحت المراجعة"],
  APPROVED: ["Approved", "معتمد"],
  REJECTED: ["Rejected", "مرفوض"],
  CONTRACT_SIGNED: ["Contract signed", "العقد موقع"],
  ACTIVE: ["Active", "نشط"]
};
const documents: Record<string, [string, string]> = {
  COMMERCIAL_REGISTRATION: ["Commercial registration", "السجل التجاري"],
  IDENTITY: ["Authorized person ID", "هوية الشخص المفوض"],
  LICENSE: ["License", "الترخيص"],
  ACTIVITY_DOCUMENT: ["Activity-specific document", "مستند النشاط"],
  TAX_CERTIFICATE: ["Tax certificate", "الشهادة الضريبية"],
  SIGNED_CONTRACT: ["Manually signed contract", "العقد الموقع يدوياً"],
  OTHER: ["Other", "أخرى"]
};

export const SUPPLIER_REGISTER_PATH = "/register/supplier";
export const CLIENT_REGISTER_PATH = "/register/client";

/** Pure path matcher for standalone /register/supplier and /register/client entry points. */
export function registrationKindFromPath(pathname: string): OnboardingKind | null {
  const normalized = pathname.trim().replace(/\/+$/, "").toLowerCase();
  if (normalized === SUPPLIER_REGISTER_PATH) return "VENDOR";
  if (normalized === CLIENT_REGISTER_PATH) return "CLIENT";
  return null;
}

/** Canonical URL path for each standalone onboarding registration flow. */
export function registrationPathForKind(kind: OnboardingKind): string {
  return kind === "VENDOR" ? SUPPLIER_REGISTER_PATH : CLIENT_REGISTER_PATH;
}

/** Friendly bilingual error messages for POST /api/auth/onboarding-register. */
export function onboardingRegisterError(
  status: number,
  serverMessage: string | undefined,
  isArabic: boolean
): string {
  if (status === 409) {
    return isArabic
      ? "هذا البريد الإلكتروني مسجل مسبقاً. يرجى تسجيل الدخول أو استخدام بريد إلكتروني آخر."
      : "This email is already registered. Please sign in or use a different email.";
  }
  if (status === 429) {
    return isArabic
      ? "تم إرسال محاولات كثيرة خلال وقت قصير. يرجى الانتظار قليلاً ثم المحاولة مجدداً."
      : "Too many registration attempts. Please wait a moment and try again.";
  }
  return serverMessage || (isArabic ? "تعذر إتمام التسجيل" : "Registration failed");
}

function isValidSessionPayload(payload: unknown): payload is Session {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  return (
    typeof record.accessToken === "string" &&
    typeof record.refreshToken === "string" &&
    Boolean(record.user && typeof record.user === "object")
  );
}

/**
 * Standalone top-level registration page reachable without login at
 * /register/supplier (fixedKind="VENDOR") and /register/client (fixedKind="CLIENT").
 */
export function ApplicantRegistration({
  isArabic: ar,
  fixedKind,
  onRegistered,
  onLogin,
  onBack,
  onLanguageToggle,
  onSwitchKind
}: {
  isArabic: boolean;
  /** When set, locks the registration form to Supplier (VENDOR) or Client (CLIENT). */
  fixedKind?: OnboardingKind;
  /** Installs the returned Session immediately after registration. */
  onRegistered?: (session: Session) => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onBack: () => void;
  onLanguageToggle?: () => void;
  onSwitchKind?: (kind: OnboardingKind) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSupplier = fixedKind === "VENDOR";
  const isClient = fixedKind === "CLIENT";
  const title = isSupplier
    ? ar
      ? "تسجيل مورد جديد"
      : "Register as a supplier"
    : isClient
      ? ar
        ? "تسجيل عميل جديد"
        : "Register as a client"
      : ar
        ? "نظام تسجيل الموردين والعملاء"
        : "Vendor & client registration";

  const description = isSupplier
    ? ar
      ? "أنشئ حساب مورد لاستكمال ملف الشركة ورفع المستندات الرسمية. تُفتح مساحة المورد بعد الاعتماد وتوثيق العقد والتفعيل."
      : "Create a supplier account to submit your company profile and official documents. Supplier portal access opens after review, signed-contract verification and activation."
    : isClient
      ? ar
        ? "أنشئ حساب عميل لاستكمال بيانات الجهة ورفع المستندات الرسمية. تُفتح بوابة العميل بعد الاعتماد وتوثيق العقد والتفعيل."
        : "Create a client account to submit your organization profile and official documents. Client portal access opens after review, signed-contract verification and activation."
      : ar
        ? "أنشئ حساب مقدم طلب. يبدأ العمل بعد المراجعة وتوثيق العقد والتفعيل."
        : "Create an applicant account. Operational access starts after review, signed-contract evidence and activation.";

  const otherKind: OnboardingKind | null = fixedKind ? (fixedKind === "VENDOR" ? "CLIENT" : "VENDOR") : null;

  return (
    <main
      className="min-h-screen bg-surface-1 text-ink"
      dir={ar ? "rtl" : "ltr"}
      data-registration-page={fixedKind ?? "COMBINED"}
    >
      <header className="border-b border-hairline bg-surface-2/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/midyaf-icon.png"
              alt={ar ? "مضياف" : "Midyaf"}
              className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-gold-500/40"
            />
            <div className="min-w-0">
              <span className="block truncate text-sm font-bold text-ink">
                {ar ? "مضياف" : "Midyaf"}
              </span>
              <span className="block truncate text-xs text-gold-500">{title}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onLanguageToggle ? (
              <Button variant="ghost" size="sm" onClick={onLanguageToggle}>
                {ar ? "English" : "العربية"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              leadingIcon={ar ? <ArrowRight className="size-4" aria-hidden /> : <ArrowLeft className="size-4" aria-hidden />}
              onClick={onBack}
            >
              {ar ? "العودة للدخول" : "Back to sign in"}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 px-5 py-8">
        {fixedKind ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="gold" size="lg">
              {isSupplier ? (
                <Package className="size-3.5" aria-hidden />
              ) : (
                <Building2 className="size-3.5" aria-hidden />
              )}
              {isSupplier
                ? ar
                  ? "مسار تسجيل الموردين"
                  : "Supplier onboarding"
                : ar
                  ? "مسار تسجيل العملاء"
                  : "Client onboarding"}
            </Badge>
            {otherKind && onSwitchKind ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSwitchKind(otherKind)}
                data-switch-registration-kind={otherKind}
              >
                {otherKind === "VENDOR"
                  ? ar
                    ? "تسجيل كمورد بدلاً من ذلك"
                    : "Register as a supplier instead"
                  : ar
                    ? "تسجيل كعميل بدلاً من ذلك"
                    : "Register as a client instead"}
              </Button>
            ) : null}
          </div>
        ) : null}

        <Section
          id={`section-register-${(fixedKind ?? "combined").toLowerCase()}`}
          title={title}
          description={description}
          collapsible={false}
          isArabic={ar}
        >
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                const base = import.meta.env.VITE_API_BASE_URL ?? "/api";
                const payload = {
                  ...Object.fromEntries(f.entries()),
                  ...(fixedKind ? { kind: fixedKind } : {}),
                  language: ar ? "ar" : "en"
                };
                const response = await fetch(`${base}/auth/onboarding-register`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload)
                });
                const data = await response.json().catch(() => null);
                if (!response.ok) {
                  throw new Error(onboardingRegisterError(response.status, data?.error?.message, ar));
                }
                if (onRegistered && isValidSessionPayload(data)) {
                  onRegistered(data);
                } else {
                  await onLogin(String(f.get("email")), String(f.get("password")));
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : ar ? "تعذر إتمام التسجيل" : "Registration failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {fixedKind ? (
              <input type="hidden" name="kind" value={fixedKind} />
            ) : (
              <label>
                {ar ? "نوع التسجيل" : "Registration type"}
                <select name="kind" className={input}>
                  <option value="VENDOR">{ar ? "مورد" : "Vendor"}</option>
                  <option value="CLIENT">{ar ? "عميل / منظم فعاليات" : "Client / event organizer"}</option>
                </select>
              </label>
            )}
            {(
              [
                ["name", ar ? "اسم الشخص المفوض" : "Authorized person"],
                ["email", ar ? "البريد الإلكتروني" : "Email"],
                ["phone", ar ? "الجوال بصيغة +9665XXXXXXXX" : "Phone: +9665XXXXXXXX"]
              ] as const
            ).map(([name, label]) => (
              <label key={name}>
                {label}
                <input
                  required
                  className={input}
                  name={name}
                  type={name === "email" ? "email" : "text"}
                  dir={name === "email" || name === "phone" ? "ltr" : undefined}
                  autoComplete={name === "name" ? "name" : name === "email" ? "email" : "tel"}
                />
              </label>
            ))}
            <label>
              {ar ? "كلمة مرور خاصة بك (12 حرفاً على الأقل)" : "Your password (at least 12 characters)"}
              <input
                required
                name="password"
                type="password"
                minLength={12}
                maxLength={72}
                autoComplete="new-password"
                dir="ltr"
                className={input}
              />
            </label>
            {error ? (
              <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="gold" size="lg" loading={busy} className="w-full">
              {busy
                ? ar
                  ? "جارٍ التسجيل…"
                  : "Registering…"
                : ar
                  ? "إنشاء حساب واستكمال الطلب"
                  : "Create account & complete application"}
            </Button>
          </form>
        </Section>
      </div>
    </main>
  );
}

/**
 * Standalone top-level frame for pending applicants completing company details
 * and document uploads (never nested inside an organizing company dashboard).
 */
export function StandaloneOnboardingFrame({
  session,
  isArabic: ar,
  onLanguageToggle,
  onLogout,
  onRefresh
}: {
  session: Session;
  isArabic: boolean;
  onLanguageToggle: () => void;
  onLogout: () => void;
  onRefresh: () => Promise<void>;
}) {
  const isSupplier = session.user.onboardingKind === "VENDOR";
  return (
    <div className="min-h-screen bg-surface-1 text-ink" dir={ar ? "rtl" : "ltr"} data-standalone-onboarding>
      <header className="sticky top-0 z-header border-b border-hairline bg-surface-2/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/midyaf-icon.png"
              alt={ar ? "مضياف" : "Midyaf"}
              className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-gold-500/40"
            />
            <div className="min-w-0">
              <span className="block truncate text-sm font-bold text-ink">{ar ? "مضياف" : "Midyaf"}</span>
              <span className="block truncate text-xs text-gold-500">
                {isSupplier
                  ? ar
                    ? "استكمال طلب تسجيل المورد"
                    : "Complete supplier registration"
                  : ar
                    ? "استكمال طلب تسجيل العميل"
                    : "Complete client registration"}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onLanguageToggle}>
              {ar ? "English" : "العربية"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<LogOut className="size-4" aria-hidden />}
              onClick={onLogout}
            >
              {ar ? "تسجيل الخروج" : "Sign out"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        <OnboardingWorkspace session={session} isArabic={ar} onRefresh={onRefresh} />
      </main>
    </div>
  );
}

export function OnboardingWorkspace({
  session,
  isArabic: ar,
  onRefresh
}: {
  session: Session;
  isArabic: boolean;
  onRefresh?: () => Promise<void>;
}) {
  const token = session.accessToken;
  const reviewer = session.user.role === "SUPER_ADMIN";
  const [revision, refresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const resource = useWorkspaceResource<{ applications: OnboardingApplicationDto[] }>(
    token,
    "/onboarding/applications",
    revision
  );
  const application =
    resource.data?.applications.find((app) => app.id === selected) ?? resource.data?.applications[0];
  const open = resource.data?.applications.some((app) => !["REJECTED", "ACTIVE"].includes(app.status));
  async function work(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      refresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4" dir={ar ? "rtl" : "ltr"}>
      <Section
        id="section-onboarding-applications"
        title={ar ? "نظام تسجيل الموردين والعملاء" : "Vendor & client onboarding"}
        description={
          reviewer
            ? ar
              ? "مراجعة المستندات ثم القرار والعقد الموقع والتفعيل"
              : "Review documents, decide, record the signed contract, then activate"
            : ar
              ? "تتاح الصلاحيات التشغيلية بعد التفعيل فقط"
              : "Operational permissions become available only after activation"
        }
        isArabic={ar}
        action={
          <button type="button" className={button} onClick={() => refresh((n) => n + 1)}>
            {ar ? "تحديث" : "Refresh"}
          </button>
        }
      >
        {(error || resource.error) && (
          <p role="alert" className="text-red-500">
            {error || resource.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {resource.data?.applications.map((app) => (
            <button
              key={app.id}
              type="button"
              className={button}
              onClick={() => setSelected(app.id)}
            >
              {app.companyName} · {statuses[app.status][ar ? 1 : 0]}
            </button>
          ))}
        </div>
        {resource.data?.applications.length === 0 && (
          <p>{ar ? "لا توجد طلبات بعد" : "No applications yet"}</p>
        )}
      </Section>
      {!reviewer && !open && (
        <Section
          id="section-onboarding-submit"
          title={ar ? "تقديم طلب رسمي" : "Submit an official request"}
          isArabic={ar}
        >
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const kind = String(f.get("kind"));
              void work(async () => {
                const body: Record<string, unknown> = {
                  kind,
                  companyName: f.get("companyName"),
                  registrationNumber: f.get("registrationNumber"),
                  contactName: f.get("contactName"),
                  contactEmail: f.get("contactEmail"),
                  contactPhone: f.get("contactPhone"),
                  city: f.get("city")
                };
                if (kind === "VENDOR") body.vendorCategory = f.get("vendorCategory");
                const result = await workspaceRequest<{ application: OnboardingApplicationDto }>(
                  token,
                  "/onboarding/applications",
                  body
                );
                setSelected(result.application.id);
              });
            }}
          >
            <label>
              {ar ? "النوع" : "Type"}
              <select
                name="kind"
                defaultValue={session.user.onboardingKind ?? (session.user.role === "SUPPLIER" ? "VENDOR" : "CLIENT")}
                className={input}
              >
                {(!session.user.onboardingKind || session.user.onboardingKind === "VENDOR") && (
                  <option value="VENDOR">{ar ? "مورد" : "Vendor"}</option>
                )}
                {(!session.user.onboardingKind || session.user.onboardingKind === "CLIENT") && (
                  <option value="CLIENT">{ar ? "عميل / منظم" : "Client / organizer"}</option>
                )}
              </select>
            </label>
            {(!session.user.onboardingKind || session.user.onboardingKind === "VENDOR") ? (
              <label>
                {ar ? "نشاط المورد (للموردين)" : "Vendor activity (vendors only)"}
                <select name="vendorCategory" className={input}>
                  {SUPPLIER_CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {(
              [
                ["companyName", ar ? "اسم الشركة" : "Company name", ""],
                ["registrationNumber", ar ? "رقم السجل التجاري" : "Commercial registration number", ""],
                ["city", ar ? "المدينة" : "City", ""],
                ["contactName", ar ? "اسم المفوض" : "Authorized person", session.user.name],
                ["contactEmail", ar ? "بريد المفوض" : "Contact email", session.user.email],
                ["contactPhone", ar ? "جوال المفوض" : "Contact phone", session.user.phone]
              ] as const
            ).map(([name, label, value]) => (
              <label key={name}>
                {label}
                <input
                  required
                  name={name}
                  type={name === "contactEmail" ? "email" : "text"}
                  defaultValue={value}
                  className={input}
                />
              </label>
            ))}
            <button className={button} disabled={busy}>
              {ar ? "تقديم الطلب" : "Submit application"}
            </button>
          </form>
        </Section>
      )}
      {application && (
        <Section
          id="section-onboarding-detail"
          title={`${application.companyName} · ${statuses[application.status][ar ? 1 : 0]}`}
          isArabic={ar}
        >
          <dl className="grid gap-2 text-sm md:grid-cols-2">
            <div>
              {ar ? "رقم السجل" : "Registration"}: {application.registrationNumber}
            </div>
            <div>
              {application.kind} · {application.vendorCategory}
            </div>
            <div>
              {application.contactName} · {application.contactEmail}
            </div>
            <div>
              {application.contactPhone} · {application.city}
            </div>
          </dl>
          {application.decisionNote && <p className="mt-3">{application.decisionNote}</p>}
          <ul className="my-4 space-y-2">
            {application.documents.map((doc) => (
              <li className="flex flex-wrap items-center gap-3 rounded border border-hairline p-3" key={doc.id}>
                <span>
                  {documents[doc.kind]?.[ar ? 1 : 0] ?? doc.kind} · {doc.fileName}
                </span>
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    void work(() =>
                      workspaceDownload(
                        token,
                        `/onboarding/applications/${application.id}/documents/${doc.id}/content`,
                        doc.fileName
                      )
                    )
                  }
                >
                  {ar ? "تنزيل خاص" : "Private download"}
                </button>
              </li>
            ))}
          </ul>
          {((!reviewer && ["SUBMITTED", "UNDER_REVIEW"].includes(application.status)) ||
            (reviewer && application.status === "APPROVED")) && (
            <form
              className="grid gap-3 rounded border border-hairline p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                const file = f.get("file");
                void work(async () => {
                  if (!(file instanceof File) || !file.size || file.size > 1048576) {
                    throw new Error(
                      ar ? "الملف PDF أو PNG أو JPEG وبحد 1 MiB" : "Use a PDF, PNG or JPEG up to 1 MiB"
                    );
                  }
                  const bytes = new Uint8Array(await file.arrayBuffer());
                  let binary = "";
                  for (let i = 0; i < bytes.length; i += 8192) {
                    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
                  }
                  await workspaceRequest(token, `/onboarding/applications/${application.id}/documents`, {
                    kind: f.get("kind"),
                    fileName: file.name,
                    mimeType: file.type,
                    contentBase64: btoa(binary)
                  });
                  form.reset();
                });
              }}
            >
              <label>
                {ar ? "نوع المستند" : "Document type"}
                <select name="kind" className={input}>
                  {(reviewer
                    ? ["SIGNED_CONTRACT"]
                    : ONBOARDING_DOCUMENT_KINDS.filter((kind) => kind !== "SIGNED_CONTRACT")
                  ).map((kind) => (
                    <option key={kind} value={kind}>
                      {documents[kind]?.[ar ? 1 : 0] ?? kind}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {ar ? "المستند الرسمي (خاص)" : "Official document (private)"}
                <input required name="file" type="file" accept=".pdf,.png,.jpg,.jpeg" />
              </label>
              <p className="text-sm text-ink-muted">
                {ar
                  ? "يلزم السجل وهوية المفوض والترخيص ومستند النشاط للمورد قبل الاعتماد"
                  : "Approval requires registration, authorized ID, license and the vendor activity document"}
              </p>
              <button className={button} disabled={busy}>
                {ar ? "رفع المستند" : "Upload document"}
              </button>
            </form>
          )}
          {reviewer && application.allowedTransitions.length > 0 && (
            <form
              className="mt-4 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const to = String(f.get("to"));
                void work(() =>
                  workspaceRequest(token, `/onboarding/applications/${application.id}/transitions`, {
                    to,
                    ...(f.get("note") ? { note: f.get("note") } : {}),
                    ...(to === "CONTRACT_SIGNED" ? { confirmSignedContract: true } : {})
                  })
                );
              }}
            >
              <label>
                {ar ? "الإجراء التالي" : "Next action"}
                <select name="to" className={input}>
                  {application.allowedTransitions.map((status) => (
                    <option key={status} value={status}>
                      {statuses[status][ar ? 1 : 0]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {ar ? "سبب القرار / مرجع العقد الموقع" : "Decision reason / signed-contract reference"}
                <textarea required name="note" maxLength={1000} className={input} />
              </label>
              <label>
                <input required type="checkbox" />{" "}
                {ar
                  ? "راجعت المستندات وأؤكد هذا الإجراء. عند تسجيل التوقيع، العقد موقع فعلياً."
                  : "I reviewed the documents and confirm this action. A recorded signature attests an already signed contract."}
              </label>
              <button disabled={busy} className={button}>
                {ar ? "تنفيذ الإجراء" : "Apply action"}
              </button>
            </form>
          )}
          {application.status === "ACTIVE" && session.user.onboardingPending && onRefresh && (
            <button type="button" className={`${button} mt-4`} onClick={() => void work(onRefresh)}>
              {ar ? "تحديث الدخول وفتح الحساب المفعل" : "Refresh sign-in & open active account"}
            </button>
          )}
          <ol className="mt-4 text-xs text-ink-muted">
            {application.transitions.map((transition, i) => (
              <li key={i}>
                {statuses[transition.to][ar ? 1 : 0]} · {transition.actor.name} ·{" "}
                {new Date(transition.at).toLocaleString(ar ? "ar-SA" : "en-GB")}
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

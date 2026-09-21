import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, ImageUp, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import type { Session } from "@shared/domain";
import { Button, Field, Input } from "../components/ui";
import { apiUploadFile, registerGuest } from "../lib/api";
import { cn } from "../lib/cn";
import { entrance } from "../lib/motion";

type Step = 1 | 2 | 3;

/**
 * Guest self-registration (pre-login, `#onboarding`). Three steps: identity,
 * hospitality preferences + ID document, review. Submit registers the guest
 * account, uploads the document under the new session, then hands that
 * session back so the guest lands in their app signed in.
 */
export function GuestSelfOnboarding({
  isArabic,
  onComplete
}: {
  isArabic: boolean;
  onComplete: (session: Session) => void;
}) {
  const p = (en: string, ar: string) => (isArabic ? ar : en);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "+9665",
    password: "",
    dietary: ""
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const phoneOk = /^\+9665\d{8}$/.test(form.phone);

  function pickFile(next: File | null) {
    setFile(next);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(
      next && next.type.startsWith("image/") ? URL.createObjectURL(next) : null
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (step === 1) {
      if (!phoneOk) {
        setError(
          p(
            "Phone must be +9665XXXXXXXX",
            "يجب أن يكون الجوال بصيغة +9665XXXXXXXX"
          )
        );
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }

    setBusy(true);
    try {
      const session = await registerGuest({
        name: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
        language: isArabic ? "ar" : "en"
      });
      if (file) {
        // Best effort: the account exists either way; a failed upload is
        // reported, not fatal, so the guest is never stranded pre-login.
        try {
          await apiUploadFile(
            file,
            { type: "OTHER", userId: session.user.id },
            session.accessToken
          );
        } catch {
          setError(
            p(
              "Account created; the ID upload failed — you can retry from your app.",
              "تم إنشاء الحساب؛ تعذر رفع الهوية — يمكنك المحاولة من تطبيقك."
            )
          );
        }
      }
      onComplete(session);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : p("Registration failed", "تعذر التسجيل")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface-0 p-4 text-ink",
        isArabic ? "font-arabic" : "font-english"
      )}
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <motion.div
        variants={entrance.rise(0)}
        initial="initial"
        animate="animate"
        className="w-full max-w-md overflow-hidden rounded-lg border border-hairline bg-surface-2 shadow-dropdown"
      >
        <header className="border-b border-hairline px-6 py-5 text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-lg border border-gold-500/40 bg-gold-500/10 text-gold-300">
            <UserPlus className="size-5" />
          </span>
          <h1 className="text-display-sm text-ink">
            {p("Guest registration", "تسجيل الضيوف")}
          </h1>
          <p className="mt-1 text-xs text-ink-muted">
            {p("Sila guest portal", "بوابة ضيوف صلة")}
          </p>
        </header>

        <form onSubmit={submit} className="space-y-5 p-6">
          <ol
            className="relative flex justify-between"
            aria-label={p("Steps", "الخطوات")}
          >
            <span
              className="absolute inset-x-4 top-1/2 -z-0 h-px -translate-y-1/2 bg-hairline"
              aria-hidden
            />
            {([1, 2, 3] as Step[]).map((s) => (
              <li
                key={s}
                aria-current={step === s ? "step" : undefined}
                className={cn(
                  "font-tnum relative z-10 grid size-8 place-items-center rounded-full text-xs font-bold transition-colors duration-base",
                  step >= s
                    ? "bg-gold-500 text-surface-0"
                    : "border border-hairline bg-surface-2 text-ink-muted"
                )}
              >
                {s}
              </li>
            ))}
          </ol>

          {step === 1 ? (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-ink">
                {p("Your details", "بياناتك")}
              </h2>
              <Field label={p("Full name", "الاسم الكامل")} required>
                <Input
                  required
                  value={form.fullName}
                  onChange={set("fullName")}
                  placeholder={p("As shown on ID", "كما هو موضح في الهوية")}
                  className="h-11"
                  autoComplete="name"
                />
              </Field>
              <Field label={p("Email", "البريد الإلكتروني")} required>
                <Input
                  required
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  className="h-11"
                  autoComplete="email"
                  dir="ltr"
                />
              </Field>
              <Field
                label={p("Mobile", "رقم الجوال")}
                hint="+9665XXXXXXXX"
                required
              >
                <Input
                  required
                  type="tel"
                  value={form.phone}
                  onChange={set("phone")}
                  className="h-11 font-tnum"
                  autoComplete="tel"
                  dir="ltr"
                />
              </Field>
              <Field
                label={p("Password", "كلمة المرور")}
                hint={p("At least 8 characters", "8 أحرف على الأقل")}
                required
              >
                <Input
                  required
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={set("password")}
                  className="h-11"
                  autoComplete="new-password"
                  dir="ltr"
                />
              </Field>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-ink">
                {p("Hospitality preferences", "تفضيلات الضيافة")}
              </h2>
              <Field
                label={p(
                  "Dietary restrictions (optional)",
                  "القيود الغذائية (اختياري)"
                )}
              >
                <Input
                  value={form.dietary}
                  onChange={set("dietary")}
                  placeholder={p(
                    "Vegan, gluten-free…",
                    "نباتي، خالٍ من الغلوتين…"
                  )}
                  className="h-11"
                />
              </Field>
              <Field
                label={p("National ID / passport", "الهوية الوطنية / الجواز")}
                hint={p(
                  "Photo or PDF, up to 10 MB",
                  "صورة أو PDF حتى 10 ميغابايت"
                )}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className={cn(
                    "flex min-h-28 w-full items-center justify-center gap-3 rounded-lg border border-dashed p-4 text-start transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus",
                    file
                      ? "border-ok/50 bg-ok/5"
                      : "border-gold-500/40 bg-surface-1 hover:bg-surface-3"
                  )}
                >
                  {preview ? (
                    <img
                      src={preview}
                      alt=""
                      className="size-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <ImageUp className="size-6 shrink-0 text-gold-300" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {file
                        ? file.name
                        : p(
                            "Tap to photograph or choose a file",
                            "انقر لالتقاط صورة أو اختيار ملف"
                          )}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {file
                        ? p("Tap to replace", "انقر للاستبدال")
                        : p(
                            "Optional now; required before arrival",
                            "اختياري الآن؛ مطلوب قبل الوصول"
                          )}
                    </span>
                  </span>
                </button>
              </Field>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4 py-2 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-ok/10 text-ok">
                <CheckCircle2 className="size-7" />
              </span>
              <h2 className="text-lg font-bold text-ink">
                {p("Ready to submit", "جاهز للإرسال")}
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-start text-sm">
                <dt className="text-ink-muted">{p("Name", "الاسم")}</dt>
                <dd className="truncate text-ink">{form.fullName}</dd>
                <dt className="text-ink-muted">{p("Mobile", "الجوال")}</dt>
                <dd className="font-tnum text-ink" dir="ltr">
                  {form.phone}
                </dd>
                <dt className="text-ink-muted">{p("Document", "المستند")}</dt>
                <dd className="truncate text-ink">
                  {file ? file.name : p("Not attached", "غير مرفق")}
                </dd>
              </dl>
              <p className="text-xs text-ink-muted">
                {p(
                  "Your account is created and your digital arrival pass is issued at the curb.",
                  "سيتم إنشاء حسابك وإصدار بطاقة الوصول الرقمية عند الرصيف."
                )}
              </p>
            </div>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            {step > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-12"
                disabled={busy}
                onClick={() => setStep((s) => (s - 1) as Step)}
              >
                {p("Back", "رجوع")}
              </Button>
            ) : null}
            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="h-12 flex-1"
              loading={busy}
            >
              {step < 3
                ? p("Next", "التالي")
                : p("Complete registration", "إكمال التسجيل")}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

import { ApplicantRegistration } from "../components/OnboardingWorkspace";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Globe2, KeyRound, Package, Play, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OnboardingKind } from "@shared/overhaul";
import type { Session } from "@shared/domain";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { SaduRibbon } from "../components/ui/SaduRibbon";
import { getRecoveryOptions, requestPasswordRecovery, resetPasswordWithToken } from "../lib/api";
import { INVESTOR_DEMO_ADMIN_EMAIL } from "../lib/investorDemoApi";
import { entrance } from "../lib/motion";
import { cn } from "../lib/cn";
import "../styles/signature.css";
import { DEMO_PERSONAS, demoPersonasEnabled, selectPersona } from "./demoPersonas";

function readInitialResetToken(propToken?: string | null) {
  if (propToken !== undefined) return propToken || null;
  if (typeof window === "undefined") return null;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const fromHash = hashParams.get("resetToken")?.trim();
  return fromHash || null;
}

function clearResetTokenFromUrl() {
  if (typeof window === "undefined") return;
  const hashRaw = window.location.hash.replace(/^#/, "");
  const hashParams = new URLSearchParams(hashRaw);
  if (!hashParams.has("resetToken")) return;
  hashParams.delete("resetToken");
  const nextHash = hashParams.toString();
  const url = new URL(window.location.href);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ""}`);
}

/** Autofocus only when the email field is already visible to a fine-pointer user. */
export function shouldAutoFocusEmailInput(
  input: Pick<HTMLInputElement, "getBoundingClientRect">,
  win: Pick<Window, "matchMedia" | "innerHeight"> | undefined = typeof window !== "undefined" ? window : undefined
): boolean {
  if (!win || typeof win.matchMedia !== "function" ||
    !win.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    return false;
  }

  const { top, bottom } = input.getBoundingClientRect();
  return top >= 0 && bottom > top && bottom <= win.innerHeight;
}

export function LoginPage({
  isArabic,
  error,
  isLoading,
  onLanguageToggle,
  onLogin,
  onOpenRegistration,
  onRegistered,
  initialResetToken
}: {
  isArabic: boolean;
  error: string | null;
  isLoading: boolean;
  onLanguageToggle: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  /** Standalone top-level navigation to /register/supplier or /register/client. */
  onOpenRegistration?: (kind: OnboardingKind) => void;
  onRegistered?: (session: Session) => void;
  /** Optional override for tests; defaults to ?resetToken=... in window.location.search. */
  initialResetToken?: string | null;
}) {
  const { t } = useTranslation();
  const [joinKind, setJoinKind] = useState<OnboardingKind | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [demoPrompt, setDemoPrompt] = useState(false);
  const [showPersonas] = useState(() => demoPersonasEnabled());
  const [resetToken, setResetToken] = useState<string | null>(() => readInitialResetToken(initialResetToken));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);
  // Sprint 2: self-service "Forgot password?" appears only when the server can email links.
  const [emailRecovery, setEmailRecovery] = useState(false);
  const [forgotState, setForgotState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getRecoveryOptions().then((options) => {
      if (active) setEmailRecovery(options.emailRecovery);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleForgotPassword() {
    const target = email.trim();
    if (!target || !target.includes("@")) {
      setForgotState("error");
      setForgotMessage(isArabic ? "أدخل بريدك الإلكتروني أولاً." : "Enter your email address first.");
      return;
    }
    setForgotState("busy");
    setForgotMessage(null);
    try {
      await requestPasswordRecovery(target);
      setForgotState("sent");
      setForgotMessage(
        isArabic
          ? "إذا كان هناك حساب بهذا البريد فقد أرسلنا رابط إعادة التعيين (صالح 15 دقيقة)."
          : "If an account exists for this email, we've sent a reset link (valid 15 minutes)."
      );
    } catch (err) {
      setForgotState("error");
      setForgotMessage(err instanceof Error ? err.message : isArabic ? "تعذر إرسال الطلب." : "Request failed.");
    }
  }
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const emailInput = emailInputRef.current;
    if (resetToken || joinKind || !emailInput) return;
    if (shouldAutoFocusEmailInput(emailInput)) {
      emailInput.focus({ preventScroll: true });
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(email, password);
  }

  async function handleResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetToken) return;
    if (newPassword.length < 12) {
      setResetError(isArabic ? "يجب أن تكون كلمة المرور 12 حرفاً على الأقل." : "Password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError(isArabic ? "كلمتا المرور غير متطابقتين." : "Passwords do not match.");
      return;
    }
    setResetBusy(true);
    setResetError(null);
    try {
      await resetPasswordWithToken(resetToken, newPassword);
      clearResetTokenFromUrl();
      setResetToken(null);
      setNewPassword("");
      setConfirmPassword("");
      setResetDone(true);
    } catch (err) {
      setResetError(
        err instanceof Error
          ? err.message
          : isArabic
            ? "الرابط غير صالح أو منتهي الصلاحية."
            : "Invalid or expired reset link."
      );
    } finally {
      setResetBusy(false);
    }
  }

  function handleCancelReset() {
    clearResetTokenFromUrl();
    setResetToken(null);
    setResetError(null);
    setNewPassword("");
    setConfirmPassword("");
  }

  function handleLaunchLiveDemo() {
    setEmail(INVESTOR_DEMO_ADMIN_EMAIL);
    setPassword("");
    setDemoPrompt(true);
    passwordInputRef.current?.focus();
  }

  function openRegistration(kind: OnboardingKind) {
    if (onOpenRegistration) {
      onOpenRegistration(kind);
    } else {
      setJoinKind(kind);
    }
  }

  if (joinKind) {
    return (
      <ApplicantRegistration
        isArabic={isArabic}
        fixedKind={joinKind}
        onRegistered={onRegistered}
        onLogin={onLogin}
        onLanguageToggle={onLanguageToggle}
        onSwitchKind={(other) => setJoinKind(other)}
        onBack={() => setJoinKind(null)}
      />
    );
  }

  const features = [
    { icon: Sparkles, label: isArabic ? "تخطيط ذكي" : "AI Planning" },
    { icon: Globe2, label: isArabic ? "عمليات مباشرة" : "Live Ops" },
    { icon: ShieldCheck, label: isArabic ? "إطلاق العمليات" : "Summit Launch" }
  ];
  const DirectionArrow = isArabic ? ArrowLeft : ArrowRight;

  return (
    <div
      data-login-arrival="qasr-dusk"
      className={cn(
        "qasr-dusk-field relative min-h-screen overflow-hidden bg-surface-1 text-ink",
        isArabic ? "font-arabic" : "font-english"
      )}
    >
      {/* Riyadh dusk field: one slow champagne-brass horizon line. Visual only — form is live at t=0. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <motion.div
          variants={entrance.horizon}
          initial={reduced ? false : "initial"}
          animate="animate"
          data-brass-horizon
          className="absolute inset-x-[8%] top-[82%] h-px origin-center bg-gradient-to-r from-transparent via-gold-500/75 to-transparent"
        />
        <div className="absolute inset-x-[22%] top-[82%] h-8 -translate-y-1/2 bg-[radial-gradient(ellipse_at_50%_50%,rgb(var(--gold-500)/0.14),transparent_72%)]" />
      </div>

      <div className="absolute top-0 z-10 flex w-full items-center justify-end px-5 py-5">
        <Button variant="ghost" size="sm" onClick={onLanguageToggle}>
          {t("switchLanguage")}
        </Button>
      </div>

      <main className="relative z-[1] mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-10 px-5 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <section className="min-w-0 space-y-7">
          <motion.div
            variants={entrance.rise(0)}
            initial={reduced ? false : "initial"}
            animate="animate"
            className="inline-flex items-center gap-4"
          >
            <img
              src="/midyaf-logo.png"
              alt={t("brand")}
              className="size-20 rounded-xl object-cover ring-1 ring-gold-500/45 shadow-dropdown"
            />
            <div className="space-y-1">
              <p
                className={cn(
                  "text-xs font-semibold text-gold-300",
                  !isArabic && "uppercase tracking-label"
                )}
              >
                {t("common.riyadhOnly")}
              </p>
              <p className="text-xs text-ink-muted">
                {isArabic ? "منصة الضيافة الملكية والقمم" : "Royal Hospitality & Summit Ops"}
              </p>
            </div>
          </motion.div>

          <div>
            <motion.h1
              variants={entrance.rise(0.2)}
              initial={reduced ? false : "initial"}
              animate="animate"
              className="font-display text-display-md text-ink"
            >
              {t("heroTitle")}
            </motion.h1>
            <motion.p
              variants={entrance.rise(0.3)}
              initial={reduced ? false : "initial"}
              animate="animate"
              className="mt-4 max-w-xl text-base leading-7 text-ink-muted"
            >
              {t("heroSubtitle")}
            </motion.p>
          </div>

          <motion.div
            variants={entrance.rise(0.4)}
            initial={reduced ? false : "initial"}
            animate="animate"
            className="flex flex-wrap gap-2"
          >
            {features.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface-2/85 px-3.5 py-2 text-sm font-medium text-ink"
              >
                <Icon className="size-4 text-gold-500" strokeWidth={1.6} aria-hidden />
                {label}
              </span>
            ))}
          </motion.div>

          {/* Qasr P4 / SIX-TASKS #6: Quiet glass-brass demo invitation strip (Sign-in owns the sole solid-brass fill) */}
          <motion.div
            variants={entrance.rise(0.5)}
            initial={reduced ? false : "initial"}
            animate="animate"
            className="max-w-lg pt-1"
          >
            <button
              type="button"
              disabled={isLoading}
              data-launch-live-demo
              onClick={handleLaunchLiveDemo}
              className={cn(
                "group flex w-full items-center justify-between gap-4 rounded-xl border border-gold-500/35 bg-surface-2/75 px-4 py-3 text-start backdrop-blur-md",
                "transition-colors duration-base hover:border-gold-500/65 hover:bg-surface-3/85",
                "focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-gold-500/40 bg-gold-500/12 text-gold-300">
                  <Play className="size-4 fill-current" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink">
                    {isArabic ? "تشغيل العرض المباشر" : "Launch Live Demo"}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {isArabic
                      ? "جولة المستثمرين الفورية · 9 أدوار متكاملة بضغطة واحدة"
                      : "One-click investor showcase · 9 live roles & baseline reset"}
                  </span>
                </span>
              </span>
              <DirectionArrow
                className="size-4 shrink-0 text-gold-500 transition-colors duration-base group-hover:text-gold-300 motion-reduce:transition-none"
                aria-hidden
              />
            </button>
          </motion.div>
        </section>

        {resetToken ? (
          <motion.form
            variants={entrance.rise(0.2)}
            initial={reduced ? false : "initial"}
            animate="animate"
            onSubmit={(event) => void handleResetSubmit(event)}
            data-password-reset-form
            className="min-w-0 overflow-hidden rounded-xl border border-hairline-strong bg-surface-2/95 shadow-luxury backdrop-blur-md"
            aria-labelledby="reset-password-title"
          >
            <SaduRibbon variant="hairline" className="opacity-90" />

            <div className="p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-gold-500/30 bg-surface-1 text-gold-500">
                  <KeyRound className="size-5" strokeWidth={1.6} aria-hidden />
                </span>
                <div>
                  <h2 id="reset-password-title" className="text-xl font-bold tracking-tight text-ink">
                    {isArabic ? "تعيين كلمة مرور جديدة" : "Set a new password"}
                  </h2>
                  <p className="text-sm text-ink-muted">
                    {isArabic
                      ? "رابط مؤقت لمرة واحدة (12 حرفاً على الأقل)"
                      : "Single-use recovery link (minimum 12 characters)"}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <Field label={isArabic ? "كلمة المرور الجديدة" : "New password"} required>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={72}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    dir="ltr"
                    placeholder="••••••••••••"
                  />
                </Field>
                <Field
                  label={isArabic ? "تأكيد كلمة المرور" : "Confirm new password"}
                  required
                  error={resetError ?? undefined}
                >
                  <Input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={72}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    dir="ltr"
                    placeholder="••••••••••••"
                  />
                </Field>
              </div>

              <Button type="submit" variant="gold" size="lg" loading={resetBusy} className="mt-6 w-full">
                {resetBusy
                  ? isArabic
                    ? "جارٍ التحديث…"
                    : "Updating password…"
                  : isArabic
                    ? "حفظ كلمة المرور الجديدة"
                    : "Save new password"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="md"
                disabled={resetBusy}
                onClick={handleCancelReset}
                className="mt-3 w-full"
              >
                {isArabic ? "العودة إلى تسجيل الدخول" : "Back to sign in"}
              </Button>
            </div>
          </motion.form>
        ) : (
        <motion.form
          variants={entrance.rise(0.2)}
          initial={reduced ? false : "initial"}
          animate="animate"
          onSubmit={(event) => void handleSubmit(event)}
          className="min-w-0 overflow-hidden rounded-xl border border-hairline-strong bg-surface-2/95 shadow-luxury backdrop-blur-md"
          aria-labelledby="login-title"
        >
          <SaduRibbon variant="hairline" className="opacity-90" />

          <div className="p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-gold-500/30 bg-surface-1 text-gold-500">
                <ShieldCheck className="size-5" strokeWidth={1.6} aria-hidden />
              </span>
              <div>
                <h2 id="login-title" className="text-xl font-bold tracking-tight text-ink">
                  {t("signIn")}
                </h2>
                <p className="text-sm text-ink-muted">{t("signInSubtitle")}</p>
              </div>
            </div>

            {resetDone ? (
              <p
                role="status"
                data-password-reset-success
                className="mt-4 flex items-center gap-2 rounded-lg border border-ok/40 bg-ok/10 p-3 text-xs font-medium text-ok"
              >
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                {isArabic
                  ? "تم تحديث كلمة المرور بنجاح — يرجى تسجيل الدخول بكلمة المرور الجديدة."
                  : "Password updated — please sign in with your new password."}
              </p>
            ) : null}

            {demoPrompt ? (
              <p
                role="status"
                data-live-demo-hint
                className="mt-4 rounded-lg border border-gold-500/40 bg-gold-500/10 p-3 text-xs text-gold-300"
              >
                {isArabic
                  ? `تم تجهيز حساب المشرف العام للعرض (${INVESTOR_DEMO_ADMIN_EMAIL}). أدخل كلمة المرور ثم اضغط «تسجيل الدخول» لفتح شريط التبديل الفوري للأدوار.`
                  : `Demo Super Admin email (${INVESTOR_DEMO_ADMIN_EMAIL}) filled. Enter your password and sign in to access the one-click Investor Demo switcher.`}
              </p>
            ) : null}

            <div className="mt-6 space-y-4">
              <Field label={t("email")} required>
                <Input
                  ref={emailInputRef}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  dir="ltr"
                  placeholder="name@organisation.sa"
                />
              </Field>
              <Field label={t("password")} required error={error ?? undefined}>
                <Input
                  ref={passwordInputRef}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  dir="ltr"
                  placeholder="••••••••"
                />
              </Field>
            </div>

            {/* Sole solid-brass primary action on the Arrival screen */}
            <Button type="submit" variant="gold" size="lg" loading={isLoading} className="mt-6 w-full">
              {isLoading ? t("signingIn") : t("signIn")}
            </Button>

            {emailRecovery ? (
              <div className="mt-3 text-center" data-forgot-password>
                <button
                  type="button"
                  onClick={() => void handleForgotPassword()}
                  disabled={forgotState === "busy"}
                  className="text-xs font-medium text-gold-400 underline-offset-4 hover:underline disabled:opacity-60"
                >
                  {isArabic ? "نسيت كلمة المرور؟" : "Forgot password?"}
                </button>
                {forgotMessage ? (
                  <p
                    role="status"
                    className={`mt-2 text-xs ${forgotState === "error" ? "text-danger" : "text-ink-muted"}`}
                  >
                    {forgotMessage}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* SIX-TASKS #3: Two standalone registration entry points */}
            <div className="mt-5 border-t border-hairline pt-4">
              <p className="mb-2.5 text-xs font-semibold text-ink-muted">
                {isArabic ? "جديد في مضياف؟ سجّل حسابك المستقل:" : "New to Midyaf? Create a standalone account:"}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  disabled={isLoading}
                  data-register-entry="supplier"
                  leadingIcon={<Package className="size-4" aria-hidden />}
                  onClick={() => openRegistration("VENDOR")}
                  className="w-full"
                >
                  {isArabic ? "تسجيل كمورد" : "Register as a supplier"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  disabled={isLoading}
                  data-register-entry="client"
                  leadingIcon={<Building2 className="size-4" aria-hidden />}
                  onClick={() => openRegistration("CLIENT")}
                  className="w-full"
                >
                  {isArabic ? "تسجيل كعميل" : "Register as a client"}
                </Button>
              </div>
            </div>

            {showPersonas ? (
              <div className="mt-6 border-t border-hairline pt-5">
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold text-gold-500",
                    !isArabic && "uppercase tracking-label"
                  )}
                >
                  <ShieldCheck className="size-3.5" aria-hidden />
                  {isArabic ? "حسابات العرض" : "Demo accounts"}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {isArabic
                    ? "اختيار الحساب يملأ البريد الإلكتروني فقط. أدخل كلمة المرور ثم سجّل الدخول."
                    : "Choosing an account fills its email only. Enter the password, then sign in."}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {DEMO_PERSONAS.map((persona) => {
                    const Icon = persona.icon;
                    return (
                      <button
                        key={persona.id}
                        type="button"
                        disabled={isLoading}
                        // Fills the email and clears the password; never signs in.
                        onClick={() => selectPersona(persona, { setEmail, setPassword })}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border border-hairline bg-surface-1 p-2.5 text-start",
                          "transition-colors duration-base hover:border-gold-500/40 hover:bg-surface-3",
                          "focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50 motion-reduce:transition-none"
                        )}
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gold-500/10 text-gold-500">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-ink">
                            {isArabic ? persona.titleAr : persona.titleEn}
                          </span>
                          <span className="block truncate text-xs text-ink-muted">
                            {isArabic ? persona.subtitleAr : persona.subtitleEn}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </motion.form>
        )}
      </main>
    </div>
  );
}

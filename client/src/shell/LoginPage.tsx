import { ApplicantRegistration } from "../components/OnboardingWorkspace";
import { useRef, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Building2, Globe2, Package, Play, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OnboardingKind } from "@shared/overhaul";
import type { Session } from "@shared/domain";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { SaduRibbon } from "../components/ui/SaduRibbon";
import { INVESTOR_DEMO_ADMIN_EMAIL } from "../lib/investorDemoApi";
import { entrance } from "../lib/motion";
import { cn } from "../lib/cn";
import "../styles/signature.css";
import { DEMO_PERSONAS, demoPersonasEnabled, selectPersona } from "./demoPersonas";

export function LoginPage({
  isArabic,
  error,
  isLoading,
  onLanguageToggle,
  onLogin,
  onOpenRegistration,
  onRegistered
}: {
  isArabic: boolean;
  error: string | null;
  isLoading: boolean;
  onLanguageToggle: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  /** Standalone top-level navigation to /register/supplier or /register/client. */
  onOpenRegistration?: (kind: OnboardingKind) => void;
  onRegistered?: (session: Session) => void;
}) {
  const { t } = useTranslation();
  const [joinKind, setJoinKind] = useState<OnboardingKind | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [demoPrompt, setDemoPrompt] = useState(false);
  const [showPersonas] = useState(() => demoPersonasEnabled());
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(email, password);
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
                  type="email"
                  autoComplete="email"
                  autoFocus
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
      </main>
    </div>
  );
}

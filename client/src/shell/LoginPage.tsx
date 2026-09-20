import { useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Globe2, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { entrance } from "../lib/motion";
import { cn } from "../lib/cn";
import { DEMO_PERSONAS, demoPersonasEnabled } from "./demoPersonas";

export function LoginPage({
  isArabic,
  error,
  isLoading,
  onLanguageToggle,
  onLogin
}: {
  isArabic: boolean;
  error: string | null;
  isLoading: boolean;
  onLanguageToggle: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPersonas] = useState(() => demoPersonasEnabled());
  const reduced = useReducedMotion();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(email, password);
  }

  const features = [
    { icon: Sparkles, label: isArabic ? "تخطيط ذكي" : "AI Planning" },
    { icon: Globe2, label: isArabic ? "عمليات مباشرة" : "Live Ops" },
    { icon: ShieldCheck, label: isArabic ? "إطلاق العمليات" : "Summit Launch" }
  ];

  return (
    <div className={cn("relative min-h-screen overflow-hidden bg-surface-1 text-ink", isArabic ? "font-arabic" : "font-english")}>
      {/* Obsidian field: one slow gold horizon line. Visual only — the form is live at t=0. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgb(var(--gold-500)/0.10),transparent_60%)]" />
        <motion.div
          variants={entrance.horizon}
          initial={reduced ? false : "initial"}
          animate="animate"
          className="absolute inset-x-[10%] top-[80%] h-px origin-center bg-gradient-to-r from-transparent via-gold-500/70 to-transparent"
        />
      </div>

      <div className="absolute top-0 z-10 flex w-full items-center justify-end px-5 py-4">
        <Button variant="ghost" size="sm" onClick={onLanguageToggle}>
          {t("switchLanguage")}
        </Button>
      </div>

      <main className="relative z-[1] mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-8">
          <motion.img
            variants={entrance.rise(0)}
            initial={reduced ? false : "initial"}
            animate="animate"
            src="/midyaf-logo.png"
            alt={t("brand")}
            className="size-20 rounded-lg object-cover ring-1 ring-gold-500/40"
          />
          <div>
            <motion.p
              variants={entrance.rise(0.15)}
              initial={reduced ? false : "initial"}
              animate="animate"
              className="text-xs font-semibold uppercase tracking-label text-gold-500"
            >
              {t("common.riyadhOnly")}
            </motion.p>
            <motion.h1
              variants={entrance.rise(0.25)}
              initial={reduced ? false : "initial"}
              animate="animate"
              className="mt-3 text-display-md text-ink"
            >
              {t("heroTitle")}
            </motion.h1>
            <motion.p
              variants={entrance.rise(0.35)}
              initial={reduced ? false : "initial"}
              animate="animate"
              className="mt-4 max-w-xl text-base leading-7 text-ink-muted"
            >
              {t("heroSubtitle")}
            </motion.p>
          </div>
          <motion.div
            variants={entrance.rise(0.45)}
            initial={reduced ? false : "initial"}
            animate="animate"
            className="flex flex-wrap gap-2"
          >
            {features.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface-2 px-3.5 py-2 text-sm font-medium text-ink"
              >
                <Icon className="size-4 text-gold-500" aria-hidden />
                {label}
              </span>
            ))}
          </motion.div>
        </section>

        <motion.form
          variants={entrance.rise(0.2)}
          initial={reduced ? false : "initial"}
          animate="animate"
          onSubmit={(event) => void handleSubmit(event)}
          className="rounded-lg border border-hairline bg-surface-2 p-7 shadow-dropdown"
          aria-labelledby="login-title"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg border border-hairline bg-surface-1 text-gold-500">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="login-title" className="text-xl font-bold tracking-tight text-ink">
                {t("signIn")}
              </h2>
              <p className="text-sm text-ink-muted">{t("signInSubtitle")}</p>
            </div>
          </div>

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

          <Button type="submit" variant="gold" size="lg" loading={isLoading} className="mt-6 w-full">
            {isLoading ? t("signingIn") : t("signIn")}
          </Button>

          {showPersonas ? (
            <div className="mt-6 border-t border-hairline pt-5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-label text-gold-500">
                <ShieldCheck className="size-3.5" aria-hidden />
                {isArabic ? "الدخول القيادي السريع" : "Executive Fast Access"}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DEMO_PERSONAS.map((persona) => {
                  const Icon = persona.icon;
                  return (
                    <button
                      key={persona.id}
                      type="button"
                      disabled={isLoading}
                      onClick={() => void onLogin(persona.email, persona.password)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border border-hairline bg-surface-1 p-2.5 text-start",
                        "transition-colors duration-base hover:border-gold-500/40 hover:bg-surface-3",
                        "focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50"
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
        </motion.form>
      </main>
    </div>
  );
}

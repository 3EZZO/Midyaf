import { useMemo, useState } from "react";
import { Check, Copy, KeyRound, MessageCircle, Search } from "lucide-react";
import type { Session, User } from "@shared/domain";
import { issueUserResetLink, type PasswordResetLinkResponse } from "../lib/api";
import { shortTime } from "../lib/format";
import { Badge, Button, EmptyState, Input, Section, Surface, useToast } from "./ui";

const ROLE_LABELS: Record<string, { en: string; ar: string }> = {
  SUPER_ADMIN: { en: "Super Admin", ar: "المشرف العام" },
  LOGISTICS_MANAGER: { en: "Logistics Manager", ar: "مدير اللوجستيات" },
  ORGANIZER: { en: "Event Manager", ar: "مدير الفعالية" },
  COMPANY_ORGANIZER: { en: "Organizing Company", ar: "الشركة المنظمة" },
  COORDINATOR: { en: "Coordinator", ar: "منسق" },
  DRIVER: { en: "Captain", ar: "كابتن" },
  SUPPLIER: { en: "Supplier", ar: "مورد" },
  CLIENT: { en: "Client", ar: "عميل" },
  GUEST: { en: "Guest", ar: "ضيف" }
};

function normalizeWhatsAppPhone(phone: string | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length >= 9 ? digits : null;
}

export function buildResetWhatsAppUrl(
  phone: string | undefined,
  userName: string,
  fullResetUrl: string,
  isArabic: boolean
) {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits) return null;
  const text = isArabic
    ? `مرحباً ${userName}، هذا رابط استعادة كلمة المرور لحسابك في منصة مضياف (صالح لمرة واحدة لمدة 15 دقيقة):\n${fullResetUrl}`
    : `Hi ${userName}, here is your single-use Midyaf password reset link (valid for 15 minutes):\n${fullResetUrl}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * PLAN_READY_1 Sprint 1: Super Admin 1-click temporary password reset link generator.
 * Allows operations to unblock any locked captain, supplier, organizer, or VIP via
 * clipboard or 1-tap WhatsApp handoff in 5 seconds, without requiring an email provider.
 */
export function AccountRecoveryPanel({
  users,
  session,
  isArabic = true
}: {
  users: User[];
  session: Session | null;
  isArabic?: boolean;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [issued, setIssued] = useState<(PasswordResetLinkResponse & { fullUrl: string; phone?: string }) | null>(null);
  const [copied, setCopied] = useState(false);

  if (session?.user.role !== "SUPER_ADMIN") {
    return null;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, query]);

  async function handleGenerate(target: User) {
    if (!session) return;
    setBusyUserId(target.id);
    setCopied(false);
    try {
      const result = await issueUserResetLink(target.id, session.accessToken);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const fullUrl = `${origin}${result.resetPath}`;
      setIssued({ ...result, fullUrl, phone: target.phone });
      toast.success(
        isArabic ? "تم إنشاء رابط الاستعادة" : "Reset link generated",
        isArabic
          ? `صالح لمدة 15 دقيقة لـ ${target.name}`
          : `Valid for 15 minutes for ${target.name}`
      );
    } catch (err) {
      toast.alert(
        isArabic ? "تعذر إنشاء الرابط" : "Could not generate link",
        err instanceof Error ? err.message : isArabic ? "حاول مجدداً" : "Please try again"
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleCopy() {
    if (!issued || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(issued.fullUrl);
    setCopied(true);
    toast.success(
      isArabic ? "تم نسخ الرابط" : "Link copied",
      isArabic ? "يمكنك إرساله مباشرة للمستخدم" : "Ready to share with the user"
    );
  }

  const whatsappUrl = issued
    ? buildResetWhatsAppUrl(issued.phone, issued.userName, issued.fullUrl, isArabic)
    : null;

  return (
    <Section
      id="section-admin-account-recovery"
      title={isArabic ? "استعادة وصول الحسابات" : "Account Access Recovery"}
      eyebrow={isArabic ? "روابط مؤقتة لمدة 15 دقيقة · للمشرف العام فقط" : "Single-use 15m links · Super Admin only"}
      isArabic={isArabic}
      action={
        <Badge tone="gold" size="sm">
          <KeyRound className="size-3.5" aria-hidden />
          {isArabic ? `${users.length} حساب` : `${users.length} accounts`}
        </Badge>
      }
    >
      <div className="space-y-4" data-account-recovery-panel>
        {issued ? (
          <Surface tone="gold" padding="sm" className="space-y-3" data-issued-reset-link>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-ink">
                  {isArabic
                    ? `رابط الاستعادة المؤقت لـ ${issued.userName}`
                    : `Temporary reset link for ${issued.userName}`}
                </p>
                <p className="text-xs text-ink-muted">
                  {issued.userEmail} ·{" "}
                  {isArabic
                    ? `ينتهي الساعة ${shortTime(issued.expiresAt, "ar")} · يُستخدم مرة واحدة فقط`
                    : `Expires at ${shortTime(issued.expiresAt, "en")} · single-use only`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="gold"
                  leadingIcon={copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                  onClick={() => void handleCopy()}
                >
                  {copied ? (isArabic ? "تم النسخ" : "Copied") : isArabic ? "نسخ الرابط" : "Copy link"}
                </Button>
                {whatsappUrl ? (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gold-500/40 bg-surface-1 px-3 text-xs font-semibold text-gold-300 transition-colors hover:border-gold-500 hover:bg-surface-3"
                  >
                    <MessageCircle className="size-3.5" aria-hidden />
                    {isArabic ? "إرسال عبر واتساب" : "Send via WhatsApp"}
                  </a>
                ) : null}
              </div>
            </div>
            <Input
              readOnly
              dir="ltr"
              value={issued.fullUrl}
              aria-label={isArabic ? "رابط استعادة كلمة المرور" : "Password reset URL"}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
          </Surface>
        ) : null}

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={isArabic ? "ابحث عن مستخدم" : "Search accounts"}
            placeholder={isArabic ? "ابحث بالاسم أو البريد أو الدور..." : "Search by name, email, or role..."}
            className="ps-9"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon={<KeyRound className="size-4" aria-hidden />}
            title={isArabic ? "لا توجد حسابات مطابقة" : "No matching accounts"}
          />
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, 12).map((account) => {
              const roleMeta = ROLE_LABELS[account.role];
              return (
                <li key={account.id}>
                  <Surface padding="sm" className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{account.name}</p>
                      <p className="truncate text-xs text-ink-muted" dir="ltr">
                        {account.email}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-gold-300">
                        {roleMeta ? (isArabic ? roleMeta.ar : roleMeta.en) : account.role}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      loading={busyUserId === account.id}
                      disabled={busyUserId !== null}
                      leadingIcon={<KeyRound className="size-3.5" aria-hidden />}
                      onClick={() => void handleGenerate(account)}
                      className="shrink-0"
                    >
                      {isArabic ? "رابط استعادة" : "Reset link"}
                    </Button>
                  </Surface>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
}

/**
 * Plan Ready 1 · Sprint 2 — transactional email over Brevo's HTTPS API ($0 tier:
 * 300 emails/day, no card). No SDK dependency: one bounded `fetch`.
 *
 * Inert until BREVO_API_KEY + MAIL_FROM_EMAIL are set in Render. Never throws to
 * callers and never logs recipients' links (they carry single-use secrets).
 */
import { env } from "../env.js";

export type MailMessage = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
};

export type MailResult =
  | { sent: true; provider: "brevo" }
  | { sent: false; reason: "not_configured" | "provider_error" | "timeout" };

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 6000;

export function emailConfigured(config = env): boolean {
  return Boolean(config.BREVO_API_KEY && config.MAIL_FROM_EMAIL);
}

/** Public origin used to build links in emails (first CLIENT_ORIGIN unless PUBLIC_APP_URL is set). */
export function publicAppUrl(config = env): string {
  const explicit = config.PUBLIC_APP_URL?.trim();
  const fallback = config.CLIENT_ORIGIN.split(",")[0]?.trim() || "https://midyaf.onrender.com";
  return (explicit || fallback).replace(/\/+$/, "");
}

export async function sendEmail(
  message: MailMessage,
  config = env,
  fetcher: typeof fetch = fetch
): Promise<MailResult> {
  if (!emailConfigured(config)) return { sent: false, reason: "not_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetcher(BREVO_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      redirect: "error",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": config.BREVO_API_KEY!
      },
      body: JSON.stringify({
        sender: { email: config.MAIL_FROM_EMAIL, name: config.MAIL_FROM_NAME },
        to: [{ email: message.to, ...(message.toName ? { name: message.toName } : {}) }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text
      })
    });
    if (!response.ok) {
      // Status only: the request body contains a single-use link.
      console.warn(`Email provider rejected message (HTTP ${response.status})`);
      return { sent: false, reason: "provider_error" };
    }
    return { sent: true, provider: "brevo" };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.warn(aborted ? "Email provider timed out" : "Email provider unreachable");
    return { sent: false, reason: aborted ? "timeout" : "provider_error" };
  } finally {
    clearTimeout(timer);
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function layout(arTitle: string, arBody: string, enTitle: string, enBody: string, url: string, arCta: string, enCta: string) {
  const safeUrl = escapeHtml(url);
  const button = (label: string) =>
    `<p style="margin:20px 0"><a href="${safeUrl}" style="background:#C9A44C;color:#0D0E12;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">${escapeHtml(label)}</a></p>`;
  return `<!doctype html><html><body style="margin:0;background:#0D0E12;color:#F4EFE6;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px">
<h2 style="color:#C9A44C;margin:0 0 18px">Midyaf | مِضْيَافٌ</h2>
<div dir="rtl" lang="ar" style="text-align:right"><h3>${escapeHtml(arTitle)}</h3><p>${escapeHtml(arBody)}</p>${button(arCta)}</div>
<hr style="border:none;border-top:1px solid #2a2b31;margin:24px 0">
<div dir="ltr" lang="en"><h3>${escapeHtml(enTitle)}</h3><p>${escapeHtml(enBody)}</p>${button(enCta)}</div>
<p style="color:#8a8b93;font-size:12px;word-break:break-all">${safeUrl}</p>
</div></body></html>`;
}

export function passwordResetEmail(to: string, name: string, url: string, minutes = 15): MailMessage {
  const arBody = `مرحباً ${name}، تم إنشاء رابط لإعادة تعيين كلمة المرور. الرابط صالح لمرة واحدة ولمدة ${minutes} دقيقة. إذا لم تطلبه فتجاهل هذه الرسالة.`;
  const enBody = `Hello ${name}, a password reset link was created for your account. It works once and expires in ${minutes} minutes. If you did not request it, ignore this email.`;
  return {
    to,
    toName: name,
    subject: "Midyaf — إعادة تعيين كلمة المرور / Password reset",
    html: layout("إعادة تعيين كلمة المرور", arBody, "Reset your password", enBody, url, "تعيين كلمة مرور جديدة", "Set a new password"),
    text: `${arBody}\n\n${enBody}\n\n${url}`
  };
}

export function invitationEmail(to: string, eventName: string, url: string): MailMessage {
  const arBody = `تمت دعوتك للانضمام إلى فريق تشغيل فعالية "${eventName}" على مضياف. سجّل الدخول بهذا البريد ثم افتح الرابط خلال 24 ساعة.`;
  const enBody = `You have been invited to the operations team for "${eventName}" on Midyaf. Sign in with this email address, then open the link within 24 hours.`;
  return {
    to,
    subject: `Midyaf — دعوة / Invitation: ${eventName}`,
    html: layout("دعوة لفريق التشغيل", arBody, "Team invitation", enBody, url, "قبول الدعوة", "Accept invitation"),
    text: `${arBody}\n\n${enBody}\n\n${url}`
  };
}

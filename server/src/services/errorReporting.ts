/**
 * Plan Ready 1 · Sprint 4 — live crash alerting via Sentry Free (5K errors/month).
 *
 * Inert unless SENTRY_DSN is set in Render. Privacy first: no request bodies,
 * cookies, query strings or auth headers ever leave the server; users are reduced
 * to their opaque id; JWTs, bearer tokens, reset/invite links and connection
 * strings are redacted from messages, exceptions and breadcrumbs. Only unexpected
 * 5xx errors are reported (validation/permission 4xx are normal traffic).
 */
import * as Sentry from "@sentry/node";
import { env } from "../env.js";

type SentryEvent = Sentry.ErrorEvent;

const REDACTIONS: Array<[RegExp, string]> = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[jwt]"],
  [/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]"],
  [/(resetToken|workspace-invite|token|sig|signature|api_key|api-key|password)=([^&\s#"']+)/gi, "$1=[redacted]"],
  [/\b(postgres(?:ql)?|cloudinary|redis|mongodb(?:\+srv)?):\/\/[^\s"']+/gi, "$1://[redacted]"],
  [/\b[A-Fa-f0-9]{64}\b/g, "[hex64]"]
];

export function redactText(value: string): string {
  return REDACTIONS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

const KEPT_HEADERS = new Set(["user-agent", "content-type", "accept-language"]);

/** Strips everything that could identify a guest or carry a credential. */
export function scrubEvent(event: SentryEvent): SentryEvent {
  if (event.request) {
    const headers = event.request.headers ?? {};
    event.request = {
      method: event.request.method,
      // Path only: query strings can carry signed-URL signatures and tokens.
      url: event.request.url ? redactText(event.request.url.split("?")[0]) : undefined,
      headers: Object.fromEntries(
        Object.entries(headers).filter(([key]) => KEPT_HEADERS.has(key.toLowerCase()))
      )
    };
  }
  if (event.user) {
    event.user = event.user.id ? { id: String(event.user.id) } : undefined;
  }
  if (event.message) event.message = redactText(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactText(exception.value);
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      message: crumb.message ? redactText(crumb.message) : crumb.message,
      // Breadcrumb data (HTTP URLs, console args) is dropped wholesale.
      data: undefined
    }));
  }
  delete event.extra;
  return event;
}

let enabled = false;

export function initErrorReporting(config = env): boolean {
  if (!config.SENTRY_DSN) return false;
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    release: process.env.RENDER_GIT_COMMIT,
    tracesSampleRate: 0,
    maxBreadcrumbs: 20,
    beforeSend: (event) => scrubEvent(event)
  });
  enabled = true;
  return true;
}

export function errorReportingEnabled() {
  return enabled;
}

/** Reports an unexpected server error (no-op when Sentry is not configured). */
export function reportError(error: unknown, context: { method?: string; path?: string; userId?: string } = {}) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context.method || context.path) {
      scope.setTag("route", `${context.method ?? ""} ${context.path ? redactText(context.path) : ""}`.trim());
    }
    if (context.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(error);
  });
}

/** Flushes queued Sentry events during graceful shutdown (no-op when disabled). */
export async function flushErrorReporting(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  await Sentry.flush(timeoutMs).catch(() => undefined);
}

/** Test-only reset for deterministic unit coverage. */
export function resetErrorReportingForTest() {
  enabled = false;
}

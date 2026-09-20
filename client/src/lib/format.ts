import type { Money } from "@shared/domain";

export function money(value: Money, currency = "SAR") {
  return new Intl.NumberFormat(currentLocale(), {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Number(value));
}

export function shortTime(value: string, locale = "en") {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn" : currentLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Riyadh"
  }).format(new Date(value));
}

export function shortDate(value: string, locale = "en") {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn" : currentLocale(), {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Riyadh"
  }).format(new Date(value));
}

export function percent(value: Money) {
  return `${Number(value).toFixed(0)}%`;
}

function currentLocale() {
  if (
    typeof document !== "undefined" &&
    document.documentElement.lang.startsWith("ar")
  ) {
    return "ar-SA-u-nu-latn";
  }

  return "en-SA";
}

/** Compact number: 1.2M / 340K — Western digits in both languages. */
export function compact(value: Money, maximumFractionDigits = 1) {
  return new Intl.NumberFormat(currentLocale(), { notation: "compact", maximumFractionDigits }).format(Number(value));
}

/** Plain integer with grouping. */
export function integer(value: Money) {
  return new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 0 }).format(Number(value));
}

/** Signed percent delta: "+18.4%" / "−2.1%". */
export function delta(value: number, fractionDigits = 1) {
  const n = Number(value);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: fractionDigits }).format(Math.abs(n))}%`;
}

/** Minutes → "1h 25m" / "45 د" style but always Western digits. */
export function duration(minutes: number) {
  const ar = currentLocale().startsWith("ar");
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return ar ? `${rest} د` : `${rest}m`;
  return ar ? `${h} س ${rest} د` : `${h}h ${rest}m`;
}

/** "3 minutes ago" via Intl.RelativeTimeFormat, Western digits. */
export function relativeTime(value: string | Date, now: Date = new Date()) {
  const then = value instanceof Date ? value : new Date(value);
  const diffSec = Math.round((then.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(currentLocale(), { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}

/** Short axis date: "12 Sep" / "12 سبتمبر". */
export function axisDate(value: string) {
  return new Intl.DateTimeFormat(currentLocale(), { day: "numeric", month: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));
}

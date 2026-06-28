import type { Money } from "@shared/domain";

export function money(value: Money, currency = "SAR") {
  return new Intl.NumberFormat(currentLocale(), {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Number(value));
}

export function shortTime(value: string, locale = "en") {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : currentLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Riyadh"
  }).format(new Date(value));
}

export function shortDate(value: string, locale = "en") {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : currentLocale(), {
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
    return "ar-SA";
  }

  return "en-SA";
}

/**
 * PLAN_READY_1 Sprint 3: Zero-cost WhatsApp Handoff (`wa.me` deep links).
 * Builds client-side `https://wa.me/<digits>?text=<encoded>` URLs with bilingual
 * EN/AR operational messages — $0 Meta API cost, zero server round-trips, works on
 * iOS, Android, and desktop WhatsApp.
 */

export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  // Convert local Saudi mobile format (05XXXXXXXX) to international 9665XXXXXXXX.
  if (digits.length === 10 && digits.startsWith("05")) {
    digits = `966${digits.slice(1)}`;
  }
  if (digits.length < 9 || digits.length > 15) {
    return null;
  }
  return digits;
}

export function buildWhatsAppDeepLink(
  phone: string | null | undefined,
  message: string
): string | null {
  const digits = normalizeWhatsAppPhone(phone);
  const body = message.trim();
  if (!digits || !body) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}

export function buildCaptainDispatchWhatsAppUrl(input: {
  phone: string | null | undefined;
  captainName: string;
  guestLabel: string;
  pickupLocation: string;
  dropoffLocation: string;
  scheduledTime?: string;
  isArabic: boolean;
}): string | null {
  const text = input.isArabic
    ? [
        `مرحباً كابتن ${input.captainName}، تفاصيل مهمة مضياف:`,
        `الضيف: ${input.guestLabel}`,
        `من: ${input.pickupLocation}`,
        `إلى: ${input.dropoffLocation}`,
        input.scheduledTime ? `الموعد: ${input.scheduledTime}` : null
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Hi Captain ${input.captainName}, Midyaf dispatch details:`,
        `Guest: ${input.guestLabel}`,
        `Pickup: ${input.pickupLocation}`,
        `Drop-off: ${input.dropoffLocation}`,
        input.scheduledTime ? `Scheduled: ${input.scheduledTime}` : null
      ]
        .filter(Boolean)
        .join("\n");
  return buildWhatsAppDeepLink(input.phone, text);
}

export function buildGuestPickupWhatsAppUrl(input: {
  phone: string | null | undefined;
  guestName: string;
  captainName?: string;
  pickupLocation: string;
  dropoffLocation?: string;
  etaMinutes?: number | null;
  gate?: string;
  appUrl?: string;
  isArabic: boolean;
}): string | null {
  const text = input.isArabic
    ? [
        `مرحباً ${input.guestName}، تحديث استقبالكم من منصة مضياف:`,
        input.captainName ? `الكابتن المخصص: ${input.captainName}` : null,
        input.gate ? `البوابة: ${input.gate}` : null,
        `نقطة الاستقبال: ${input.pickupLocation}`,
        input.dropoffLocation ? `الوجهة: ${input.dropoffLocation}` : null,
        input.etaMinutes != null ? `الوصول المتوقع خلال: ${input.etaMinutes} دقيقة` : null,
        input.appUrl ? `بطاقة الصعود والتفاصيل: ${input.appUrl}` : null
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Hello ${input.guestName}, your Midyaf hospitality pickup update:`,
        input.captainName ? `Assigned Captain: ${input.captainName}` : null,
        input.gate ? `Gate: ${input.gate}` : null,
        `Pickup: ${input.pickupLocation}`,
        input.dropoffLocation ? `Destination: ${input.dropoffLocation}` : null,
        input.etaMinutes != null ? `Estimated arrival: ${input.etaMinutes} min` : null,
        input.appUrl ? `Boarding pass & live details: ${input.appUrl}` : null
      ]
        .filter(Boolean)
        .join("\n");
  return buildWhatsAppDeepLink(input.phone, text);
}

export function buildGuestToCaptainWhatsAppUrl(input: {
  phone: string | null | undefined;
  captainName: string;
  guestName: string;
  arrivalGate?: string;
  arrivalStatus?: string;
  isArabic: boolean;
}): string | null {
  const text = input.isArabic
    ? [
        `مرحباً كابتن ${input.captainName}، معك الضيف ${input.guestName} (منصة مضياف).`,
        input.arrivalGate ? `بوابة الوصول: ${input.arrivalGate}` : null,
        input.arrivalStatus ? `الحالة الحالية: ${input.arrivalStatus}` : null
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Hi Captain ${input.captainName}, this is ${input.guestName} (Midyaf guest).`,
        input.arrivalGate ? `Arrival gate: ${input.arrivalGate}` : null,
        input.arrivalStatus ? `Current status: ${input.arrivalStatus}` : null
      ]
        .filter(Boolean)
        .join("\n");
  return buildWhatsAppDeepLink(input.phone, text);
}

export function buildCoordinatorHandoffWhatsAppUrl(input: {
  phone: string | null | undefined;
  guestName: string;
  summary: string;
  route: string;
  deadline?: string;
  isArabic: boolean;
}): string | null {
  const text = input.isArabic
    ? [
        `تحديث تنسيق مضياف — الضيف: ${input.guestName}`,
        `الطلب: ${input.summary}`,
        `المسار: ${input.route}`,
        input.deadline ? `الموعد النهائي: ${input.deadline}` : null
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Midyaf coordination update — Guest: ${input.guestName}`,
        `Request: ${input.summary}`,
        `Route: ${input.route}`,
        input.deadline ? `Deadline: ${input.deadline}` : null
      ]
        .filter(Boolean)
        .join("\n");
  return buildWhatsAppDeepLink(input.phone, text);
}

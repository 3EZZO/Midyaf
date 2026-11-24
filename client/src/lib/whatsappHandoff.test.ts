import { describe, expect, it } from "vitest";
import {
  buildCaptainDispatchWhatsAppUrl,
  buildCoordinatorHandoffWhatsAppUrl,
  buildGuestPickupWhatsAppUrl,
  buildGuestToCaptainWhatsAppUrl,
  buildWhatsAppDeepLink,
  normalizeWhatsAppPhone
} from "./whatsappHandoff";

describe("whatsappHandoff (PLAN_READY_1 Sprint 3)", () => {
  it("normalizes international, 00-prefixed, and Saudi 05XXXXXXXX numbers and rejects invalid input", () => {
    expect(normalizeWhatsAppPhone("+966 50-123-4567")).toBe("966501234567");
    expect(normalizeWhatsAppPhone("00966501234567")).toBe("966501234567");
    expect(normalizeWhatsAppPhone("0501234567")).toBe("966501234567");
    expect(normalizeWhatsAppPhone("12345")).toBeNull();
    expect(normalizeWhatsAppPhone("")).toBeNull();
    expect(normalizeWhatsAppPhone(null)).toBeNull();
  });

  it("builds safe wa.me deep links with encoded bilingual messages", () => {
    expect(buildWhatsAppDeepLink("+966501112222", "   ")).toBeNull();
    const raw = buildWhatsAppDeepLink("+966501112222", "Hello Midyaf");
    expect(raw).toBe("https://wa.me/966501112222?text=Hello%20Midyaf");

    const captainEn = buildCaptainDispatchWhatsAppUrl({
      phone: "+966501112222",
      captainName: "Fahad",
      guestLabel: "GV01",
      pickupLocation: "KKIA Terminal 5",
      dropoffLocation: "Four Seasons Riyadh",
      scheduledTime: "14:30",
      isArabic: false
    });
    expect(captainEn).toContain("https://wa.me/966501112222?text=");
    expect(decodeURIComponent(captainEn!)).toContain("Pickup: KKIA Terminal 5");
    expect(decodeURIComponent(captainEn!)).toContain("Guest: GV01");

    const captainAr = buildCaptainDispatchWhatsAppUrl({
      phone: "0501112222",
      captainName: "فهد",
      guestLabel: "GV01",
      pickupLocation: "مطار الملك خالد",
      dropoffLocation: "فندق فور سيزونز",
      isArabic: true
    });
    expect(captainAr).toContain("https://wa.me/966501112222?text=");
    expect(decodeURIComponent(captainAr!)).toContain("تفاصيل مهمة مضياف");

    const guestEn = buildGuestPickupWhatsAppUrl({
      phone: "+966509998888",
      guestName: "Dr. Layla",
      captainName: "Fahad",
      pickupLocation: "Gate 4",
      etaMinutes: 8,
      appUrl: "https://midyaf.onrender.com",
      isArabic: false
    });
    expect(decodeURIComponent(guestEn!)).toContain("Estimated arrival: 8 min");
    expect(decodeURIComponent(guestEn!)).toContain("https://midyaf.onrender.com");

    const guestToCap = buildGuestToCaptainWhatsAppUrl({
      phone: "+966501112222",
      captainName: "Fahad",
      guestName: "Dr. Layla",
      arrivalGate: "Gate 4",
      arrivalStatus: "GATE",
      isArabic: true
    });
    expect(decodeURIComponent(guestToCap!)).toContain("بوابة الوصول: Gate 4");

    const coord = buildCoordinatorHandoffWhatsAppUrl({
      phone: "+966504445555",
      guestName: "VIP Group",
      summary: "Extra SUV needed",
      route: "KAFD -> Diriyah",
      deadline: "18:00",
      isArabic: false
    });
    expect(decodeURIComponent(coord!)).toContain("Extra SUV needed");
  });
});

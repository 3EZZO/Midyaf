import { narrateEventScenario } from "@shared/eventNarration";
import { isArabicLanguage } from "./localize";
import type { AiAction } from "./aiStream";

/**
 * Deterministic reply used when the streaming endpoint is unreachable (no
 * server, no session, network loss) and for the scripted rehearsal. Matches
 * the same scenarios as `server/src/services/ai.ts`; the body is narrated
 * from `context` (the briefing snapshot the caller already holds), so it
 * names the current event and reports anything else as unavailable.
 */
export function localAiReply(
  message: string,
  language: string,
  persona: string,
  context?: unknown
): { body: string; actions?: AiAction[] } {
  const lower = message.toLowerCase();
  const isArabic = isArabicLanguage(language);
  const say = (scenario: Parameters<typeof narrateEventScenario>[0]) =>
    `${persona}: ${narrateEventScenario(scenario, context, isArabic)}`;
  const welcome = () => ({
    body: say("welcome"),
    actions: [
      {
        label: "Check Missing Vendors",
        labelAr: "فحص الموردين المتأخرين",
        actionId: "send_vendor_sms"
      },
      {
        label: "Check Security Vault",
        labelAr: "فحص الخزنة الثلاثية",
        actionId: "scroll_to_vault"
      },
      {
        label: "Flight Arrivals Surge",
        labelAr: "تنبيه وصول المطار",
        actionId: "divert_fleet"
      },
      {
        label: "Where is my Driver?",
        labelAr: "أين سائقي؟",
        actionId: "track_driver"
      }
    ]
  });

  // 0. Situation briefing (`BRIEF_PROMPTS.situation`): the snapshot summary,
  // in both languages ("on-time" would otherwise match the schedule).
  if (lower.includes("situation") || lower.includes("وضع العملية")) {
    return welcome();
  }

  // 1. Missing vendors geofence check
  if (
    lower.includes("missing") ||
    lower.includes("hall a") ||
    lower.includes("vendor") ||
    lower.includes("late") ||
    lower.includes("delayed") ||
    lower.includes("av team") ||
    lower.includes("غائب") ||
    lower.includes("مورد") ||
    lower.includes("متأخر") ||
    lower.includes("القاعة") ||
    lower.includes("الصوتيات")
  ) {
    return {
      body: say("vendors"),
      actions: [
        {
          label: "Dispatch Urgent SMS to AV Team",
          labelAr: "إرسال تنبيه SMS عاجل لفريق الصوتيات",
          actionId: "send_vendor_sms"
        },
        {
          label: "Pinpoint on Fleet Map",
          labelAr: "تتبع الموقع على الخريطة",
          actionId: "view_vendor_map"
        }
      ]
    };
  }

  // 2. Triple-Key Security Vault & Sealed Bids
  if (
    lower.includes("vault") ||
    lower.includes("seal") ||
    lower.includes("bid") ||
    lower.includes("quote") ||
    lower.includes("corruption") ||
    lower.includes("anti-corruption") ||
    lower.includes("key") ||
    lower.includes("auditor") ||
    lower.includes("unseal") ||
    lower.includes("sila") ||
    lower.includes("خزنة") ||
    lower.includes("مظاريف") ||
    lower.includes("عروض") ||
    lower.includes("مفاتيح") ||
    lower.includes("فساد") ||
    lower.includes("مدقق") ||
    lower.includes("صلة")
  ) {
    return {
      body: say("vault"),
      actions: [
        {
          label: "Access Triple-Key Vault",
          labelAr: "الانتقال إلى الخزنة الثلاثية",
          actionId: "scroll_to_vault"
        }
      ]
    };
  }

  // 3. Flight Arrivals, Airport Surge & Standby Fleet
  if (
    lower.includes("flight") ||
    lower.includes("terminal 2") ||
    lower.includes("airport") ||
    lower.includes("surge") ||
    lower.includes("divert") ||
    lower.includes("landed") ||
    lower.includes("van") ||
    lower.includes("shuttle") ||
    lower.includes("مطار") ||
    lower.includes("رحلات") ||
    lower.includes("صالة 2") ||
    lower.includes("تحويل") ||
    lower.includes("حافلات")
  ) {
    return {
      body: say("arrivals"),
      actions: [
        {
          label: "Divert 5 Vans to Terminal 2",
          labelAr: "تحويل 5 حافلات فوراً إلى الصالة 2",
          actionId: "divert_fleet"
        }
      ]
    };
  }

  // 4. VIP Hospitality & Hotel Riders
  if (
    lower.includes("rider") ||
    lower.includes("hospitality") ||
    lower.includes("hotel") ||
    lower.includes("ritz") ||
    lower.includes("suite") ||
    lower.includes("amenities") ||
    lower.includes("dietary") ||
    lower.includes("dates") ||
    lower.includes("gahwa") ||
    lower.includes("pillow") ||
    lower.includes("oud") ||
    lower.includes("فندق") ||
    lower.includes("ريتز") ||
    lower.includes("جناح") ||
    lower.includes("ضيافة") ||
    lower.includes("تمور") ||
    lower.includes("قهوة سعودية") ||
    lower.includes("عود")
  ) {
    return {
      body: say("hospitality"),
      actions: [
        {
          label: "Inspect Hospitality Riders",
          labelAr: "استعراض مذكرات الضيافة",
          actionId: "inspect_riders"
        }
      ]
    };
  }

  // 5. Driver & Chauffeur Match / VIP Pickup
  if (
    lower.includes("driver") ||
    lower.includes("chauffeur") ||
    lower.includes("sultan") ||
    lower.includes("khaled") ||
    lower.includes("ahmed") ||
    lower.includes("car") ||
    lower.includes("maybach") ||
    lower.includes("gmc") ||
    lower.includes("mercedes") ||
    lower.includes("plate") ||
    lower.includes("pickup") ||
    lower.includes("curb") ||
    lower.includes("gate 2") ||
    lower.includes("exit 4") ||
    lower.includes("سائق") ||
    lower.includes("سيارة") ||
    lower.includes("مايباخ") ||
    lower.includes("سلطان") ||
    lower.includes("خالد") ||
    lower.includes("أحمد") ||
    lower.includes("لوحة")
  ) {
    return {
      body: say("driver"),
      actions: [
        {
          label: "Track Chauffeur Live on Radar",
          labelAr: "تتبع السائق مباشرة على الرادار",
          actionId: "track_driver"
        }
      ]
    };
  }

  // 6. Event Schedule, Keynote & Shuttle
  if (
    lower.includes("schedule") ||
    lower.includes("agenda") ||
    lower.includes("keynote") ||
    lower.includes("timetable") ||
    lower.includes("sessions") ||
    lower.includes("gala") ||
    lower.includes("today") ||
    lower.includes("time") ||
    lower.includes("جدول") ||
    lower.includes("أجندة") ||
    lower.includes("الكلمة") ||
    lower.includes("مؤتمر") ||
    lower.includes("عشاء") ||
    lower.includes("فعالية")
  ) {
    return {
      body: say("schedule"),
      actions: [
        {
          label: "View Shuttle Route & GPS",
          labelAr: "عرض مسار الحافلة ونظام GPS",
          actionId: "view_shuttle_gps"
        }
      ]
    };
  }

  // 7. Coffee Station Surge & Catering Restock
  if (
    lower.includes("coffee") ||
    lower.includes("pastries") ||
    lower.includes("hall b") ||
    lower.includes("rush") ||
    lower.includes("crowd") ||
    lower.includes("restock") ||
    lower.includes("catering") ||
    lower.includes("قهوة") ||
    lower.includes("مخبوزات") ||
    lower.includes("قاعة ب") ||
    lower.includes("تموين") ||
    lower.includes("ازدحام")
  ) {
    return {
      body: say("catering"),
      actions: [
        {
          label: "Dispatch 2 Baristas & Restock",
          labelAr: "إرسال 2 باريستا وإعادة التعبئة",
          actionId: "confirm_dispatch_staff"
        }
      ]
    };
  }

  // 8. Automated Post-Event Analytics & Cost Savings
  if (
    lower.includes("report") ||
    lower.includes("analytics") ||
    lower.includes("saving") ||
    lower.includes("post-event") ||
    lower.includes("kpi") ||
    lower.includes("nps") ||
    lower.includes("cost") ||
    lower.includes("metric") ||
    lower.includes("تقرير") ||
    lower.includes("وفورات") ||
    lower.includes("إحصائيات") ||
    lower.includes("تقييم") ||
    lower.includes("تكاليف")
  ) {
    return {
      body: say("report"),
      actions: [
        {
          label: "View Executive PDF Report",
          labelAr: "استعراض التقرير التنفيذي الكامل",
          actionId: "generate_report"
        }
      ]
    };
  }

  // 9. Wi-Fi, Lounge Access & VIP Pass
  if (
    lower.includes("wifi") ||
    lower.includes("internet") ||
    lower.includes("network") ||
    lower.includes("password") ||
    lower.includes("lounge") ||
    lower.includes("pass") ||
    lower.includes("credential") ||
    lower.includes("واي فاي") ||
    lower.includes("إنترنت") ||
    lower.includes("شبكة") ||
    lower.includes("كلمة المرور") ||
    lower.includes("استراحة")
  ) {
    return { body: say("network") };
  }

  // 10. Diriyah & Fine Dining
  if (
    lower.includes("diriyah") ||
    lower.includes("dinner") ||
    lower.includes("restaurant") ||
    lower.includes("reserve") ||
    lower.includes("bujairi") ||
    lower.includes("food") ||
    lower.includes("عشاء") ||
    lower.includes("مطعم") ||
    lower.includes("الدرعية") ||
    lower.includes("البجيري") ||
    lower.includes("حجز")
  ) {
    return { body: say("dining") };
  }

  return welcome();
}

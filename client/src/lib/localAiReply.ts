import { isArabicLanguage } from "./localize";
import type { AiAction } from "./aiStream";

/**
 * Deterministic reply used when the streaming endpoint is unreachable (no
 * server, no session, network loss). Mirrors the scripted scenarios in
 * `server/src/services/ai.ts` so the projector sees the same answer either way.
 */
export function localAiReply(
  message: string,
  language: string,
  persona: string
): { body: string; actions?: AiAction[] } {
  const lower = message.toLowerCase();
  const isArabic = isArabicLanguage(language);

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
      body: isArabic
        ? `${persona}: تنبيه فحص التواجد الجغرافي للموردين: فريق الصوتيات والمرئيات (شركة الفيصل) فقط هو المتأخر عن القاعة (أ). يوضح نظام الـ GPS أن شاحنة المعدات عالقة في زحمة طريق الملك فهد وتبعد حوالي 10-12 دقيقة. جميع الموردين الـ 6 الآخرين متواجدون في مواقعهم.`
        : `${persona}: Vendor Geofence Alert: Only the AV team (Al-Faisal Lighting & AV) is missing from Hall A right now. Real-time GPS telemetry shows their equipment truck is navigating heavy traffic on King Fahd Rd (~10–12 minutes away). All other 6 registered vendors are checked in at their designated bays.`,
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
      body: isArabic
        ? `${persona}: خزنة مِضياف الأمنية الثلاثية لمكافحة تسريب العروض نَشِطة حالياً لمبادرة مستقبل الاستثمار 2027 (FII). عروض الأسعار المقدمة من فندق الريتز-كارلتون (1,250,000 ر.س) والأسطول الملكي (450,000 ر.س) مشفرة ومختومة بالكامل. يتطلب فتحها تفعيل 3 مفاتيح أمنية في آن واحد (2 من صلة + 1 من مدقق مِضياف) خلال نافذة 5 دقائق لمنع أي تسريب للموردين المفضلين.`
        : `${persona}: Midyaf Triple-Key Anti-Corruption Security Vault is ACTIVE for Future Investment Initiative 2027 (FII). Vendor bids from The Ritz-Carlton (SAR 1,250,000) and Royal Fleet VIP (SAR 450,000) remain cryptographically sealed. Viewing unsealed quotations requires simultaneous authentication from 2 Sila Organizers and 1 Midyaf Independent Auditor within a strict 5-minute window.`,
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
      body: isArabic
        ? `${persona}: تنبيه غرفة العمليات المباشرة: 3 رحلات دولية (SV102 من لندن، EK817 من دبي، QR1164 من الدوحة) هبطت في نفس التوقيت بمطار الملك خالد الدولي - الصالة 2. يوجد 40 ضيفاً بحاجة لنقل فوري، بينما يتوفر 15 حافلة فقط في الصالة 2. يتوفر 8 حافلات في وضع الاستعداد بالصالة 1 يمكن تحويلها فوراً.`
        : `${persona}: Live Command Center Alert: 3 international flights (SV102 from London, EK817 from Dubai, QR1164 from Doha) touched down simultaneously at KKIA Terminal 2. 40 VIP delegates require immediate curbside pickup, but only 15 vans are staged there. Terminal 1 currently has 8 idle standby vans ready for immediate reallocation.`,
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
      body: isArabic
        ? `${persona}: مذكرات الضيافة الملكية (VIP Riders) معتمدة في فندق الريتز-كارلتون: 1) معالي ياسر الرميان (الجناح الملكي 1: قهوة سعودية بورد الطائف، تمر سكري فاخر، وجبات حلال خالية من الغلوتين)؛ 2) سارة التويجري (جناح تنفيذي 204: وسائد ريش متماسكة، دهن عود ملكي معتق)؛ 3) طارق منصور (غرفة ديلوكس 310: قهوة بدون كافيين ومياه فوارة). تم تأكيد كافة التجهيزات مسبقاً.`
        : `${persona}: VIP Hospitality Riders Verified at The Ritz-Carlton Grand Hotel: 1) H.E. Yasir Al-Rumayyan (Royal Suite 1: Taif Rose Gahwa, Sukkari Dates, Strictly Halal & Gluten-Free dietary rider); 2) Sarah Al-Tuwaijri (Executive Suite 204: Firm Feather Pillow, Royal Arabian Oud amenities); 3) Tariq Mansoor (Deluxe King 310: Decaf Saudi Gahwa, Sparkling Water). All riders pre-cleared by Midyaf Protocol.`,
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
      body: isArabic
        ? `${persona}: السائق التنفيذي المخصص: الكابتن سلطان العتيبي بانتظارك عند رصيف كبار الشخصيات بوابة 2 بالصالة 2 في سيارة مرسيدس مايباخ S680 سوداء (لوحة: أ د ن 9119). التصريح الأمني: مرافقة تنفيذية #819. مكيف السيارة مضبوط على 20° مئوية مع ماء ورد طائفي ومناشف باردة جاهزة. يمكنك التوجه للسيارة مباشرة دون الحاجة للاتصال.`
        : `${persona}: Assigned VIP Chauffeur: Captain Sultan Al-Otaibi is waiting at KKIA Terminal 2 VIP Curb Gate 2 in an all-black Mercedes Maybach S680 (Plate: KSA 9119). Security clearance: Executive Escort #819. In-cabin climate set to 20°C with cold Taif rose water ready. You can walk straight to the vehicle without phone calls.`,
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
      body: isArabic
        ? `${persona}: جدول مبادرة مستقبل الاستثمار 2027 اليوم: \n• 08:30 - إفطار واستقبال كبار الشخصيات (بهو الريتز-كارلتون) \n• 10:00 - الكلمة الافتتاحية: 'الآفاق الاقتصادية القادمة' (مركز المؤتمرات KAICC قاعة 1) \n• 13:00 - غداء قادة الأعمال الدوليين \n• 20:00 - العشاء الملكي الاحتفالي (مطل البجيري - الدرعية التاريخية). \n[تنبيه مروري]: يستغرق الانتقال إلى الدرعية حوالي 35 دقيقة، وتنطلق حافلات الضيوف في تمام 19:15.`
        : `${persona}: FII 2027 Schedule & Travel Advisory: \n• 08:30 - VIP Networking Breakfast (The Ritz-Carlton Lobby) \n• 10:00 - Opening Keynote: 'The Next Economic Horizon' (KAICC Plenary Hall 1) \n• 13:00 - Global Leaders Networking Luncheon \n• 20:00 - Royal Gala Dinner (Diriyah Bujairi Terrace). \n[Traffic Advisory]: Transit to Diriyah will take ~35 minutes during evening peak. Executive lobby shuttles depart promptly at 19:15.`,
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
      body: isArabic
        ? `${persona}: تنبيه تموين عاجل: حساسات الحركة في استراحة كبار الشخصيات بالقاعة (ب) تسجل ازدحاماً بنسبة 85% بعد انتهاء الجلسة الصباحية. انخفض مخزون القهوة والمخبوزات الفاخرة إلى 18%. يوصى بإرسال 2 باريستا إضافيين وعربة إعادة تعبئة فوراً لتفادي أي انقطاع.`
        : `${persona}: Urgent Catering Alert: Footfall monitors at Hall B Executive Lounge report an 85% capacity surge following the morning panel. Artisan pastries and premium Gahwa beans have dropped to 18% inventory. Immediate dispatch of 2 standby baristas and a replenishment cart recommended.`,
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
      body: isArabic
        ? `${persona}: ملخص تقرير ما بعد الفعالية الذكي: بلغت نسبة رضا كبار الشخصيات 96% (مؤشر NPS 88). أبرز المكاسب التشغيلية: جدولة رحلات الوصول في مطار الملك خالد ألغت أوقات انتظار الرصيف وخفّضت هدر الأسطول بنسبة 40%، محققة وفراً مالياً قدره 145,000 ريال سعودي.`
        : `${persona}: Automated Post-Event Intelligence Summary: Overall VIP satisfaction reached 96% (NPS 88). Key operational efficiency: Intelligent flight batching at KKIA Terminal 2 eliminated 18-minute curb wait times and cut idle vehicle duration by 40%, delivering SAR 145,000 in direct fleet cost savings.`,
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
    return {
      body: isArabic
        ? `${persona}: بيانات شبكة كبار الشخصيات المشفرة: \n• اسم الشبكة: Midyaf-VIP-5G \n• كلمة المرور: SaudiVision2030! \n• التغطية: قاعات مركز المؤتمرات، أجنحة واستراحات الريتز-كارلتون. سرعة تتجاوز 450 ميغابت مع أولوية اتصال مخصصة.`
        : `${persona}: VIP Encrypted Network Credentials: \n• Network (SSID): Midyaf-VIP-5G \n• Passphrase: SaudiVision2030! \n• Coverage: KAICC Plenary Halls, Ritz-Carlton Royal Lounges & Media Suite. Dedicated 450 Mbps fiber uplink with encrypted channel.`
    };
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
    return {
      body: isArabic
        ? `${persona}: توصية العشاء الفاخر لضيوف القمة: مطل البجيري في الدرعية التاريخية يضم نخبة من أرقى المطاعم العالمية المطلة على حي الطريف التاريخي المسجل باليونسكو. المطاعم الموصى بها: مطعم ميز (المطبخ السعودي الفاخر) أو هاكاسان. أنصح بالتحرك في تمام 19:15 لتفادي الذروة المرورية.`
        : `${persona}: VIP Summit Dining Recommendation: Bujairi Terrace in Historic Diriyah offers premier gastronomy overlooking the UNESCO World Heritage site of At-Turaif. Top recommendations: Maiz (refined Saudi dining) or Hakkasan. Recommended departure time is 19:15 to bypass corridor congestion.`
    };
  }

  return {
    body: isArabic
      ? `${persona}: أهلاً بك في منصة مِضياف الذكية لإدارة العمليات والضيافة السيادية. أتابع حالياً فعاليات مبادرة مستقبل الاستثمار 2027 (FII). يمكنني مساعدتك فوراً في: فحص الموردين بالقاعة أ، التحقق من الخزنة الثلاثية، تنبيهات وصول المطار، مذكرات الضيافة، وتتبع السائقين.`
      : `${persona}: Welcome to Midyaf AI Operations Brain. I am actively monitoring telemetry for Future Investment Initiative 2027 (FII). I can help with real-time vendor geofencing, the Triple-Key Security Vault, Terminal 2 flight surges, VIP hospitality riders, and driver tracking.`,
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
  };
}

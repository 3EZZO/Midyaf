import OpenAI from "openai";
import { env } from "../env.js";

const client = env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;

export type ChatInput = {
  message: string;
  language?: string;
  persona?: "Saud" | "Noura" | "Saif & Munirah" | "Ops Manager" | "Supply Chain AI";
  context?: unknown;
};

export type ChatReplyAction = {
  label: string;
  labelAr: string;
  actionId: string;
};

export type ChatReply = {
  persona: string;
  content: string;
  toolIntent?: string;
  actions?: ChatReplyAction[];
};

export async function chatGuide(input: ChatInput): Promise<ChatReply> {
  const persona = input.persona ?? "Noura";
  const language = input.language ?? "en";
  const isArabic = language.startsWith("ar");

  // First check if the user query directly triggers one of Osama Morad's exact PDF scenarios
  const exactMatch = deterministicChat(persona, input.message, language);
  if (exactMatch.matched) {
    return {
      persona,
      content: exactMatch.content,
      toolIntent: exactMatch.toolIntent,
      actions: exactMatch.actions
    };
  }

  const system = [
    `You are ${persona}, Midyaf's world-class hospitality and operational AI for Riyadh.`,
    "Answer with practical, executive-grade Gulf hospitality and logistics recommendations.",
    "Respect Saudi cultural context and user privacy.",
    `Respond in ${language}.`
  ].join(" ");

  if (!client) {
    return {
      persona,
      content: exactMatch.content,
      toolIntent: inferToolIntent(input.message),
      actions: exactMatch.actions
    };
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({
            message: input.message,
            context: input.context ?? {}
          })
        }
      ],
      temperature: 0.4
    });

    return {
      persona,
      content: completion.choices[0]?.message.content ?? exactMatch.content,
      toolIntent: inferToolIntent(input.message),
      actions: exactMatch.actions
    };
  } catch (error) {
    return {
      persona,
      content: exactMatch.content,
      toolIntent: inferToolIntent(input.message),
      actions: exactMatch.actions
    };
  }
}

export async function smartAssistant(
  query: string,
  language: string,
  context?: unknown
) {
  const normLang = (language || "en").toLowerCase().startsWith("ar") ? "ar" : "en";
  const resolved = resolveSmartQuery(query, normLang, "Smart Assistant");

  if (resolved.matched || !client) {
    return {
      message: resolved.content,
      toolIntent: resolved.toolIntent,
      actions: resolved.actions,
      data: resolved.data
    };
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are the Midyaf Smart Assistant, the elite hospitality and logistics AI engine for Riyadh events (such as FII 2027). Answer organizer and guest queries concisely with practical, executive-level insights about fleet, venues, VIP riders, and vendor operations."
        },
        {
          role: "user",
          content: JSON.stringify({ query, context: context ?? {} })
        }
      ]
    });
    return {
      message: completion.choices[0]?.message.content ?? resolved.content,
      toolIntent: resolved.toolIntent,
      actions: resolved.actions
    };
  } catch {
    return {
      message: resolved.content,
      toolIntent: resolved.toolIntent,
      actions: resolved.actions,
      data: resolved.data
    };
  }
}

export async function executeSmartAction(
  actionId: string,
  params?: unknown
): Promise<{
  ok: boolean;
  message: string;
  messageAr: string;
  data?: unknown;
}> {
  switch (actionId) {
    case "divert_fleet":
    case "command_center_divert_vans":
      return {
        ok: true,
        message: "5 executive vans successfully diverted from Terminal 1 to KKIA Terminal 2. Drivers notified via mobile app.",
        messageAr: "تم تحويل 5 حافلات تنفيذية بنجاح من الصالة 1 إلى الصالة 2 بمطار الملك خالد. تم إشعار السائقين عبر التطبيق.",
        data: { divertedCount: 5, targetTerminal: "Terminal 2", status: "EN_ROUTE" }
      };

    case "send_vendor_sms":
    case "send_vendor_message":
      return {
        ok: true,
        message: "Priority SMS dispatched to Al-Faisal Lighting & AV Lead (+966 55 432 1098). Driver acknowledged and is en route on King Fahd Rd (ETA 10 mins).",
        messageAr: "تم إرسال تنبيه SMS عاجل لمدير فريق شركة الفيصل (+966 55 432 1098). أكد السائق الاستلام وتواجده على طريق الملك فهد (الوصول خلال 10 دقائق).",
        data: { recipient: "+966 55 432 1098", vendor: "Al-Faisal Lighting & AV", status: "DELIVERED" }
      };

    case "confirm_dispatch_staff":
      return {
        ok: true,
        message: "2 standby baristas and replenishment cart dispatched to Hall B Executive Lounge. Acknowledged by Najd Hospitality.",
        messageAr: "تم إرسال 2 باريستا وعربة تموين فوراً إلى استراحة كبار الشخصيات بالقاعة (ب). تم تأكيد الاستلام من شركة نجد.",
        data: { staffAssigned: 2, location: "Hall B Executive Lounge", status: "DISPATCHED" }
      };

    case "track_driver":
    case "track_driver_khaled":
      return {
        ok: true,
        message: "Live telemetry connected: Capt. Sultan Al-Otaibi (Mercedes Maybach S680 · Plate KSA 9119) is staged at KKIA Terminal 2 VIP Curb Gate 2.",
        messageAr: "تم الاتصال بالرادار المباشر: الكابتن سلطان العتيبي (مرسيدس مايباخ S680 · لوحة أ د ن 9119) متوقف عند رصيف كبار الشخصيات بوابة 2.",
        data: {
          driverName: "Capt. Sultan Al-Otaibi",
          vehicle: "Mercedes Maybach S680",
          plate: "KSA 9119",
          location: "KKIA Terminal 2 VIP Curb Gate 2",
          lat: 24.9576,
          lng: 46.6988,
          speed: "0 km/h (Engine idling, A/C 20°C)",
          status: "READY_FOR_PICKUP"
        }
      };

    case "notify_butler":
      return {
        ok: true,
        message: "The Ritz-Carlton Head Butler notified. Royal Suite amenities and Taif Rose Gahwa re-confirmed for H.E. Yasir Al-Rumayyan.",
        messageAr: "تم إشعار رئيس الخدم في فندق الريتز-كارلتون. تم تأكيد تجهيزات الجناح الملكي والقهوة بورد الطائف لمعالي ياسر الرميان.",
        data: { hotel: "The Ritz-Carlton Riyadh", suite: "Royal Suite 1", status: "PREPARED" }
      };

    case "reserve_dining":
      return {
        ok: true,
        message: "VIP Table Reserved at Bujairi Terrace (Maiz Restaurant) for 20:30 tonight. Confirmation Code: #BT-7749.",
        messageAr: "تم تأكيد حجز طاولة كبار الشخصيات في مطل البجيري (مطعم ميز) الليلة الساعة 20:30. رمز الحجز: #BT-7749.",
        data: { venue: "Maiz Restaurant, Bujairi Terrace", time: "20:30", bookingCode: "BT-7749" }
      };

    default:
      return {
        ok: true,
        message: `Action '${actionId}' executed successfully and logged in Midyaf event stream.`,
        messageAr: `تم تنفيذ الإجراء '${actionId}' بنجاح وتوثيقه في سجل عمليات مِضياف.`,
        data: { actionId, timestamp: new Date().toISOString() }
      };
  }
}

export async function verifyDocument(input: {
  fileName?: string;
  documentType?: string;
  eventEndDate?: string;
  content?: string;
}) {
  const fileName = (input.fileName ?? "").toLowerCase();
  const content = (input.content ?? "").toLowerCase();

  // Check for the exact vendor compliance scenario from Page 8 of PDF
  if (
    fileName.includes("expired") ||
    fileName.includes("october12") ||
    content.includes("october 12") ||
    content.includes("expire") ||
    input.documentType === "SIMULATE_EXPIRED"
  ) {
    return {
      status: "REJECTED",
      reason:
        "Sorry, your policy expires on October 12th, but our event runs until October 15th. Please upload an extended policy to continue.",
      reasonAr:
        "عذراً، تنتهي صلاحية وثيقة التأمين الخاصة بك في 12 أكتوبر، بينما تستمر فعالياتنا حتى 15 أكتوبر. يرجى رفع وثيقة ممتدة للمتابعة.",
      companyName: "Al-Faisal Lighting & AV Solutions",
      expiryDate: "2026-10-12",
      requiredEndDate: input.eventEndDate ?? "2026-10-15",
      coverageAmount: "SAR 2,000,000",
      confidence: "99.4%"
    };
  }

  return {
    status: "APPROVED",
    reason:
      "Commercial license and insurance certificate verified. Expiry date and coverage exceed event requirements.",
    reasonAr:
      "تم التحقق بنجاح من السجل التجاري وشهادة التأمين. تاريخ الصلاحية والتغطية المالية متطابقة مع شروط الفعالية.",
    companyName: "Najd Premium Fleet & Hospitality",
    expiryDate: "2027-05-20",
    requiredEndDate: input.eventEndDate ?? "2026-10-15",
    coverageAmount: "SAR 5,000,000",
    confidence: "99.8%"
  };
}

export async function getCommandCenterInsights(input?: unknown) {
  return {
    status: "AMBER_WARNING",
    title: "Terminal 2 Arrival Surge",
    titleAr: "تنبيه ازدحام القادمين في الصالة 2",
    message:
      "Warning: Three delayed flights just landed at the same time. 40 guests need pickup soon, but we only have 15 vans assigned there. Should we divert 5 vans from Terminal 1?",
    messageAr:
      "تحذير: هبطت 3 رحلات متأخرة في نفس الوقت. 40 ضيفاً بحاجة لتوصيل فوري، ولكن يوجد لدينا 15 حافلة فقط مخصصة هناك. هل نرغب في تحويل 5 حافلات من الصالة 1؟",
    recommendation: "Divert 5 vans from Terminal 1 to Terminal 2",
    recommendationAr: "تحويل 5 حافلات فوراً من الصالة 1 إلى الصالة 2",
    actionLabel: "Yes, Divert 5 Vans",
    actionLabelAr: "نعم، تحويل 5 حافلات",
    actionId: "command_center_divert_vans",
    atRiskGuestsCount: 25,
    transitConfidence: "96.5%"
  };
}

export async function generatePostEventReport(input?: unknown) {
  return {
    eventId: "riyadh-luxury-forum-2026",
    title: "Automated Executive Post-Event Report — Riyadh Leadership Summit",
    titleAr: "التقرير التنفيذي التلقائي ما بعد الفعالية — قمة الرياض للقيادة",
    summary:
      "The morning after your event finishes, the system aggregates multi-channel telemetry. Overall VIP satisfaction reached 96%, with seamless protocol transfers across Mandarin Oriental Al Faisaliah and Diriyah Bujairi Terrace.",
    summaryAr:
      "صباح اليوم التالي لانتهاء الفعالية، قام النظام بجمع وتحليل بيانات المراقبة الشاملة. بلغت نسبة رضا كبار الشخصيات 96% مع انسيابية كاملة في عمليات الاستقبال والتسكين في فندقي ماندريان أورينتيل والدرعية.",
    keyFindings: [
      {
        finding: "Drivers spent 40% of their time sitting idle at the hotel yesterday afternoon.",
        findingAr: "أمضى السائقون 40% من وقتهم في حالة انتظار ونشاط خامل عند الفندق بعد ظهر أمس."
      },
      {
        finding: "If we group guests together more efficiently next year, we can cut fleet costs by 25% without making anyone wait longer.",
        findingAr: "إذا قمنا بتجميع الضيوف ضمن دفعات أكثر كفاءة في العام القادم، يمكننا خفض تكاليف الأسطول بنسبة 25% دون زيادة وقت الانتظار لأي ضيف."
      },
      {
        finding: "Long wait times (averaging 18 minutes) at Terminal 2 between 14:00 and 15:30 directly caused lower satisfaction scores at hotel check-in desks.",
        findingAr: "أدت أوقات الانتظار الطويلة (بمتوسط 18 دقيقة) في الصالة 2 بين الساعة 14:00 و 15:30 بشكل مباشر إلى انخفاض تقييمات الرضا عند مكاتب الاستقبال في الفنادق."
      }
    ],
    metrics: {
      totalGuestsServed: 420,
      averagePickupWaitMinutes: 4.2,
      fleetIdlePercentage: 40,
      estimatedCostSavingsSAR: 145000,
      npsScore: 88
    },
    actionPlan: [
      {
        step: "Implement dynamic buffer pooling at King Khalid International Airport (KKIA) Terminal 2.",
        stepAr: "تطبيق التوزيع المرن للحافلات في مطار الملك خالد الدولي - الصالة 2."
      },
      {
        step: "Enable automated shuttle batching for arrivals within 20-minute windows.",
        stepAr: "تفعيل التجميع التلقائي للرحلات الواصلة ضمن نوافذ زمنية مدتها 20 دقيقة."
      },
      {
        step: "Pre-clear security and dietary manifests for Diriyah Bujairi Terrace 24 hours in advance.",
        stepAr: "التصريح المسبق للقوائم الأمنية والغذائية لمطاعم المطل في الدرعية قبل 24 ساعة."
      }
    ]
  };
}

export async function planEvent(eventBrief: string) {
  const prompt = [
    "Create a Riyadh logistics plan for this event brief.",
    "Return hotels, transport waves, supplier needs, risks, and driver staffing.",
    `Brief: ${eventBrief}`
  ].join("\n");

  if (!client) {
    return {
      summary:
        "Use KAFD/Central Riyadh luxury hotels, split airport pickups by arrival wave, reserve executive SUVs, and keep a Diriyah corridor standby driver team.",
      recommendations: [
        "Book 12 executive rooms within 15 minutes of the venue.",
        "Assign VIP airport transfers from North Riyadh first.",
        "Keep 20% driver capacity as contingency after Maghrib.",
        "Confirm Saudi coffee service and AV equipment 24 hours before doors."
      ],
      risks: [
        "Airport arrival clustering at King Khalid International Terminal 2",
        "KAFD evening peak transit flow",
        "VIP dietary preferences alignment"
      ]
    };
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Midyaf Ops Manager. Produce concise operational plans for Riyadh events."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    });

    return {
      summary: completion.choices[0]?.message.content,
      recommendations: [],
      risks: []
    };
  } catch {
    return {
      summary:
        "Use KAFD/Central Riyadh luxury hotels, split airport pickups by arrival wave, reserve executive SUVs, and keep a Diriyah corridor standby driver team.",
      recommendations: [
        "Book 12 executive rooms within 15 minutes of the venue.",
        "Assign VIP airport transfers from North Riyadh first.",
        "Keep 20% driver capacity as contingency after Maghrib.",
        "Confirm Saudi coffee service and AV equipment 24 hours before doors."
      ],
      risks: [
        "Airport arrival clustering at King Khalid International Terminal 2",
        "KAFD evening peak transit flow",
        "VIP dietary preferences alignment"
      ]
    };
  }
}

export async function analyzeSuppliers(offers: unknown) {
  if (!client) {
    return {
      bestValue: "Najd Palace Suites & Hospitality",
      rationale:
        "Highest verified rating (4.9/5), strategic North Riyadh location, and commission within the 10-15% business governance rule.",
      anomalies: [
        "Flagged unverified supplier 'Modern Lighting Co.' with price 28% below category benchmark."
      ]
    };
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Midyaf Supply Chain AI. Compare vendor offers for value, risk, and anomalies."
        },
        { role: "user", content: JSON.stringify(offers) }
      ],
      temperature: 0.2
    });

    return {
      bestValue: completion.choices[0]?.message.content,
      rationale: "",
      anomalies: []
    };
  } catch {
    return {
      bestValue: "Najd Palace Suites & Hospitality",
      rationale:
        "Highest verified rating (4.9/5), strategic North Riyadh location, and commission within the 10-15% business governance rule.",
      anomalies: [
        "Flagged unverified supplier 'Modern Lighting Co.' with price 28% below category benchmark."
      ]
    };
  }
}

export function resolveSmartQuery(
  query: string,
  language: string,
  persona: string = "Smart Assistant"
): {
  matched: boolean;
  content: string;
  toolIntent?: string;
  actions?: ChatReplyAction[];
  data?: unknown;
} {
  const isArabic = (language || "en").toLowerCase().startsWith("ar");
  const lower = (query || "").toLowerCase();

  // 1. Missing vendors geofence check (PDF Page 4)
  if (
    lower.includes("missing") ||
    lower.includes("hall a") ||
    lower.includes("vendor") ||
    lower.includes("supplier") ||
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
      matched: true,
      content: isArabic
        ? `${persona}: تنبيه فحص التواجد الجغرافي للموردين: فريق الصوتيات والمرئيات (شركة الفيصل للحلول الصوتية) فقط هو المتأخر عن القاعة (أ) حالياً. يوضح نظام الـ GPS أن شاحنة المعدات عالقة في ازدحام طريق الملك فهد وتبعد حوالي 10-12 دقيقة. جميع الموردين الآخرين (6 موردين) متواجدون في مواقعهم المخصصة.`
        : `${persona}: Vendor Geofence Alert: Only the AV team (Al-Faisal Lighting & AV) is missing from Hall A right now. Real-time GPS telemetry shows their equipment truck is navigating heavy traffic on King Fahd Rd (~10–12 minutes away). All other 6 registered event vendors are checked in at their designated bays.`,
      toolIntent: "vendor_geofence_check",
      actions: [
        {
          label: "⚡ Dispatch Urgent SMS to AV Team",
          labelAr: "⚡ إرسال تنبيه SMS عاجل لفريق الصوتيات",
          actionId: "send_vendor_sms"
        },
        {
          label: "📍 Pinpoint on Fleet Map",
          labelAr: "📍 تتبع الموقع على الخريطة",
          actionId: "view_vendor_map"
        }
      ]
    };
  }

  // 2. Triple-Key Anti-Corruption Security Vault & Sealed Bids (Investor Feature)
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
      matched: true,
      content: isArabic
        ? `${persona}: خزنة مِضياف الأمنية الثلاثية لمكافحة تسريب العروض نَشِطة حالياً لمبادرة مستقبل الاستثمار 2027 (FII). عروض الأسعار المقدمة من فندق الريتز-كارلتون (1,250,000 ر.س) والأسطول الملكي (450,000 ر.س) مشفرة ومختومة بالكامل. يتطلب فتحها تفعيل 3 مفاتيح أمنية في آن واحد (2 من صلة + 1 من مدقق مِضياف) خلال نافذة 5 دقائق لمنع أي تسريب للموردين المفضلين.`
        : `${persona}: Midyaf Triple-Key Anti-Corruption Security Vault is ACTIVE for Future Investment Initiative 2027 (FII). Vendor bids from The Ritz-Carlton (SAR 1,250,000) and Royal Fleet VIP (SAR 450,000) remain cryptographically sealed. Viewing unsealed quotations requires simultaneous authentication from 2 Sila Organizers and 1 Midyaf Independent Auditor within a strict 5-minute window.`,
      toolIntent: "vault_status_check",
      actions: [
        {
          label: "🔐 Access Triple-Key Vault",
          labelAr: "🔐 الانتقال إلى الخزنة الثلاثية",
          actionId: "scroll_to_vault"
        },
        {
          label: "📜 View Security Integrity Audit",
          labelAr: "📜 سجل التدقيق والنزاهة",
          actionId: "view_vault_audit"
        }
      ]
    };
  }

  // 3. Flight Arrivals, Airport Surge & Standby Fleet (Live Command Center)
  if (
    lower.includes("flight") ||
    lower.includes("terminal 2") ||
    lower.includes("terminal 1") ||
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
      matched: true,
      content: isArabic
        ? `${persona}: تنبيه غرفة العمليات المباشرة: 3 رحلات دولية (SV102 من لندن، EK817 من دبي، QR1164 من الدوحة) هبطت في نفس التوقيت بمطار الملك خالد الدولي - الصالة 2. يوجد 40 ضيفاً بحاجة لنقل فوري إلى مقر الإقامة، بينما يتوفر 15 حافلة فقط في الصالة 2. يتوفر 8 حافلات في وضع الاستعداد بالصالة 1 يمكن تحويلها فوراً.`
        : `${persona}: Live Command Center Alert: 3 international flights (SV102 from London, EK817 from Dubai, QR1164 from Doha) touched down simultaneously at KKIA Terminal 2. 40 VIP delegates require immediate curbside pickup, but only 15 vans are staged there. Terminal 1 currently has 8 idle standby vans ready for immediate reallocation.`,
      toolIntent: "airport_flight_surge",
      actions: [
        {
          label: "🚐 Divert 5 Vans to Terminal 2",
          labelAr: "🚐 تحويل 5 حافلات فوراً إلى الصالة 2",
          actionId: "divert_fleet"
        },
        {
          label: "✈️ View Airport Express Manifest",
          labelAr: "✈️ عرض قائمة وصول المطار",
          actionId: "view_airport"
        }
      ]
    };
  }

  // 4. VIP Hospitality & Hotel Riders (FII 2027)
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
      matched: true,
      content: isArabic
        ? `${persona}: مذكرات الضيافة الملكية (VIP Riders) معتمدة في فندق الريتز-كارلتون الرياض: 1) معالي ياسر الرميان (الجناح الملكي 1: قهوة سعودية بورد الطائف، تمر سكري فاخر، وجبات حلال خالية من الغلوتين)؛ 2) سارة التويجري (جناح تنفيذي 204: وسائد ريش متماسكة، دهن عود ملكي معتق)؛ 3) طارق منصور (غرفة ديلوكس 310: قهوة بدون كافيين ومياه فوارة). تم تأكيد كافة التجهيزات مع فريق الاستقبال.`
        : `${persona}: VIP Hospitality Riders Verified at The Ritz-Carlton Riyadh: 1) H.E. Yasir Al-Rumayyan (Royal Suite 1: Taif Rose Gahwa, Sukkari Dates, Strictly Halal & Gluten-Free dietary rider); 2) Sarah Al-Tuwaijri (Executive Suite 204: Firm Feather Pillow, Royal Arabian Oud amenities); 3) Tariq Mansoor (Deluxe King 310: Decaf Saudi Gahwa, Sparkling Water). All riders pre-cleared by Midyaf Protocol.`,
      toolIntent: "hospitality_rider_check",
      actions: [
        {
          label: "📋 Inspect Hospitality Riders",
          labelAr: "📋 استعراض مذكرات الضيافة",
          actionId: "inspect_riders"
        },
        {
          label: "🛎️ Re-confirm with Ritz Butler",
          labelAr: "🛎️ تأكيد التجهيزات مع رئيس الخدم",
          actionId: "notify_butler"
        }
      ]
    };
  }

  // 5. Driver & Chauffeur Match / Frictionless VIP Pickup (PDF Page 6)
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
      matched: true,
      content: isArabic
        ? `${persona}: السائق التنفيذي المخصص: الكابتن سلطان العتيبي بانتظارك عند رصيف كبار الشخصيات بوابة 2 بالصالة 2 في سيارة مرسيدس مايباخ S680 سوداء (لوحة: أ د ن 9119). التصريح الأمني: مرافقة تنفيذية #819. مكيف السيارة مضبوط على 20° مئوية مع ماء ورد طائفي ومناشف باردة. يمكنك التوجه للسيارة مباشرة دون الحاجة للاتصال.`
        : `${persona}: Assigned VIP Chauffeur: Captain Sultan Al-Otaibi is waiting at KKIA Terminal 2 VIP Curb Gate 2 in an all-black Mercedes Maybach S680 (Plate: KSA 9119). Security clearance: Executive Escort #819. In-cabin climate set to 20°C with cold Taif rose water ready. You can walk straight to the vehicle without phone calls.`,
      toolIntent: "driver_touchdown_match",
      actions: [
        {
          label: "🗺️ Track Chauffeur Live on Radar",
          labelAr: "🗺️ تتبع السائق مباشرة على الرادار",
          actionId: "track_driver"
        },
        {
          label: "📞 Connect Encrypted Line",
          labelAr: "📞 اتصال آمن مباشر بالسائق",
          actionId: "call_chauffeur"
        }
      ]
    };
  }

  // 6. Event Schedule, Keynote & Shuttle Shifts (PDF Page 7)
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
      matched: true,
      content: isArabic
        ? `${persona}: جدول مبادرة مستقبل الاستثمار 2027 اليوم: \n• 08:30 - إفطار واستقبال كبار الشخصيات (بهو الريتز-كارلتون) \n• 10:00 - الكلمة الافتتاحية: 'الآفاق الاقتصادية القادمة' (مركز المؤتمرات KAICC قاعة 1) \n• 13:00 - غداء قادة الأعمال الدوليين \n• 20:00 - العشاء الملكي الاحتفالي (مطل البجيري - الدرعية التاريخية). \n⚠️ تنبيه مروري: يستغرق الانتقال إلى الدرعية حوالي 35 دقيقة بسبب ذروة المساء، وتنطلق حافلات الضيوف من بهو الفندق في تمام 19:15.`
        : `${persona}: FII 2027 Schedule & Travel Advisory: \n• 08:30 - VIP Networking Breakfast (The Ritz-Carlton Lobby) \n• 10:00 - Opening Keynote: 'The Next Economic Horizon' (KAICC Plenary Hall 1) \n• 13:00 - Global Leaders Networking Luncheon \n• 20:00 - Royal Gala Dinner (Diriyah Bujairi Terrace). \n⚠️ Traffic Advisory: Transit to Diriyah will take ~35 minutes during evening peak. Executive lobby shuttles depart promptly at 19:15.`,
      toolIntent: "fii_schedule_check",
      actions: [
        {
          label: "🚌 View Shuttle Route & GPS",
          labelAr: "🚌 عرض مسار الحافلة ونظام GPS",
          actionId: "view_shuttle_gps"
        },
        {
          label: "📅 Add to Calendar",
          labelAr: "📅 إضافة للتقويم",
          actionId: "sync_calendar"
        }
      ]
    };
  }

  // 7. Coffee Station Surge & Catering Restock (PDF Page 9)
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
      matched: true,
      content: isArabic
        ? `${persona}: تنبيه تموين عاجل: حساسات الحركة في استراحة كبار الشخصيات بالقاعة (ب) تسجل ازدحاماً بنسبة 85% بعد انتهاء الجلسة الصباحية. انخفض مخزون القهوة والمخبوزات الفاخرة إلى 18%. يوصى بإرسال 2 باريستا إضافيين وعربة إعادة تعبئة فوراً لتفادي أي انقطاع.`
        : `${persona}: Urgent Catering Alert: Footfall monitors at Hall B Executive Lounge report an 85% capacity surge following the morning panel. Artisan pastries and premium Gahwa beans have dropped to 18% inventory. Immediate dispatch of 2 standby baristas and a replenishment cart recommended.`,
      toolIntent: "catering_restock_dispatch",
      actions: [
        {
          label: "☕ Dispatch 2 Baristas & Restock",
          labelAr: "☕ إرسال 2 باريستا وإعادة التعبئة",
          actionId: "confirm_dispatch_staff"
        },
        {
          label: "📢 Send Alert to Najd Catering",
          labelAr: "📢 إرسال إشعار لتموين نجد",
          actionId: "notify_catering"
        }
      ]
    };
  }

  // 8. Automated Post-Event Telemetry & Cost Savings (PDF Page 10)
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
      matched: true,
      content: isArabic
        ? `${persona}: ملخص تقرير ما بعد الفعالية الذكي: بلغت نسبة رضا كبار الشخصيات 96% (مؤشر NPS 88). أبرز المكاسب التشغيلية: جدولة رحلات الوصول في مطار الملك خالد ألغت أوقات انتظار الرصيف وخفّضت هدر الأسطول بنسبة 40%، محققة وفراً مالياً قدره 145,000 ريال سعودي.`
        : `${persona}: Automated Post-Event Intelligence Summary: Overall VIP satisfaction reached 96% (NPS 88). Key operational efficiency: Intelligent flight batching at KKIA Terminal 2 eliminated 18-minute curb wait times and cut idle vehicle duration by 40%, delivering SAR 145,000 in direct fleet cost savings.`,
      toolIntent: "post_event_analytics",
      actions: [
        {
          label: "📊 View Executive PDF Report",
          labelAr: "📊 استعراض التقرير التنفيذي الكامل",
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
      matched: true,
      content: isArabic
        ? `${persona}: بيانات شبكة كبار الشخصيات المشفرة: \n• اسم الشبكة: Midyaf-VIP-5G \n• كلمة المرور: SaudiVision2030! \n• التغطية: قاعات مركز المؤتمرات، أجنحة واستراحات الريتز-كارلتون. سرعة تتجاوز 450 ميغابت مع أولوية اتصال مخصصة.`
        : `${persona}: VIP Encrypted Network Credentials: \n• Network (SSID): Midyaf-VIP-5G \n• Passphrase: SaudiVision2030! \n• Coverage: KAICC Plenary Halls, Ritz-Carlton Royal Lounges & Media Suite. Dedicated 450 Mbps fiber uplink with encrypted channel.`,
      toolIntent: "vip_lounge_wifi",
      actions: [
        {
          label: "📋 Copy Wi-Fi Passphrase",
          labelAr: "📋 نسخ كلمة المرور",
          actionId: "copy_wifi"
        }
      ]
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
      matched: true,
      content: isArabic
        ? `${persona}: توصية العشاء الفاخر في الرياض: مطل البجيري في الدرعية التاريخية يضم نخبة من أرقى المطاعم العالمية المطلة على حي الطريف التاريخي المسجل باليونسكو. المطاعم الموصى بها: مطعم ميز (المطبخ السعودي الفاخر) أو هاكاسان. أنصح بالتحرك في تمام 19:15 لتفادي الذروة المرورية.`
        : `${persona}: VIP Riyadh Dining Recommendation: Bujairi Terrace in Historic Diriyah offers premier gastronomy overlooking the UNESCO World Heritage site of At-Turaif. Top recommendations: Maiz (refined Saudi dining) or Hakkasan. Recommended departure time is 19:15 to bypass corridor congestion.`,
      toolIntent: "diriyah_dining_reserve",
      actions: [
        {
          label: "🍽️ Reserve Table at Bujairi",
          labelAr: "🍽️ حجز طاولة في مطل البجيري",
          actionId: "reserve_dining"
        }
      ]
    };
  }

  // Default hospitality replies
  return {
    matched: false,
    content: isArabic
      ? `${persona}: أهلاً بك في منصة مِضياف الذكية لإدارة العمليات والضيافة في الرياض. أتابع حالياً فعاليات مبادرة مستقبل الاستثمار 2027 (FII). يمكنني مساعدتك فوراً في: فحص الموردين بالقاعة أ، التحقق من الخزنة الثلاثية، تنبيهات وصول المطار، مذكرات الضيافة، وتتبع السائقين.`
      : `${persona}: Welcome to Midyaf AI Operations Brain. I am actively monitoring telemetry for Future Investment Initiative 2027 (FII). I can help with real-time vendor geofencing, the Triple-Key Security Vault, Terminal 2 flight surges, VIP hospitality riders, and driver tracking.`,
    actions: [
      {
        label: "🚨 Check Missing Vendors",
        labelAr: "🚨 فحص الموردين المتأخرين",
        actionId: "send_vendor_sms"
      },
      {
        label: "🔐 Check Security Vault",
        labelAr: "🔐 فحص الخزنة الثلاثية",
        actionId: "scroll_to_vault"
      },
      {
        label: "✈️ Flight Arrivals Surge",
        labelAr: "✈️ تنبيه وصول المطار",
        actionId: "divert_fleet"
      },
      {
        label: "🚗 Where is my Driver?",
        labelAr: "🚗 أين سائقي؟",
        actionId: "track_driver"
      }
    ]
  };
}

function deterministicChat(
  persona: string,
  message: string,
  language: string
): { matched: boolean; content: string; toolIntent?: string; actions?: ChatReplyAction[] } {
  return resolveSmartQuery(message, language, persona);
}

function inferToolIntent(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("missing") || lower.includes("hall a") || lower.includes("vendor")) {
    return "vendor_geofence_check";
  }
  if (lower.includes("keynote") || lower.includes("shuttle") || lower.includes("traffic")) {
    return "concierge_schedule_check";
  }
  if (lower.includes("khaled") || lower.includes("gmc") || lower.includes("exit 4")) {
    return "driver_touchdown_match";
  }
  if (lower.includes("coffee") || lower.includes("hall b") || lower.includes("pastries")) {
    return "vendor_task_dispatch";
  }
  if (lower.includes("book") || lower.includes("reserve")) {
    return "booking_requested";
  }
  if (lower.includes("taxi") || lower.includes("driver")) {
    return "transport_requested";
  }
  if (lower.includes("restaurant") || lower.includes("dinner")) {
    return "restaurant_recommendation";
  }

  return "guidance";
}

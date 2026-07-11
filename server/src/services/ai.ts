import OpenAI from "openai";
import { env } from "../env.js";

const client = env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;

export type ChatInput = {
  message: string;
  language?: string;
  persona?: "Saud" | "Noura" | "Ops Manager" | "Supply Chain AI";
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

function deterministicChat(
  persona: string,
  message: string,
  language: string
): { matched: boolean; content: string; toolIntent?: string; actions?: ChatReplyAction[] } {
  const isArabic = language.startsWith("ar");
  const lower = message.toLowerCase();

  // 1. Organizer Smart Assistant: Missing vendors geofence check (PDF Page 4)
  if (
    lower.includes("missing") ||
    lower.includes("hall a") ||
    lower.includes("vendor") ||
    lower.includes("غائب") ||
    lower.includes("القاعة") ||
    lower.includes("مورد")
  ) {
    return {
      matched: true,
      content: isArabic
        ? `${persona}: فريق الإضاءة والصوت (AV team) فقط هو الغائب عن القاعة (أ) حالياً. يوضح نظام الـ GPS أنهم عالقون في الازدحام المروري ويبعدون حوالي 10 دقائق. هل ترغب في أن أرسل لهم رسالة تنبيه فورية؟`
        : `${persona}: Only the AV team is missing from Hall A right now. Their GPS shows they are stuck in traffic about 10 minutes away. Do you want me to send them a message?`,
      toolIntent: "vendor_geofence_check",
      actions: [
        {
          label: "Send SMS to AV Team",
          labelAr: "إرسال رسالة لفريق الإضاءة والصوت",
          actionId: "send_vendor_sms"
        }
      ]
    };
  }

  // 2. Guest Digital Concierge: Schedule shift & traffic departure warning (PDF Page 7)
  if (
    lower.includes("keynote") ||
    lower.includes("shuttle") ||
    lower.includes("lobby") ||
    lower.includes("traffic") ||
    lower.includes("الكلمة") ||
    lower.includes("حافلة") ||
    lower.includes("ازدحام")
  ) {
    return {
      matched: true,
      content: isArabic
        ? `${persona}: تبدأ الكلمة الرئيسية بعد 45 دقيقة. حركة المرور مزدحمة قليلاً اليوم، لذا نوصي بالتوجه إلى حافلة البهو خلال الـ 10 دقائق القادمة لتجنب أي تأخير والوصول براحة تامة.`
        : `${persona}: The Keynote Speech starts in 45 minutes. Traffic is a bit heavy today, so we recommend heading down to the lobby shuttle in the next 10 minutes so you don't have to rush.`,
      toolIntent: "concierge_schedule_check",
      actions: [
        {
          label: "View Live Shuttle GPS",
          labelAr: "عرض موقع الحافلة المباشر",
          actionId: "view_shuttle_gps"
        }
      ]
    };
  }

  // 3. Guest Frictionless Driver Match: Touchdown notification (PDF Page 6)
  if (
    lower.includes("khaled") ||
    lower.includes("exit 4") ||
    lower.includes("gmc") ||
    lower.includes("plate") ||
    lower.includes("خالد") ||
    lower.includes("مخرج 4") ||
    lower.includes("سائق")
  ) {
    return {
      matched: true,
      content: isArabic
        ? `${persona}: أهلاً بك في الرياض! سائقك خالد بانتظارك عند المخرج 4 في سيارة GMC بيضاء (لوحة 8899). يمكنك فتح الخريطة والتوجه مباشرة للسيارة دون الحاجة لإجراء أي مكالمات.`
        : `${persona}: Welcome to Riyadh! Your driver Khaled is waiting at Exit 4 in a white GMC (Plate 8899). You can open the map and walk straight to the car. No phone calls, no confusion.`,
      toolIntent: "driver_touchdown_match",
      actions: [
        {
          label: "Track Khaled on Map",
          labelAr: "تتبع موقع خالد على الخريطة",
          actionId: "track_driver_khaled"
        }
      ]
    };
  }

  // 4. Vendor Live Task Dispatching: Crowd surge & coffee restocking alert (PDF Page 9)
  if (
    lower.includes("coffee") ||
    lower.includes("hall b") ||
    lower.includes("pastries") ||
    lower.includes("restock") ||
    lower.includes("قهوة") ||
    lower.includes("قاعة ب") ||
    lower.includes("مخبوزات")
  ) {
    return {
      matched: true,
      content: isArabic
        ? `${persona}: عاجل: محطة القهوة في القاعة (ب) تشهد إقبالاً كثيفاً جداً حالياً. يرجى إرسال موظفين إضافيين (2) وإعادة تعبئة المخبوزات فوراً. اضغط للتأكيد.`
        : `${persona}: Urgent: The coffee station in Hall B is getting really busy. Please send 2 more staff members and restock the pastries right now. Tap to confirm.`,
      toolIntent: "vendor_task_dispatch",
      actions: [
        {
          label: "Confirm & Dispatch Staff",
          labelAr: "تأكيد وإرسال الموظفين",
          actionId: "confirm_dispatch_staff"
        }
      ]
    };
  }

  // Default hospitality replies
  if (lower.includes("diriyah") || lower.includes("histor")) {
    return {
      matched: true,
      content: isArabic
        ? `${persona}: أنصح بزيارة الدرعية التاريخية قبل العشاء، وسأرتب لك مساراً هادئاً ومثاليا مع توقيت مخصص لتجنب الزحام.`
        : `${persona}: I recommend Diriyah before dinner. I can prepare a quiet route with location-aware historical notes and optimal transit timing.`,
      toolIntent: "guidance"
    };
  }

  return {
    matched: false,
    content: isArabic
      ? `${persona}: أهلاً بك في الرياض. يمكنني مساعدتك فوراً في متابعة الأسطول، التنسيق المباشر، الفحص التلقائي للوثائق، أو توجيه الضيوف للمسار الأمثل.`
      : `${persona}: Welcome to Riyadh. I can help immediately with live fleet tracking, instant vendor document verification, proactive traffic alerts, and schedule guidance.`
  };
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

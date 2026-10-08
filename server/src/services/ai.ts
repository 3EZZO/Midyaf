import OpenAI from "openai";
import { env } from "../env.js";
import { narrateEventScenario } from "../../../shared/eventNarration.js";

const client = env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;

export type ChatInput = {
  message: string;
  language?: string;
  persona?:
    | "Saud"
    | "Noura"
    | "Saif & Munirah"
    | "Ops Manager"
    | "Supply Chain AI";
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
  const exactMatch = deterministicChat(
    persona,
    input.message,
    language,
    input.context
  );
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

export type ChatStreamMeta = {
  persona: string;
  toolIntent?: string;
  actions?: ChatReplyAction[];
  data?: unknown;
  /** "openai" when tokens come from the model, "local" when the deterministic reply is replayed. */
  source: "openai" | "local";
};

export type ChatStreamEvent =
  | { type: "meta"; meta: ChatStreamMeta }
  | { type: "delta"; delta: string }
  | { type: "done"; content: string };

/**
 * Streaming twin of `chatGuide`. Yields one `meta` event first (actions and
 * widgets are known before the first token), then text deltas, then `done`
 * with the full text. Without an API key — or when the query hits one of the
 * scripted scenarios — the deterministic reply is replayed in short chunks so
 * the client sees the same shape either way. The four non-streaming calls
 * above are untouched.
 */
export async function* streamChatCompletion(
  input: ChatInput,
  signal?: AbortSignal
): AsyncGenerator<ChatStreamEvent, void, undefined> {
  const persona = input.persona ?? "Noura";
  const language = input.language ?? "en";
  const resolved = resolveSmartQuery(
    input.message,
    language,
    persona,
    input.context
  );
  const toolIntent = resolved.toolIntent ?? inferToolIntent(input.message);

  const replayLocal = async function* (): AsyncGenerator<
    ChatStreamEvent,
    void,
    undefined
  > {
    yield {
      type: "meta",
      meta: {
        persona,
        toolIntent,
        actions: resolved.actions,
        data: resolved.data,
        source: "local"
      }
    };
    for (const delta of chunkText(resolved.content)) {
      if (signal?.aborted) return;
      yield { type: "delta", delta };
    }
    yield { type: "done", content: resolved.content };
  };

  if (resolved.matched || !client) {
    yield* replayLocal();
    return;
  }

  const system = [
    `You are ${persona}, Midyaf's world-class hospitality and operational AI for Riyadh.`,
    "Answer with practical, executive-grade Gulf hospitality and logistics recommendations.",
    "Use short Markdown: a lead sentence, then bullet points; no headings above level 3, no HTML.",
    "Respect Saudi cultural context and user privacy.",
    `Respond in ${language}.`
  ].join(" ");

  type Chunk = { choices: Array<{ delta?: { content?: string | null } }> };
  let stream: AsyncIterable<Chunk>;
  try {
    stream = await client.chat.completions.create(
      {
        model: env.OPENAI_MODEL,
        stream: true,
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: JSON.stringify({
              message: input.message,
              context: input.context ?? {}
            })
          }
        ]
      },
      { signal }
    );
  } catch {
    yield* replayLocal();
    return;
  }

  yield {
    type: "meta",
    meta: {
      persona,
      toolIntent,
      actions: resolved.actions,
      data: resolved.data,
      source: "openai"
    }
  };
  let content = "";
  try {
    for await (const chunk of stream) {
      if (signal?.aborted) return;
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (!delta) continue;
      content += delta;
      yield { type: "delta", delta };
    }
  } catch {
    // A mid-stream failure leaves a clean partial; the client keeps what it has.
    if (!content) {
      for (const delta of chunkText(resolved.content))
        yield { type: "delta", delta };
      content = resolved.content;
    }
  }
  yield { type: "done", content };
}

/** Word-sized chunks (a few words each) so a replayed reply still reads as typed. */
function chunkText(text: string, wordsPerChunk = 2): string[] {
  const parts = text.split(/(\s+)/);
  const chunks: string[] = [];
  let current = "";
  let words = 0;
  for (const part of parts) {
    current += part;
    if (part.trim()) words++;
    if (words >= wordsPerChunk) {
      chunks.push(current);
      current = "";
      words = 0;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function smartAssistant(
  query: string,
  language: string,
  context?: unknown
) {
  const normLang = (language || "en").toLowerCase().startsWith("ar")
    ? "ar"
    : "en";
  const resolved = resolveSmartQuery(
    query,
    normLang,
    "Smart Assistant",
    context
  );

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
        message:
          "5 executive vans successfully diverted from Terminal 1 to KKIA Terminal 2. Drivers notified via mobile app.",
        messageAr:
          "تم تحويل 5 حافلات تنفيذية بنجاح من الصالة 1 إلى الصالة 2 بمطار الملك خالد. تم إشعار السائقين عبر التطبيق.",
        data: {
          divertedCount: 5,
          targetTerminal: "Terminal 2",
          status: "EN_ROUTE"
        }
      };

    case "send_vendor_sms":
    case "send_vendor_message":
      return {
        ok: true,
        message:
          "Priority SMS dispatched to Al-Faisal Lighting & AV Lead (+966 55 432 1098). Driver acknowledged and is en route on King Fahd Rd (ETA 10 mins).",
        messageAr:
          "تم إرسال تنبيه SMS عاجل لمدير فريق شركة الفيصل (+966 55 432 1098). أكد السائق الاستلام وتواجده على طريق الملك فهد (الوصول خلال 10 دقائق).",
        data: {
          recipient: "+966 55 432 1098",
          vendor: "Al-Faisal Lighting & AV",
          status: "DELIVERED"
        }
      };

    case "confirm_dispatch_staff":
      return {
        ok: true,
        message:
          "2 standby baristas and replenishment cart dispatched to Hall B Executive Lounge. Acknowledged by Najd Hospitality.",
        messageAr:
          "تم إرسال 2 باريستا وعربة تموين فوراً إلى استراحة كبار الشخصيات بالقاعة (ب). تم تأكيد الاستلام من شركة نجد.",
        data: {
          staffAssigned: 2,
          location: "Hall B Executive Lounge",
          status: "DISPATCHED"
        }
      };

    case "track_driver":
    case "track_driver_khaled":
      return {
        ok: true,
        message:
          "Live telemetry connected: Capt. Sultan Al-Otaibi (Mercedes Maybach S680 · Plate KSA 9119) is staged at KKIA Terminal 2 VIP Curb Gate 2.",
        messageAr:
          "تم الاتصال بالرادار المباشر: الكابتن سلطان العتيبي (مرسيدس مايباخ S680 · لوحة أ د ن 9119) متوقف عند رصيف كبار الشخصيات بوابة 2.",
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
        message:
          "The Ritz-Carlton Head Butler notified. Royal Suite amenities and Taif Rose Gahwa re-confirmed for H.E. Yasir Al-Rumayyan.",
        messageAr:
          "تم إشعار رئيس الخدم في فندق الريتز-كارلتون. تم تأكيد تجهيزات الجناح الملكي والقهوة بورد الطائف لمعالي ياسر الرميان.",
        data: {
          hotel: "The Ritz-Carlton Riyadh",
          suite: "Royal Suite 1",
          status: "PREPARED"
        }
      };

    case "reserve_dining":
      return {
        ok: true,
        message:
          "VIP Table Reserved at Bujairi Terrace (Maiz Restaurant) for 20:30 tonight. Confirmation Code: #BT-7749.",
        messageAr:
          "تم تأكيد حجز طاولة كبار الشخصيات في مطل البجيري (مطعم ميز) الليلة الساعة 20:30. رمز الحجز: #BT-7749.",
        data: {
          venue: "Maiz Restaurant, Bujairi Terrace",
          time: "20:30",
          bookingCode: "BT-7749"
        }
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
        finding:
          "Drivers spent 40% of their time sitting idle at the hotel yesterday afternoon.",
        findingAr:
          "أمضى السائقون 40% من وقتهم في حالة انتظار ونشاط خامل عند الفندق بعد ظهر أمس."
      },
      {
        finding:
          "If we group guests together more efficiently next year, we can cut fleet costs by 25% without making anyone wait longer.",
        findingAr:
          "إذا قمنا بتجميع الضيوف ضمن دفعات أكثر كفاءة في العام القادم، يمكننا خفض تكاليف الأسطول بنسبة 25% دون زيادة وقت الانتظار لأي ضيف."
      },
      {
        finding:
          "Long wait times (averaging 18 minutes) at Terminal 2 between 14:00 and 15:30 directly caused lower satisfaction scores at hotel check-in desks.",
        findingAr:
          "أدت أوقات الانتظار الطويلة (بمتوسط 18 دقيقة) في الصالة 2 بين الساعة 14:00 و 15:30 بشكل مباشر إلى انخفاض تقييمات الرضا عند مكاتب الاستقبال في الفنادق."
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
        stepAr:
          "تطبيق التوزيع المرن للحافلات في مطار الملك خالد الدولي - الصالة 2."
      },
      {
        step: "Enable automated shuttle batching for arrivals within 20-minute windows.",
        stepAr:
          "تفعيل التجميع التلقائي للرحلات الواصلة ضمن نوافذ زمنية مدتها 20 دقيقة."
      },
      {
        step: "Pre-clear security and dietary manifests for Diriyah Bujairi Terrace 24 hours in advance.",
        stepAr:
          "التصريح المسبق للقوائم الأمنية والغذائية لمطاعم المطل في الدرعية قبل 24 ساعة."
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

/**
 * Scripted scenario matching. The reply body is narrated from `context`
 * (only the context the route already authorized: an operator's briefing
 * snapshot, the fixed synthetic demo context, or validated references), so
 * it names the current event or says what is unavailable.
 */
export function resolveSmartQuery(
  query: string,
  language: string,
  persona: string = "Smart Assistant",
  context?: unknown
): {
  matched: boolean;
  content: string;
  toolIntent?: string;
  actions?: ChatReplyAction[];
  data?: unknown;
} {
  const isArabic = (language || "en").toLowerCase().startsWith("ar");
  const lower = (query || "").toLowerCase();
  const say = (scenario: Parameters<typeof narrateEventScenario>[0]) =>
    `${persona}: ${narrateEventScenario(scenario, context, isArabic)}`;
  // Default hospitality replies
  const welcome = () => ({
    matched: false,
    content: say("welcome"),
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

  // 0. Situation briefing: the snapshot summary, unmatched like any open
  // question ("on-time" would otherwise match the schedule scenario).
  if (lower.includes("situation") || lower.includes("وضع العملية")) {
    return welcome();
  }

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
      content: say("vendors"),
      toolIntent: "vendor_geofence_check",
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
      content: say("vault"),
      toolIntent: "vault_status_check",
      actions: [
        {
          label: "Access Triple-Key Vault",
          labelAr: "الانتقال إلى الخزنة الثلاثية",
          actionId: "scroll_to_vault"
        },
        {
          label: "View Security Integrity Audit",
          labelAr: "سجل التدقيق والنزاهة",
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
      content: say("arrivals"),
      toolIntent: "airport_flight_surge",
      actions: [
        {
          label: "Divert 5 Vans to Terminal 2",
          labelAr: "تحويل 5 حافلات فوراً إلى الصالة 2",
          actionId: "divert_fleet"
        },
        {
          label: "View Airport Express Manifest",
          labelAr: "عرض قائمة وصول المطار",
          actionId: "view_airport"
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
      matched: true,
      content: say("hospitality"),
      toolIntent: "hospitality_rider_check",
      actions: [
        {
          label: "Inspect Hospitality Riders",
          labelAr: "استعراض مذكرات الضيافة",
          actionId: "inspect_riders"
        },
        {
          label: "Re-confirm with Ritz Butler",
          labelAr: "تأكيد التجهيزات مع رئيس الخدم",
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
      content: say("driver"),
      toolIntent: "driver_touchdown_match",
      actions: [
        {
          label: "Track Chauffeur Live on Radar",
          labelAr: "تتبع السائق مباشرة على الرادار",
          actionId: "track_driver"
        },
        {
          label: "Connect Encrypted Line",
          labelAr: "اتصال آمن مباشر بالسائق",
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
      content: say("schedule"),
      toolIntent: "fii_schedule_check",
      actions: [
        {
          label: "View Shuttle Route & GPS",
          labelAr: "عرض مسار الحافلة ونظام GPS",
          actionId: "view_shuttle_gps"
        },
        {
          label: "Add to Calendar",
          labelAr: "إضافة للتقويم",
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
      content: say("catering"),
      toolIntent: "catering_restock_dispatch",
      actions: [
        {
          label: "Dispatch 2 Baristas & Restock",
          labelAr: "إرسال 2 باريستا وإعادة التعبئة",
          actionId: "confirm_dispatch_staff"
        },
        {
          label: "Send Alert to Najd Catering",
          labelAr: "إرسال إشعار لتموين نجد",
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
      content: say("report"),
      toolIntent: "post_event_analytics",
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
      matched: true,
      content: say("network"),
      toolIntent: "vip_lounge_wifi",
      actions: [
        {
          label: "Copy Wi-Fi Passphrase",
          labelAr: "نسخ كلمة المرور",
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
      content: say("dining"),
      toolIntent: "diriyah_dining_reserve",
      actions: [
        {
          label: "Reserve Table at Bujairi",
          labelAr: "حجز طاولة في مطل البجيري",
          actionId: "reserve_dining"
        }
      ]
    };
  }

  return welcome();
}

function deterministicChat(
  persona: string,
  message: string,
  language: string,
  context?: unknown
): {
  matched: boolean;
  content: string;
  toolIntent?: string;
  actions?: ChatReplyAction[];
} {
  return resolveSmartQuery(message, language, persona, context);
}

function inferToolIntent(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("missing") ||
    lower.includes("hall a") ||
    lower.includes("vendor")
  ) {
    return "vendor_geofence_check";
  }
  if (
    lower.includes("keynote") ||
    lower.includes("shuttle") ||
    lower.includes("traffic")
  ) {
    return "concierge_schedule_check";
  }
  if (
    lower.includes("khaled") ||
    lower.includes("gmc") ||
    lower.includes("exit 4")
  ) {
    return "driver_touchdown_match";
  }
  if (
    lower.includes("coffee") ||
    lower.includes("hall b") ||
    lower.includes("pastries")
  ) {
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

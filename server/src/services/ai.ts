import OpenAI from "openai";
import { env } from "../env.js";

const client = env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;

type ChatInput = {
  message: string;
  language?: string;
  persona?: "Saud" | "Noura" | "Ops Manager" | "Supply Chain AI";
  context?: unknown;
};

export async function chatGuide(input: ChatInput) {
  const persona = input.persona ?? "Noura";
  const language = input.language ?? "en";
  const system = [
    `You are ${persona}, Midyaf's hospitality AI for Riyadh.`,
    "Answer with practical, premium Gulf hospitality recommendations.",
    "Respect Saudi cultural context and user privacy.",
    "If booking actions are requested, return next-step intent data.",
    `Respond in ${language}.`
  ].join(" ");

  if (!client) {
    return {
      persona,
      content: deterministicChat(persona, input.message, language),
      toolIntent: inferToolIntent(input.message)
    };
  }

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
    content:
      completion.choices[0]?.message.content ??
      deterministicChat(persona, input.message, language),
    toolIntent: inferToolIntent(input.message)
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
        "Use KAFD/Central Riyadh hotels, split airport pickups by arrival wave, reserve VIP SUVs, and keep a Diriyah corridor standby driver.",
      recommendations: [
        "Book 12 executive rooms within 15 minutes of the venue.",
        "Assign VIP airport transfers from North Riyadh first.",
        "Keep 20% driver capacity as contingency after Maghrib.",
        "Confirm Saudi coffee service and AV equipment 24 hours before doors."
      ],
      risks: [
        "Airport arrival clustering",
        "KAFD evening traffic",
        "VIP dietary preferences not yet confirmed"
      ]
    };
  }

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
}

export async function analyzeSuppliers(offers: unknown) {
  if (!client) {
    return {
      bestValue: "Najd Palace Suites",
      rationale:
        "Highest verified rating, central location, and commission within the 10-15% business rule.",
      anomalies: [
        "Flag any unverified supplier with a price more than 25% below category average."
      ]
    };
  }

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
}

function deterministicChat(persona: string, message: string, language: string) {
  const isArabic = language.startsWith("ar");
  const lower = message.toLowerCase();

  if (lower.includes("diriyah") || lower.includes("histor")) {
    return isArabic
      ? `${persona}: أنصح بزيارة الدرعية قبل العشاء، وسأرتب لك مساراً هادئاً مع محتوى تاريخي حسب موقعك.`
      : `${persona}: I recommend Diriyah before dinner. I can prepare a quiet route with location-aware historical notes.`;
  }

  if (lower.includes("taxi") || lower.includes("driver")) {
    return isArabic
      ? `${persona}: سأبحث عن أقرب سائق متاح وأعطي الأولوية للضيوف المهمين.`
      : `${persona}: I will look for the nearest available driver and prioritize VIP transport.`;
  }

  return isArabic
    ? `${persona}: أهلاً بك في الرياض. يمكنني مساعدتك في الجدول، التنقل، المطاعم، والمعالم القريبة.`
    : `${persona}: Welcome to Riyadh. I can help with schedules, transport, restaurants, and nearby landmarks.`;
}

function inferToolIntent(message: string) {
  const lower = message.toLowerCase();

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

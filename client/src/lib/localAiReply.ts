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
    lower.includes("ØºØ§Ø¦Ø¨") ||
    lower.includes("Ù…ÙˆØ±Ø¯") ||
    lower.includes("Ù…ØªØ£Ø®Ø±") ||
    lower.includes("Ø§Ù„Ù‚Ø§Ø¹Ø©") ||
    lower.includes("Ø§Ù„ØµÙˆØªÙŠØ§Øª")
  ) {
    return {
      body: isArabic
        ? `${persona}: ØªÙ†Ø¨ÙŠÙ‡ ÙØ­Øµ Ø§Ù„ØªÙˆØ§Ø¬Ø¯ Ø§Ù„Ø¬ØºØ±Ø§ÙÙŠ Ù„Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†: ÙØ±ÙŠÙ‚ Ø§Ù„ØµÙˆØªÙŠØ§Øª ÙˆØ§Ù„Ù…Ø±Ø¦ÙŠØ§Øª (Ø´Ø±ÙƒØ© Ø§Ù„ÙÙŠØµÙ„) ÙÙ‚Ø· Ù‡Ùˆ Ø§Ù„Ù…ØªØ£Ø®Ø± Ø¹Ù† Ø§Ù„Ù‚Ø§Ø¹Ø© (Ø£). ÙŠÙˆØ¶Ø­ Ù†Ø¸Ø§Ù… Ø§Ù„Ù€ GPS Ø£Ù† Ø´Ø§Ø­Ù†Ø© Ø§Ù„Ù…Ø¹Ø¯Ø§Øª Ø¹Ø§Ù„Ù‚Ø© ÙÙŠ Ø²Ø­Ù…Ø© Ø·Ø±ÙŠÙ‚ Ø§Ù„Ù…Ù„Ùƒ ÙÙ‡Ø¯ ÙˆØªØ¨Ø¹Ø¯ Ø­ÙˆØ§Ù„ÙŠ 10-12 Ø¯Ù‚ÙŠÙ‚Ø©. Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ø§Ù„Ù€ 6 Ø§Ù„Ø¢Ø®Ø±ÙŠÙ† Ù…ØªÙˆØ§Ø¬Ø¯ÙˆÙ† ÙÙŠ Ù…ÙˆØ§Ù‚Ø¹Ù‡Ù….`
        : `${persona}: Vendor Geofence Alert: Only the AV team (Al-Faisal Lighting & AV) is missing from Hall A right now. Real-time GPS telemetry shows their equipment truck is navigating heavy traffic on King Fahd Rd (~10â€“12 minutes away). All other 6 registered vendors are checked in at their designated bays.`,
      actions: [
        {
          label: "Dispatch Urgent SMS to AV Team",
          labelAr:
            "Ø¥Ø±Ø³Ø§Ù„ ØªÙ†Ø¨ÙŠÙ‡ SMS Ø¹Ø§Ø¬Ù„ Ù„ÙØ±ÙŠÙ‚ Ø§Ù„ØµÙˆØªÙŠØ§Øª",
          actionId: "send_vendor_sms"
        },
        {
          label: "Pinpoint on Fleet Map",
          labelAr: "ØªØªØ¨Ø¹ Ø§Ù„Ù…ÙˆÙ‚Ø¹ Ø¹Ù„Ù‰ Ø§Ù„Ø®Ø±ÙŠØ·Ø©",
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
    lower.includes("Ø®Ø²Ù†Ø©") ||
    lower.includes("Ù…Ø¸Ø§Ø±ÙŠÙ") ||
    lower.includes("Ø¹Ø±ÙˆØ¶") ||
    lower.includes("Ù…ÙØ§ØªÙŠØ­") ||
    lower.includes("ÙØ³Ø§Ø¯") ||
    lower.includes("Ù…Ø¯Ù‚Ù‚") ||
    lower.includes("ØµÙ„Ø©")
  ) {
    return {
      body: isArabic
        ? `${persona}: Ø®Ø²Ù†Ø© Ù…ÙØ¶ÙŠØ§Ù Ø§Ù„Ø£Ù…Ù†ÙŠØ© Ø§Ù„Ø«Ù„Ø§Ø«ÙŠØ© Ù„Ù…ÙƒØ§ÙØ­Ø© ØªØ³Ø±ÙŠØ¨ Ø§Ù„Ø¹Ø±ÙˆØ¶ Ù†ÙŽØ´ÙØ·Ø© Ø­Ø§Ù„ÙŠØ§Ù‹ Ù„Ù…Ø¨Ø§Ø¯Ø±Ø© Ù…Ø³ØªÙ‚Ø¨Ù„ Ø§Ù„Ø§Ø³ØªØ«Ù…Ø§Ø± 2027 (FII). Ø¹Ø±ÙˆØ¶ Ø§Ù„Ø£Ø³Ø¹Ø§Ø± Ø§Ù„Ù…Ù‚Ø¯Ù…Ø© Ù…Ù† ÙÙ†Ø¯Ù‚ Ø§Ù„Ø±ÙŠØªØ²-ÙƒØ§Ø±Ù„ØªÙˆÙ† (1,250,000 Ø±.Ø³) ÙˆØ§Ù„Ø£Ø³Ø·ÙˆÙ„ Ø§Ù„Ù…Ù„ÙƒÙŠ (450,000 Ø±.Ø³) Ù…Ø´ÙØ±Ø© ÙˆÙ…Ø®ØªÙˆÙ…Ø© Ø¨Ø§Ù„ÙƒØ§Ù…Ù„. ÙŠØªØ·Ù„Ø¨ ÙØªØ­Ù‡Ø§ ØªÙØ¹ÙŠÙ„ 3 Ù…ÙØ§ØªÙŠØ­ Ø£Ù…Ù†ÙŠØ© ÙÙŠ Ø¢Ù† ÙˆØ§Ø­Ø¯ (2 Ù…Ù† ØµÙ„Ø© + 1 Ù…Ù† Ù…Ø¯Ù‚Ù‚ Ù…ÙØ¶ÙŠØ§Ù) Ø®Ù„Ø§Ù„ Ù†Ø§ÙØ°Ø© 5 Ø¯Ù‚Ø§Ø¦Ù‚ Ù„Ù…Ù†Ø¹ Ø£ÙŠ ØªØ³Ø±ÙŠØ¨ Ù„Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ø§Ù„Ù…ÙØ¶Ù„ÙŠÙ†.`
        : `${persona}: Midyaf Triple-Key Anti-Corruption Security Vault is ACTIVE for Future Investment Initiative 2027 (FII). Vendor bids from The Ritz-Carlton (SAR 1,250,000) and Royal Fleet VIP (SAR 450,000) remain cryptographically sealed. Viewing unsealed quotations requires simultaneous authentication from 2 Sila Organizers and 1 Midyaf Independent Auditor within a strict 5-minute window.`,
      actions: [
        {
          label: "Access Triple-Key Vault",
          labelAr: "Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ Ø¥Ù„Ù‰ Ø§Ù„Ø®Ø²Ù†Ø© Ø§Ù„Ø«Ù„Ø§Ø«ÙŠØ©",
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
    lower.includes("Ù…Ø·Ø§Ø±") ||
    lower.includes("Ø±Ø­Ù„Ø§Øª") ||
    lower.includes("ØµØ§Ù„Ø© 2") ||
    lower.includes("ØªØ­ÙˆÙŠÙ„") ||
    lower.includes("Ø­Ø§ÙÙ„Ø§Øª")
  ) {
    return {
      body: isArabic
        ? `${persona}: ØªÙ†Ø¨ÙŠÙ‡ ØºØ±ÙØ© Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„Ù…Ø¨Ø§Ø´Ø±Ø©: 3 Ø±Ø­Ù„Ø§Øª Ø¯ÙˆÙ„ÙŠØ© (SV102 Ù…Ù† Ù„Ù†Ø¯Ù†ØŒ EK817 Ù…Ù† Ø¯Ø¨ÙŠØŒ QR1164 Ù…Ù† Ø§Ù„Ø¯ÙˆØ­Ø©) Ù‡Ø¨Ø·Øª ÙÙŠ Ù†ÙØ³ Ø§Ù„ØªÙˆÙ‚ÙŠØª Ø¨Ù…Ø·Ø§Ø± Ø§Ù„Ù…Ù„Ùƒ Ø®Ø§Ù„Ø¯ Ø§Ù„Ø¯ÙˆÙ„ÙŠ - Ø§Ù„ØµØ§Ù„Ø© 2. ÙŠÙˆØ¬Ø¯ 40 Ø¶ÙŠÙØ§Ù‹ Ø¨Ø­Ø§Ø¬Ø© Ù„Ù†Ù‚Ù„ ÙÙˆØ±ÙŠØŒ Ø¨ÙŠÙ†Ù…Ø§ ÙŠØªÙˆÙØ± 15 Ø­Ø§ÙÙ„Ø© ÙÙ‚Ø· ÙÙŠ Ø§Ù„ØµØ§Ù„Ø© 2. ÙŠØªÙˆÙØ± 8 Ø­Ø§ÙÙ„Ø§Øª ÙÙŠ ÙˆØ¶Ø¹ Ø§Ù„Ø§Ø³ØªØ¹Ø¯Ø§Ø¯ Ø¨Ø§Ù„ØµØ§Ù„Ø© 1 ÙŠÙ…ÙƒÙ† ØªØ­ÙˆÙŠÙ„Ù‡Ø§ ÙÙˆØ±Ø§Ù‹.`
        : `${persona}: Live Command Center Alert: 3 international flights (SV102 from London, EK817 from Dubai, QR1164 from Doha) touched down simultaneously at KKIA Terminal 2. 40 VIP delegates require immediate curbside pickup, but only 15 vans are staged there. Terminal 1 currently has 8 idle standby vans ready for immediate reallocation.`,
      actions: [
        {
          label: "Divert 5 Vans to Terminal 2",
          labelAr: "ØªØ­ÙˆÙŠÙ„ 5 Ø­Ø§ÙÙ„Ø§Øª ÙÙˆØ±Ø§Ù‹ Ø¥Ù„Ù‰ Ø§Ù„ØµØ§Ù„Ø© 2",
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
    lower.includes("ÙÙ†Ø¯Ù‚") ||
    lower.includes("Ø±ÙŠØªØ²") ||
    lower.includes("Ø¬Ù†Ø§Ø­") ||
    lower.includes("Ø¶ÙŠØ§ÙØ©") ||
    lower.includes("ØªÙ…ÙˆØ±") ||
    lower.includes("Ù‚Ù‡ÙˆØ© Ø³Ø¹ÙˆØ¯ÙŠØ©") ||
    lower.includes("Ø¹ÙˆØ¯")
  ) {
    return {
      body: isArabic
        ? `${persona}: Ù…Ø°ÙƒØ±Ø§Øª Ø§Ù„Ø¶ÙŠØ§ÙØ© Ø§Ù„Ù…Ù„ÙƒÙŠØ© (VIP Riders) Ù…Ø¹ØªÙ…Ø¯Ø© ÙÙŠ ÙÙ†Ø¯Ù‚ Ø§Ù„Ø±ÙŠØªØ²-ÙƒØ§Ø±Ù„ØªÙˆÙ†: 1) Ù…Ø¹Ø§Ù„ÙŠ ÙŠØ§Ø³Ø± Ø§Ù„Ø±Ù…ÙŠØ§Ù† (Ø§Ù„Ø¬Ù†Ø§Ø­ Ø§Ù„Ù…Ù„ÙƒÙŠ 1: Ù‚Ù‡ÙˆØ© Ø³Ø¹ÙˆØ¯ÙŠØ© Ø¨ÙˆØ±Ø¯ Ø§Ù„Ø·Ø§Ø¦ÙØŒ ØªÙ…Ø± Ø³ÙƒØ±ÙŠ ÙØ§Ø®Ø±ØŒ ÙˆØ¬Ø¨Ø§Øª Ø­Ù„Ø§Ù„ Ø®Ø§Ù„ÙŠØ© Ù…Ù† Ø§Ù„ØºÙ„ÙˆØªÙŠÙ†)Ø› 2) Ø³Ø§Ø±Ø© Ø§Ù„ØªÙˆÙŠØ¬Ø±ÙŠ (Ø¬Ù†Ø§Ø­ ØªÙ†ÙÙŠØ°ÙŠ 204: ÙˆØ³Ø§Ø¦Ø¯ Ø±ÙŠØ´ Ù…ØªÙ…Ø§Ø³ÙƒØ©ØŒ Ø¯Ù‡Ù† Ø¹ÙˆØ¯ Ù…Ù„ÙƒÙŠ Ù…Ø¹ØªÙ‚)Ø› 3) Ø·Ø§Ø±Ù‚ Ù…Ù†ØµÙˆØ± (ØºØ±ÙØ© Ø¯ÙŠÙ„ÙˆÙƒØ³ 310: Ù‚Ù‡ÙˆØ© Ø¨Ø¯ÙˆÙ† ÙƒØ§ÙÙŠÙŠÙ† ÙˆÙ…ÙŠØ§Ù‡ ÙÙˆØ§Ø±Ø©). ØªÙ… ØªØ£ÙƒÙŠØ¯ ÙƒØ§ÙØ© Ø§Ù„ØªØ¬Ù‡ÙŠØ²Ø§Øª Ù…Ø³Ø¨Ù‚Ø§Ù‹.`
        : `${persona}: VIP Hospitality Riders Verified at The Ritz-Carlton Grand Hotel: 1) H.E. Yasir Al-Rumayyan (Royal Suite 1: Taif Rose Gahwa, Sukkari Dates, Strictly Halal & Gluten-Free dietary rider); 2) Sarah Al-Tuwaijri (Executive Suite 204: Firm Feather Pillow, Royal Arabian Oud amenities); 3) Tariq Mansoor (Deluxe King 310: Decaf Saudi Gahwa, Sparkling Water). All riders pre-cleared by Midyaf Protocol.`,
      actions: [
        {
          label: "Inspect Hospitality Riders",
          labelAr: "Ø§Ø³ØªØ¹Ø±Ø§Ø¶ Ù…Ø°ÙƒØ±Ø§Øª Ø§Ù„Ø¶ÙŠØ§ÙØ©",
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
    lower.includes("Ø³Ø§Ø¦Ù‚") ||
    lower.includes("Ø³ÙŠØ§Ø±Ø©") ||
    lower.includes("Ù…Ø§ÙŠØ¨Ø§Ø®") ||
    lower.includes("Ø³Ù„Ø·Ø§Ù†") ||
    lower.includes("Ø®Ø§Ù„Ø¯") ||
    lower.includes("Ø£Ø­Ù…Ø¯") ||
    lower.includes("Ù„ÙˆØ­Ø©")
  ) {
    return {
      body: isArabic
        ? `${persona}: Ø§Ù„Ø³Ø§Ø¦Ù‚ Ø§Ù„ØªÙ†ÙÙŠØ°ÙŠ Ø§Ù„Ù…Ø®ØµØµ: Ø§Ù„ÙƒØ§Ø¨ØªÙ† Ø³Ù„Ø·Ø§Ù† Ø§Ù„Ø¹ØªÙŠØ¨ÙŠ Ø¨Ø§Ù†ØªØ¸Ø§Ø±Ùƒ Ø¹Ù†Ø¯ Ø±ØµÙŠÙ ÙƒØ¨Ø§Ø± Ø§Ù„Ø´Ø®ØµÙŠØ§Øª Ø¨ÙˆØ§Ø¨Ø© 2 Ø¨Ø§Ù„ØµØ§Ù„Ø© 2 ÙÙŠ Ø³ÙŠØ§Ø±Ø© Ù…Ø±Ø³ÙŠØ¯Ø³ Ù…Ø§ÙŠØ¨Ø§Ø® S680 Ø³ÙˆØ¯Ø§Ø¡ (Ù„ÙˆØ­Ø©: Ø£ Ø¯ Ù† 9119). Ø§Ù„ØªØµØ±ÙŠØ­ Ø§Ù„Ø£Ù…Ù†ÙŠ: Ù…Ø±Ø§ÙÙ‚Ø© ØªÙ†ÙÙŠØ°ÙŠØ© #819. Ù…ÙƒÙŠÙ Ø§Ù„Ø³ÙŠØ§Ø±Ø© Ù…Ø¶Ø¨ÙˆØ· Ø¹Ù„Ù‰ 20Â° Ù…Ø¦ÙˆÙŠØ© Ù…Ø¹ Ù…Ø§Ø¡ ÙˆØ±Ø¯ Ø·Ø§Ø¦ÙÙŠ ÙˆÙ…Ù†Ø§Ø´Ù Ø¨Ø§Ø±Ø¯Ø© Ø¬Ø§Ù‡Ø²Ø©. ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„ØªÙˆØ¬Ù‡ Ù„Ù„Ø³ÙŠØ§Ø±Ø© Ù…Ø¨Ø§Ø´Ø±Ø© Ø¯ÙˆÙ† Ø§Ù„Ø­Ø§Ø¬Ø© Ù„Ù„Ø§ØªØµØ§Ù„.`
        : `${persona}: Assigned VIP Chauffeur: Captain Sultan Al-Otaibi is waiting at KKIA Terminal 2 VIP Curb Gate 2 in an all-black Mercedes Maybach S680 (Plate: KSA 9119). Security clearance: Executive Escort #819. In-cabin climate set to 20Â°C with cold Taif rose water ready. You can walk straight to the vehicle without phone calls.`,
      actions: [
        {
          label: "Track Chauffeur Live on Radar",
          labelAr: "ØªØªØ¨Ø¹ Ø§Ù„Ø³Ø§Ø¦Ù‚ Ù…Ø¨Ø§Ø´Ø±Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø±Ø§Ø¯Ø§Ø±",
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
    lower.includes("Ø¬Ø¯ÙˆÙ„") ||
    lower.includes("Ø£Ø¬Ù†Ø¯Ø©") ||
    lower.includes("Ø§Ù„ÙƒÙ„Ù…Ø©") ||
    lower.includes("Ù…Ø¤ØªÙ…Ø±") ||
    lower.includes("Ø¹Ø´Ø§Ø¡") ||
    lower.includes("ÙØ¹Ø§Ù„ÙŠØ©")
  ) {
    return {
      body: isArabic
        ? `${persona}: Ø¬Ø¯ÙˆÙ„ Ù…Ø¨Ø§Ø¯Ø±Ø© Ù…Ø³ØªÙ‚Ø¨Ù„ Ø§Ù„Ø§Ø³ØªØ«Ù…Ø§Ø± 2027 Ø§Ù„ÙŠÙˆÙ…: \nâ€¢ 08:30 - Ø¥ÙØ·Ø§Ø± ÙˆØ§Ø³ØªÙ‚Ø¨Ø§Ù„ ÙƒØ¨Ø§Ø± Ø§Ù„Ø´Ø®ØµÙŠØ§Øª (Ø¨Ù‡Ùˆ Ø§Ù„Ø±ÙŠØªØ²-ÙƒØ§Ø±Ù„ØªÙˆÙ†) \nâ€¢ 10:00 - Ø§Ù„ÙƒÙ„Ù…Ø© Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠØ©: 'Ø§Ù„Ø¢ÙØ§Ù‚ Ø§Ù„Ø§Ù‚ØªØµØ§Ø¯ÙŠØ© Ø§Ù„Ù‚Ø§Ø¯Ù…Ø©' (Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø¤ØªÙ…Ø±Ø§Øª KAICC Ù‚Ø§Ø¹Ø© 1) \nâ€¢ 13:00 - ØºØ¯Ø§Ø¡ Ù‚Ø§Ø¯Ø© Ø§Ù„Ø£Ø¹Ù…Ø§Ù„ Ø§Ù„Ø¯ÙˆÙ„ÙŠÙŠÙ† \nâ€¢ 20:00 - Ø§Ù„Ø¹Ø´Ø§Ø¡ Ø§Ù„Ù…Ù„ÙƒÙŠ Ø§Ù„Ø§Ø­ØªÙØ§Ù„ÙŠ (Ù…Ø·Ù„ Ø§Ù„Ø¨Ø¬ÙŠØ±ÙŠ - Ø§Ù„Ø¯Ø±Ø¹ÙŠØ© Ø§Ù„ØªØ§Ø±ÙŠØ®ÙŠØ©). \n[ØªÙ†Ø¨ÙŠÙ‡ Ù…Ø±ÙˆØ±ÙŠ]: ÙŠØ³ØªØºØ±Ù‚ Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ Ø¥Ù„Ù‰ Ø§Ù„Ø¯Ø±Ø¹ÙŠØ© Ø­ÙˆØ§Ù„ÙŠ 35 Ø¯Ù‚ÙŠÙ‚Ø©ØŒ ÙˆØªÙ†Ø·Ù„Ù‚ Ø­Ø§ÙÙ„Ø§Øª Ø§Ù„Ø¶ÙŠÙˆÙ ÙÙŠ ØªÙ…Ø§Ù… 19:15.`
        : `${persona}: FII 2027 Schedule & Travel Advisory: \nâ€¢ 08:30 - VIP Networking Breakfast (The Ritz-Carlton Lobby) \nâ€¢ 10:00 - Opening Keynote: 'The Next Economic Horizon' (KAICC Plenary Hall 1) \nâ€¢ 13:00 - Global Leaders Networking Luncheon \nâ€¢ 20:00 - Royal Gala Dinner (Diriyah Bujairi Terrace). \n[Traffic Advisory]: Transit to Diriyah will take ~35 minutes during evening peak. Executive lobby shuttles depart promptly at 19:15.`,
      actions: [
        {
          label: "View Shuttle Route & GPS",
          labelAr: "Ø¹Ø±Ø¶ Ù…Ø³Ø§Ø± Ø§Ù„Ø­Ø§ÙÙ„Ø© ÙˆÙ†Ø¸Ø§Ù… GPS",
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
    lower.includes("Ù‚Ù‡ÙˆØ©") ||
    lower.includes("Ù…Ø®Ø¨ÙˆØ²Ø§Øª") ||
    lower.includes("Ù‚Ø§Ø¹Ø© Ø¨") ||
    lower.includes("ØªÙ…ÙˆÙŠÙ†") ||
    lower.includes("Ø§Ø²Ø¯Ø­Ø§Ù…")
  ) {
    return {
      body: isArabic
        ? `${persona}: ØªÙ†Ø¨ÙŠÙ‡ ØªÙ…ÙˆÙŠÙ† Ø¹Ø§Ø¬Ù„: Ø­Ø³Ø§Ø³Ø§Øª Ø§Ù„Ø­Ø±ÙƒØ© ÙÙŠ Ø§Ø³ØªØ±Ø§Ø­Ø© ÙƒØ¨Ø§Ø± Ø§Ù„Ø´Ø®ØµÙŠØ§Øª Ø¨Ø§Ù„Ù‚Ø§Ø¹Ø© (Ø¨) ØªØ³Ø¬Ù„ Ø§Ø²Ø¯Ø­Ø§Ù…Ø§Ù‹ Ø¨Ù†Ø³Ø¨Ø© 85% Ø¨Ø¹Ø¯ Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„Ø¬Ù„Ø³Ø© Ø§Ù„ØµØ¨Ø§Ø­ÙŠØ©. Ø§Ù†Ø®ÙØ¶ Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ù‚Ù‡ÙˆØ© ÙˆØ§Ù„Ù…Ø®Ø¨ÙˆØ²Ø§Øª Ø§Ù„ÙØ§Ø®Ø±Ø© Ø¥Ù„Ù‰ 18%. ÙŠÙˆØµÙ‰ Ø¨Ø¥Ø±Ø³Ø§Ù„ 2 Ø¨Ø§Ø±ÙŠØ³ØªØ§ Ø¥Ø¶Ø§ÙÙŠÙŠÙ† ÙˆØ¹Ø±Ø¨Ø© Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹Ø¨Ø¦Ø© ÙÙˆØ±Ø§Ù‹ Ù„ØªÙØ§Ø¯ÙŠ Ø£ÙŠ Ø§Ù†Ù‚Ø·Ø§Ø¹.`
        : `${persona}: Urgent Catering Alert: Footfall monitors at Hall B Executive Lounge report an 85% capacity surge following the morning panel. Artisan pastries and premium Gahwa beans have dropped to 18% inventory. Immediate dispatch of 2 standby baristas and a replenishment cart recommended.`,
      actions: [
        {
          label: "Dispatch 2 Baristas & Restock",
          labelAr: "Ø¥Ø±Ø³Ø§Ù„ 2 Ø¨Ø§Ø±ÙŠØ³ØªØ§ ÙˆØ¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ¹Ø¨Ø¦Ø©",
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
    lower.includes("ØªÙ‚Ø±ÙŠØ±") ||
    lower.includes("ÙˆÙÙˆØ±Ø§Øª") ||
    lower.includes("Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª") ||
    lower.includes("ØªÙ‚ÙŠÙŠÙ…") ||
    lower.includes("ØªÙƒØ§Ù„ÙŠÙ")
  ) {
    return {
      body: isArabic
        ? `${persona}: Ù…Ù„Ø®Øµ ØªÙ‚Ø±ÙŠØ± Ù…Ø§ Ø¨Ø¹Ø¯ Ø§Ù„ÙØ¹Ø§Ù„ÙŠØ© Ø§Ù„Ø°ÙƒÙŠ: Ø¨Ù„ØºØª Ù†Ø³Ø¨Ø© Ø±Ø¶Ø§ ÙƒØ¨Ø§Ø± Ø§Ù„Ø´Ø®ØµÙŠØ§Øª 96% (Ù…Ø¤Ø´Ø± NPS 88). Ø£Ø¨Ø±Ø² Ø§Ù„Ù…ÙƒØ§Ø³Ø¨ Ø§Ù„ØªØ´ØºÙŠÙ„ÙŠØ©: Ø¬Ø¯ÙˆÙ„Ø© Ø±Ø­Ù„Ø§Øª Ø§Ù„ÙˆØµÙˆÙ„ ÙÙŠ Ù…Ø·Ø§Ø± Ø§Ù„Ù…Ù„Ùƒ Ø®Ø§Ù„Ø¯ Ø£Ù„ØºØª Ø£ÙˆÙ‚Ø§Øª Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø±ØµÙŠÙ ÙˆØ®ÙÙ‘Ø¶Øª Ù‡Ø¯Ø± Ø§Ù„Ø£Ø³Ø·ÙˆÙ„ Ø¨Ù†Ø³Ø¨Ø© 40%ØŒ Ù…Ø­Ù‚Ù‚Ø© ÙˆÙØ±Ø§Ù‹ Ù…Ø§Ù„ÙŠØ§Ù‹ Ù‚Ø¯Ø±Ù‡ 145,000 Ø±ÙŠØ§Ù„ Ø³Ø¹ÙˆØ¯ÙŠ.`
        : `${persona}: Automated Post-Event Intelligence Summary: Overall VIP satisfaction reached 96% (NPS 88). Key operational efficiency: Intelligent flight batching at KKIA Terminal 2 eliminated 18-minute curb wait times and cut idle vehicle duration by 40%, delivering SAR 145,000 in direct fleet cost savings.`,
      actions: [
        {
          label: "View Executive PDF Report",
          labelAr: "Ø§Ø³ØªØ¹Ø±Ø§Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ± Ø§Ù„ØªÙ†ÙÙŠØ°ÙŠ Ø§Ù„ÙƒØ§Ù…Ù„",
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
    lower.includes("ÙˆØ§ÙŠ ÙØ§ÙŠ") ||
    lower.includes("Ø¥Ù†ØªØ±Ù†Øª") ||
    lower.includes("Ø´Ø¨ÙƒØ©") ||
    lower.includes("ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±") ||
    lower.includes("Ø§Ø³ØªØ±Ø§Ø­Ø©")
  ) {
    return {
      body: isArabic
        ? `${persona}: Ø¨ÙŠØ§Ù†Ø§Øª Ø´Ø¨ÙƒØ© ÙƒØ¨Ø§Ø± Ø§Ù„Ø´Ø®ØµÙŠØ§Øª Ø§Ù„Ù…Ø´ÙØ±Ø©: \nâ€¢ Ø§Ø³Ù… Ø§Ù„Ø´Ø¨ÙƒØ©: Midyaf-VIP-5G \nâ€¢ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±: SaudiVision2030! \nâ€¢ Ø§Ù„ØªØºØ·ÙŠØ©: Ù‚Ø§Ø¹Ø§Øª Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø¤ØªÙ…Ø±Ø§ØªØŒ Ø£Ø¬Ù†Ø­Ø© ÙˆØ§Ø³ØªØ±Ø§Ø­Ø§Øª Ø§Ù„Ø±ÙŠØªØ²-ÙƒØ§Ø±Ù„ØªÙˆÙ†. Ø³Ø±Ø¹Ø© ØªØªØ¬Ø§ÙˆØ² 450 Ù…ÙŠØºØ§Ø¨Øª Ù…Ø¹ Ø£ÙˆÙ„ÙˆÙŠØ© Ø§ØªØµØ§Ù„ Ù…Ø®ØµØµØ©.`
        : `${persona}: VIP Encrypted Network Credentials: \nâ€¢ Network (SSID): Midyaf-VIP-5G \nâ€¢ Passphrase: SaudiVision2030! \nâ€¢ Coverage: KAICC Plenary Halls, Ritz-Carlton Royal Lounges & Media Suite. Dedicated 450 Mbps fiber uplink with encrypted channel.`
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
    lower.includes("Ø¹Ø´Ø§Ø¡") ||
    lower.includes("Ù…Ø·Ø¹Ù…") ||
    lower.includes("Ø§Ù„Ø¯Ø±Ø¹ÙŠØ©") ||
    lower.includes("Ø§Ù„Ø¨Ø¬ÙŠØ±ÙŠ") ||
    lower.includes("Ø­Ø¬Ø²")
  ) {
    return {
      body: isArabic
        ? `${persona}: ØªÙˆØµÙŠØ© Ø§Ù„Ø¹Ø´Ø§Ø¡ Ø§Ù„ÙØ§Ø®Ø± Ù„Ø¶ÙŠÙˆÙ Ø§Ù„Ù‚Ù…Ø©: Ù…Ø·Ù„ Ø§Ù„Ø¨Ø¬ÙŠØ±ÙŠ ÙÙŠ Ø§Ù„Ø¯Ø±Ø¹ÙŠØ© Ø§Ù„ØªØ§Ø±ÙŠØ®ÙŠØ© ÙŠØ¶Ù… Ù†Ø®Ø¨Ø© Ù…Ù† Ø£Ø±Ù‚Ù‰ Ø§Ù„Ù…Ø·Ø§Ø¹Ù… Ø§Ù„Ø¹Ø§Ù„Ù…ÙŠØ© Ø§Ù„Ù…Ø·Ù„Ø© Ø¹Ù„Ù‰ Ø­ÙŠ Ø§Ù„Ø·Ø±ÙŠÙ Ø§Ù„ØªØ§Ø±ÙŠØ®ÙŠ Ø§Ù„Ù…Ø³Ø¬Ù„ Ø¨Ø§Ù„ÙŠÙˆÙ†Ø³ÙƒÙˆ. Ø§Ù„Ù…Ø·Ø§Ø¹Ù… Ø§Ù„Ù…ÙˆØµÙ‰ Ø¨Ù‡Ø§: Ù…Ø·Ø¹Ù… Ù…ÙŠØ² (Ø§Ù„Ù…Ø·Ø¨Ø® Ø§Ù„Ø³Ø¹ÙˆØ¯ÙŠ Ø§Ù„ÙØ§Ø®Ø±) Ø£Ùˆ Ù‡Ø§ÙƒØ§Ø³Ø§Ù†. Ø£Ù†ØµØ­ Ø¨Ø§Ù„ØªØ­Ø±Ùƒ ÙÙŠ ØªÙ…Ø§Ù… 19:15 Ù„ØªÙØ§Ø¯ÙŠ Ø§Ù„Ø°Ø±ÙˆØ© Ø§Ù„Ù…Ø±ÙˆØ±ÙŠØ©.`
        : `${persona}: VIP Summit Dining Recommendation: Bujairi Terrace in Historic Diriyah offers premier gastronomy overlooking the UNESCO World Heritage site of At-Turaif. Top recommendations: Maiz (refined Saudi dining) or Hakkasan. Recommended departure time is 19:15 to bypass corridor congestion.`
    };
  }

  return {
    body: isArabic
      ? `${persona}: Ø£Ù‡Ù„Ø§Ù‹ Ø¨Ùƒ ÙÙŠ Ù…Ù†ØµØ© Ù…ÙØ¶ÙŠØ§Ù Ø§Ù„Ø°ÙƒÙŠØ© Ù„Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª ÙˆØ§Ù„Ø¶ÙŠØ§ÙØ© Ø§Ù„Ø³ÙŠØ§Ø¯ÙŠØ©. Ø£ØªØ§Ø¨Ø¹ Ø­Ø§Ù„ÙŠØ§Ù‹ ÙØ¹Ø§Ù„ÙŠØ§Øª Ù…Ø¨Ø§Ø¯Ø±Ø© Ù…Ø³ØªÙ‚Ø¨Ù„ Ø§Ù„Ø§Ø³ØªØ«Ù…Ø§Ø± 2027 (FII). ÙŠÙ…ÙƒÙ†Ù†ÙŠ Ù…Ø³Ø§Ø¹Ø¯ØªÙƒ ÙÙˆØ±Ø§Ù‹ ÙÙŠ: ÙØ­Øµ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ø¨Ø§Ù„Ù‚Ø§Ø¹Ø© Ø£ØŒ Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ø®Ø²Ù†Ø© Ø§Ù„Ø«Ù„Ø§Ø«ÙŠØ©ØŒ ØªÙ†Ø¨ÙŠÙ‡Ø§Øª ÙˆØµÙˆÙ„ Ø§Ù„Ù…Ø·Ø§Ø±ØŒ Ù…Ø°ÙƒØ±Ø§Øª Ø§Ù„Ø¶ÙŠØ§ÙØ©ØŒ ÙˆØªØªØ¨Ø¹ Ø§Ù„Ø³Ø§Ø¦Ù‚ÙŠÙ†.`
      : `${persona}: Welcome to Midyaf AI Operations Brain. I am actively monitoring telemetry for Future Investment Initiative 2027 (FII). I can help with real-time vendor geofencing, the Triple-Key Security Vault, Terminal 2 flight surges, VIP hospitality riders, and driver tracking.`,
    actions: [
      {
        label: "Check Missing Vendors",
        labelAr: "ÙØ­Øµ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ø§Ù„Ù…ØªØ£Ø®Ø±ÙŠÙ†",
        actionId: "send_vendor_sms"
      },
      {
        label: "Check Security Vault",
        labelAr: "ÙØ­Øµ Ø§Ù„Ø®Ø²Ù†Ø© Ø§Ù„Ø«Ù„Ø§Ø«ÙŠØ©",
        actionId: "scroll_to_vault"
      },
      {
        label: "Flight Arrivals Surge",
        labelAr: "ØªÙ†Ø¨ÙŠÙ‡ ÙˆØµÙˆÙ„ Ø§Ù„Ù…Ø·Ø§Ø±",
        actionId: "divert_fleet"
      },
      {
        label: "Where is my Driver?",
        labelAr: "Ø£ÙŠÙ† Ø³Ø§Ø¦Ù‚ÙŠØŸ",
        actionId: "track_driver"
      }
    ]
  };
}

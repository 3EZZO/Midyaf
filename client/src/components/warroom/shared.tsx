import { GEOFENCE_RING_META, type GeofenceRingName } from "@shared/constants";
import type { Bilingual } from "../../lib/demo/data";

export const pick = (text: Bilingual | null | undefined, isArabic: boolean) =>
  text ? (isArabic ? text.ar : text.en) : "";

export const RING_LABEL: Record<GeofenceRingName | "OUTSIDE", Bilingual> = {
  OUTER_APPROACH: { en: "Approach", ar: "الاقتراب" },
  STAGING_HOLD: { en: "Staging", ar: "الاصطفاف" },
  CURBSIDE_GATE: { en: "Curbside", ar: "الرصيف" },
  DOCKED_BAY: { en: "Docked", ar: "الرسو" },
  OUTSIDE: { en: "Outside", ar: "خارج النطاق" }
};

export const ringColor = (ring: GeofenceRingName | "OUTSIDE") =>
  ring === "OUTSIDE" ? "#64748B" : GEOFENCE_RING_META[ring].color;

/** mm:ss from seconds; "—" when not applicable. */
export function clock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

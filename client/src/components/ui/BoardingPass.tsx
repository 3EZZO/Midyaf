import { Car, Crown, MapPin, User } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { GEOFENCE_RING_META, GEOFENCE_RING_ORDER } from "@shared/constants";
import type { GeofenceRingType } from "@shared/domain";
import { cn } from "../../lib/cn";
import { EASE_OUT } from "../../lib/motion";
import "../../styles/signature.css";
import { QrCode } from "./QrCode";
import { SaduRibbon } from "./SaduRibbon";

export type BoardingPassProps = {
  isArabic: boolean;
  eventName: string;
  guestName: string;
  guestTitle?: string | null;
  captainName?: string | null;
  vehicle?: string | null;
  plate?: string | null;
  /** Innermost ring the convoy is inside at the destination, or null when unknown. */
  ring?: GeofenceRingType | "OUTSIDE" | null;
  siteName?: string | null;
  /** Encoded into the QR; scanned by the captain's manifest or the curbside desk. */
  code: string;
  /** Play the one-shot curbside slide-up reveal (curbside handshake / arrival). */
  reveal?: boolean;
  className?: string;
};

const RING_LABEL: Record<string, { en: string; ar: string }> = {
  OUTSIDE: { en: "En route", ar: "في الطريق" },
  OUTER_APPROACH: { en: "Approaching", ar: "في الاقتراب" },
  STAGING_HOLD: { en: "Staging", ar: "في الاصطفاف" },
  CURBSIDE_GATE: { en: "At the curb", ar: "على الرصيف" },
  DOCKED_BAY: { en: "Docked", ar: "راسٍ" }
};

/** One-shot curbside slide-up envelope reveal for the guest arrival pass. */
const passSlideUp: Variants = {
  initial: { opacity: 0, y: 28, scale: 0.985 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.65, ease: EASE_OUT }
  }
};

/**
 * Qasr Obsidian P4 Guest Arrival Pass:
 * Vertical mobile-first wallet card with brushed-brass crest, Sadu ribbon,
 * VIP guest & chauffeur details, live geofence progress rings, perforated tear
 * line with recessed notches, and a dedicated high-contrast warm ivory QR pod
 * for reliable curbside scanning in Riyadh sunlight.
 */
export function BoardingPass({
  isArabic,
  eventName,
  guestName,
  guestTitle,
  captainName,
  vehicle,
  plate,
  ring,
  siteName,
  code,
  reveal = false,
  className
}: BoardingPassProps) {
  const reduced = useReducedMotion();
  const ringName = ring ?? "OUTSIDE";
  const depth =
    ringName === "OUTSIDE" ? 0 : GEOFENCE_RING_META[ringName].order + 1;
  const ringLabel = RING_LABEL[ringName];

  return (
    <motion.article
      variants={passSlideUp}
      initial={reveal && !reduced ? "initial" : false}
      animate="animate"
      data-boarding-pass
      data-boarding-pass-layout="vertical"
      className={cn(
        "overflow-hidden rounded-xl border border-gold-500/50 bg-surface-2 shadow-luxury",
        className
      )}
      aria-label={isArabic ? "بطاقة الوصول" : "Arrival pass"}
    >
      {/* Brushed brass header band */}
      <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-gold-700 via-gold-500 to-gold-300 px-4 py-3 text-surface-0">
        <span
          className={cn(
            "flex items-center gap-2 text-xs font-bold",
            !isArabic && "uppercase tracking-label"
          )}
        >
          <Crown className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {isArabic ? "بطاقة الوصول" : "Arrival pass"}
        </span>
        <span className="truncate text-xs font-bold">{eventName}</span>
      </header>

      {/* Static architectural Sadu crest band */}
      <SaduRibbon variant="crest" />

      {/* Upper pass body: guest identity & live transfer details */}
      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <p
            className={cn(
              "text-xs font-semibold text-gold-300",
              !isArabic && "uppercase tracking-label"
            )}
          >
            {isArabic ? "الضيف" : "Guest"}
          </p>
          <h3 className="mt-1 font-display text-2xl font-bold leading-snug text-ink">
            {guestName}
          </h3>
          {guestTitle ? (
            <p className="mt-0.5 text-sm font-medium text-ink-muted">{guestTitle}</p>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-hairline bg-surface-1/80 p-3 text-sm">
          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
              <User className="size-3.5 shrink-0 text-gold-500" strokeWidth={1.6} aria-hidden />
              {isArabic ? "الكابتن" : "Captain"}
            </dt>
            <dd className="mt-0.5 truncate font-semibold text-ink">
              {captainName ?? "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
              <Car className="size-3.5 shrink-0 text-gold-500" strokeWidth={1.6} aria-hidden />
              {isArabic ? "المركبة" : "Vehicle"}
            </dt>
            <dd className="mt-0.5 truncate font-semibold text-ink">
              {vehicle ?? "—"}
              {plate ? (
                <span className="font-tnum ms-1.5 font-mono text-xs text-gold-300" dir="ltr">
                  {plate}
                </span>
              ) : null}
            </dd>
          </div>
          <div className="col-span-2 border-t border-hairline pt-2.5">
            <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
              <MapPin className="size-3.5 shrink-0 text-gold-500" strokeWidth={1.6} aria-hidden />
              {siteName ?? (isArabic ? "الوجهة" : "Destination")}
            </dt>
            <dd className="mt-1.5 flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5" dir="ltr" aria-hidden>
                {GEOFENCE_RING_ORDER.map((r, i) => (
                  <span
                    key={r}
                    className={cn(
                      "h-2 w-6 rounded-full transition-colors duration-slow motion-reduce:transition-none",
                      i >= depth && "bg-white/10"
                    )}
                    style={
                      i < depth
                        ? { backgroundColor: GEOFENCE_RING_META[r].color }
                        : undefined
                    }
                  />
                ))}
              </span>
              <span
                className={cn(
                  "text-xs font-bold",
                  depth >= 3
                    ? "text-ok"
                    : depth > 0
                      ? "text-gold-300"
                      : "text-ink-muted"
                )}
              >
                {isArabic ? ringLabel.ar : ringLabel.en}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Horizontal perforated tear line with recessed semicircular ticket notches */}
      <div className="relative flex items-center px-4" aria-hidden>
        <span className="absolute -start-2.5 size-5 rounded-full border border-gold-500/35 bg-surface-1" />
        <div className="w-full border-t border-dashed border-gold-500/40" />
        <span className="absolute -end-2.5 size-5 rounded-full border border-gold-500/35 bg-surface-1" />
      </div>

      {/* Lower stub: dedicated high-contrast warm ivory QR pod for sunlit airport scanning */}
      <div
        data-boarding-pass-qr-pod
        className="flex flex-col items-center justify-center gap-2 bg-surface-1/60 px-4 py-5"
      >
        <div className="qasr-ivory-qr-pod rounded-xl p-3">
          <QrCode
            value={code}
            size={136}
            label={isArabic ? "امسح عند الرصيف" : "Scan at the curb"}
            className="border-0 bg-transparent p-0"
          />
        </div>
        <p className="text-center text-xs text-ink-muted">
          {isArabic
            ? "أبرز الرمز لمنسق الصالة أو الكابتن عند الوصول"
            : "Present this code to the curbside coordinator or captain"}
        </p>
      </div>
    </motion.article>
  );
}

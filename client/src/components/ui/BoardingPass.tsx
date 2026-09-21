import { Car, Crown, MapPin, User } from "lucide-react";
import { motion } from "motion/react";
import { GEOFENCE_RING_META, GEOFENCE_RING_ORDER } from "@shared/constants";
import type { GeofenceRingType } from "@shared/domain";
import { cn } from "../../lib/cn";
import { cinematic } from "../../lib/motion";
import { QrCode } from "./QrCode";

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
  /** Play the one-shot reveal (curbside handshake / arrival). */
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

/**
 * The guest's arrival pass: a gold-banded card that appears on the guest's
 * device at the curbside handshake and stays for the rest of the journey.
 * Everything on it comes from the task, the driver and the geofence engine —
 * the QR is the only thing minted here.
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
  const ringName = ring ?? "OUTSIDE";
  const depth =
    ringName === "OUTSIDE" ? 0 : GEOFENCE_RING_META[ringName].order + 1;
  const ringLabel = RING_LABEL[ringName];

  return (
    <motion.article
      variants={cinematic}
      initial={reveal ? "initial" : false}
      animate="animate"
      className={cn(
        "overflow-hidden rounded-lg border border-gold-500/50 bg-surface-2 shadow-dropdown",
        className
      )}
      aria-label={isArabic ? "بطاقة الوصول" : "Arrival pass"}
    >
      <header className="flex items-center justify-between gap-3 bg-gold-500 px-4 py-2.5 text-surface-0">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-label">
          <Crown className="size-3.5" />
          {isArabic ? "بطاقة الوصول" : "Arrival pass"}
        </span>
        <span className="truncate text-xs font-semibold">{eventName}</span>
      </header>

      <div className="flex gap-4 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-label text-ink-muted">
            {isArabic ? "الضيف" : "Guest"}
          </p>
          <h3 className="mt-0.5 truncate text-display-sm text-ink">
            {guestName}
          </h3>
          {guestTitle ? (
            <p className="truncate text-sm text-ink-muted">{guestTitle}</p>
          ) : null}

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="flex items-center gap-1 text-xs text-ink-muted">
                <User className="size-3" />
                {isArabic ? "الكابتن" : "Captain"}
              </dt>
              <dd className="truncate font-semibold text-ink">
                {captainName ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-ink-muted">
                <Car className="size-3" />
                {isArabic ? "المركبة" : "Vehicle"}
              </dt>
              <dd className="truncate font-semibold text-ink">
                {vehicle ?? "—"}
                {plate ? (
                  <span className="font-tnum ms-1 text-ink-muted" dir="ltr">
                    {plate}
                  </span>
                ) : null}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="flex items-center gap-1 text-xs text-ink-muted">
                <MapPin className="size-3" />
                {siteName ?? (isArabic ? "الوجهة" : "Destination")}
              </dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="flex items-center gap-1" dir="ltr" aria-hidden>
                  {GEOFENCE_RING_ORDER.map((r, i) => (
                    <span
                      key={r}
                      className={cn(
                        "size-2 rounded-full transition-colors duration-slow",
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
                    "text-sm font-semibold",
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

        {/* Perforation, then the QR — the tear-off stub of a paper pass. */}
        <div className="flex items-stretch gap-3">
          <div
            className="w-px border-s border-dashed border-gold-500/40"
            aria-hidden
          />
          <QrCode
            value={code}
            size={104}
            label={isArabic ? "امسح عند الرصيف" : "Scan at the curb"}
            className="self-center"
          />
        </div>
      </div>
    </motion.article>
  );
}

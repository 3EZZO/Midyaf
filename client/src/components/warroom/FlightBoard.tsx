import { Plane } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Badge, EmptyState } from "../ui";
import type { BadgeTone } from "../ui";
import {
  DEMO_FLIGHTS,
  DEMO_VIP_GUESTS,
  FLIGHT_PHASE_LABEL,
  type FlightPhase
} from "../../lib/demo/data";
import { fade } from "../../lib/motion";
import { PanelFrame } from "./PanelFrame";

const phaseTone: Record<FlightPhase, BadgeTone> = {
  INBOUND: "info",
  FINAL_APPROACH: "warn",
  LANDED: "ok",
  CHAUFFEUR_READY: "gold",
  DEPARTED_AIRPORT: "neutral"
};

/**
 * Inbound VIP flights. There is no flight feed in production yet, so the
 * board only has rows while the director is scripting phases; live mode
 * shows the empty state rather than a mock.
 */
export function FlightBoard({
  isArabic,
  scripted,
  phases
}: {
  isArabic: boolean;
  scripted: boolean;
  phases: Record<string, FlightPhase>;
}) {
  return (
    <PanelFrame
      panelId="flightBoard"
      title={isArabic ? "لوحة الرحلات" : "Flight board"}
      icon={<Plane />}
    >
      {!scripted ? (
        <EmptyState
          title={isArabic ? "لا يوجد تدفق رحلات" : "No flight feed"}
          description={
            isArabic
              ? "يظهر جدول الرحلات أثناء العرض الموجّه."
              : "Flights appear during a directed demo."
          }
          className="h-full"
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {DEMO_FLIGHTS.map((flight) => {
            const phase = phases[flight.flightNo] ?? flight.phase;
            const vip = DEMO_VIP_GUESTS.find((g) => g.id === flight.vipId);
            const label = FLIGHT_PHASE_LABEL[phase];
            return (
              <li
                key={flight.flightNo}
                className="flex items-center gap-3 px-3 py-2"
              >
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="font-tnum text-sm font-bold text-ink"
                      dir="ltr"
                    >
                      {flight.flightNo}
                    </span>
                    <span className="truncate text-xs text-ink-muted">
                      {isArabic ? flight.airline.ar : flight.airline.en}
                    </span>
                  </div>
                  <p className="truncate text-xs text-ink-muted">
                    {isArabic ? flight.origin.ar : flight.origin.en} ·{" "}
                    {isArabic ? flight.gate.ar : flight.gate.en}
                    {vip ? ` · ${isArabic ? vip.nameAr : vip.nameEn}` : ""}
                  </p>
                </div>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={phase}
                    variants={fade}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <Badge
                      tone={phaseTone[phase]}
                      dot={phase === "LANDED" || phase === "CHAUFFEUR_READY"}
                    >
                      {isArabic ? label.ar : label.en}
                    </Badge>
                  </motion.div>
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
    </PanelFrame>
  );
}

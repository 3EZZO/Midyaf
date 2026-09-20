import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Award } from "lucide-react";
import type { Driver, Event, Task } from "@shared/domain";
import { useLiveHistory } from "../../lib/liveEvents";
import type { DirectorState } from "../../lib/demo/director";
import { fleetUtilisation, slaSample } from "../../lib/metrics";
import { cinematic, staggerChild, staggerIn } from "../../lib/motion";
import { Button, KpiTile } from "../ui";
import { clock } from "./shared";

/**
 * End-of-operation reveal. Every number is a selector over the live
 * snapshot or the bus history — the same figures the Client portal shows.
 */
export function Scorecard({
  isArabic,
  state,
  event,
  drivers,
  tasks,
  onDismiss
}: {
  isArabic: boolean;
  state: DirectorState;
  event?: Event;
  drivers: Driver[];
  tasks: Task[];
  onDismiss: () => void;
}) {
  const history = useLiveHistory(200);
  const sla = slaSample(tasks);
  const fleet = fleetUtilisation(drivers);
  const guests = event?.guests ?? [];
  const arrived = guests.filter((g) => g.rsvpStatus === "ARRIVED").length;
  const counts = useMemo(
    () => ({
      transitions: history.filter((e) => e.name === "geofence:transition")
        .length,
      diversions: history.filter((e) => e.name === "fleet:diverted").length,
      delays: history.filter((e) => e.name === "alert:delay").length
    }),
    [history]
  );

  return (
    <AnimatePresence>
      {state.scorecardVisible ? (
        <motion.div
          key="scorecard"
          variants={cinematic}
          initial="initial"
          animate="animate"
          exit="exit"
          className="absolute inset-0 z-[1100] flex items-center justify-center bg-surface-0/70 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={isArabic ? "بطاقة أداء العملية" : "Operation scorecard"}
        >
          <div className="w-full max-w-4xl rounded-lg border border-gold-500/40 bg-surface-1 p-8 shadow-dropdown">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-label text-gold-500">
                  <Award className="size-4" aria-hidden />
                  {isArabic ? "بطاقة أداء العملية" : "Operation scorecard"}
                </div>
                <h2 className="mt-1 text-display-sm text-ink">
                  {isArabic
                    ? "اكتمل الوصول السيادي"
                    : "Sovereign Arrival complete"}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {event?.name ?? ""} · {isArabic ? "مدة العرض" : "Demo clock"}{" "}
                  <span className="font-tnum" dir="ltr">
                    {clock(state.totalElapsedMs / 1000)}
                  </span>
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onDismiss}>
                {isArabic ? "إغلاق" : "Dismiss"}
              </Button>
            </div>

            <motion.div
              variants={staggerIn}
              initial="initial"
              animate="animate"
              className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3"
            >
              <motion.div variants={staggerChild}>
                <KpiTile
                  label={isArabic ? "الالتزام بالوقت" : "On-time"}
                  value={sla.onTimePercent}
                  format="percent"
                  tone="ok"
                  size="lg"
                  detail={`${sla.completed} ${isArabic ? "مكتملة" : "completed"} · ${sla.delayed} ${isArabic ? "متأخرة" : "delayed"}`}
                />
              </motion.div>
              <motion.div variants={staggerChild}>
                <KpiTile
                  label={isArabic ? "الضيوف الواصلون" : "Guests arrived"}
                  value={arrived}
                  tone="gold"
                  size="lg"
                  detail={`${isArabic ? "من" : "of"} ${guests.length}`}
                />
              </motion.div>
              <motion.div variants={staggerChild}>
                <KpiTile
                  label={isArabic ? "المهام" : "Tasks"}
                  value={sla.completed}
                  tone="info"
                  size="lg"
                  detail={`${isArabic ? "من" : "of"} ${sla.total}`}
                />
              </motion.div>
              <motion.div variants={staggerChild}>
                <KpiTile
                  label={isArabic ? "عبور الحلقات" : "Ring transitions"}
                  value={counts.transitions}
                  size="lg"
                  detail={
                    isArabic ? "أحداث النطاق الجغرافي" : "Geofence events"
                  }
                />
              </motion.div>
              <motion.div variants={staggerChild}>
                <KpiTile
                  label={isArabic ? "التحويلات" : "Diversions"}
                  value={counts.diversions}
                  tone={counts.diversions ? "warn" : "none"}
                  size="lg"
                  detail={`${counts.delays} ${isArabic ? "تنبيه تأخير" : "delay alerts"}`}
                />
              </motion.div>
              <motion.div variants={staggerChild}>
                <KpiTile
                  label={isArabic ? "الأسطول النشط" : "Fleet active"}
                  value={fleet.percent}
                  format="percent"
                  size="lg"
                  detail={`${fleet.active} / ${fleet.total - fleet.offline}`}
                />
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

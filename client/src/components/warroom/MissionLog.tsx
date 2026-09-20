import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SUMMIT_CORRIDORS } from "@shared/constants";
import { cn } from "../../lib/cn";
import { useLiveHistory, type LiveEvent } from "../../lib/liveEvents";
import { localizeText } from "../../lib/localize";
import { staggerChild } from "../../lib/motion";
import { EmptyState } from "../ui";
import { RING_LABEL } from "./shared";
import { PanelFrame } from "./PanelFrame";

type Line = {
  id: string;
  at: number;
  source: LiveEvent["source"];
  tag: string;
  tone: string;
  text: string;
};

const SHOWN = 40;

/**
 * Operational log straight off the bus, newest first. Every line names its
 * source — LIVE (socket) or REH (director) — so the narrator can prove the
 * panel is not a recording. Location fixes are omitted; they belong on the map.
 */
export function MissionLog({ isArabic }: { isArabic: boolean }) {
  const history = useLiveHistory(120);
  const lines = useMemo(
    () =>
      history
        .map((e) => toLine(e, isArabic))
        .filter((l): l is Line => l !== null)
        .slice(0, SHOWN),
    [history, isArabic]
  );

  return (
    <PanelFrame
      panelId="missionLog"
      title={isArabic ? "سجل المهمة" : "Mission log"}
      className="min-h-[180px] flex-1"
      bodyClassName="overflow-y-auto"
    >
      {lines.length === 0 ? (
        <EmptyState
          compact
          title={isArabic ? "لا توجد أحداث بعد" : "No events yet"}
          description={
            isArabic
              ? "تظهر أحداث البث المباشر والبروفة هنا."
              : "Live and rehearsal events land here."
          }
        />
      ) : (
        <ol className="divide-y divide-hairline">
          <AnimatePresence initial={false}>
            {lines.map((line) => (
              <motion.li
                key={line.id}
                variants={staggerChild}
                initial="initial"
                animate="animate"
                className="grid grid-cols-[auto_auto_1fr] items-start gap-x-2 px-3 py-1.5"
              >
                <time
                  className="font-tnum pt-0.5 text-xs text-ink-faint"
                  dir="ltr"
                  dateTime={new Date(line.at).toISOString()}
                >
                  {new Date(line.at).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false
                  })}
                </time>
                <span
                  className={cn(
                    "mt-0.5 rounded px-1 text-[12px] font-bold uppercase leading-4",
                    line.tone
                  )}
                >
                  {line.tag}
                </span>
                <span className="text-xs text-ink">{line.text}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </PanelFrame>
  );
}

// Stable ids per event object so AnimatePresence only animates genuinely new lines.
const ids = new WeakMap<LiveEvent, string>();
let counter = 0;
function idFor(e: LiveEvent) {
  let id = ids.get(e);
  if (!id) {
    id = `${e.name}-${e.at}-${++counter}`;
    ids.set(e, id);
  }
  return id;
}

function toLine(e: LiveEvent, isArabic: boolean): Line | null {
  const base = { id: idFor(e), at: e.at, source: e.source };
  const src =
    e.source === "director"
      ? isArabic
        ? "بروفة"
        : "REH"
      : isArabic
        ? "مباشر"
        : "LIVE";
  const srcTone =
    e.source === "director"
      ? "bg-gold-500/15 text-gold-300"
      : "bg-ok/15 text-ok";
  switch (e.name) {
    case "demo:ticker": {
      const text = isArabic ? e.payload.ar : e.payload.en;
      return {
        ...base,
        tag: src,
        tone: srcTone,
        text: text.replace(/^\[[^\]]+\]\s*/, "")
      };
    }
    case "geofence:transition": {
      const site = isArabic
        ? e.payload.geofenceNameAr
        : e.payload.geofenceNameEn;
      const ring = isArabic
        ? RING_LABEL[e.payload.currentRing].ar
        : RING_LABEL[e.payload.currentRing].en;
      const who = localizeText(
        e.payload.driverName ?? e.payload.driverId,
        isArabic
      );
      const verb =
        e.payload.direction === "DEPARTING"
          ? isArabic
            ? "غادر"
            : "left"
          : isArabic
            ? "دخل"
            : "entered";
      return {
        ...base,
        tag: src,
        tone: srcTone,
        text: `${who} ${verb} ${ring} · ${site}`
      };
    }
    case "task:status_change":
      return {
        ...base,
        tag: src,
        tone: srcTone,
        text: `${isArabic ? "المهمة" : "Task"} ${e.payload.taskId.slice(-6)} → ${localizeText(e.payload.status, isArabic)}`
      };
    case "alert:delay":
      return {
        ...base,
        tag: isArabic ? "تأخير" : "DELAY",
        tone: "bg-danger/15 text-danger",
        text: `${isArabic ? "تنبيه تأخير للمهمة" : "Delay alert on task"} ${e.payload.taskId.slice(-6)}`
      };
    case "guest:arrived":
      return {
        ...base,
        tag: src,
        tone: srcTone,
        text: `${isArabic ? "وصل الضيف" : "Guest arrived"} · ${localizeText(e.payload.guestName ?? e.payload.guestId, isArabic)}`
      };
    case "fleet:diverted":
      return {
        ...base,
        tag: isArabic ? "تحويل" : "DIVERT",
        tone: "bg-warn/15 text-warn",
        text: e.payload.message
      };
    case "corridor:state": {
      const corridor = SUMMIT_CORRIDORS.find((c) => c.code === e.payload.code);
      const name = corridor
        ? isArabic
          ? corridor.nameAr
          : corridor.nameEn
        : e.payload.code;
      const state = {
        normal: isArabic ? "طبيعي" : "normal",
        closed: isArabic ? "مغلق" : "closed",
        reroute: isArabic ? "تحويل" : "reroute"
      }[e.payload.state];
      const reason = e.payload.reason
        ? ` · ${isArabic ? e.payload.reason.ar : e.payload.reason.en}`
        : "";
      const tone =
        e.payload.state === "closed"
          ? "bg-danger/15 text-danger"
          : e.payload.state === "reroute"
            ? "bg-warn/15 text-warn"
            : srcTone;
      return {
        ...base,
        tag: isArabic ? "ممر" : "CORRIDOR",
        tone,
        text: `${name} → ${state}${reason}`
      };
    }
    case "demo:act":
      return {
        ...base,
        tag: isArabic ? "فصل" : "ACT",
        tone: "bg-info/15 text-info",
        text: isArabic ? e.payload.title.ar : e.payload.title.en
      };
    case "demo:brief":
      return {
        ...base,
        tag: "AI",
        tone: "bg-info/15 text-info",
        text: isArabic
          ? "طلب إحاطة ذكية: " + e.payload.promptId
          : "Briefing requested: " + e.payload.promptId
      };
    case "task:assigned":
      return {
        ...base,
        tag: src,
        tone: srcTone,
        text: `${isArabic ? "إسناد مهمة" : "Task assigned"} · ${localizeText(e.payload.pickupLocation ?? e.payload.id, isArabic)}`
      };
    case "rider:update":
      return {
        ...base,
        tag: src,
        tone: srcTone,
        text: isArabic ? "تحديث رايدر الضيافة" : "Hospitality rider updated"
      };
    default:
      return null;
  }
}

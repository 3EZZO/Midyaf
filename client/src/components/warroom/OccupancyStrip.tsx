import { useCallback, useEffect, useMemo, useState } from "react";
import { CONCENTRIC_GEOFENCES } from "@shared/constants";
import type { Driver } from "@shared/domain";
import { useLiveEvent } from "../../lib/liveEvents";
import { ringOccupancy } from "../../lib/metrics";
import { RingOccupancyChart } from "../charts";
import { PanelFrame } from "./PanelFrame";

/** Ring-occupancy arcs for every geofenced site; the ring just entered pulses once. */
export function OccupancyStrip({
  isArabic,
  drivers
}: {
  isArabic: boolean;
  drivers: Driver[];
}) {
  const occupancy = useMemo(() => ringOccupancy(drivers), [drivers]);
  const [pulse, setPulse] = useState<{
    siteId: string;
    ring: string;
    at: number;
  } | null>(null);

  useLiveEvent(
    "geofence:transition",
    useCallback((payload) => {
      if (payload.currentRing === "OUTSIDE") return;
      const site = CONCENTRIC_GEOFENCES.find(
        (s) => s.id === payload.geofenceId || s.code === payload.geofenceCode
      );
      if (site)
        setPulse({
          siteId: site.id,
          ring: payload.currentRing,
          at: Date.now()
        });
    }, [])
  );
  useEffect(() => {
    if (!pulse) return;
    const id = window.setTimeout(() => setPulse(null), 1800);
    return () => window.clearTimeout(id);
  }, [pulse]);

  return (
    <PanelFrame
      panelId="occupancy"
      title={isArabic ? "إشغال الحلقات" : "Ring occupancy"}
      bodyClassName="grid grid-cols-4 gap-2 px-3 py-2"
    >
      {occupancy.map((site) => (
        <div key={site.siteId} className="flex flex-col items-center">
          <RingOccupancyChart
            occupancy={site}
            isArabic={isArabic}
            size={84}
            compact
            pulse={pulse?.siteId === site.siteId ? pulse.ring : null}
          />
          <div
            className="mt-1 w-full truncate text-center text-xs text-ink-muted"
            title={isArabic ? site.siteNameAr : site.siteNameEn}
          >
            {shortSite(site.siteId, isArabic)}
          </div>
        </div>
      ))}
    </PanelFrame>
  );
}

function shortSite(siteId: string, isArabic: boolean) {
  switch (siteId) {
    case "geo-kkia-royal":
      return isArabic ? "المطار" : "KKIA";
    case "geo-kafd-plenary":
      return isArabic ? "كافد" : "KAFD";
    case "geo-ritz-carlton":
      return isArabic ? "الريتز-كارلتون" : "Ritz-Carlton";
    case "geo-diriyah-bujairi":
      return isArabic ? "الدرعية" : "Diriyah";
    default:
      return siteId;
  }
}

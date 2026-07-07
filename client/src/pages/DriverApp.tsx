import { useMemo, useState } from "react";
import { Banknote, CheckCircle2, Clock, Map, Navigation } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "../components/Badge";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { RiyadhMap } from "../components/RiyadhMap";
import { money, shortTime } from "../lib/format";
import { useLiveLocation } from "../lib/useLiveLocation";
import type { PortalProps } from "./types";

export function DriverApp({
  data,
  updateTaskStatus,
  shareDriverLocation
}: PortalProps) {
  const { t, i18n } = useTranslation();
  const event = data.events[0];
  const driver = data.drivers[0];
  const tasks = useMemo(
    () =>
      event.tasks.filter(
        (task) => task.driverId === driver.id || task.status === "PENDING"
      ),
    [driver.id, event.tasks]
  );

  const [gpsEnabled, setGpsEnabled] = useState(true);
  const locationState = useLiveLocation({
    enabled: gpsEnabled,
    userId: driver?.user?.id,
    role: "DRIVER",
    driverId: driver?.id,
    eventId: event?.id
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-4">
        <div className={`flex items-center justify-between rounded-xl px-4 py-3 text-white shadow-md transition-all ${
          locationState.tracking ? "bg-gradient-to-r from-emerald-600 to-teal-700" : "bg-gradient-to-r from-slate-700 to-slate-800"
        }`}>
          <div className="flex items-center gap-2.5">
            <span className={`size-3 rounded-full ${locationState.tracking ? "bg-emerald-300 animate-ping" : "bg-slate-400"}`} />
            <div>
              <p className="text-xs font-bold tracking-wide uppercase">
                {locationState.tracking ? "📍 Live GPS Auto-Tracking Active" : "GPS Tracking Offline"}
              </p>
              <p className="text-[11px] text-white/80">
                {locationState.tracking
                  ? `Lat: ${locationState.lat?.toFixed(4)} · Lng: ${locationState.lng?.toFixed(4)} · Acc: ±${Math.round(locationState.accuracy ?? 0)}m`
                  : locationState.error ?? "Click toggle to enable real-time location streaming"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setGpsEnabled(!gpsEnabled)}
            className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/30 transition-colors"
          >
            {gpsEnabled ? "Turn Off" : "Turn On"}
          </button>
        </div>

        <section className="rounded-lg bg-midyaf-purple p-5 text-white shadow-luxury">
          <Badge tone="gold">{t("driver.title")}</Badge>
          <h1 className="mt-4 text-2xl font-bold">{driver.user.name}</h1>
          <p className="mt-2 text-sm text-white/70">
            {driver.zone.replaceAll("_", " ")} · {driver.licenseNo}
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label={t("driver.shift")}
            value={`${shortTime(driver.shiftStart ?? event.date, i18n.language)}-${shortTime(
              driver.shiftEnd ?? event.date,
              i18n.language
            )}`}
            detail={driver.status}
            icon={<Clock size={17} />}
          />
          <MetricCard
            label={t("driver.earnings")}
            value={money(driver.earnings ?? 0)}
            detail="Today"
            icon={<Banknote size={17} />}
          />
          <MetricCard
            label={t("common.status")}
            value={tasks.length}
            detail="Open assignments"
            icon={<CheckCircle2 size={17} />}
          />
        </div>

        <Section
          title={t("common.transport")}
          action={
            <button
              onClick={() => void shareDriverLocation(driver.id)}
              className="rounded-lg bg-midyaf-purple px-3 py-2 text-xs font-bold text-white"
            >
              {t("common.shareLocation")}
            </button>
          }
        >
          <div className="space-y-3">
            {tasks.map((task) => (
              <article
                key={task.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Badge tone={task.status === "DELAYED" ? "red" : "purple"}>
                      {task.status}
                    </Badge>
                    <h3 className="mt-3 font-bold text-midyaf-ink">
                      {task.type.replaceAll("_", " ")}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {shortTime(task.scheduledAt, i18n.language)}
                    </p>
                  </div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${driver.currentLat},${driver.currentLng}&destination=${task.dropoffLat},${task.dropoffLng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="grid size-11 place-items-center rounded-lg bg-midyaf-gold text-white"
                    aria-label={t("driver.nav")}
                  >
                    <Navigation size={19} />
                  </a>
                </div>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                  <p className="rounded-lg bg-slate-50 p-3">
                    <span className="block text-xs text-slate-500">Pickup</span>
                    {task.pickupLocation}
                  </p>
                  <p className="rounded-lg bg-slate-50 p-3">
                    <span className="block text-xs text-slate-500">Dropoff</span>
                    {task.dropoffLocation}
                  </p>
                </div>
                {(() => {
                  const rider = data.hospitalityRiders?.find((r) => r.guestId === task.guestId);
                  if (!rider) return null;
                  return (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 shadow-sm dark:bg-amber-950/40 dark:text-amber-200">
                      <div className="flex items-center justify-between font-bold text-amber-800 dark:text-amber-300 mb-1.5">
                        <span>⚠️ VIP Hospitality Rider (Vehicle & Protocol)</span>
                        <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] uppercase text-amber-900">VIP Priority</span>
                      </div>
                      <ul className="list-disc start-4 space-y-1 text-[11px]">
                        {rider.vehicleRider?.map((item: string, idx: number) => (
                          <li key={idx} className="font-medium">{item}</li>
                        ))}
                        {rider.securityNotes?.map((item: string, idx: number) => (
                          <li key={`sec-${idx}`} className="font-semibold text-red-700 dark:text-red-400">🛡️ {item}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => void updateTaskStatus(task.id, "PICKED_UP")}
                    className="rounded-lg border border-midyaf-purple px-3 py-2 text-xs font-bold text-midyaf-purple"
                  >
                    {t("driver.pickup")}
                  </button>
                  <button
                    onClick={() => void updateTaskStatus(task.id, "COMPLETED")}
                    className="rounded-lg bg-midyaf-purple px-3 py-2 text-xs font-bold text-white"
                  >
                    {t("driver.dropoff")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Section>
      </div>

      <div className="space-y-4">
        <RiyadhMap event={event} drivers={data.drivers} tasks={tasks} />
        <Section title="Navigation stack">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Google Maps navigation", "Driver deep links are ready per task."],
              ["Socket.IO live sharing", "Location updates stream to organizers."],
              ["Delay alert", "No update for 5 minutes triggers alert:delay."],
              ["Zone logic", "Same Riyadh zone is searched before expansion."]
            ].map(([title, detail]) => (
              <div key={title} className="rounded-lg bg-slate-50 p-3">
                <Map className="mb-2 text-midyaf-purple" size={18} />
                <p className="font-semibold text-midyaf-ink">{title}</p>
                <p className="text-xs text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { Banknote, CheckCircle2, Clock, Map, Navigation } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "../components/Badge";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { RiyadhMap } from "../components/RiyadhMap";
import { money, shortTime } from "../lib/format";
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

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-4">
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

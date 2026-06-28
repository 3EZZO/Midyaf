import {
  CalendarDays,
  Crown,
  Landmark,
  Luggage,
  MapPin,
  QrCode,
  Sparkles
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "../components/Badge";
import { Section } from "../components/Section";
import { RiyadhMap } from "../components/RiyadhMap";
import { AiPanel } from "../components/AiPanel";
import { money, shortDate, shortTime } from "../lib/format";
import type { PortalProps } from "./types";

export function GuestApp({ data, session }: PortalProps) {
  const { t, i18n } = useTranslation();
  const event = data.events[0];
  const guest =
    event.guests.find((item) => item.user.email === "guest.vip@midyaf.local") ??
    event.guests[0];
  const driverTask =
    event.tasks.find((task) => task.guestId === guest?.id && task.driverId) ??
    event.tasks[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.55fr)]">
      <div className="space-y-4">
        <section className="overflow-hidden rounded-lg bg-midyaf-purple text-white shadow-luxury">
          <div className="bg-[radial-gradient(circle_at_10%_20%,rgba(201,168,76,0.35),transparent_24%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,0.16),transparent_28%)] p-5">
            <Badge tone="gold" className="ring-white/20">
              <Crown size={13} />
              {t("guest.vip")} · {guest?.tier}
            </Badge>
            <h1 className="mt-4 text-2xl font-bold">{t("guest.title")}</h1>
            <p className="mt-2 max-w-xl text-sm text-white/75">
              {event.name} · {shortDate(event.date, i18n.language)} ·{" "}
              {shortTime(event.date, i18n.language)}
            </p>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
          <Section title={t("guest.qr")}>
            <div className="rounded-lg border border-dashed border-midyaf-purple/30 bg-midyaf-pearl p-4">
              <div className="mx-auto grid size-44 grid-cols-7 gap-1 rounded-lg bg-white p-3 shadow-inner">
                {Array.from({ length: 49 }).map((_, index) => (
                  <span
                    key={index}
                    className={
                      (index * 7 + guest.qrCode.length) % 5 < 2
                        ? "rounded-sm bg-midyaf-purple"
                        : "rounded-sm bg-midyaf-gold/25"
                    }
                  />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-bold text-midyaf-ink">
                    {guest.qrCode}
                  </p>
                  <p className="text-xs text-slate-500">{event.venue}</p>
                </div>
                <QrCode className="text-midyaf-gold" size={24} />
              </div>
            </div>
          </Section>

          <Section title={t("common.schedule")}>
            <div className="space-y-3">
              {[
                ["13:30", "Airport pickup", "King Khalid International Airport"],
                ["15:00", "Hotel check-in", "Mandarin Oriental Al Faisaliah"],
                ["17:00", event.name, event.venue],
                ["20:30", "Diriyah cultural dinner", "Bujairi Terrace"]
              ].map(([time, title, location]) => (
                <div
                  key={`${time}-${title}`}
                  className="flex gap-3 rounded-lg bg-slate-50 p-3"
                >
                  <div className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-midyaf-purple shadow-sm">
                    {time}
                  </div>
                  <div>
                    <p className="font-semibold text-midyaf-ink">{title}</p>
                    <p className="text-xs text-slate-500">{location}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <Section title={t("common.transport")}>
          <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-lg bg-midyaf-pearl p-4">
              <div className="flex items-center justify-between">
                <Badge tone={driverTask.status === "DELAYED" ? "red" : "green"}>
                  {driverTask.status}
                </Badge>
                {guest.isVIP ? (
                  <Badge tone="gold">{t("common.priority")}</Badge>
                ) : null}
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex gap-2">
                  <MapPin size={16} className="text-midyaf-purple" />
                  <span>{driverTask.pickupLocation}</span>
                </div>
                <div className="flex gap-2">
                  <Luggage size={16} className="text-midyaf-purple" />
                  <span>{driverTask.dropoffLocation}</span>
                </div>
                <div className="flex gap-2">
                  <CalendarDays size={16} className="text-midyaf-purple" />
                  <span>{shortTime(driverTask.scheduledAt, i18n.language)}</span>
                </div>
              </div>
            </div>
            <RiyadhMap event={event} drivers={data.drivers} tasks={[driverTask]} />
          </div>
        </Section>
      </div>

      <aside className="space-y-4">
        <AiPanel session={session} persona="Noura" context={{ event, guest }} />

        <Section title={t("guest.suggestions")}>
          <div className="space-y-3">
            {[
              {
                icon: Landmark,
                title: "Diriyah private heritage walk",
                detail: "15 min from KAFD with historical audio notes."
              },
              {
                icon: Sparkles,
                title: "VIP dinner at Bujairi Terrace",
                detail: "Quiet table, Saudi tasting menu, premium transport."
              },
              {
                icon: MapPin,
                title: t("guest.locationContent"),
                detail:
                  "Nearby content triggers automatically around KAFD and Diriyah."
              }
            ].map((item) => (
              <div key={item.title} className="flex gap-3 rounded-lg bg-slate-50 p-3">
                <div className="grid size-10 place-items-center rounded-lg bg-white text-midyaf-purple shadow-sm">
                  <item.icon size={18} />
                </div>
                <div>
                  <p className="font-semibold text-midyaf-ink">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t("common.bookings")}>
          <div className="space-y-3">
            {event.bookings.map((booking) => (
              <div
                key={booking.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"
              >
                <div>
                  <p className="font-semibold text-midyaf-ink">
                    {booking.service.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {booking.supplier.name} · x{booking.quantity}
                  </p>
                </div>
                <p className="text-sm font-bold text-midyaf-purple">
                  {money(booking.totalPrice)}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </aside>
    </div>
  );
}

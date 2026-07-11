import {
  CalendarDays,
  Car,
  CheckCircle2,
  Crown,
  Landmark,
  Luggage,
  MapPin,
  Phone,
  QrCode,
  Sparkles
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "../components/Badge";
import { RoyalCard } from "../components/RoyalCard";
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
        <RoyalCard tone="purple" elevated interactive={false} className="bg-gradient-to-br from-midyaf-purple via-midyaf-purple-dark to-midyaf-purple text-white">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Badge tone="gold" className="ring-1 ring-midyaf-gold/40">
              <Crown size={13} className="text-midyaf-gold animate-bounce" />
              {t("guest.vip")} · {guest?.tier}
            </Badge>
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-300 border border-emerald-400/30 shadow-glow">
              <span className="size-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>📍 Live GPS Tracking & Concierge Sync Active</span>
            </div>
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight">{t("guest.title")}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/80 font-medium">
            {event.name} · {shortDate(event.date, i18n.language)} ·{" "}
            {shortTime(event.date, i18n.language)}
          </p>
        </RoyalCard>

        {/* Touchdown Driver Banner & Proactive Concierge (PDF Page 4) */}
        <div className="glass-royal rounded-2xl p-5 border border-amber-400/50 shadow-luxury transition-all animate-fadeIn">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-amber-500/20 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-slate-950 font-black shadow-md shrink-0">
                <Car size={22} className="text-slate-950 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/40">
                    <CheckCircle2 size={11} className="text-emerald-600 dark:text-emerald-400 inline" />
                    {t("guest.touchdown", "✈️ FLIGHT TOUCHDOWN CONFIRMED")}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40">
                    ⚡ VIP EXPEDITED CURB
                  </span>
                </div>
                <h3 className="text-base font-bold text-midyaf-ink dark:text-dark-primary mt-1">
                  Your Royal Escort & Chauffeur is waiting at Gate 2 VIP Curb
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => alert("📞 Connecting directly via encrypted royal line to Captain Sultan Al-Otaibi (+966 50 811 9119)...")}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                <Phone size={13} />
                Call Captain
              </button>
              <button
                onClick={() => alert("💬 Concierge Noura notified: 'Guest has cleared immigration and is walking to Bay 4 right now.'")}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-midyaf-purple hover:bg-midyaf-purple-dark text-white text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                <Sparkles size={13} className="text-midyaf-gold" />
                Notify Noura
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl bg-white/70 dark:bg-dark-surface p-3.5 ring-1 ring-slate-200 dark:ring-white/10 flex items-center gap-3">
              <div className="size-10 rounded-full bg-slate-800 border-2 border-amber-400 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
                SA
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ASSIGNED CHAUFFEUR</span>
                <strong className="text-midyaf-ink dark:text-dark-text font-bold text-sm">Capt. Sultan Al-Otaibi</strong>
                <span className="text-slate-500 block text-[11px]">VIP Security Cleared #819</span>
              </div>
            </div>

            <div className="rounded-xl bg-white/70 dark:bg-dark-surface p-3.5 ring-1 ring-slate-200 dark:ring-white/10">
              <span className="text-slate-400 block text-[10px]">VEHICLE & PLATE</span>
              <strong className="text-midyaf-ink dark:text-dark-text font-bold text-sm block">Mercedes Maybach S680</strong>
              <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded font-mono font-black bg-amber-400 text-slate-950 text-[11px]">
                KSA · 9119
              </span>
            </div>

            <div className="rounded-xl bg-white/70 dark:bg-dark-surface p-3.5 ring-1 ring-slate-200 dark:ring-white/10">
              <span className="text-slate-400 block text-[10px]">MEETING POINT & ETA</span>
              <strong className="text-emerald-600 dark:text-emerald-400 font-bold text-sm block">Gate 2 Royal VIP Curb — Bay 4</strong>
              <span className="text-slate-500 text-[11px]">Est. transfer to Hotel: 22 mins</span>
            </div>
          </div>
        </div>

        {(() => {
          const rider = data.hospitalityRiders?.find((r) => r.guestId === guest?.id);
          if (!rider) return null;
          return (
            <Section title="🌟 Your Platinum Hospitality Rider">
              <RoyalCard tone="gold" elevated interactive={true}>
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-3 mb-4 dark:border-amber-900/40">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="text-amber-500 animate-pulse" size={22} />
                    <span className="text-base font-black tracking-tight text-midyaf-purple dark:text-white">
                      Personalized Royal Reception & Protocol
                    </span>
                  </div>
                  <Badge tone={rider.fulfilled ? "green" : "gold"}>
                    {rider.fulfilled ? "✓ Rider Verified & Ready" : "⏳ In Preparation by Concierge"}
                  </Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-3 text-xs">
                  <div className="rounded-xl bg-white/80 p-4 shadow-sm ring-1 ring-emerald-500/20 transition-all duration-300 hover:scale-[1.02] dark:bg-dark-surface dark:ring-emerald-500/30">
                    <p className="font-bold text-emerald-800 dark:text-emerald-400 mb-2 flex items-center gap-1.5 text-sm">
                      🍽️ Dietary & Refreshments
                    </p>
                    <ul className="list-disc start-4 space-y-1 text-slate-600 dark:text-slate-300 font-medium">
                      {rider.dietaryNeeds?.map((item: string, idx: number) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl bg-white/80 p-4 shadow-sm ring-1 ring-purple-500/20 transition-all duration-300 hover:scale-[1.02] dark:bg-dark-surface dark:ring-purple-500/30">
                    <p className="font-bold text-purple-800 dark:text-purple-400 mb-2 flex items-center gap-1.5 text-sm">
                      🏨 Suite & Environment
                    </p>
                    <ul className="list-disc start-4 space-y-1 text-slate-600 dark:text-slate-300 font-medium">
                      {rider.roomPreferences?.map((item: string, idx: number) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl bg-white/80 p-4 shadow-sm ring-1 ring-amber-500/20 transition-all duration-300 hover:scale-[1.02] dark:bg-dark-surface dark:ring-amber-500/30">
                    <p className="font-bold text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-1.5 text-sm">
                      🚘 Chauffeur & Fleet
                    </p>
                    <ul className="list-disc start-4 space-y-1 text-slate-600 dark:text-slate-300 font-medium">
                      {rider.vehicleRider?.map((item: string, idx: number) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </RoyalCard>
            </Section>
          );
        })()}

        <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
          <Section title={t("guest.qr")}>
            <RoyalCard tone="purple" interactive={true} className="border border-dashed border-midyaf-purple/30 bg-midyaf-pearl/80 dark:bg-dark-surface">
              <div className="mx-auto grid size-44 grid-cols-7 gap-1 rounded-xl bg-white p-3 shadow-inner ring-1 ring-midyaf-purple/10">
                {Array.from({ length: 49 }).map((_, index) => (
                  <span
                    key={index}
                    className={
                      (index * 7 + guest.qrCode.length) % 5 < 2
                        ? "rounded-sm bg-midyaf-purple dark:bg-midyaf-purple-light"
                        : "rounded-sm bg-midyaf-gold/30"
                    }
                  />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-black tracking-wider text-midyaf-ink dark:text-white">
                    {guest.qrCode}
                  </p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{event.venue}</p>
                </div>
                <QrCode className="text-midyaf-gold animate-pulse" size={26} />
              </div>
            </RoyalCard>
          </Section>

          <Section title={t("common.schedule")}>
            <RoyalCard tone="default" interactive={false} className="space-y-3 p-4">
              {[
                ["13:30", "Airport pickup", "King Khalid International Airport"],
                ["15:00", "Hotel check-in", "Mandarin Oriental Al Faisaliah"],
                ["17:00", event.name, event.venue],
                ["20:30", "Diriyah cultural dinner", "Bujairi Terrace"]
              ].map(([time, title, location]) => (
                <div
                  key={`${time}-${title}`}
                  className="flex gap-3 rounded-xl bg-slate-50/90 p-3.5 shadow-card-sm ring-1 ring-slate-200/60 transition-all duration-200 hover:scale-[1.01] dark:bg-dark-surface dark:ring-slate-800"
                >
                  <div className="grid place-items-center rounded-lg bg-gradient-to-br from-midyaf-purple to-midyaf-purple-dark px-3 py-2 text-xs font-black text-white shadow-sm">
                    {time}
                  </div>
                  <div>
                    <p className="font-bold text-midyaf-ink dark:text-white">{title}</p>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{location}</p>
                  </div>
                </div>
              ))}
            </RoyalCard>
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

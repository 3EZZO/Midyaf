import { useMemo, useState } from "react";
import {
  BarChart3,
  Car,
  CheckCircle2,
  ClipboardList,
  Crown,
  QrCode,
  Users
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskStatus } from "@shared/domain";
import { Badge } from "../components/Badge";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { RiyadhMap } from "../components/RiyadhMap";
import { AiPanel } from "../components/AiPanel";
import { money, percent, shortTime } from "../lib/format";
import type { PortalProps } from "./types";

const kanbanStatuses: TaskStatus[] = [
  "PENDING",
  "ASSIGNED",
  "EN_ROUTE",
  "DELAYED",
  "COMPLETED"
];

export function OrganizerDashboard({ data, session }: PortalProps) {
  const { t, i18n } = useTranslation();
  const [inviteResult, setInviteResult] = useState("");
  const event = data.events[0];
  const vipGuests = event.guests.filter((guest) => guest.isVIP);
  const totalCommission = event.bookings.reduce(
    (sum, booking) => sum + Number(booking.commissionAmount),
    0
  );
  const kanban = useMemo(
    () =>
      kanbanStatuses.map((status) => ({
        status,
        tasks: event.tasks.filter((task) => task.status === status)
      })),
    [event.tasks]
  );

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg bg-midyaf-purple p-5 text-white shadow-luxury">
          <Badge tone="gold">{t("organizer.title")}</Badge>
          <h1 className="mt-4 text-2xl font-bold">{event.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/75">{event.brief}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge tone="green">{event.status}</Badge>
            <Badge tone="gold">{event.venue}</Badge>
            <Badge tone="purple" className="bg-white/15 text-white ring-white/20">
              Asia/Riyadh · SAR · VAT 15%
            </Badge>
          </div>
        </div>
        <AiPanel session={session} persona="Ops Manager" context={{ event }} />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label={t("metrics.guests")}
          value={event.guests.length}
          detail="Free tier limit: 50"
          icon={<Users size={17} />}
        />
        <MetricCard
          label={t("metrics.vip")}
          value={vipGuests.length}
          detail="Priority transport"
          icon={<Crown size={17} />}
        />
        <MetricCard
          label={t("metrics.drivers")}
          value={data.drivers.length}
          detail="Live map enabled"
          icon={<Car size={17} />}
        />
        <MetricCard
          label={t("metrics.commission")}
          value={money(totalCommission)}
          detail="10-15% supplier take"
          icon={<BarChart3 size={17} />}
        />
        <MetricCard
          label={t("metrics.onTime")}
          value="94%"
          detail="Forecast"
          icon={<CheckCircle2 size={17} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <RiyadhMap event={event} drivers={data.drivers} tasks={event.tasks} />
        <Section
          title={t("common.guests")}
          action={
            <button
              onClick={() =>
                setInviteResult("3 QR invites queued for WhatsApp/SMS delivery.")
              }
              className="rounded-lg bg-midyaf-gold px-3 py-2 text-xs font-bold text-white"
            >
              <QrCode size={14} className="me-1 inline" />
              {t("organizer.invite")}
            </button>
          }
        >
          <div className="space-y-3">
            {event.guests.map((guest) => (
              <div
                key={guest.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"
              >
                <div>
                  <p className="font-semibold text-midyaf-ink">
                    {guest.user.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {guest.qrCode} · {guest.rsvpStatus}
                  </p>
                </div>
                {guest.isVIP ? <Badge tone="gold">VIP</Badge> : null}
              </div>
            ))}
          </div>
          {inviteResult ? (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {inviteResult}
            </p>
          ) : null}
        </Section>
      </div>

      <Section title={t("organizer.kanban")}>
        <div className="grid gap-3 lg:grid-cols-5">
          {kanban.map((column) => (
            <div key={column.status} className="rounded-lg bg-slate-50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-600">
                  {column.status}
                </p>
                <Badge tone={column.status === "DELAYED" ? "red" : "slate"}>
                  {column.tasks.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {column.tasks.map((task) => (
                  <div key={task.id} className="rounded-lg bg-white p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <ClipboardList size={14} className="text-midyaf-purple" />
                      <p className="text-sm font-semibold text-midyaf-ink">
                        {task.type.replaceAll("_", " ")}
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {shortTime(task.scheduledAt, i18n.language)} ·{" "}
                      {task.pickupLocation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title={t("common.suppliers")}>
          <div className="space-y-3">
            {data.suppliers.slice(0, 3).map((supplier) => (
              <div
                key={supplier.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"
              >
                <div>
                  <p className="font-semibold text-midyaf-ink">{supplier.name}</p>
                  <p className="text-xs text-slate-500">
                    {supplier.category} · {percent(supplier.commissionPercent)}
                  </p>
                </div>
                {supplier.sponsoredRank ? (
                  <Badge tone="gold">{t("common.sponsored")}</Badge>
                ) : (
                  <Badge tone="green">{t("common.verified")}</Badge>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section title={t("common.reports")}>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [t("organizer.costGuest"), money(2130), "Includes rooms + cars"],
              [t("metrics.utilization"), "78%", "Drivers and suppliers"],
              ["Demand forecast", "+18%", "Next 30 days"]
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-2 text-xl font-bold text-midyaf-purple">
                  {value}
                </p>
                <p className="mt-1 text-xs text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

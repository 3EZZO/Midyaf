import { BarChart3, Building2, Flag, ShieldCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BUSINESS_RULES } from "@shared/constants";
import { Badge } from "../components/Badge";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { money, percent } from "../lib/format";
import type { PortalProps } from "./types";

export function SuperAdmin({ data }: PortalProps) {
  const { t } = useTranslation();
  const event = data.events[0];
  const totalCommission = event.bookings.reduce(
    (sum, booking) => sum + Number(booking.commissionAmount),
    0
  );

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-midyaf-purple p-5 text-white shadow-luxury">
        <Badge tone="gold">{t("admin.title")}</Badge>
        <h1 className="mt-4 text-2xl font-bold">
          Platform controls, analytics, and compliance
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/75">
          Manage roles, Riyadh feature flags, supplier commission ranges,
          sponsored placement, and PDPL-aligned hosting policy.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("common.guests")}
          value={event.guests.length}
          detail={`Free tier cap ${BUSINESS_RULES.freeTierGuestLimit}`}
          icon={<Users size={17} />}
        />
        <MetricCard
          label={t("common.suppliers")}
          value={data.suppliers.length}
          detail="Verified marketplace"
          icon={<Building2 size={17} />}
        />
        <MetricCard
          label={t("metrics.commission")}
          value={money(totalCommission)}
          detail="Current event"
          icon={<BarChart3 size={17} />}
        />
        <MetricCard
          label="Compliance"
          value="PDPL"
          detail="AWS me-south-1 preferred"
          icon={<ShieldCheck size={17} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Section title="Users">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pe-4">Name</th>
                  <th className="py-2 pe-4">Role</th>
                  <th className="py-2 pe-4">Phone</th>
                  <th className="py-2 pe-4">Language</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100">
                    <td className="py-3 pe-4 font-medium text-midyaf-ink">
                      {user.name}
                    </td>
                    <td className="py-3 pe-4">
                      <Badge tone="purple">{user.role}</Badge>
                    </td>
                    <td className="py-3 pe-4 text-slate-500">{user.phone}</td>
                    <td className="py-3 pe-4 text-slate-500">
                      {user.language}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={t("admin.cityFlags")}>
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-midyaf-ink">{data.city.nameEn}</p>
                  <p className="text-xs text-slate-500">
                    {data.city.timezone} · {data.city.currency} · VAT{" "}
                    {percent(data.city.vatPercent)}
                  </p>
                </div>
                <Badge tone="green">Enabled</Badge>
              </div>
            </div>
            {["Jeddah", "Al Khobar", "AlUla"].map((city) => (
              <div
                key={city}
                className="flex items-center justify-between rounded-lg bg-slate-100 p-4 text-slate-400"
              >
                <div className="flex items-center gap-2">
                  <Flag size={16} />
                  <span className="font-semibold">{city}</span>
                </div>
                <Badge tone="slate">{t("comingSoon")}</Badge>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title={t("admin.commissionConfig")}>
          <div className="space-y-3">
            {data.commission.map((config, index) => (
              <div
                key={config.category ?? `default-${index}`}
                className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
              >
                <div>
                  <p className="font-semibold text-midyaf-ink">
                    {config.category ?? "Default"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Range {percent(config.minPercent)}-{percent(config.maxPercent)}
                  </p>
                </div>
                <Badge tone="gold">{percent(config.defaultPercent)}</Badge>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t("admin.platformAnalytics")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["On-time rate", "94%"],
              ["Cost per guest", money(2130)],
              ["Driver utilization", "78%"],
              ["Demand forecast", "+18%"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-2 text-xl font-bold text-midyaf-purple">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-lg bg-midyaf-pearl px-3 py-2 text-sm text-slate-600">
            {t("admin.pdpl")}
          </p>
        </Section>
      </div>
    </div>
  );
}

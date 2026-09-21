import { Radio, Sparkles } from "lucide-react";
import type { Driver, MidyafData } from "@shared/domain";
import { statusMeta } from "@shared/statusMeta";
import { localizeText } from "../../lib/localize";
import {
  deriveExecutiveKpis,
  fleetUtilisation,
  slaSample
} from "../../lib/metrics";
import { Badge, KpiTile, StatusPill } from "../ui";

/**
 * Inline cards the assistant attaches to a reply. Every number is read from
 * the workspace snapshot through `metrics.ts`, so a card shows what the
 * dashboards show — never a typed-in figure.
 */

export type AiWidget =
  | { type: "driver"; driverId: string }
  | { type: "scorecard" };

/** Which captain a "where is my driver" question is about: the one on a VIP task, else the first moving one. */
export function pickDriver(data: MidyafData | undefined): Driver | null {
  if (!data) return null;
  const withFix = data.drivers.filter(
    (d) =>
      d.currentLat != null && d.currentLng != null && d.status !== "OFFLINE"
  );
  const vipTask = data.events[0]?.tasks.find(
    (t) =>
      t.driverId && (t.type === "AIRPORT_PICKUP" || t.type === "VIP_ESCORT")
  );
  return (
    withFix.find((d) => d.id === vipTask?.driverId) ??
    withFix.find((d) => d.status === "EN_ROUTE") ??
    withFix[0] ??
    null
  );
}

export function DriverWidget({
  driver,
  isArabic
}: {
  driver: Driver;
  isArabic: boolean;
}) {
  const l = (v: string | number | null | undefined) =>
    localizeText(v, isArabic);
  const coords =
    driver.currentLat != null && driver.currentLng != null
      ? `${driver.currentLat.toFixed(4)}° N, ${driver.currentLng.toFixed(4)}° E`
      : null;
  return (
    <div className="mt-3 rounded-lg border border-ok/30 bg-surface-1 p-3">
      <div className="mb-2 flex items-center justify-between border-b border-hairline pb-2">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-label text-ok">
          <Radio className="size-3.5" />
          {isArabic ? "رادار التتبع المباشر" : "Live telemetry"}
        </span>
        {coords ? (
          <span className="font-tnum text-xs text-ink-muted" dir="ltr">
            {coords}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="block text-ink-muted">
            {isArabic ? "الكابتن" : "Captain"}
          </span>
          <strong className="text-ink">{l(driver.user.name)}</strong>
        </div>
        <div>
          <span className="block text-ink-muted">
            {isArabic ? "الحالة" : "Status"}
          </span>
          <StatusPill
            status={driver.status}
            size="sm"
            live={driver.status === "EN_ROUTE"}
          />
        </div>
        <div>
          <span className="block text-ink-muted">
            {isArabic ? "المنطقة" : "Zone"}
          </span>
          <span className="text-ink">
            {isArabic ? statusMeta(driver.zone).ar : statusMeta(driver.zone).en}
          </span>
        </div>
        <div>
          <span className="block text-ink-muted">
            {isArabic ? "الهاتف" : "Phone"}
          </span>
          <span className="font-tnum text-ink" dir="ltr">
            {driver.user.phone || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ScorecardWidget({
  data,
  isDemoMode,
  isArabic
}: {
  data: MidyafData;
  isDemoMode: boolean;
  isArabic: boolean;
}) {
  const tasks = data.events[0]?.tasks ?? [];
  const guests = data.events[0]?.guests ?? [];
  const fleet = fleetUtilisation(data.drivers);
  const sla = slaSample(tasks);
  const kpis = deriveExecutiveKpis(data, { isDemoMode });
  const arrived = guests.filter((g) => g.rsvpStatus === "ARRIVED").length;
  return (
    <div className="mt-3 rounded-lg border border-gold-500/30 bg-surface-1 p-3">
      <div className="mb-2 flex items-center justify-between border-b border-hairline pb-2">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-label text-gold-300">
          <Sparkles className="size-3.5" />
          {isArabic ? "بطاقة الأداء التنفيذية" : "Executive scorecard"}
        </span>
        <Badge tone="neutral" size="sm">
          {isArabic ? "من البيانات الحية" : "From live data"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <KpiTile
          label={isArabic ? "الالتزام بالمواعيد" : "On-time SLA"}
          value={sla.onTimePercent}
          format="percent"
          tone="ok"
          source="live"
        />
        <KpiTile
          label={isArabic ? "استغلال الأسطول" : "Fleet utilisation"}
          value={fleet.percent}
          format="percent"
          tone="info"
          source="live"
        />
        <KpiTile
          label={isArabic ? "الضيوف الواصلون" : "Guests arrived"}
          value={arrived}
          format="number"
          detail={`${isArabic ? "من" : "of"} ${guests.length}`}
          tone="gold"
          source="live"
        />
        <KpiTile
          label={isArabic ? "عمولة المنصة" : "Platform commission"}
          value={kpis.commission.value}
          format="money"
          delta={kpis.commission.delta}
          source={kpis.commission.source}
        />
      </div>
    </div>
  );
}

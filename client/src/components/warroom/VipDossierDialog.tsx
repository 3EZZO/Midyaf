import { Crown, ShieldCheck } from "lucide-react";
import type { Driver } from "@shared/domain";
import {
  DEMO_CONVOYS,
  DEMO_VIP_DOSSIERS,
  DEMO_VIP_GUESTS,
  type DemoDriverKey
} from "../../lib/demo/data";
import type { ConvoySnapshot } from "../../lib/demo/director";
import { localizeText } from "../../lib/localize";
import { Badge, Dialog } from "../ui";
import { RING_LABEL, pick } from "./shared";

/** Protocol dossier for the VIP riding in a convoy: clearance, protocol, rider, live ring. */
export function VipDossierDialog({
  isArabic,
  vipId,
  drivers,
  convoys,
  onClose
}: {
  isArabic: boolean;
  vipId: string | null;
  drivers: Driver[];
  convoys: Record<DemoDriverKey, ConvoySnapshot>;
  onClose: () => void;
}) {
  const vip = vipId ? DEMO_VIP_GUESTS.find((v) => v.id === vipId) : undefined;
  const convoy = vipId
    ? DEMO_CONVOYS.find((c) => c.vipId === vipId)
    : undefined;
  const snapshot = convoy ? convoys[convoy.driver] : undefined;
  const driver = snapshot?.driverId
    ? drivers.find((d) => d.id === snapshot.driverId)
    : undefined;
  const dossier = vip
    ? DEMO_VIP_DOSSIERS.find((d) => d.vipId === vip.id)
    : undefined;

  return (
    <Dialog
      open={Boolean(vip)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="sm"
      elevated
      title={
        <span className="flex items-center gap-2">
          <Crown className="size-4 text-gold-500" aria-hidden />
          {vip ? (isArabic ? vip.nameAr : vip.nameEn) : ""}
        </span>
      }
      description={vip ? (isArabic ? vip.titleAr : vip.titleEn) : undefined}
      closeLabel={isArabic ? "إغلاق" : "Close"}
    >
      {vip ? (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {dossier ? (
              <Badge tone="gold">
                <ShieldCheck className="size-3" aria-hidden />{" "}
                {pick(dossier.clearance, isArabic)}
              </Badge>
            ) : null}
            {snapshot ? (
              <Badge tone="info">
                {pick(RING_LABEL[snapshot.ring], isArabic)}
              </Badge>
            ) : null}
          </div>
          {dossier ? (
            <p className="text-ink-muted">{pick(dossier.protocol, isArabic)}</p>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-xs uppercase tracking-label text-ink-faint">
              {isArabic ? "الكابتن" : "Captain"}
            </dt>
            <dd className="font-semibold text-ink">
              {driver
                ? localizeText(driver.user?.name, isArabic)
                : isArabic
                  ? vip.driverNameAr
                  : vip.driverNameEn}
            </dd>
            <dt className="text-xs uppercase tracking-label text-ink-faint">
              {isArabic ? "المركبة" : "Vehicle"}
            </dt>
            <dd className="font-semibold text-ink">
              {convoy
                ? pick(convoy.vehicle, isArabic)
                : isArabic
                  ? vip.vehicleAr
                  : vip.vehicleEn}{" "}
              <span className="font-tnum text-ink-muted">
                {convoy?.plate ?? vip.plate}
              </span>
            </dd>
            {convoy ? (
              <>
                <dt className="text-xs uppercase tracking-label text-ink-faint">
                  {isArabic ? "المرافقة" : "Escort"}
                </dt>
                <dd className="font-semibold text-ink">
                  {pick(convoy.escort, isArabic)}
                </dd>
              </>
            ) : null}
            <dt className="text-xs uppercase tracking-label text-ink-faint">
              {isArabic ? "الوجهة" : "Destination"}
            </dt>
            <dd className="font-semibold text-ink">
              {isArabic ? vip.hotelAr : vip.hotelEn}
            </dd>
            <dt className="text-xs uppercase tracking-label text-ink-faint">
              {isArabic ? "الرحلة" : "Flight"}
            </dt>
            <dd className="font-tnum font-semibold text-ink" dir="ltr">
              {vip.flight}
            </dd>
            {snapshot?.location ? (
              <>
                <dt className="text-xs uppercase tracking-label text-ink-faint">
                  {isArabic ? "الموقع الآن" : "Now at"}
                </dt>
                <dd className="font-semibold text-ink">
                  {pick(snapshot.location, isArabic)}
                </dd>
              </>
            ) : null}
          </dl>
          {dossier?.rider.length ? (
            <div>
              <div className="text-xs uppercase tracking-label text-ink-faint">
                {isArabic ? "متطلبات الضيافة" : "Hospitality rider"}
              </div>
              <ul className="mt-1.5 space-y-1">
                {dossier.rider.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-ink">
                    <span
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-gold-500"
                      aria-hidden
                    />
                    {pick(item, isArabic)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

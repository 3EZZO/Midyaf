// Compatibility shim over ui/KpiTile keeping the legacy MetricCard props.
import type { ReactNode } from "react";
import { KpiTile } from "./ui/KpiTile";

export function MetricCard({
  label,
  value,
  detail,
  icon,
  onClick
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  return <KpiTile label={label} value={value} format="raw" detail={detail} icon={icon} onClick={onClick} />;
}

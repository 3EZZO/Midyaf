import {
  AlertTriangle,
  Car,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Crown,
  DoorOpen,
  Eye,
  FileCheck2,
  FileText,
  Flame,
  Luggage,
  MapPin,
  Navigation,
  Pause,
  Plane,
  Play,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
  XCircle,
  type LucideIcon
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { statusMeta, type StatusIcon } from "@shared/statusMeta";
import { isArabicLanguage } from "../../lib/localize";
import { cn } from "../../lib/cn";
import { Badge } from "./Badge";

const icons: Record<StatusIcon, LucideIcon> = {
  circle: Circle,
  clock: Clock,
  check: Check,
  "check-circle": CheckCircle2,
  "x-circle": XCircle,
  "alert-triangle": AlertTriangle,
  navigation: Navigation,
  "map-pin": MapPin,
  "user-check": UserCheck,
  pause: Pause,
  play: Play,
  send: Send,
  "file-text": FileText,
  "file-check": FileCheck2,
  sparkles: Sparkles,
  "shield-check": ShieldCheck,
  radio: Radio,
  plane: Plane,
  luggage: Luggage,
  "door-open": DoorOpen,
  car: Car,
  eye: Eye,
  crown: Crown,
  flame: Flame
};

/**
 * Status badge driven entirely by shared/statusMeta.ts. Pass the raw enum
 * value; tone, icon and bilingual label are looked up.
 */
export function StatusPill({
  status,
  size,
  showIcon = true,
  className,
  live
}: {
  status: string | null | undefined;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
  /** Pulse once to acknowledge a live change (attention statuses only). */
  live?: boolean;
}) {
  const { i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const meta = statusMeta(status);
  const Icon = icons[meta.icon];
  return (
    <Badge
      tone={meta.tone}
      size={size}
      className={cn(meta.terminal && "opacity-70", live && meta.attention && "animate-pulse", className)}
    >
      {showIcon ? <Icon className="size-3" aria-hidden /> : null}
      {isArabic ? meta.ar : meta.en}
    </Badge>
  );
}

export function StatusDot({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = statusMeta(status);
  const color = {
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    info: "bg-info",
    neutral: "bg-neutral",
    gold: "bg-gold-500"
  }[meta.tone];
  return (
    <span
      className={cn("inline-block size-2 rounded-full", color, meta.attention && "animate-pulse", className)}
      aria-hidden
    />
  );
}

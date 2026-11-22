import { useId } from "react";
import {
  Compass,
  CheckSquare,
  BarChart3,
  Bot,
  ChevronDown,
  Radar,
  ReceiptText,
  Settings2,
  Navigation
} from "lucide-react";
import { cn } from "../lib/cn";
import { sectionStorageKey, usePersistedCollapse } from "../lib/collapsibleStorage";
import { smoothScrollToSection } from "../lib/navigation";

interface DashboardJumpDockProps {
  isArabic: boolean;
  isDemoMode?: boolean;
}

export function DashboardJumpDock({ isArabic, isDemoMode }: DashboardJumpDockProps) {
  const listId = `jump-dock-${useId().replace(/:/g, "")}`;
  const { collapsed, toggle } = usePersistedCollapse(sectionStorageKey("dashboard-jump-dock"), false);

  const chips = [
    ...(isDemoMode
      ? [
          {
            id: "section-hotspots-radar",
            icon: Radar,
            labelEn: "Live Radar",
            labelAr: "الرادار الحي",
            tone: "amber"
          }
        ]
      : []),
    {
      id: "section-metrics",
      icon: BarChart3,
      labelEn: "KPI Metrics",
      labelAr: "المؤشرات الإحصائية",
      tone: "purple"
    },
    {
      id: "section-tactical-map",
      icon: Compass,
      labelEn: "Tactical Map",
      labelAr: "الخريطة التكتيكية",
      tone: "gold"
    },
    {
      id: "section-task-board",
      icon: CheckSquare,
      labelEn: "Task Board",
      labelAr: "لوحة المهام",
      tone: "blue"
    },
    {
      id: "section-smart-assistant",
      icon: Bot,
      labelEn: "Smart AI",
      labelAr: "المساعد الذكي",
      tone: "purple"
    },
    {
      id: "section-contracts-phases",
      icon: ReceiptText,
      labelEn: "Contracts & Quotes",
      labelAr: "العقود والخطط",
      tone: "gold"
    },
    {
      id: "section-operations-setup",
      icon: Settings2,
      labelEn: "Operations Setup",
      labelAr: "إعداد العمليات",
      tone: "slate"
    }
  ];

  const toggleLabel = collapsed
    ? isArabic
      ? "توسيع شريط الانتقال السريع"
      : "Expand quick jump bar"
    : isArabic
      ? "طي شريط الانتقال السريع"
      : "Collapse quick jump bar";

  return (
    <div
      data-jump-dock-collapsed={collapsed ? "true" : "false"}
      className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-2 px-3 py-2"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={listId}
          aria-label={toggleLabel}
          title={toggleLabel}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg bg-surface-3 px-2.5 py-1 text-xs font-bold text-ink",
            "transition-colors duration-base hover:text-gold-300 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
          )}
        >
          <Navigation className="size-3.5 text-gold-500" aria-hidden />
          <span>{isArabic ? "انتقال سريع" : "Quick Jump"}</span>
          <ChevronDown
            className={cn(
              "size-3.5 text-ink-muted transition-transform duration-base ease-out motion-reduce:transition-none",
              collapsed && "-rotate-90 rtl:rotate-90"
            )}
            aria-hidden
          />
        </button>
        {collapsed ? (
          <span className="text-xs text-ink-faint">
            {isArabic ? `${chips.length} أقسام` : `${chips.length} sections`}
          </span>
        ) : null}
      </div>

      <div
        id={listId}
        aria-hidden={collapsed || undefined}
        className={cn(
          "grid transition-[grid-template-rows,opacity,visibility] duration-base ease-out motion-reduce:transition-none",
          collapsed ? "grid-rows-[0fr] opacity-0 invisible" : "grid-rows-[1fr] opacity-100 visible"
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => {
              const Icon = chip.icon;
              const label = isArabic ? chip.labelAr : chip.labelEn;
              return (
                <button
                  key={chip.id}
                  type="button"
                  title={label}
                  onClick={() => smoothScrollToSection(chip.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-3 py-1.5 text-xs font-semibold text-ink-muted",
                    "transition-colors duration-base hover:border-gold-500/40 hover:bg-surface-3 hover:text-ink",
                    "focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
                  )}
                >
                  <Icon className="size-3.5 shrink-0 text-gold-500" aria-hidden />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

import {
  Compass,
  CheckSquare,
  BarChart3,
  Bot,
  Radar,
  ReceiptText,
  Settings2,
  Navigation
} from "lucide-react";
import { smoothScrollToSection } from "../lib/navigation";

interface DashboardJumpDockProps {
  isArabic: boolean;
  isDemoMode?: boolean;
}

export function DashboardJumpDock({ isArabic, isDemoMode }: DashboardJumpDockProps) {
  const chips = [
    ...(isDemoMode ? [{
      id: "section-hotspots-radar",
      icon: Radar,
      labelEn: "Live Radar",
      labelAr: "الرادار الحي",
      tone: "amber"
    }] : []),
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

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1 px-1 -my-1 scrollbar-none animate-fadeIn">
      <div className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-lg bg-midyaf-purple/10 dark:bg-midyaf-purple/20 text-[11px] font-black text-midyaf-purple dark:text-purple-300">
        <Navigation size={12} className="text-midyaf-gold" />
        <span>{isArabic ? "انتقال سريع:" : "Quick Jump:"}</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {chips.map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => smoothScrollToSection(chip.id)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition-all duration-200 hover:border-midyaf-gold hover:bg-midyaf-gold/10 hover:text-midyaf-purple hover:scale-105 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-midyaf-gold cursor-pointer"
            >
              <Icon size={13} className="text-midyaf-gold shrink-0" />
              <span>{isArabic ? chip.labelAr : chip.labelEn}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

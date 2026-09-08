import {
  ClipboardList,
  Hotel,
  Coins,
  Cpu,
  FileSignature,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { smoothScrollToSection } from "../lib/navigation";

interface IntakeWorkflowStepperProps {
  isArabic: boolean;
  isPlanApproved: boolean;
  hasCoreData: boolean;
  hasHotelData: boolean;
  hasGuestCsv: boolean;
  onApprovePlan?: () => void;
}

export function IntakeWorkflowStepper({
  isArabic,
  isPlanApproved,
  hasCoreData,
  hasHotelData,
  hasGuestCsv
}: IntakeWorkflowStepperProps) {
  const steps = [
    {
      id: "section-intake-core",
      num: "1",
      titleEn: "Event & Venues",
      titleAr: "بيانات الفعالية والمواقع",
      descEn: "Name, places, visitor count",
      descAr: "الاسم، المواقع، عدد الحضور",
      icon: ClipboardList,
      status: hasCoreData ? "completed" : "active"
    },
    {
      id: "section-intake-hotels",
      num: "2",
      titleEn: "Guests & Hotels",
      titleAr: "الضيوف، الفندق والتأجير",
      descEn: "CSV upload, rooms & rentals",
      descAr: "قائمة CSV، الغرف وتأجير السيارات",
      icon: Hotel,
      status: hasGuestCsv || hasHotelData ? "completed" : "ready"
    },
    {
      id: "section-price-ranges",
      num: "3",
      titleEn: "Supplier Rates",
      titleAr: "نطاقات أسعار الموردين",
      descEn: "Market bands & price caps",
      descAr: "حدود الأسعار للفئات الـ 8",
      icon: Coins,
      status: "ready"
    },
    {
      id: "section-ai-plan",
      num: "4",
      titleEn: "AI Logistics Plan",
      titleAr: "الخطة اللوجستية الذكية",
      descEn: "Quotas, fleet & approval",
      descAr: "توزيع الحصص والأسطول",
      icon: Cpu,
      status: isPlanApproved ? "completed" : "active"
    },
    {
      id: "section-supplier-contracts",
      num: "5",
      titleEn: "Supplier Contracts",
      titleAr: "عقود الموردين الـ 8",
      descEn: "8-category workflow",
      descAr: "التفاوض وتوقيع الاتفاقيات",
      icon: FileSignature,
      status: isPlanApproved ? "ready" : "locked"
    }
  ];

  return (
    <div className="rounded-2xl border border-midyaf-gold/25 bg-gradient-to-r from-white via-slate-50 to-white p-4 shadow-luxury dark:from-slate-900 dark:via-slate-800/80 dark:to-slate-900 animate-fadeInDown">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-lg bg-midyaf-gold/20 text-midyaf-gold font-black text-xs">
            <Sparkles size={13} />
          </span>
          <h3 className="text-xs font-black tracking-wide text-midyaf-purple dark:text-white uppercase">
            {isArabic ? "مسار العمل اللوجستي الذكي (مراحل الإدخال والاعتماد)" : "Interactive Logistics Workflow Stepper"}
          </h3>
        </div>
        <span className="text-[11px] text-slate-400 font-medium">
          {isArabic ? "اضغط على أي مرحلة للانتقال السريع لها" : "Click any step to smoothly jump to its section"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = step.status === "completed";
          const isLocked = step.status === "locked";
          const isActive = step.status === "active";

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => smoothScrollToSection(step.id)}
              className={`group relative flex items-center gap-3 rounded-xl p-2.5 text-start transition-all duration-200 cursor-pointer ${
                isCompleted
                  ? "bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/15"
                  : isActive
                  ? "bg-midyaf-purple/10 border border-midyaf-purple/30 shadow-glow-purple/20 hover:bg-midyaf-purple/15"
                  : isLocked
                  ? "bg-slate-100/70 border border-dashed border-slate-200 opacity-70 hover:opacity-100 dark:bg-slate-800/40 dark:border-slate-700"
                  : "bg-white border border-slate-200/80 hover:border-midyaf-gold/50 hover:bg-midyaf-gold/5 dark:bg-slate-800 dark:border-slate-700"
              }`}
            >
              <div
                className={`grid size-9 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-105 ${
                  isCompleted
                    ? "bg-emerald-600 text-white shadow-xs"
                    : isActive
                    ? "bg-midyaf-purple text-midyaf-gold shadow-xs"
                    : isLocked
                    ? "bg-slate-200 text-slate-400 dark:bg-slate-700"
                    : "bg-midyaf-gold/15 text-midyaf-gold dark:bg-midyaf-gold/20"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 size={16} />
                ) : isLocked ? (
                  <Lock size={15} />
                ) : (
                  <Icon size={16} />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black text-slate-400">
                    {step.num}.
                  </span>
                  <p className="text-xs font-black text-midyaf-ink dark:text-white truncate">
                    {isArabic ? step.titleAr : step.titleEn}
                  </p>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {isArabic ? step.descAr : step.descEn}
                </p>
              </div>

              {idx < steps.length - 1 && (
                <ArrowRight
                  size={12}
                  className={`hidden lg:block absolute -end-2 text-slate-300 dark:text-slate-600 z-10 ${
                    isArabic ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { ArrowLeft, ArrowRight, Check, CircleDot } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./ui";

export type LifecycleStageId = "intake" | "plan" | "approval" | "rfq" | "ops";
export type LifecycleStageState = "done" | "active" | "upcoming";

export interface LifecycleStage {
  id: LifecycleStageId;
  step: number;
  state: LifecycleStageState;
  labelEn: string;
  labelAr: string;
}

export interface EventLifecycleSummary {
  currentIndex: number;
  stages: LifecycleStage[];
  nextHintEn: string;
  nextHintAr: string;
  actionLabelEn?: string;
  actionLabelAr?: string;
  actionTab?: "plan" | "vendors" | "radar";
}

export interface EventLifecycleInput {
  planApproved: boolean;
  contractSigned?: boolean;
  operationalStatus?: string;
  /** False only when we explicitly know no plan draft exists yet. */
  hasPlan?: boolean;
}

const STAGE_DEFS: Array<{ id: LifecycleStageId; labelEn: string; labelAr: string }> = [
  { id: "intake", labelEn: "Intake", labelAr: "الإدخال" },
  { id: "plan", labelEn: "AI Plan", labelAr: "خطة الذكاء" },
  { id: "approval", labelEn: "Client Approval", labelAr: "اعتماد العميل" },
  { id: "rfq", labelEn: "Vendor RFQ & Vault", labelAr: "الموردون والخزنة" },
  { id: "ops", labelEn: "Live Ops", labelAr: "التشغيل المباشر" }
];

/**
 * Pure 5-stage lifecycle derivation grounded strictly in the event's persisted flags.
 */
export function deriveEventLifecycle(input: EventLifecycleInput): EventLifecycleSummary {
  const status = (input.operationalStatus ?? "PLANNING").toUpperCase();

  let currentIndex: number;
  let allDone = false;
  let nextHintEn: string;
  let nextHintAr: string;
  let actionLabelEn: string | undefined;
  let actionLabelAr: string | undefined;
  let actionTab: "plan" | "vendors" | "radar" | undefined;

  if (status === "COMPLETED") {
    currentIndex = 4;
    allDone = true;
    nextHintEn = "Event completed — review final operational radar & logs.";
    nextHintAr = "اكتملت الفعالية — راجع سجل التشغيل والرادار الختامي.";
    actionLabelEn = "View radar";
    actionLabelAr = "عرض الرادار";
    actionTab = "radar";
  } else if (!input.planApproved) {
    if (input.hasPlan === false) {
      currentIndex = 1;
      nextHintEn = "Next: generate or edit the operational plan proposal.";
      nextHintAr = "التالي: توليد أو تعديل مقترح الخطة التشغيلية.";
      actionLabelEn = "Open plan";
      actionLabelAr = "فتح الخطة";
      actionTab = "plan";
    } else {
      currentIndex = 2;
      nextHintEn = "Next: approve the operational plan to unlock vendors & field ops.";
      nextHintAr = "التالي: اعتماد الخطة التشغيلية لفتح الموردين والتشغيل الميداني.";
      actionLabelEn = "Review & approve plan";
      actionLabelAr = "مراجعة واعتماد الخطة";
      actionTab = "plan";
    }
  } else if (!input.contractSigned && status === "PLANNING") {
    currentIndex = 3;
    nextHintEn = "Next: collect sealed supplier quotes, open the vault, and sign the contract.";
    nextHintAr = "التالي: استلام عروض الموردين المختومة، فتح الخزنة، وتوقيع العقد.";
    actionLabelEn = "Open vendors";
    actionLabelAr = "فتح الموردين";
    actionTab = "vendors";
  } else {
    currentIndex = 4;
    nextHintEn = "Operations active — monitor VIP convoys, arrivals, and geofence rings live.";
    nextHintAr = "التشغيل المباشر نشط — تابع المواكب والوصول وحلقات النطاق الجغرافي لحظياً.";
    actionLabelEn = "Open radar";
    actionLabelAr = "فتح الرادار";
    actionTab = "radar";
  }

  const stages: LifecycleStage[] = STAGE_DEFS.map((def, idx) => ({
    ...def,
    step: idx + 1,
    state: allDone
      ? "done"
      : idx < currentIndex
        ? "done"
        : idx === currentIndex
          ? "active"
          : "upcoming"
  }));

  return {
    currentIndex,
    stages,
    nextHintEn,
    nextHintAr,
    actionLabelEn,
    actionLabelAr,
    actionTab
  };
}

export function EventLifecycleRail({
  planApproved,
  contractSigned,
  operationalStatus,
  hasPlan,
  isArabic,
  compact = false,
  onNavigateTab,
  className
}: EventLifecycleInput & {
  isArabic: boolean;
  compact?: boolean;
  onNavigateTab?: (tab: "plan" | "vendors" | "radar") => void;
  className?: string;
}) {
  const summary = deriveEventLifecycle({
    planApproved,
    contractSigned,
    operationalStatus,
    hasPlan
  });
  const DirectionArrow = isArabic ? ArrowLeft : ArrowRight;

  if (compact) {
    return (
      <div
        data-lifecycle-rail="compact"
        data-lifecycle-stage={summary.stages[summary.currentIndex]?.id}
        className={cn("space-y-1.5 pt-1", className)}
      >
        <ol
          aria-label={isArabic ? "مراحل دورة الفعالية" : "Event lifecycle stages"}
          className="grid grid-cols-5 gap-1"
        >
          {summary.stages.map((stage) => (
            <li
              key={stage.id}
              data-stage-state={stage.state}
              title={`${stage.step}. ${isArabic ? stage.labelAr : stage.labelEn}`}
              className="min-w-0"
            >
              <span
                className={cn(
                  "block h-1.5 w-full rounded-full transition-colors",
                  stage.state === "done"
                    ? "bg-ok"
                    : stage.state === "active"
                      ? "bg-gold-500"
                      : "bg-surface-3"
                )}
              />
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
          <span className="font-semibold text-gold-300">
            {summary.currentIndex + 1}/5 ·{" "}
            {isArabic
              ? summary.stages[summary.currentIndex]?.labelAr
              : summary.stages[summary.currentIndex]?.labelEn}
          </span>
          <span className="truncate text-ink-muted">
            {isArabic ? summary.nextHintAr : summary.nextHintEn}
          </span>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label={isArabic ? "مسار دورة الفعالية" : "Event lifecycle progress"}
      data-lifecycle-rail="full"
      data-lifecycle-stage={summary.stages[summary.currentIndex]?.id}
      className={cn(
        "rounded-xl border border-gold-500/25 bg-surface-2 p-3.5 sm:p-4",
        className
      )}
    >
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {summary.stages.map((stage) => {
          const isDone = stage.state === "done";
          const isActive = stage.state === "active";
          return (
            <li
              key={stage.id}
              data-lifecycle-step={stage.id}
              data-stage-state={stage.state}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors",
                isActive
                  ? "border-gold-500/60 bg-gold-500/15 text-gold-300"
                  : isDone
                    ? "border-ok/35 bg-ok/10 text-ok"
                    : "border-hairline bg-surface-1 text-ink-faint"
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full font-tnum text-xs font-bold",
                  isActive
                    ? "bg-gold-500 text-surface-0"
                    : isDone
                      ? "bg-ok/20 text-ok"
                      : "bg-surface-3 text-ink-muted"
                )}
                aria-hidden
              >
                {isDone ? (
                  <Check className="size-3.5" strokeWidth={2.5} />
                ) : isActive ? (
                  <CircleDot className="size-3.5" strokeWidth={2.2} />
                ) : (
                  stage.step
                )}
              </span>
              <span className="min-w-0 truncate font-semibold">
                {stage.step}. {isArabic ? stage.labelAr : stage.labelEn}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2.5 text-xs">
        <p className="min-w-0 text-ink-muted">
          {isArabic ? summary.nextHintAr : summary.nextHintEn}
        </p>
        {onNavigateTab && summary.actionTab && summary.actionLabelEn ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            trailingIcon={<DirectionArrow className="size-3.5" aria-hidden />}
            onClick={() => onNavigateTab(summary.actionTab!)}
          >
            {isArabic ? summary.actionLabelAr : summary.actionLabelEn}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

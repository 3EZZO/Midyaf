// AI plan phase timeline.
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { useState } from "react";
import { Badge } from "../../components/Badge";
import { Section } from "../../components/Section";
import type { PortalProps } from "../types";
import { emptyAiPlan, useOpsText } from "./shared";

export function PlanPhases({
  data,
  canManage = false,
  onConfirmAiPlan
}: Pick<PortalProps, "data"> & {
  canManage?: boolean;
  onConfirmAiPlan?: PortalProps["confirmAiPlan"];
}) {
  const ui = useOpsText();
  const plan = data.aiPlans[0];
  const safePlan = plan ?? emptyAiPlan;
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleConfirmPlan() {
    if (!onConfirmAiPlan || !plan) {
      return;
    }

    setIsConfirming(true);
    try {
      await onConfirmAiPlan(plan.id);
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <Section title={ui.l("AI plan phases")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-midyaf-pearl p-3">
        <Badge tone={safePlan.confirmed ? "green" : "gold"}>
          {safePlan.confirmed
            ? ui.l("Plan confirmed")
            : ui.l("Awaiting confirmation")}
        </Badge>
        {plan && canManage && !safePlan.confirmed ? (
          <button
            onClick={() => void handleConfirmPlan()}
            disabled={isConfirming}
            className="btn-primary rounded-xl px-3 py-2 text-xs"
          >
            {isConfirming ? ui.l("Saving") : ui.l("Confirm AI plan")}
          </button>
        ) : null}
      </div>
      <div className="space-y-3">
        {safePlan.phases.map((phase) => (
          <div key={phase.name} className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-slate-900 dark:text-white">{ui.l(phase.name)}</p>
              <Badge tone={phase.status === "CONFIRMED" ? "green" : "purple"}>
                {ui.l(phase.status)}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {ui.l(phase.owner)} · {ui.l("Deadline")} {ui.date(phase.deadline)}{" "}
              {ui.time(phase.deadline)}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

import { useId, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Eye, FileCheck, RefreshCw } from "lucide-react";
import type { Session } from "@shared/domain";
import type { PlanApprovalQueueItem, PlanApprovalQueueResponse } from "@shared/overhaul";
import { planProvenanceLabel } from "@shared/planEditing";
import { cn } from "../lib/cn";
import { shortDate } from "../lib/format";
import { useWorkspaceResource, workspaceRequest } from "../lib/workspaceApi";
import { approvePlan, planSections, type PlanSection } from "../lib/workspaceWorkflow";
import { Badge, Button, EmptyState, Section, StatusPill, Surface, useToast } from "./ui";

const PLAN_SECTION_LABELS: Record<PlanSection, { en: string; ar: string }> = {
  logistics: { en: "Logistics plan", ar: "الخطة اللوجستية" },
  hotelDistribution: { en: "Hotel distribution", ar: "توزيع الفنادق" },
  vehicleRequirements: { en: "Vehicle requirements", ar: "احتياج السيارات" },
  teamRequirements: { en: "Team requirements", ar: "احتياج الفرق" },
  scopeOfWork: { en: "Scope of work", ar: "نطاق العمل" }
};

/** Whether a queue item may display the one-click Approve action. */
export function canApproveQueueItem(item: PlanApprovalQueueItem): boolean {
  return item.plan.status === "DRAFT" && item.plan.viewerCanApprove === true;
}

/** Suppliers never receive or act on plan approvals. */
export function canShowApprovalQueue(session: Session | null | undefined): boolean {
  return Boolean(session?.accessToken && session.user.role !== "SUPPLIER");
}

function PlanPreviewValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>—</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span>—</span>;
    return (
      <ul className="space-y-1">
        {value.map((entry, idx) => (
          <li key={idx} className="rounded border border-hairline bg-surface-2 px-2 py-1">
            <PlanPreviewValue value={entry} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <dl className="space-y-1">
        {Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
          <div key={key} className="flex flex-wrap gap-1.5">
            <dt className="text-ink-muted">{key.replace(/([A-Z])/g, " $1")}:</dt>
            <dd className="text-ink">
              <PlanPreviewValue value={entry} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}

export function PlanApprovalQueueView({
  items,
  loading = false,
  error,
  approvingPlanId = null,
  isArabic,
  onApprove,
  onRefresh,
  sectionId = "section-plans-awaiting-approval"
}: {
  items: PlanApprovalQueueItem[];
  loading?: boolean;
  error?: string;
  approvingPlanId?: string | null;
  isArabic: boolean;
  onApprove?: (item: PlanApprovalQueueItem) => void;
  onRefresh?: () => void;
  sectionId?: string;
}) {
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const idPrefix = useId().replace(/:/g, "");

  return (
    <Section
      id={sectionId}
      title={isArabic ? "خطط بانتظار الاعتماد" : "Plans awaiting approval"}
      eyebrow={isArabic ? "اعتماد بضغطة واحدة" : "One-click approval"}
      description={
        isArabic
          ? "راجع ملخص الخطة وتفاصيلها ثم اعتمدها مباشرة لبدء التشغيل."
          : "Review each plan summary and details, then approve in one click to unlock operations."
      }
      isArabic={isArabic}
      action={
        <div className="flex items-center gap-2">
          {items.length > 0 ? (
            <Badge tone="warn" size="sm" data-approval-queue-count={items.length}>
              {items.length}
            </Badge>
          ) : null}
          {onRefresh ? (
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<RefreshCw className="size-3.5" aria-hidden />}
              onClick={onRefresh}
            >
              {isArabic ? "تحديث" : "Refresh"}
            </Button>
          ) : null}
        </div>
      }
    >
      {error ? (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      ) : loading ? (
        <p role="status" className="text-sm text-ink-muted">
          {isArabic ? "جارٍ تحميل الخطط بانتظار الاعتماد…" : "Loading plans awaiting approval…"}
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={<FileCheck className="size-5" aria-hidden />}
          title={isArabic ? "لا توجد خطط بانتظار الاعتماد حالياً" : "No plans awaiting approval"}
          description={
            isArabic
              ? "عند جاهزية أي خطة لمراجعتك ستظهر هنا للاعتماد المباشر."
              : "When a plan is ready for your review, it will appear here for one-click approval."
          }
        />
      ) : (
        <ul className="space-y-3" data-approval-queue-list>
          {items.map((item) => {
            const { event, plan } = item;
            const approvable = canApproveQueueItem(item);
            const expanded = expandedPlanId === plan.id;
            const detailsId = `${idPrefix}-plan-${plan.id}`;
            const provenance = planProvenanceLabel(plan, isArabic);
            const busy = approvingPlanId === plan.id;
            const sections = planSections(plan.content);

            return (
              <li key={`${event.id}:${plan.id}`}>
                <Surface
                  padding="sm"
                  tone="warn"
                  data-approval-queue-item={plan.id}
                  className="space-y-3"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-ink">{event.name}</h3>
                        <Badge tone="gold" size="sm" data-plan-provenance>
                          {provenance}
                        </Badge>
                        <Badge tone="neutral" size="sm">
                          {isArabic ? `إصدار ${plan.version}` : `v${plan.version}`}
                        </Badge>
                        <StatusPill status={event.operationalStatus} size="sm" />
                      </div>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        {event.organizationName ? <span>{event.organizationName}</span> : null}
                        {event.startAt ? (
                          <span className="inline-flex items-center gap-1 font-tnum">
                            <CalendarDays className="size-3.5 text-gold-500" aria-hidden />
                            {shortDate(event.startAt, isArabic ? "ar" : "en")}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-expanded={expanded}
                        aria-controls={detailsId}
                        leadingIcon={<Eye className="size-4" aria-hidden />}
                        trailingIcon={
                          <ChevronDown
                            className={cn(
                              "size-3.5 transition-transform duration-base motion-reduce:transition-none",
                              expanded && "rotate-180"
                            )}
                            aria-hidden
                          />
                        }
                        onClick={() => setExpandedPlanId(expanded ? null : plan.id)}
                      >
                        {expanded
                          ? isArabic
                            ? "إخفاء الخطة"
                            : "Hide plan"
                          : isArabic
                            ? "عرض الخطة"
                            : "View plan"}
                      </Button>

                      {approvable && onApprove ? (
                        <Button
                          size="sm"
                          variant="gold"
                          loading={busy}
                          disabled={Boolean(approvingPlanId)}
                          leadingIcon={<CheckCircle2 className="size-4" aria-hidden />}
                          data-approve-plan={plan.id}
                          onClick={() => onApprove(item)}
                        >
                          {isArabic ? "اعتماد الخطة" : "Approve"}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <p className="rounded-lg border border-hairline bg-surface-1 p-3 text-sm leading-relaxed text-ink-muted">
                    {plan.summary}
                  </p>

                  <div
                    id={detailsId}
                    aria-hidden={!expanded || undefined}
                    className={cn(
                      "grid transition-[grid-template-rows,opacity,visibility] duration-base ease-out motion-reduce:transition-none",
                      expanded ? "grid-rows-[1fr] opacity-100 visible" : "grid-rows-[0fr] opacity-0 invisible"
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="grid gap-3 pt-1 md:grid-cols-2">
                        {sections.map(({ key, value }) => (
                          <div
                            key={key}
                            data-plan-preview-section={key}
                            className="rounded-lg border border-hairline bg-surface-1 p-3 text-xs"
                          >
                            <h4 className="mb-1.5 font-semibold text-gold-300">
                              {isArabic ? PLAN_SECTION_LABELS[key].ar : PLAN_SECTION_LABELS[key].en}
                            </h4>
                            <PlanPreviewValue value={value} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Surface>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/**
 * Connected client/admin queue backed by GET /api/workspace/plans/awaiting-approval
 * and POST /api/workspace/events/:eventId/plans/:planId/approve.
 */
export function PlanApprovalQueue({
  session,
  isArabic,
  onApproved,
  sectionId
}: {
  session?: Session | null;
  isArabic: boolean;
  onApproved?: () => void;
  sectionId?: string;
}) {
  const toast = useToast();
  const [revision, setRevision] = useState(0);
  const [approvingPlanId, setApprovingPlanId] = useState<string | null>(null);
  const enabled = canShowApprovalQueue(session);

  const resource = useWorkspaceResource<PlanApprovalQueueResponse>(
    session?.accessToken ?? "",
    enabled ? "/plans/awaiting-approval" : null,
    revision,
    "/workspace",
    true
  );

  if (!enabled) return null;

  const items = resource.data?.items ?? [];

  async function handleApprove(item: PlanApprovalQueueItem) {
    if (!session?.accessToken || !canApproveQueueItem(item)) return;
    setApprovingPlanId(item.plan.id);
    try {
      await approvePlan(
        (path, body, method) => workspaceRequest(session.accessToken, path, body, method),
        item.event.id,
        item.plan.id
      );
      toast.success(
        isArabic ? "تم اعتماد الخطة بنجاح" : "Plan approved",
        isArabic
          ? `تم اعتماد خطة «${item.event.name}» وفتح التشغيل.`
          : `Approved plan for “${item.event.name}” and unlocked operations.`
      );
      setRevision((n) => n + 1);
      onApproved?.();
    } catch (err) {
      toast.alert(
        isArabic ? "تعذر اعتماد الخطة" : "Could not approve plan",
        err instanceof Error ? err.message : isArabic ? "حدث خطأ غير متوقع" : "Unexpected error"
      );
    } finally {
      setApprovingPlanId(null);
    }
  }

  return (
    <PlanApprovalQueueView
      items={items}
      loading={!resource.data && !resource.error}
      error={resource.error}
      approvingPlanId={approvingPlanId}
      isArabic={isArabic}
      onApprove={(item) => void handleApprove(item)}
      onRefresh={() => setRevision((n) => n + 1)}
      sectionId={sectionId}
    />
  );
}

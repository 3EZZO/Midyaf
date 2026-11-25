import { useEffect, useId, useRef, useState } from "react";
import {
  BedDouble,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileCheck,
  RefreshCw,
  ShieldCheck,
  Users
} from "lucide-react";
import type { Session } from "@shared/domain";
import type { PlanApprovalQueueItem, PlanApprovalQueueResponse } from "@shared/overhaul";
import { planProvenanceLabel } from "@shared/planEditing";
import { cn } from "../lib/cn";
import { shortDate } from "../lib/format";
import { localizeDemoText } from "../lib/localizeDemo";
import { useWorkspaceResource, workspaceRequest } from "../lib/workspaceApi";
import { approvePlan, planSections, type PlanSection } from "../lib/workspaceWorkflow";
import "../styles/signature.css";
import { Badge, Button, EmptyState, Section, StatusPill, Surface, useToast } from "./ui";

const PLAN_SECTION_LABELS: Record<PlanSection, { en: string; ar: string }> = {
  logistics: { en: "Logistics plan", ar: "الخطة اللوجستية" },
  hotelDistribution: { en: "Hotel distribution", ar: "توزيع الفنادق" },
  vehicleRequirements: { en: "Vehicle requirements", ar: "احتياج السيارات" },
  teamRequirements: { en: "Team requirements", ar: "احتياج الفرق" },
  scopeOfWork: { en: "Scope of work", ar: "نطاق العمل" }
};

/** Total hold time so investors clearly read the circular ceremonial stamp before the queue refreshes. */
export const APPROVAL_SEAL_MS = 1200;
/** Hold time under prefers-reduced-motion (static stamp, then refresh). */
export const APPROVAL_SEAL_REDUCED_MS = 600;

/** Whether a queue item may display the one-click Approve action. */
export function canApproveQueueItem(item: PlanApprovalQueueItem): boolean {
  return item.plan.status === "DRAFT" && item.plan.viewerCanApprove === true;
}

/** Suppliers never receive or act on plan approvals. */
export function canShowApprovalQueue(session: Session | null | undefined): boolean {
  return Boolean(session?.accessToken && session.user.role !== "SUPPLIER");
}

export type PlanKeyFigure = {
  id: "rooms" | "vehicles" | "teams";
  labelEn: string;
  labelAr: string;
  value: number;
  detailEn?: string;
  detailAr?: string;
};

/** Derives a compact, factual executive strip from the plan JSON (no invented values). */
export function extractPlanKeyFigures(content: unknown): PlanKeyFigure[] {
  if (!content || typeof content !== "object") return [];
  const obj = content as Record<string, unknown>;
  const figures: PlanKeyFigure[] = [];

  if (obj.hotelDistribution && typeof obj.hotelDistribution === "object") {
    const h = obj.hotelDistribution as Record<string, unknown>;
    const vip = typeof h.vipSingleRooms === "number" ? h.vipSingleRooms : 0;
    const reg = typeof h.regularTwinRooms === "number" ? h.regularTwinRooms : 0;
    const total = vip + reg;
    if (total > 0) {
      figures.push({
        id: "rooms",
        labelEn: "Hotel rooms",
        labelAr: "غرف الفنادق",
        value: total,
        detailEn: vip > 0 ? `${vip} VIP` : undefined,
        detailAr: vip > 0 ? `${vip} VIP` : undefined
      });
    }
  }

  if (obj.vehicleRequirements && typeof obj.vehicleRequirements === "object") {
    const v = obj.vehicleRequirements as Record<string, unknown>;
    const vip = typeof v.vip === "number" ? v.vip : 0;
    const shuttle = typeof v.shuttle === "number" ? v.shuttle : 0;
    const total = vip + shuttle;
    if (total > 0) {
      figures.push({
        id: "vehicles",
        labelEn: "Fleet vehicles",
        labelAr: "مركبات الأسطول",
        value: total,
        detailEn: vip > 0 ? `${vip} VIP` : undefined,
        detailAr: vip > 0 ? `${vip} VIP` : undefined
      });
    }
  }

  if (Array.isArray(obj.teamRequirements) && obj.teamRequirements.length > 0) {
    const staff = obj.teamRequirements.reduce<number>((sum, item) => {
      if (item && typeof item === "object" && typeof (item as Record<string, unknown>).minimumPeople === "number") {
        return sum + ((item as Record<string, unknown>).minimumPeople as number);
      }
      return sum;
    }, 0);
    if (staff > 0) {
      figures.push({
        id: "teams",
        labelEn: "Field staff",
        labelAr: "الكوادر الميدانية",
        value: staff,
        detailEn: `${obj.teamRequirements.length} teams`,
        detailAr: `${obj.teamRequirements.length} فرق`
      });
    }
  }

  return figures;
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
  sealedPlanId = null,
  isArabic,
  onApprove,
  onRefresh,
  sectionId = "section-plans-awaiting-approval"
}: {
  items: PlanApprovalQueueItem[];
  loading?: boolean;
  error?: string;
  approvingPlanId?: string | null;
  /** Plan currently displaying the 450ms brass->emerald ceremonial approval seal. */
  sealedPlanId?: string | null;
  isArabic: boolean;
  onApprove?: (item: PlanApprovalQueueItem) => void;
  onRefresh?: () => void;
  sectionId?: string;
}) {
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const idPrefix = useId().replace(/:/g, "");
  const stampRef = useRef<HTMLDivElement | null>(null);

  // On narrow screens the figure tiles wrap, so the card grows and its
  // lower-end stamp can sit behind the mobile dock. Bring it into view once
  // per approval; scroll-margin keeps it clear of the dock.
  useEffect(() => {
    if (!sealedPlanId) return;
    const reducedMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    stampRef.current?.scrollIntoView?.({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [sealedPlanId]);

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
            <Badge tone="gold" size="sm" data-approval-queue-count={items.length}>
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
            const sealed = sealedPlanId === plan.id;
            const sections = planSections(plan.content);
            const keyFigures = extractPlanKeyFigures(plan.content);

            return (
              <li key={`${event.id}:${plan.id}`}>
                <Surface
                  padding="none"
                  tone={sealed ? "ok" : "gold"}
                  focal={!sealed}
                  data-approval-queue-item={plan.id}
                  data-approval-sealed={sealed ? "true" : undefined}
                  className={cn(
                    "relative overflow-hidden border transition-colors duration-base motion-reduce:transition-none",
                    sealed
                      ? "qasr-approval-sealed-card border-ok/75"
                      : "border-gold-500/35"
                  )}
                >
                  {/* Circular ceremonial stamp (136px) over the lower-end corner so the green status pill stays unobstructed */}
                  {sealed ? (
                    <div
                      aria-hidden="true"
                      ref={stampRef}
                      data-approval-stamp={plan.id}
                      className="qasr-approval-circular-stamp pointer-events-none absolute bottom-3 end-4 z-10 grid size-[136px] scroll-mb-24 place-items-center rounded-full p-2.5 text-center sm:end-6"
                    >
                      <div className="flex size-full flex-col items-center justify-center rounded-full border border-dashed border-current/70 px-2">
                        <span className="font-display text-2xl font-bold leading-none">
                          معتمد
                        </span>
                        <span
                          dir="ltr"
                          className="mt-1.5 text-xs font-bold uppercase tracking-label"
                        >
                          APPROVED
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-3 p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-ink">{localizeDemoText(event.name, isArabic)}</h3>
                          <Badge tone="gold" size="sm" data-plan-provenance>
                            {provenance}
                          </Badge>
                          <Badge tone="neutral" size="sm">
                            {isArabic ? `إصدار ${plan.version}` : `v${plan.version}`}
                          </Badge>
                          <StatusPill status={event.operationalStatus} size="sm" />
                        </div>
                        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                          {event.organizationName ? <span>{localizeDemoText(event.organizationName, isArabic)}</span> : null}
                          {event.startAt ? (
                            <span className="inline-flex items-center gap-1 font-tnum">
                              <CalendarDays className="size-3.5 text-gold-500" aria-hidden />
                              {shortDate(event.startAt, isArabic ? "ar" : "en")}
                            </span>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {sealed ? (
                          <span
                            role="status"
                            data-approval-seal-badge={plan.id}
                            className="qasr-approval-seal-badge inline-flex items-center gap-1.5 rounded-lg border border-ok/60 bg-ok/15 px-3 py-1.5 text-xs font-bold text-ok"
                          >
                            <ShieldCheck className="size-4 shrink-0" aria-hidden />
                            {isArabic ? "تم الاعتماد · جارٍ فتح التشغيل" : "Approved · Unlocking ops"}
                          </span>
                        ) : (
                          <>
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
                                disabled={Boolean(approvingPlanId || sealedPlanId)}
                                leadingIcon={<CheckCircle2 className="size-4" aria-hidden />}
                                data-approve-plan={plan.id}
                                onClick={() => onApprove(item)}
                              >
                                {isArabic ? "اعتماد الخطة" : "Approve"}
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Executive key-figure strip derived directly from the plan content */}
                    {keyFigures.length > 0 ? (
                      <ul
                        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                        data-approval-key-figures
                      >
                        {keyFigures.map((fig) => {
                          const Icon = fig.id === "rooms" ? BedDouble : fig.id === "vehicles" ? Car : Users;
                          return (
                            <li
                              key={fig.id}
                              className="flex items-center gap-2.5 rounded-lg border border-hairline bg-surface-1/90 px-3 py-2"
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-md border border-hairline bg-surface-2 text-gold-500">
                                <Icon className="size-4" strokeWidth={1.6} aria-hidden />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-xs text-ink-muted">
                                  {isArabic ? fig.labelAr : fig.labelEn}
                                </p>
                                <p className="flex items-baseline gap-1.5 font-tnum text-sm font-bold text-ink">
                                  <span>{fig.value}</span>
                                  {fig.detailEn ? (
                                    <span className="text-xs font-medium text-gold-300">
                                      {isArabic ? fig.detailAr : fig.detailEn}
                                    </span>
                                  ) : null}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}

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
 * Plays a 450ms brass->emerald approval seal (skipped under prefers-reduced-motion)
 * before refreshing the queue.
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
  const [sealedPlanId, setSealedPlanId] = useState<string | null>(null);
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
      setApprovingPlanId(null);
      setSealedPlanId(item.plan.id);

      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const holdMs = reducedMotion ? APPROVAL_SEAL_REDUCED_MS : APPROVAL_SEAL_MS;
      await new Promise((resolve) => window.setTimeout(resolve, holdMs));

      toast.success(
        isArabic ? "تم اعتماد الخطة بنجاح" : "Plan approved",
        isArabic
          ? `تم اعتماد خطة «${item.event.name}» وفتح التشغيل.`
          : `Approved plan for “${item.event.name}” and unlocked operations.`
      );
      setSealedPlanId(null);
      setRevision((n) => n + 1);
      onApproved?.();
    } catch (err) {
      toast.alert(
        isArabic ? "تعذر اعتماد الخطة" : "Could not approve plan",
        err instanceof Error ? err.message : isArabic ? "حدث خطأ غير متوقع" : "Unexpected error"
      );
      setApprovingPlanId(null);
      setSealedPlanId(null);
    }
  }

  return (
    <PlanApprovalQueueView
      items={items}
      loading={!resource.data && !resource.error}
      error={resource.error}
      approvingPlanId={approvingPlanId}
      sealedPlanId={sealedPlanId}
      isArabic={isArabic}
      onApprove={(item) => void handleApprove(item)}
      onRefresh={() => setRevision((n) => n + 1)}
      sectionId={sectionId}
    />
  );
}

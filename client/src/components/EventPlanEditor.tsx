import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Pencil, Plus, Save, Send, Trash2, X } from "lucide-react";
import {
  EVENT_SUBTEAMS,
  rfqDraftFromPlanContent,
  rfqDraftText,
  type EventPlanDto,
  type EventSubteam,
  type RfqDraftDto,
  type WorkspaceEventDto
} from "@shared/overhaul";
import {
  editablePlanFromContent,
  editablePlanSchema,
  planProvenanceLabel,
  type EditablePlan,
  type EditablePlanInput,
  type PlanEditResponse
} from "@shared/planEditing";
import { ApiError } from "../lib/api";
import { Section } from "./Section";
import { workspaceButton, workspaceInput, type WorkspaceProps } from "./OrganizerWorkspace";
import { useWorkspaceResource, workspaceRequest } from "../lib/workspaceApi";
import { approvePlan, canViewRfq, generateAdvisoryPlan, planSections, type PlanSection } from "../lib/workspaceWorkflow";
import { Badge, Button, useToast } from "./ui";

export type RfqSupplierRequestDto = {
  intakeId: string;
  reference: string;
  status: string;
  sentAt: string;
};

export type RfqDispatchResponse = {
  supplierRequest: RfqSupplierRequestDto | null;
};

export type RfqSendResponse = {
  supplierRequest: RfqSupplierRequestDto;
  created: boolean;
  notifiedSuppliers: number;
};

/** Friendly bilingual error messages for POST /api/workspace/events/:eventId/rfq/send. */
export function rfqSendErrorMessage(error: unknown, ar: boolean): string {
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 423) {
    return ar
      ? "يجب اعتماد الخطة أولاً قبل إرسال طلب التسعير للموردين."
      : "Approve the plan first before sending the RFQ to suppliers.";
  }
  if (status === 403) {
    return ar
      ? "لا تملك صلاحية التعديل لإرسال طلب التسعير للموردين."
      : "EDIT permission is required to send the RFQ to suppliers.";
  }
  if (status === 409) {
    return ar
      ? "لا يمكن إرسال طلب التسعير عندما تكون أعداد الضيوف صفراً."
      : "Guest counts must be greater than zero before sending an RFQ to suppliers.";
  }
  return error instanceof Error
    ? error.message
    : ar
      ? "تعذر إرسال طلب التسعير للموردين."
      : "Could not send RFQ to suppliers.";
}

const ITEM_CATEGORIES = ["VEHICLES", "HOTEL_ROOMS", "TICKETS", "STAFF", "OTHER"] as const;
type ItemCategory = (typeof ITEM_CATEGORIES)[number];

const SUBTEAM_LABELS: Record<EventSubteam, { en: string; ar: string }> = {
  HOTELS: { en: "Hotels", ar: "الفنادق" },
  AIRPORT: { en: "Airport", ar: "المطار" },
  VENUE: { en: "Venue", ar: "موقع الفعالية" },
  TRANSPORT: { en: "Transport", ar: "النقل" }
};

const CATEGORY_LABELS: Record<ItemCategory, { en: string; ar: string }> = {
  VEHICLES: { en: "Vehicles", ar: "المركبات" },
  HOTEL_ROOMS: { en: "Hotel rooms", ar: "غرف فندقية" },
  TICKETS: { en: "Tickets", ar: "التذاكر" },
  STAFF: { en: "Staff", ar: "الطاقم" },
  OTHER: { en: "Other", ar: "أخرى" }
};

function PlanValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>—</span>;
  if (Array.isArray(value)) return <ul className="space-y-1">{value.map((entry, i) => <li className="rounded border border-hairline p-2" key={i}><PlanValue value={entry}/></li>)}</ul>;
  if (typeof value === "object") return <dl className="space-y-1">{Object.entries(value).map(([key, entry]) => <div key={key} className="flex flex-wrap gap-2"><dt className="text-ink-muted">{key.replace(/([A-Z])/g, ' $1')}:</dt><dd><PlanValue value={entry}/></dd></div>)}</dl>;
  return <span>{String(value)}</span>;
}

const sectionLabels: Record<PlanSection, [string, string]> = {
  logistics: ['Logistics plan', 'الخطة اللوجستية'],
  hotelDistribution: ['Hotel distribution', 'توزيع الفنادق'],
  vehicleRequirements: ['Vehicle requirements', 'احتياج السيارات'],
  teamRequirements: ['Team requirements', 'احتياج الفرق'],
  scopeOfWork: ['Scope of work', 'نطاق العمل']
};

export function sourceLabel(plan: Pick<EventPlanDto, 'source' | 'edited'>, ar: boolean) {
  const base = plan.source === 'DETERMINISTIC_ADVISORY'
    ? (ar ? 'مقترح محسوب بالقواعد — مزود الذكاء الاصطناعي غير مهيأ، وليس ناتجه' : 'Rules-based advisory — AI provider not configured; not AI output')
    : plan.source === 'MANUAL'
      ? (ar ? 'خطة يدوية' : 'Manual plan')
      : (ar ? 'مقترح مزود ذكاء اصطناعي — استشاري' : 'AI provider advisory');
  return plan.edited ? `${base} · ${planProvenanceLabel(plan, ar)}` : base;
}

/** Pure helper: reorders an array item by delta (-1 up, +1 down) without mutating. */
export function reorderRow<T>(rows: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return [...rows];
  const copy = [...rows];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/** Converts an ISO timestamp to a Riyadh (UTC+03:00) datetime-local input value. */
export function isoToRiyadhLocal(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms + 3 * 3_600_000).toISOString().slice(0, 16);
}

/** Converts a Riyadh (UTC+03:00) datetime-local input value back to ISO string or null. */
export function riyadhLocalToIso(local: string): string | null {
  const trimmed = local.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed.includes("Z") || /[+-]\d{2}:\d{2}$/.test(trimmed) ? trimmed : `${trimmed}+03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Normalizes editor draft fields into a strict EditablePlanInput payload before validation. */
export function normalizeEditablePlanInput(draft: EditablePlan): EditablePlanInput {
  const safeCount = (n: number) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
  return {
    summary: draft.summary.trim(),
    hotelDistribution: {
      zone: draft.hotelDistribution.zone?.trim() ? draft.hotelDistribution.zone.trim() : null,
      vipSingleRooms: safeCount(draft.hotelDistribution.vipSingleRooms),
      regularTwinRooms: safeCount(draft.hotelDistribution.regularTwinRooms)
    },
    vehicleRequirements: {
      vip: safeCount(draft.vehicleRequirements.vip),
      shuttle: safeCount(draft.vehicleRequirements.shuttle)
    },
    teamRequirements: draft.teamRequirements.map((row) => ({
      subteam: row.subteam,
      minimumPeople: safeCount(row.minimumPeople)
    })),
    schedule: draft.schedule.map((row) => ({
      subteam: row.subteam,
      name: row.name.trim(),
      startsAt: row.startsAt ? riyadhLocalToIso(row.startsAt) : null
    })),
    scopeOfWork: draft.scopeOfWork.map((line) => line.trim()).filter(Boolean),
    items: draft.items.map((item) => {
      const note = item.note?.trim();
      return {
        category: item.category,
        quantity: safeCount(item.quantity),
        ...(note ? { note } : {})
      };
    })
  };
}

/** Client-side Zod validation using shared editablePlanSchema with friendly AR/EN messaging. */
export function validateEditablePlan(
  draft: EditablePlan,
  ar: boolean
): { ok: true; payload: EditablePlanInput } | { ok: false; message: string } {
  const payload = normalizeEditablePlanInput(draft);
  const parsed = editablePlanSchema.safeParse(payload);
  if (parsed.success) return { ok: true, payload };
  const first = parsed.error.issues[0];
  const path = first?.path?.join(".") ?? "";
  const detail = first?.message ?? "";
  if (ar) {
    return {
      ok: false,
      message: path
        ? `يرجى التحقق من الحقل (${path}): ${detail}`
        : `يرجى مراجعة بيانات الخطة قبل الحفظ: ${detail}`
    };
  }
  return {
    ok: false,
    message: path
      ? `Please check field "${path}": ${detail}`
      : `Please check the plan fields before saving: ${detail}`
  };
}

/**
 * The plan draft, its five sections, inline AI plan editing and its RFQ draft.
 * Generation and RFQ drafting never send anything; approval is a separate explicit
 * action by an authorized approver, and only the server's answer unlocks operations.
 */
export function EventPlanEditor({ token, eventId, isArabic: ar, event, onChange, onApproved, initialError = null, initialManual = false }: WorkspaceProps & { event: WorkspaceEventDto; onChange: () => void; onApproved?: (event: WorkspaceEventDto) => void; initialError?: string | null; initialManual?: boolean }) {
  const toast = useToast();
  const [revision, refresh] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [manual, setManual] = useState(initialManual);
  const [sendingRfq, setSendingRfq] = useState(false);
  const [rfqSendError, setRfqSendError] = useState<string | null>(null);
  const [sentSupplierRequest, setSentSupplierRequest] = useState<RfqSupplierRequestDto | null>(null);
  // A failed automatic generation after event creation: the event exists, only generation is retried.
  const [generationError, setGenerationError] = useState<string | null>(initialError);
  const resource = useWorkspaceResource<{ plans: EventPlanDto[] }>(token, `/events/${eventId}/plans`, revision, '/workspace', true);
  const viewerSeesRfq = canViewRfq(event);
  const rfqDispatch = useWorkspaceResource<RfqDispatchResponse>(
    token,
    viewerSeesRfq ? `/events/${eventId}/rfq/dispatch` : null,
    revision,
    "/workspace",
    true
  );
  const supplierRequest = sentSupplierRequest ?? rfqDispatch.data?.supplierRequest ?? null;
  const request = (path: string, body?: unknown, method?: string) => workspaceRequest(token, path, body, method);
  const open = event.operationalStatus !== "COMPLETED";
  const canEdit = event.access.permissions.includes("EDIT") && open;
  const canApproveFallback =
    !event.access.support &&
    event.access.eventRole !== "VENDOR" &&
    open &&
    (["OWNER", "ADMIN"].includes(event.access.organizationRole ?? "") ||
      (event.access.eventRole === "PROJECT_MANAGER" && event.access.permissions.includes("EDIT")) ||
      event.access.eventRole === "CLIENT_VIEWER");
  const canDraftRfq = canEdit && !event.access.support && viewerSeesRfq && !event.contractSigned;
  const canSendRfq = canEdit && !event.access.support && viewerSeesRfq;

  async function sendRfqToSuppliers() {
    setSendingRfq(true);
    setRfqSendError(null);
    try {
      const response = await workspaceRequest<RfqSendResponse>(
        token,
        `/events/${eventId}/rfq/send`,
        { confirm: true },
        "POST"
      );
      setSentSupplierRequest(response.supplierRequest);
      const count = response.notifiedSuppliers;
      toast.success(
        ar ? `أُرسل إلى ${count} من الموردين المطابقين` : `Sent to ${count} matching suppliers`,
        ar
          ? `المرجع: ${response.supplierRequest.reference} · الحالة: ${response.supplierRequest.status}`
          : `Reference: ${response.supplierRequest.reference} · Status: ${response.supplierRequest.status}`
      );
      refresh((n) => n + 1);
      onChange();
    } catch (err) {
      const msg = rfqSendErrorMessage(err, ar);
      setRfqSendError(msg);
      toast.alert(ar ? "تعذر إرسال طلب التسعير" : "Could not send RFQ", msg);
    } finally {
      setSendingRfq(false);
    }
  }
  async function act(path: string, body: unknown) {
    setBusy(true); setError("");
    try { await request(`/events/${eventId}${path}`, body); refresh(n => n + 1); onChange(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "Request failed"); return false; } finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setError("");
    const result = await generateAdvisoryPlan(request, eventId);
    setGenerationError(result.planError); setBusy(false);
    if (result.plan) { refresh(n => n + 1); onChange(); }
  }
  async function approve(planId: string) {
    setBusy(true); setError("");
    try { const result = await approvePlan(request, eventId, planId); refresh(n => n + 1); onApproved ? onApproved(result.event) : onChange(); }
    catch (e) { setError(e instanceof Error ? e.message : "Request failed"); } finally { setBusy(false); }
  }
  async function savePlanEdit(planId: string, payload: EditablePlanInput): Promise<PlanEditResponse> {
    const response = await workspaceRequest<PlanEditResponse>(
      token,
      `/events/${eventId}/plans/${planId}`,
      payload,
      "PATCH"
    );
    if (response.created) {
      toast.info(
        ar ? `تم الحفظ كمسودة جديدة (الإصدار ${response.plan.version})` : `Saved as new draft v${response.plan.version}`,
        ar
          ? "اعتمد المسودة الجديدة لتصبح الخطة التشغيلية المعتمدة."
          : `Saved as new draft v${response.plan.version}, approve to make it operational.`
      );
    } else {
      toast.success(
        ar ? "تم حفظ تعديلات الخطة" : "Plan updated",
        ar ? "تم تحديث المسودة في مكانها بنجاح." : "Draft plan changes saved."
      );
    }
    refresh((n) => n + 1);
    onChange();
    return response;
  }
  return <Section id="section-event-plan" title={ar ? "الخطة التشغيلية" : "Operational plan"} description={ar ? "تراجع المقترحات ويعتمدها مسؤول مخول قبل بدء التشغيل" : "An authorized person reviews and approves each plan before operations"} isArabic={ar}>
    {generationError && <div role="alert" className="mb-4 rounded border border-red-500/40 p-3 text-sm"><p className="text-red-500">{ar ? "حُفظت الفعالية، لكن تعذّر تجهيز مقترح الخطة" : "The event was saved, but the plan proposal could not be generated"}: {generationError}</p>{canEdit && <button disabled={busy} className={`${workspaceButton} mt-2`} onClick={() => void generate()}>{ar ? "إعادة محاولة تجهيز المقترح" : "Retry plan generation"}</button>}</div>}
    {canEdit && <div className="mb-4 flex flex-wrap gap-2"><button disabled={busy} className={workspaceButton} onClick={() => void generate()}>{busy ? (ar ? "جارٍ التنفيذ…" : "Working…") : (ar ? "تحليل وتجهيز مقترح" : "Analyze & propose plan")}</button><button className={workspaceButton} aria-expanded={manual} onClick={() => setManual(!manual)}>{ar ? "إدخال خطة يدوية" : "Manual plan"}</button></div>}
    {manual && canEdit && <form className="mb-4 grid gap-3" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void act('/plans/generate', { mode: 'MANUAL', summary: f.get('summary'), items: ['Logistics', 'Hotels', 'Vehicles', 'Teams', 'Scope'].map((name, i) => ({ category: (['OTHER','HOTEL_ROOMS','VEHICLES','STAFF','OTHER'] as const)[i], quantity: Number(f.get(`${name}-quantity`)), note: `${name}: ${f.get(name)}` })) }).then(saved => { if (saved) setManual(false); }); }}>
      <label>{ar ? "ملخص الخطة" : "Plan summary"}<textarea required name="summary" maxLength={2000} className={workspaceInput}/></label>
      {['Logistics','Hotels','Vehicles','Teams','Scope'].map((name, i) => <div className="grid gap-2 sm:grid-cols-2" key={name}><label>{[ar ? 'الخدمات اللوجستية' : 'Logistics', ar ? 'الفنادق' : 'Hotels', ar ? 'المركبات' : 'Vehicles', ar ? 'الفرق' : 'Teams', ar ? 'نطاق العمل' : 'Scope of work'][i]}<input required name={name} maxLength={250} className={workspaceInput}/></label><label>{ar ? "العدد" : "Quantity"}<input type="number" required min="0" defaultValue="0" name={`${name}-quantity`} className={workspaceInput}/></label></div>)}
      <button disabled={busy} className={workspaceButton}>{ar ? "حفظ مسودة" : "Save draft"}</button>
    </form>}
    {(error || resource.error) && <p role="alert" className="text-red-500">{error || resource.error}</p>}
    {!resource.data && !resource.error && <p role="status">{ar ? "جارٍ تحميل الخطط…" : "Loading plans…"}</p>}
    {resource.data?.plans.length === 0 && !generationError && <p>{ar ? "أنشئ مقترحاً أو أدخل خطة يدوية" : "Generate an advisory plan or enter a manual plan"}</p>}
    <div className="space-y-4">
      {resource.data?.plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          ar={ar}
          busy={busy}
          canApprove={plan.viewerCanApprove !== undefined ? plan.viewerCanApprove === true : canApproveFallback}
          canDraftRfq={canDraftRfq && plan.status !== "SUPERSEDED"}
          canSendRfq={canSendRfq && plan.status !== "SUPERSEDED"}
          planApproved={event.planApproved}
          supplierRequest={supplierRequest}
          sendingRfq={sendingRfq}
          rfqSendError={rfqSendError}
          onApprove={() => void approve(plan.id)}
          onDraftRfq={() => void act(`/plans/${plan.id}/rfq`, {})}
          onSendRfq={() => void sendRfqToSuppliers()}
          onSaveEdit={(payload) => savePlanEdit(plan.id, payload)}
        />
      ))}
    </div>
  </Section>;
}

/**
 * SIX-TASKS #4: Inline editor prefilled from `editablePlanFromContent`.
 * Never opens blank; validates client-side with `editablePlanSchema.safeParse`
 * and keeps user edits intact if validation or server 400 fails.
 */
export function InlinePlanEditor({
  plan,
  ar,
  onSave,
  onCancel
}: {
  plan: EventPlanDto;
  ar: boolean;
  onSave: (payload: EditablePlanInput) => Promise<PlanEditResponse>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<EditablePlan>(() => editablePlanFromContent(plan.summary, plan.content));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const subteamMap = new Map(draft.teamRequirements.map((t) => [t.subteam, t.minimumPeople]));

  function setTeamCount(subteam: EventSubteam, minimumPeople: number) {
    const clean = Number.isFinite(minimumPeople) && minimumPeople >= 0 ? Math.floor(minimumPeople) : 0;
    setDraft((prev) => {
      const exists = prev.teamRequirements.some((row) => row.subteam === subteam);
      const next = exists
        ? prev.teamRequirements.map((row) => (row.subteam === subteam ? { ...row, minimumPeople: clean } : row))
        : [...prev.teamRequirements, { subteam, minimumPeople: clean }];
      return { ...prev, teamRequirements: next };
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const checked = validateEditablePlan(draft, ar);
    if (!checked.ok) {
      setFormError(checked.message);
      return;
    }
    setSaving(true);
    try {
      await onSave(checked.payload);
      onCancel();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : ar
            ? "تعذر حفظ تعديلات الخطة. يرجى التحقق من المدخلات والمحاولة مجدداً."
            : "Could not save plan edits. Please review your inputs and try again."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(editablePlanFromContent(plan.summary, plan.content));
    setFormError(null);
    onCancel();
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      data-inline-plan-editor={plan.id}
      className="mt-4 space-y-5 rounded-lg border border-gold-500/40 bg-surface-2 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3">
        <div>
          <h4 className="text-sm font-bold text-ink">
            {ar ? "تعديل الخطة التشغيلية" : "Edit AI Plan"} · {ar ? `إصدار ${plan.version}` : `v${plan.version}`}
          </h4>
          {plan.status === "APPROVED" ? (
            <p className="mt-0.5 text-xs text-warn">
              {ar
                ? "هذه الخطة معتمدة حالياً؛ سيُحفظ التعديل كمسودة جديدة دون تعطيل التشغيل القائم."
                : "This plan is currently approved; saving creates a new draft version while keeping operations running."}
            </p>
          ) : null}
        </div>
        <Badge tone="gold" size="sm">
          {planProvenanceLabel(plan, ar)}
        </Badge>
      </div>

      {formError ? (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      {/* Summary */}
      <label className="block space-y-1 text-sm">
        <span className="font-semibold text-ink">{ar ? "ملخص الخطة" : "Plan summary"}</span>
        <textarea
          name="summary"
          rows={3}
          required
          minLength={2}
          maxLength={2000}
          value={draft.summary}
          onChange={(e) => setDraft((prev) => ({ ...prev, summary: e.target.value }))}
          className={workspaceInput}
        />
      </label>

      {/* Hotel distribution & Vehicle requirements */}
      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="space-y-2 rounded-lg border border-hairline bg-surface-1 p-3">
          <legend className="px-1 text-xs font-bold text-gold-300">
            {ar ? "توزيع الفنادق" : "Hotel distribution"}
          </legend>
          <label className="block text-xs text-ink-muted">
            {ar ? "نطاق الفنادق" : "Hotel zone"}
            <input
              type="text"
              name="hotelZone"
              maxLength={120}
              value={draft.hotelDistribution.zone ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  hotelDistribution: { ...prev.hotelDistribution, zone: e.target.value || null }
                }))
              }
              className={`${workspaceInput} mt-1`}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-ink-muted">
              {ar ? "غرف VIP مفردة" : "VIP single rooms"}
              <input
                type="number"
                min={0}
                name="vipSingleRooms"
                value={draft.hotelDistribution.vipSingleRooms}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    hotelDistribution: { ...prev.hotelDistribution, vipSingleRooms: Number(e.target.value) }
                  }))
                }
                className={`${workspaceInput} mt-1`}
              />
            </label>
            <label className="block text-xs text-ink-muted">
              {ar ? "غرف عادية مزدوجة" : "Regular twin rooms"}
              <input
                type="number"
                min={0}
                name="regularTwinRooms"
                value={draft.hotelDistribution.regularTwinRooms}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    hotelDistribution: { ...prev.hotelDistribution, regularTwinRooms: Number(e.target.value) }
                  }))
                }
                className={`${workspaceInput} mt-1`}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-2 rounded-lg border border-hairline bg-surface-1 p-3">
          <legend className="px-1 text-xs font-bold text-gold-300">
            {ar ? "احتياج السيارات والأسطول" : "Vehicle / fleet requirements"}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-ink-muted">
              {ar ? "سيارات VIP" : "VIP vehicles"}
              <input
                type="number"
                min={0}
                name="vipVehicles"
                value={draft.vehicleRequirements.vip}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    vehicleRequirements: { ...prev.vehicleRequirements, vip: Number(e.target.value) }
                  }))
                }
                className={`${workspaceInput} mt-1`}
              />
            </label>
            <label className="block text-xs text-ink-muted">
              {ar ? "مركبات النقل الجماعي" : "Shuttle vehicles"}
              <input
                type="number"
                min={0}
                name="shuttleVehicles"
                value={draft.vehicleRequirements.shuttle}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    vehicleRequirements: { ...prev.vehicleRequirements, shuttle: Number(e.target.value) }
                  }))
                }
                className={`${workspaceInput} mt-1`}
              />
            </label>
          </div>
        </fieldset>
      </div>

      {/* Team requirements */}
      <fieldset className="space-y-2 rounded-lg border border-hairline bg-surface-1 p-3">
        <legend className="px-1 text-xs font-bold text-gold-300">
          {ar ? "احتياج الفرق (الحد الأدنى للأفراد)" : "Team requirements (minimum people)"}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {EVENT_SUBTEAMS.map((team) => (
            <label key={team} className="block text-xs text-ink-muted">
              {ar ? SUBTEAM_LABELS[team].ar : SUBTEAM_LABELS[team].en}
              <input
                type="number"
                min={0}
                name={`team-${team}`}
                value={subteamMap.get(team) ?? 0}
                onChange={(e) => setTeamCount(team, Number(e.target.value))}
                className={`${workspaceInput} mt-1`}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {/* Schedule (add / remove / reorder) */}
      <fieldset className="space-y-2 rounded-lg border border-hairline bg-surface-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <legend className="px-1 text-xs font-bold text-gold-300">
            {ar ? "الجدول التشغيلي" : "Schedule"}
          </legend>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Plus className="size-3.5" aria-hidden />}
            onClick={() =>
              setDraft((prev) => ({
                ...prev,
                schedule: [...prev.schedule, { subteam: "TRANSPORT", name: "", startsAt: null }]
              }))
            }
          >
            {ar ? "إضافة مرحلة" : "Add phase"}
          </Button>
        </div>
        {draft.schedule.length === 0 ? (
          <p className="text-xs text-ink-muted">{ar ? "لا توجد مراحل مجدولة بعد." : "No schedule phases yet."}</p>
        ) : (
          <div className="space-y-2">
            {draft.schedule.map((row, idx) => (
              <div key={idx} className="grid gap-2 rounded-md border border-hairline bg-surface-2 p-2 sm:grid-cols-[140px_1fr_190px_auto]">
                <select
                  aria-label={ar ? "الفريق" : "Subteam"}
                  value={row.subteam}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      schedule: prev.schedule.map((r, i) =>
                        i === idx ? { ...r, subteam: e.target.value as EventSubteam } : r
                      )
                    }))
                  }
                  className={workspaceInput}
                >
                  {EVENT_SUBTEAMS.map((st) => (
                    <option key={st} value={st}>
                      {ar ? SUBTEAM_LABELS[st].ar : SUBTEAM_LABELS[st].en}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  aria-label={ar ? "اسم المرحلة" : "Phase name"}
                  placeholder={ar ? "اسم المرحلة أو النشاط" : "Phase or milestone name"}
                  value={row.name}
                  maxLength={160}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      schedule: prev.schedule.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r))
                    }))
                  }
                  className={workspaceInput}
                />
                <input
                  type="datetime-local"
                  aria-label={ar ? "وقت البداية" : "Start time"}
                  value={isoToRiyadhLocal(row.startsAt)}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      schedule: prev.schedule.map((r, i) =>
                        i === idx ? { ...r, startsAt: riyadhLocalToIso(e.target.value) } : r
                      )
                    }))
                  }
                  className={workspaceInput}
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    aria-label={ar ? "تحريك للأعلى" : "Move up"}
                    title={ar ? "تحريك للأعلى" : "Move up"}
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, schedule: reorderRow(prev.schedule, idx, -1) }))
                    }
                    className="grid size-8 place-items-center rounded border border-hairline bg-surface-1 text-ink-muted hover:text-ink disabled:opacity-40"
                  >
                    <ArrowUp className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={idx === draft.schedule.length - 1}
                    aria-label={ar ? "تحريك للأسفل" : "Move down"}
                    title={ar ? "تحريك للأسفل" : "Move down"}
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, schedule: reorderRow(prev.schedule, idx, 1) }))
                    }
                    className="grid size-8 place-items-center rounded border border-hairline bg-surface-1 text-ink-muted hover:text-ink disabled:opacity-40"
                  >
                    <ArrowDown className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={ar ? "حذف المرحلة" : "Remove phase"}
                    title={ar ? "حذف المرحلة" : "Remove phase"}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        schedule: prev.schedule.filter((_, i) => i !== idx)
                      }))
                    }
                    className="grid size-8 place-items-center rounded border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      {/* Scope of work */}
      <fieldset className="space-y-2 rounded-lg border border-hairline bg-surface-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <legend className="px-1 text-xs font-bold text-gold-300">
            {ar ? "نطاق العمل" : "Scope of work"}
          </legend>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Plus className="size-3.5" aria-hidden />}
            onClick={() => setDraft((prev) => ({ ...prev, scopeOfWork: [...prev.scopeOfWork, ""] }))}
          >
            {ar ? "إضافة بند نطاق" : "Add scope item"}
          </Button>
        </div>
        {draft.scopeOfWork.length === 0 ? (
          <p className="text-xs text-ink-muted">{ar ? "لا توجد بنود في نطاق العمل." : "No scope items yet."}</p>
        ) : (
          <div className="space-y-2">
            {draft.scopeOfWork.map((line, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={300}
                  aria-label={ar ? `بند نطاق ${idx + 1}` : `Scope item ${idx + 1}`}
                  value={line}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      scopeOfWork: prev.scopeOfWork.map((s, i) => (i === idx ? e.target.value : s))
                    }))
                  }
                  className={workspaceInput}
                />
                <button
                  type="button"
                  aria-label={ar ? "حذف البند" : "Remove scope item"}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      scopeOfWork: prev.scopeOfWork.filter((_, i) => i !== idx)
                    }))
                  }
                  className="grid size-9 shrink-0 place-items-center rounded border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      {/* Line items */}
      <fieldset className="space-y-2 rounded-lg border border-hairline bg-surface-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <legend className="px-1 text-xs font-bold text-gold-300">
            {ar ? "بنود التوريد والكميات" : "Plan line items"}
          </legend>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Plus className="size-3.5" aria-hidden />}
            onClick={() =>
              setDraft((prev) => ({
                ...prev,
                items: [...prev.items, { category: "OTHER", quantity: 1 }]
              }))
            }
          >
            {ar ? "إضافة بند" : "Add item"}
          </Button>
        </div>
        {draft.items.length === 0 ? (
          <p className="text-xs text-ink-muted">{ar ? "لا توجد بنود إضافية." : "No additional line items."}</p>
        ) : (
          <div className="space-y-2">
            {draft.items.map((item, idx) => (
              <div key={idx} className="grid gap-2 rounded-md border border-hairline bg-surface-2 p-2 sm:grid-cols-[150px_100px_1fr_auto]">
                <select
                  aria-label={ar ? "الفئة" : "Category"}
                  value={item.category}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      items: prev.items.map((it, i) =>
                        i === idx ? { ...it, category: e.target.value as ItemCategory } : it
                      )
                    }))
                  }
                  className={workspaceInput}
                >
                  {ITEM_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {ar ? CATEGORY_LABELS[cat].ar : CATEGORY_LABELS[cat].en}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  aria-label={ar ? "الكمية" : "Quantity"}
                  value={item.quantity}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      items: prev.items.map((it, i) =>
                        i === idx ? { ...it, quantity: Number(e.target.value) } : it
                      )
                    }))
                  }
                  className={workspaceInput}
                />
                <input
                  type="text"
                  maxLength={300}
                  aria-label={ar ? "ملاحظة" : "Note"}
                  placeholder={ar ? "ملاحظة اختيارية" : "Optional note"}
                  value={item.note ?? ""}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      items: prev.items.map((it, i) =>
                        i === idx ? { ...it, note: e.target.value || undefined } : it
                      )
                    }))
                  }
                  className={workspaceInput}
                />
                <button
                  type="button"
                  aria-label={ar ? "حذف البند" : "Remove item"}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      items: prev.items.filter((_, i) => i !== idx)
                    }))
                  }
                  className="grid size-9 place-items-center rounded border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving}
          leadingIcon={<X className="size-4" aria-hidden />}
          onClick={handleCancel}
        >
          {ar ? "إلغاء" : "Cancel"}
        </Button>
        <Button
          type="submit"
          variant="gold"
          size="sm"
          loading={saving}
          leadingIcon={<Save className="size-4" aria-hidden />}
        >
          {saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : ar ? "حفظ التعديلات" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

export function PlanCard({
  plan,
  ar,
  busy,
  canApprove,
  canDraftRfq,
  canSendRfq = false,
  planApproved = false,
  supplierRequest = null,
  sendingRfq = false,
  rfqSendError = null,
  onApprove,
  onDraftRfq,
  onSendRfq,
  onSaveEdit,
  defaultEditing = false
}: {
  plan: EventPlanDto;
  ar: boolean;
  busy: boolean;
  canApprove: boolean;
  canDraftRfq: boolean;
  canSendRfq?: boolean;
  planApproved?: boolean;
  supplierRequest?: RfqSupplierRequestDto | null;
  sendingRfq?: boolean;
  rfqSendError?: string | null;
  onApprove: () => void;
  onDraftRfq: () => void;
  onSendRfq?: () => void;
  onSaveEdit?: (payload: EditablePlanInput) => Promise<PlanEditResponse>;
  /** For SSR testing of the open inline editor state. */
  defaultEditing?: boolean;
}) {
  const [editing, setEditing] = useState(defaultEditing);
  const rfq = rfqDraftFromPlanContent(plan.content);
  const canEditPlan = plan.viewerCanEdit === true && Boolean(onSaveEdit);
  const provenance = planProvenanceLabel(plan, ar);

  return <article className="rounded-lg border border-hairline bg-surface-1 p-4" data-plan-status={plan.status}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold">
        {ar ? 'إصدار' : 'Version'} {plan.version} · {plan.status === 'APPROVED' ? (ar ? 'معتمد' : 'Approved') : plan.status === 'DRAFT' ? (ar ? 'مسودة' : 'Draft') : (ar ? 'إصدار سابق' : 'Superseded')}
      </h3>
      <Badge tone={plan.edited ? "gold" : "neutral"} size="sm" data-plan-provenance>
        {provenance}
      </Badge>
    </div>
    <p className="my-2">{plan.summary}</p>
    <p className="mb-1 text-sm text-gold-500">{sourceLabel(plan, ar)}</p>
    {plan.status === 'DRAFT' && <p className="mb-3 text-sm">🔒 {ar ? 'مسودة مقفلة — لا يبدأ التشغيل قبل اعتماد صريح من مسؤول مخول' : 'Locked draft — operations stay locked until an authorized approver explicitly approves it'}</p>}
    {editing && canEditPlan && onSaveEdit ? (
      <InlinePlanEditor
        plan={plan}
        ar={ar}
        onSave={onSaveEdit}
        onCancel={() => setEditing(false)}
      />
    ) : (
      <>
        <div className="grid gap-3 md:grid-cols-2">{planSections(plan.content).map(({ key, value }) => <section key={key} data-plan-section={key} className="rounded border border-hairline p-3"><h4 className="mb-2 font-semibold">{sectionLabels[key][ar ? 1 : 0]}</h4><div className="text-sm"><PlanValue value={value}/></div></section>)}</div>
        {rfq ? (
          <RfqDraftPanel
            rfq={rfq}
            ar={ar}
            canSendRfq={canSendRfq}
            planApproved={planApproved}
            supplierRequest={supplierRequest}
            sendingRfq={sendingRfq}
            rfqSendError={rfqSendError}
            onSendRfq={onSendRfq}
          />
        ) : canDraftRfq && (
          <p className="mt-3 text-sm text-ink-muted">{ar ? 'لا توجد مسودة طلب عروض أسعار لهذا الإصدار' : 'No RFQ draft for this version yet'}</p>
        )}
      </>
    )}
    <div className="mt-4 flex flex-wrap gap-2">
      {canEditPlan && !editing && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          data-edit-plan={plan.id}
          leadingIcon={<Pencil className="size-3.5" aria-hidden />}
          onClick={() => setEditing(true)}
        >
          {ar ? "تعديل الخطة" : "Edit AI Plan"}
        </Button>
      )}
      {canDraftRfq && !editing && <button type="button" disabled={busy} className={workspaceButton} onClick={onDraftRfq}>{rfq ? (ar ? 'إعادة توليد مسودة طلب العروض' : 'Regenerate RFQ draft') : (ar ? 'توليد مسودة طلب العروض' : 'Generate RFQ draft')}</button>}
      {plan.status === 'DRAFT' && canApprove && !editing && <button type="button" disabled={busy} className={workspaceButton} onClick={onApprove}>{ar ? 'اعتماد الخطة وتفعيل التشغيل' : 'Approve plan & unlock operations'}</button>}
    </div>
  </article>;
}

const unitLabels: Record<RfqDraftDto['lines'][number]['unit'], [string, string]> = { rooms: ['rooms', 'غرف'], vehicles: ['vehicles', 'مركبات'], people: ['people', 'أفراد'], tickets: ['tickets', 'تذاكر'], items: ['items', 'بنود'] };

/** Read-only RFQ draft with explicit Send-to-Suppliers dispatch once the plan is approved. */
export function RfqDraftPanel({
  rfq,
  ar,
  canSendRfq = false,
  planApproved = false,
  supplierRequest = null,
  sendingRfq = false,
  rfqSendError = null,
  onSendRfq
}: {
  rfq: RfqDraftDto;
  ar: boolean;
  canSendRfq?: boolean;
  planApproved?: boolean;
  supplierRequest?: RfqSupplierRequestDto | null;
  sendingRfq?: boolean;
  rfqSendError?: string | null;
  onSendRfq?: () => void;
}) {
  const [copied, setCopied] = useState('');
  const text = rfqDraftText(rfq);
  function copy() { void navigator.clipboard?.writeText(text).then(() => setCopied(ar ? 'نُسخت المسودة' : 'Draft copied'), () => setCopied(ar ? 'تعذر النسخ' : 'Copy failed')); }
  function download() { const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `${rfq.reference}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <section className="mt-4 rounded border border-gold-500/40 p-3" data-rfq-reference={rfq.reference} aria-label={ar ? 'مسودة طلب عروض الأسعار' : 'RFQ draft'}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold">{ar ? 'مسودة طلب عروض الأسعار' : 'RFQ draft'} · {rfq.reference}</h4>
      {supplierRequest ? (
        <Badge tone="ok" size="sm" data-rfq-sent={supplierRequest.reference}>
          <CheckCircle2 className="size-3.5" aria-hidden />
          {ar
            ? `أُرسل للموردين · ${supplierRequest.reference} · ${supplierRequest.status}`
            : `Sent to suppliers · ${supplierRequest.reference} · ${supplierRequest.status}`}
        </Badge>
      ) : null}
    </div>
    {!supplierRequest ? (
      <p className="text-sm font-semibold text-gold-500">{ar ? 'مسودة — لم تُرسل لأي مورد. الإرسال خطوة منفصلة وصريحة.' : 'Draft — not sent to any vendor. Sending is a separate, explicit step.'}</p>
    ) : null}
    <p className="text-xs text-ink-muted">{ar ? 'الإصدار' : 'Plan version'} {rfq.planVersion} · {rfq.quantitiesFrom === 'PLAN_ITEMS' ? (ar ? 'الكميات من بنود الخطة' : 'Quantities from the plan items') : (ar ? 'الكميات محسوبة بالقواعد من أعداد الفعالية' : 'Quantities computed by rules from the event counts')} · {rfq.scope.serviceDays} {ar ? 'يوم خدمة' : 'service day(s)'}{rfq.scope.hotelZone ? ` · ${rfq.scope.hotelZone}` : ''}</p>
    <table className="mt-2 w-full text-sm"><thead><tr><th className="text-start">{ar ? 'البند' : 'Item'}</th><th className="text-start">{ar ? 'الكمية' : 'Quantity'}</th><th className="text-start">{ar ? 'الأيام' : 'Days'}</th><th className="text-start">{ar ? 'سعر الوحدة' : 'Unit price'}</th></tr></thead>
      <tbody>{rfq.lines.map((line, i) => <tr key={i} data-rfq-category={line.category}><td>{line.description}</td><td>{line.quantity} {unitLabels[line.unit][ar ? 1 : 0]}</td><td>{line.serviceDays ?? '—'}</td><td>{ar ? 'يحدده المورد' : 'Vendor to quote'}</td></tr>)}</tbody></table>
    {rfq.lines.length === 0 && <p className="text-sm">{ar ? 'لا توجد بنود بكميات' : 'No quantified line items'}</p>}
    <ul className="mt-2 list-disc ps-5 text-xs text-ink-muted">{rfq.notes.map(note => <li key={note}>{note}</li>)}</ul>
    {rfqSendError ? (
      <p role="alert" className="mt-2 rounded border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
        {rfqSendError}
      </p>
    ) : null}
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {!supplierRequest && canSendRfq && onSendRfq ? (
        <>
          <Button
            size="sm"
            variant="gold"
            disabled={!planApproved || sendingRfq}
            loading={sendingRfq}
            data-rfq-send
            leadingIcon={<Send className="size-3.5" aria-hidden />}
            onClick={onSendRfq}
          >
            {ar ? "إرسال طلب التسعير للموردين" : "Send RFQ to suppliers"}
          </Button>
          {!planApproved ? (
            <span className="text-xs text-ink-muted">
              {ar ? "يُفعَّل الإرسال بعد اعتماد الخطة." : "Enabled once the plan is approved."}
            </span>
          ) : null}
        </>
      ) : null}
      <button type="button" className={workspaceButton} onClick={copy}>{ar ? 'نسخ المسودة' : 'Copy draft'}</button>
      <button type="button" className={workspaceButton} onClick={download}>{ar ? 'تنزيل المسودة' : 'Download draft'}</button>
      {copied && <span role="status" className="self-center text-xs">{copied}</span>}
    </div>
  </section>;
}

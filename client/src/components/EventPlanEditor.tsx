import { useState } from "react";
import { rfqDraftFromPlanContent, rfqDraftText, type EventPlanDto, type RfqDraftDto, type WorkspaceEventDto } from "@shared/overhaul";
import { Section } from "./Section";
import { workspaceButton, workspaceInput, type WorkspaceProps } from "./OrganizerWorkspace";
import { useWorkspaceResource, workspaceRequest } from "../lib/workspaceApi";
import { approvePlan, canViewRfq, generateAdvisoryPlan, planSections, type PlanSection } from "../lib/workspaceWorkflow";

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

export function sourceLabel(plan: Pick<EventPlanDto, 'source'>, ar: boolean) {
  return plan.source === 'DETERMINISTIC_ADVISORY' ? (ar ? 'مقترح محسوب بالقواعد — مزود الذكاء الاصطناعي غير مهيأ، وليس ناتجه' : 'Rules-based advisory — AI provider not configured; not AI output')
    : plan.source === 'MANUAL' ? (ar ? 'خطة يدوية' : 'Manual plan')
    : (ar ? 'مقترح مزود ذكاء اصطناعي — استشاري' : 'AI provider advisory');
}

/**
 * The plan draft, its five sections and its RFQ draft. Generation and RFQ
 * drafting never send anything; approval is a separate explicit action by an
 * authorized approver, and only the server's answer unlocks operations.
 */
export function EventPlanEditor({ token, eventId, isArabic: ar, event, onChange, onApproved, initialError = null, initialManual = false }: WorkspaceProps & { event: WorkspaceEventDto; onChange: () => void; onApproved?: (event: WorkspaceEventDto) => void; initialError?: string | null; initialManual?: boolean }) {
  const [revision, refresh] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [manual, setManual] = useState(initialManual);
  // A failed automatic generation after event creation: the event exists, only generation is retried.
  const [generationError, setGenerationError] = useState<string | null>(initialError);
  const resource = useWorkspaceResource<{ plans: EventPlanDto[] }>(token, `/events/${eventId}/plans`, revision, '/workspace', true);
  const request = (path: string, body?: unknown, method?: string) => workspaceRequest(token, path, body, method);
  const open = event.operationalStatus !== "COMPLETED";
  const canEdit = event.access.permissions.includes("EDIT") && open;
  const canApprove = !event.access.support && open && (["OWNER", "ADMIN"].includes(event.access.organizationRole ?? "") || (event.access.eventRole === "PROJECT_MANAGER" && event.access.permissions.includes("EDIT")));
  const canDraftRfq = canEdit && !event.access.support && canViewRfq(event) && !event.contractSigned;
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
  return <Section title={ar ? "الخطة التشغيلية" : "Operational plan"} description={ar ? "تراجع المقترحات ويعتمدها مسؤول مخول قبل بدء التشغيل" : "An authorized person reviews and approves each plan before operations"}>
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
    <div className="space-y-4">{resource.data?.plans.map(plan => <PlanCard key={plan.id} plan={plan} ar={ar} busy={busy} canApprove={canApprove} canDraftRfq={canDraftRfq && plan.status !== 'SUPERSEDED'} onApprove={() => void approve(plan.id)} onDraftRfq={() => void act(`/plans/${plan.id}/rfq`, {})} />)}</div>
  </Section>;
}

export function PlanCard({ plan, ar, busy, canApprove, canDraftRfq, onApprove, onDraftRfq }: { plan: EventPlanDto; ar: boolean; busy: boolean; canApprove: boolean; canDraftRfq: boolean; onApprove: () => void; onDraftRfq: () => void }) {
  const rfq = rfqDraftFromPlanContent(plan.content);
  return <article className="rounded-lg border border-hairline bg-surface-1 p-4" data-plan-status={plan.status}>
    <h3 className="font-bold">{ar ? 'إصدار' : 'Version'} {plan.version} · {plan.status === 'APPROVED' ? (ar ? 'معتمد' : 'Approved') : plan.status === 'DRAFT' ? (ar ? 'مسودة' : 'Draft') : (ar ? 'إصدار سابق' : 'Superseded')}</h3>
    <p className="my-2">{plan.summary}</p>
    <p className="mb-1 text-sm text-gold-500">{sourceLabel(plan, ar)}</p>
    {plan.status === 'DRAFT' && <p className="mb-3 text-sm">🔒 {ar ? 'مسودة مقفلة — لا يبدأ التشغيل قبل اعتماد صريح من مسؤول مخول' : 'Locked draft — operations stay locked until an authorized approver explicitly approves it'}</p>}
    <div className="grid gap-3 md:grid-cols-2">{planSections(plan.content).map(({ key, value }) => <section key={key} data-plan-section={key} className="rounded border border-hairline p-3"><h4 className="mb-2 font-semibold">{sectionLabels[key][ar ? 1 : 0]}</h4><div className="text-sm"><PlanValue value={value}/></div></section>)}</div>
    {rfq ? <RfqDraftPanel rfq={rfq} ar={ar} /> : canDraftRfq && <p className="mt-3 text-sm text-ink-muted">{ar ? 'لا توجد مسودة طلب عروض أسعار لهذا الإصدار' : 'No RFQ draft for this version yet'}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {canDraftRfq && <button disabled={busy} className={workspaceButton} onClick={onDraftRfq}>{rfq ? (ar ? 'إعادة توليد مسودة طلب العروض' : 'Regenerate RFQ draft') : (ar ? 'توليد مسودة طلب العروض' : 'Generate RFQ draft')}</button>}
      {plan.status === 'DRAFT' && canApprove && <button disabled={busy} className={workspaceButton} onClick={onApprove}>{ar ? 'اعتماد الخطة وتفعيل التشغيل' : 'Approve plan & unlock operations'}</button>}
    </div>
  </article>;
}

const unitLabels: Record<RfqDraftDto['lines'][number]['unit'], [string, string]> = { rooms: ['rooms', 'غرف'], vehicles: ['vehicles', 'مركبات'], people: ['people', 'أفراد'], tickets: ['tickets', 'تذاكر'], items: ['items', 'بنود'] };

/** Read-only RFQ draft: summary, line items, copy and download. It is never sent from here. */
export function RfqDraftPanel({ rfq, ar }: { rfq: RfqDraftDto; ar: boolean }) {
  const [copied, setCopied] = useState('');
  const text = rfqDraftText(rfq);
  function copy() { void navigator.clipboard?.writeText(text).then(() => setCopied(ar ? 'نُسخت المسودة' : 'Draft copied'), () => setCopied(ar ? 'تعذر النسخ' : 'Copy failed')); }
  function download() { const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `${rfq.reference}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <section className="mt-4 rounded border border-gold-500/40 p-3" data-rfq-reference={rfq.reference} aria-label={ar ? 'مسودة طلب عروض الأسعار' : 'RFQ draft'}>
    <h4 className="font-semibold">{ar ? 'مسودة طلب عروض الأسعار' : 'RFQ draft'} · {rfq.reference}</h4>
    <p className="text-sm font-semibold text-gold-500">{ar ? 'مسودة — لم تُرسل لأي مورد. الإرسال خطوة منفصلة وصريحة.' : 'Draft — not sent to any vendor. Sending is a separate, explicit step.'}</p>
    <p className="text-xs text-ink-muted">{ar ? 'الإصدار' : 'Plan version'} {rfq.planVersion} · {rfq.quantitiesFrom === 'PLAN_ITEMS' ? (ar ? 'الكميات من بنود الخطة' : 'Quantities from the plan items') : (ar ? 'الكميات محسوبة بالقواعد من أعداد الفعالية' : 'Quantities computed by rules from the event counts')} · {rfq.scope.serviceDays} {ar ? 'يوم خدمة' : 'service day(s)'}{rfq.scope.hotelZone ? ` · ${rfq.scope.hotelZone}` : ''}</p>
    <table className="mt-2 w-full text-sm"><thead><tr><th className="text-start">{ar ? 'البند' : 'Item'}</th><th className="text-start">{ar ? 'الكمية' : 'Quantity'}</th><th className="text-start">{ar ? 'الأيام' : 'Days'}</th><th className="text-start">{ar ? 'سعر الوحدة' : 'Unit price'}</th></tr></thead>
      <tbody>{rfq.lines.map((line, i) => <tr key={i} data-rfq-category={line.category}><td>{line.description}</td><td>{line.quantity} {unitLabels[line.unit][ar ? 1 : 0]}</td><td>{line.serviceDays ?? '—'}</td><td>{ar ? 'يحدده المورد' : 'Vendor to quote'}</td></tr>)}</tbody></table>
    {rfq.lines.length === 0 && <p className="text-sm">{ar ? 'لا توجد بنود بكميات' : 'No quantified line items'}</p>}
    <ul className="mt-2 list-disc ps-5 text-xs text-ink-muted">{rfq.notes.map(note => <li key={note}>{note}</li>)}</ul>
    <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={workspaceButton} onClick={copy}>{ar ? 'نسخ المسودة' : 'Copy draft'}</button><button type="button" className={workspaceButton} onClick={download}>{ar ? 'تنزيل المسودة' : 'Download draft'}</button>{copied && <span role="status" className="self-center text-xs">{copied}</span>}</div>
  </section>;
}

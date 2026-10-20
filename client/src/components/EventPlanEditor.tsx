import { useState } from "react";
import type { EventPlanDto, WorkspaceEventDto } from "@shared/overhaul";
import { Section } from "./Section";
import { workspaceButton, workspaceInput, type WorkspaceProps } from "./OrganizerWorkspace";
import { useWorkspaceResource, workspaceRequest } from "../lib/workspaceApi";

function PlanValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>—</span>;
  if (Array.isArray(value)) return <ul className="space-y-1">{value.map((entry, i) => <li className="rounded border border-hairline p-2" key={i}><PlanValue value={entry}/></li>)}</ul>;
  if (typeof value === "object") return <dl className="space-y-1">{Object.entries(value).map(([key, entry]) => <div key={key} className="flex flex-wrap gap-2"><dt className="text-ink-muted">{key.replace(/([A-Z])/g, ' $1')}:</dt><dd><PlanValue value={entry}/></dd></div>)}</dl>;
  return <span>{String(value)}</span>;
}
export function EventPlanEditor({ token, eventId, isArabic: ar, event, onChange }: WorkspaceProps & { event: WorkspaceEventDto; onChange: () => void }) {
  const [revision, refresh] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [manual, setManual] = useState(false);
  const resource = useWorkspaceResource<{ plans: EventPlanDto[] }>(token, `/events/${eventId}/plans`, revision);
  const canEdit = event.access.permissions.includes("EDIT");
  const canApprove = !event.access.support && (["OWNER", "ADMIN"].includes(event.access.organizationRole ?? "") || (event.access.eventRole === "PROJECT_MANAGER" && canEdit));
  async function act(path: string, body: unknown) {
    setBusy(true); setError("");
    try { await workspaceRequest(token, `/events/${eventId}${path}`, body); refresh(n => n + 1); onChange(); }
    catch (e) { setError(e instanceof Error ? e.message : "Request failed"); } finally { setBusy(false); }
  }
  return <Section title={ar ? "الخطة التشغيلية" : "Operational plan"} description={ar ? "تراجع المقترحات ويعتمدها مسؤول مخول قبل بدء التشغيل" : "An authorized person reviews and approves each plan before operations"}>
    {canEdit && event.operationalStatus !== "COMPLETED" && <div className="mb-4 flex flex-wrap gap-2"><button disabled={busy} className={workspaceButton} onClick={() => void act('/plans/generate', { mode: 'ADVISORY' })}>{ar ? "تحليل وتجهيز مقترح" : "Analyze & propose plan"}</button><button className={workspaceButton} onClick={() => setManual(!manual)}>{ar ? "إدخال خطة يدوية" : "Manual plan"}</button></div>}
    {manual && <form className="mb-4 grid gap-3" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void act('/plans/generate', { mode: 'MANUAL', summary: f.get('summary'), items: ['Logistics', 'Hotels', 'Vehicles', 'Teams', 'Scope'].map((name, i) => ({ category: (['OTHER','HOTEL_ROOMS','VEHICLES','STAFF','OTHER'] as const)[i], quantity: Number(f.get(`${name}-quantity`)), note: `${name}: ${f.get(name)}` })) }); }}>
      <label>{ar ? "ملخص الخطة" : "Plan summary"}<textarea required name="summary" maxLength={2000} className={workspaceInput}/></label>
      {['Logistics','Hotels','Vehicles','Teams','Scope'].map((name, i) => <div className="grid gap-2 sm:grid-cols-2" key={name}><label>{[ar ? 'الخدمات اللوجستية' : 'Logistics', ar ? 'الفنادق' : 'Hotels', ar ? 'المركبات' : 'Vehicles', ar ? 'الفرق' : 'Teams', ar ? 'نطاق العمل' : 'Scope of work'][i]}<input required name={name} maxLength={250} className={workspaceInput}/></label><label>{ar ? "العدد" : "Quantity"}<input type="number" required min="0" defaultValue="0" name={`${name}-quantity`} className={workspaceInput}/></label></div>)}
      <button disabled={busy} className={workspaceButton}>{ar ? "حفظ مسودة" : "Save draft"}</button>
    </form>}
    {(error || resource.error) && <p role="alert" className="text-red-500">{error || resource.error}</p>}
    {!resource.data && !resource.error && <p role="status">{ar ? "جارٍ تحميل الخطط…" : "Loading plans…"}</p>}
    {resource.data?.plans.length === 0 && <p>{ar ? "أدخل بيانات الفعالية ثم أنشئ مقترحاً أو خطة يدوية" : "Generate an advisory plan or enter a manual plan"}</p>}
    <div className="space-y-4">{resource.data?.plans.map(plan => {
      const content: Record<string, unknown> = plan.content && typeof plan.content === 'object' && !Array.isArray(plan.content) ? Object.fromEntries(Object.entries(plan.content)) : {};
      return <article key={plan.id} className="rounded-lg border border-hairline bg-surface-1 p-4"><h3 className="font-bold">{ar ? 'إصدار' : 'Version'} {plan.version} · {plan.status === 'APPROVED' ? (ar ? 'معتمد' : 'Approved') : plan.status === 'DRAFT' ? (ar ? 'مسودة' : 'Draft') : (ar ? 'إصدار سابق' : 'Superseded')}</h3><p className="my-2">{plan.summary}</p><p className="mb-3 text-sm text-gold-500">{plan.source === 'DETERMINISTIC_ADVISORY' ? (ar ? 'مقترح محسوب بالقواعد — ليس ناتج مزود ذكاء اصطناعي' : 'Rules-based advisory — AI provider unavailable') : plan.source === 'MANUAL' ? (ar ? 'خطة يدوية' : 'Manual plan') : (ar ? 'مقترح ذكاء اصطناعي' : 'AI advisory')}</p>
        <div className="grid gap-3 md:grid-cols-2">{([['logistics',ar ? 'الخطة اللوجستية' : 'Logistics'],['hotelDistribution',ar ? 'توزيع الفنادق' : 'Hotel distribution'],['vehicleRequirements',ar ? 'متطلبات المركبات' : 'Vehicle requirements'],['teamRequirements',ar ? 'متطلبات الفرق' : 'Team requirements'],['scopeOfWork',ar ? 'نطاق العمل' : 'Scope of work']] as const).map(([key,label]) => <section key={key} className="rounded border border-hairline p-3"><h4 className="mb-2 font-semibold">{label}</h4><div className="text-sm"><PlanValue value={content[key] ?? (key === 'scopeOfWork' ? content.items : null)}/></div></section>)}</div>
        {plan.status === 'DRAFT' && canApprove && <button disabled={busy} className={`${workspaceButton} mt-4`} onClick={() => void act(`/plans/${plan.id}/approve`, { confirm: true })}>{ar ? 'اعتماد الخطة وتفعيل التشغيل' : 'Approve plan & unlock operations'}</button>}
      </article>;
    })}</div>
  </Section>;
}

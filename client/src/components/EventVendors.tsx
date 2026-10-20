import type { EventMemberDto, RfqDraftDto, WorkspaceEventDto } from "@shared/overhaul";
import { useWorkspaceResource } from "../lib/workspaceApi";
import { canViewRfq } from "../lib/workspaceWorkflow";
import { Section } from "./Section";
import { RfqDraftPanel } from "./EventPlanEditor";
import type { WorkspaceProps } from "./OrganizerWorkspace";
export function EventVendors({ token,eventId,isArabic: ar,event }: WorkspaceProps & { event: WorkspaceEventDto }) {
 const resource = useWorkspaceResource<{members: EventMemberDto[]}>(token, `/events/${eventId}/members`);
 // The RFQ draft is internal: vendors and client viewers never request it (the server refuses them too).
 const rfq = useWorkspaceResource<{rfq: RfqDraftDto | null; planVersion: number | null}>(token, canViewRfq(event) ? `/events/${eventId}/rfq` : null);
 const vendors = resource.data?.members.filter(m => m.role === 'VENDOR' && m.status === 'ACTIVE') ?? [];
 return <div className="space-y-4"><Section title={ar ? 'إدارة الموردين' : 'Vendor management'} description={ar ? 'الموردون المكلفون بالفعالية والتنبيهات عند تعديل النطاق قبل توقيع العقد' : 'Assigned event vendors receive scope alerts before contract signature'}>
  {resource.error && <p role="alert">{resource.error}</p>}{vendors.map(vendor => <article key={vendor.id} className="rounded border border-hairline p-4"><strong>{vendor.user.name}</strong><p>{vendor.subteam} · {vendor.workScope}</p><p className="text-sm text-ink-muted">{vendor.canReceive ? (ar ? 'استقبال التنبيهات مفعّل' : 'Notifications enabled') : (ar ? 'الاستقبال موقوف' : 'Receiving disabled')}</p></article>)}{resource.data && !vendors.length && <p>{ar ? 'أضف المورد المعتمد من إدارة الفرق والصلاحيات' : 'Assign an approved vendor through Teams & permissions'}</p>}
 </Section>
 {canViewRfq(event) && <Section title={ar ? 'طلب عروض الأسعار للخطة المعتمدة' : 'RFQ for the approved plan'} description={ar ? 'مسودة داخلية مستخرجة من الخطة المعتمدة؛ لا تُرسل تلقائياً ولا تتضمن أسعاراً أو بيانات ضيوف' : 'Internal draft derived from the approved plan; never sent automatically and carries no prices or guest data'}>
  {rfq.error && <p role="alert">{rfq.error}</p>}
  {!rfq.data && !rfq.error && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
  {rfq.data?.rfq ? <RfqDraftPanel rfq={rfq.data.rfq} ar={ar}/> : rfq.data && <p>{ar ? 'لا توجد مسودة للخطة المعتمدة — ولّدها من تبويب الخطة' : 'No draft for the approved plan yet — generate it from the Plan tab'}</p>}
 </Section>}
 </div>;
}

import type { EventMemberDto } from "@shared/overhaul";
import { useWorkspaceResource } from "../lib/workspaceApi";
import { Section } from "./Section";
import type { WorkspaceProps } from "./OrganizerWorkspace";
export function EventVendors({ token,eventId,isArabic: ar }: WorkspaceProps) {
 const resource = useWorkspaceResource<{members: EventMemberDto[]}>(token, `/events/${eventId}/members`);
 const vendors = resource.data?.members.filter(m => m.role === 'VENDOR' && m.status === 'ACTIVE') ?? [];
 return <Section title={ar ? 'إدارة الموردين' : 'Vendor management'} description={ar ? 'الموردون المكلفون بالفعالية والتنبيهات عند تعديل النطاق قبل توقيع العقد' : 'Assigned event vendors receive scope alerts before contract signature'}>
  {resource.error && <p role="alert">{resource.error}</p>}{vendors.map(vendor => <article key={vendor.id} className="rounded border border-hairline p-4"><strong>{vendor.user.name}</strong><p>{vendor.subteam} · {vendor.workScope}</p><p className="text-sm text-ink-muted">{vendor.canReceive ? (ar ? 'استقبال التنبيهات مفعّل' : 'Notifications enabled') : (ar ? 'الاستقبال موقوف' : 'Receiving disabled')}</p></article>)}{resource.data && !vendors.length && <p>{ar ? 'أضف المورد المعتمد من إدارة الفرق والصلاحيات' : 'Assign an approved vendor through Teams & permissions'}</p>}
 </Section>;
}

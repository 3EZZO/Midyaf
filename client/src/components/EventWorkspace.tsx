import { useState } from "react";
import type { WorkspaceEventDto } from "@shared/overhaul";
import { useWorkspaceResource, workspaceRequest } from "../lib/workspaceApi";
import { workspaceTabs, tabUnlocked, type WorkspaceTab } from "../lib/workspaceWorkflow";
import { workspaceButton, workspaceInput, type WorkspaceProps } from "./OrganizerWorkspace";
import { Section } from "./Section";
import { EventPlanEditor } from "./EventPlanEditor";
import { EventPermissions } from "./EventPermissions";
import { EventVendors } from "./EventVendors";
import { EventTeams } from "./EventTeams";
import { WorkspaceInbox } from "./WorkspaceInbox";
import {EventRadar} from './EventRadar';
import { EventGuests } from "./EventGuests";

export function EventWorkspace(props: WorkspaceProps) {
 const {token,eventId,isArabic: ar} = props; const [revision,refresh] = useState(0); const [tab,setTab] = useState<WorkspaceTab>('overview'); const [error,setError] = useState(''); const [notice,setNotice] = useState(''); const [busy,setBusy] = useState(false);
 const resource = useWorkspaceResource<{event: WorkspaceEventDto}>(token, `/events/${eventId}`, revision);
 const updates = useWorkspaceResource<{updates: Array<{id:string; action:string; at:string; actor:string}>}>(token, `/events/${eventId}/updates`, revision);
 const event = resource.data?.event;
 async function action(path: string, body: unknown, method='POST') { setBusy(true); setError(''); try { const result = await workspaceRequest<{scopeChange?: {notifiedVendors:number}}>(token, `/events/${eventId}${path}`, body, method); setNotice(result.scopeChange ? `${ar ? 'تم إشعار الموردين' : 'Vendors notified'}: ${result.scopeChange.notifiedVendors}` : (ar ? 'تم الحفظ' : 'Saved')); refresh(n => n+1); } catch(e) { setError(e instanceof Error ? e.message : 'Request failed'); } finally { setBusy(false); } }
 if (!event) return <Section title={ar ? 'الفعالية' : 'Event'}><p role={resource.error ? 'alert' : 'status'}>{resource.error ?? (ar ? 'جاري التحميل…' : 'Loading…')}</p><button className={workspaceButton} onClick={() => refresh(n => n+1)}>{ar ? 'إعادة المحاولة' : 'Retry'}</button></Section>;
 const labels: Record<WorkspaceTab,string> = {overview: ar ? 'نظرة عامة' : 'Overview', plan: ar ? 'الخطة' : 'Plan', guests: ar ? 'الضيوف' : 'Guests', vendors: ar ? 'الموردون' : 'Vendors', teams: ar ? 'الفرق' : 'Teams', permissions: ar ? 'الصلاحيات' : 'Permissions', inbox: ar ? 'صندوق البريد' : 'Inbox', radar: ar ? 'الرادار والتتبع' : 'Radar & tracking'};
 return <div className="space-y-4"><header><h1 className="text-2xl font-bold">{event.name}</h1><p className="text-sm text-ink-muted">{event.locationLabel} · {event.operationalStatus} · {event.contractSigned ? (ar ? 'العقد موقع — النطاق مقفل' : 'Contract signed — scope locked') : (ar ? 'النطاق قابل للتعديل' : 'Scope editable')}</p></header>
  <nav className="flex flex-wrap gap-2" aria-label={ar ? 'أقسام الفعالية' : 'Event sections'}>{workspaceTabs.map(key => <button key={key} className={`${workspaceButton} ${tab === key ? 'ring-2 ring-gold-500' : ''}`} disabled={!tabUnlocked(event,key)} onClick={() => setTab(key)}>{!tabUnlocked(event,key) ? '🔒 ' : ''}{labels[key]}</button>)}</nav>
  {!event.planApproved && <p className="rounded border border-gold-500/40 p-3 text-sm">{ar ? 'اعتمد الخطة لتفعيل الموردين والفرق والصلاحيات والبريد والرادار' : 'Approve the plan to unlock vendors, teams, permissions, inbox and radar'} <button className="underline" onClick={() => setTab('plan')}>{ar ? 'عرض الخطة' : 'Open plan'}</button></p>}
  {error && <p role="alert" className="text-red-500">{error}</p>}{notice && <p role="status">{notice}</p>}
  {tab === 'overview' && <><Section title={ar ? 'بيانات الفعالية' : 'Event details'}><form className="grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const body: Record<string,unknown> = {}; for (const [name,value] of f.entries()) body[name] = ['vipGuestCount','regularGuestCount','carCount'].includes(name) ? Number(value) : name.endsWith('At') ? (value ? new Date(`${value}+03:00`).toISOString() : null) : value || null; void action('',body,'PATCH'); }}>
    <fieldset disabled={event.contractSigned || !event.access.permissions.includes('SCOPE') || busy} className="contents">
    {([['name',ar ? 'اسم الفعالية' : 'Event name'],['locationLabel',ar ? 'الموقع' : 'Location'],['hotelZone',ar ? 'نطاق الفنادق' : 'Hotel zone']] as const).map(([name,label]) => <label key={name}>{label}<input name={name} required={name !== 'hotelZone'} defaultValue={event[name] ?? ''} className={workspaceInput}/></label>)}
    <label>{ar ? 'طريقة تحديد النطاق' : 'Hotel planning'}<select name="planningMode" defaultValue={event.planningMode} className={workspaceInput}><option value="MANUAL">{ar ? 'يدوي' : 'Manual'}</option><option value="AI">{ar ? 'بمساعدة المقترح' : 'Assisted'}</option></select></label>
    {([['vipGuestCount',ar ? 'كبار الشخصيات' : 'VIP guests'],['regularGuestCount',ar ? 'ضيوف عاديون' : 'Regular guests'],['carCount',ar ? 'المحتاجون لسيارات' : 'Needing vehicles']] as const).map(([name,label]) => <label key={name}>{label}<input name={name} type="number" min="0" max="100000" defaultValue={event[name]} className={workspaceInput}/></label>)}
    {([['startAt',ar ? 'البداية' : 'Start'],['endAt',ar ? 'النهاية' : 'End'],['arrivalStartAt',ar ? 'بداية الوصول' : 'Arrivals from'],['departureEndAt',ar ? 'نهاية المغادرة' : 'Departures until']] as const).map(([name,label]) => <label key={name}>{label} (UTC+03:00)<input name={name} type="datetime-local" defaultValue={event[name] ? new Date(new Date(event[name]!).getTime()+3*3600000).toISOString().slice(0,16) : ''} className={workspaceInput}/></label>)}
    <button disabled={busy} className={workspaceButton}>{ar ? 'حفظ وإشعار الموردين' : 'Save & notify vendors'}</button></fieldset>
  </form><div className="mt-4 flex flex-wrap gap-3">{event.planApproved && event.access.permissions.includes('EDIT') && !event.access.support && event.operationalStatus !== 'COMPLETED' && <button className={workspaceButton} disabled={busy} onClick={() => void action('/status',{operationalStatus: event.operationalStatus === 'PLANNING' ? 'ACTIVE' : 'COMPLETED'})}>{event.operationalStatus === 'PLANNING' ? (ar ? 'تفعيل الفعالية' : 'Activate event') : (ar ? 'إكمال الفعالية' : 'Complete event')}</button>}{event.planApproved && !event.contractSigned && ['OWNER','ADMIN'].includes(event.access.organizationRole ?? '') && <form onSubmit={e => {e.preventDefault(); const f = new FormData(e.currentTarget); void action('/contract/sign',{confirm:true,reference:f.get('reference')});}} className="flex flex-wrap gap-2"><input required name="reference" aria-label={ar ? 'مرجع العقد الموقع' : 'Signed contract reference'} placeholder={ar ? 'مرجع العقد الموقع' : 'Signed contract reference'} className={workspaceInput}/><label><input type="checkbox" required/> {ar ? 'أؤكد توقيع العقد فعلياً وقفل النطاق' : 'I confirm the contract is signed and scope will lock'}</label><button disabled={busy} className={workspaceButton}>{ar ? 'تسجيل التوقيع' : 'Record signature'}</button></form>}</div></Section>
  <Section title={ar ? 'آخر المستجدات' : 'Latest updates'}>{updates.error && <p role="alert">{updates.error}</p>}<ul className="space-y-2">{updates.data?.updates.map(update => <li key={update.id} className="rounded border border-hairline p-3"><strong>{update.actor}</strong> · {update.action.replace('workspace.','').replaceAll('.',' ')}<time className="block text-xs text-ink-muted">{new Date(update.at).toLocaleString(ar ? 'ar-SA' : 'en-GB')}</time></li>)}</ul>{updates.data?.updates.length === 0 && <p>{ar ? 'لا مستجدات بعد' : 'No updates yet'}</p>}</Section></>}
  {tab === 'plan' && <EventPlanEditor {...props} event={event} onChange={() => refresh(n => n+1)}/>}
  {tabUnlocked(event,tab) && (tab === 'permissions' || tab === 'teams') && <EventTeams {...props} event={event}/>}
  {tabUnlocked(event,tab) && tab === 'vendors' && <EventVendors {...props}/>}
  {tab === 'guests' && <EventGuests {...props} event={event}/>}
  {tabUnlocked(event,tab) && tab === 'inbox' && <WorkspaceInbox token={token} eventId={eventId} isArabic={ar}/>}
  {tabUnlocked(event,tab) && tab === 'radar' && <EventRadar key={`${token}:${event.id}`} token={token} event={event} isArabic={ar}/>}
 </div>;
}

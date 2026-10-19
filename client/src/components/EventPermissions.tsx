import { useState } from "react";
import { EVENT_MEMBER_ROLES, EVENT_PERMISSIONS, EVENT_SUBTEAMS, type EventMemberDto, type WorkspaceEventDto } from "@shared/overhaul";
import { useWorkspaceResource, workspaceRequest } from "../lib/workspaceApi";
import { Section } from "./Section";
import { workspaceButton, workspaceInput, type WorkspaceProps } from "./OrganizerWorkspace";

export function EventPermissions({ token, eventId, isArabic: ar, event }: WorkspaceProps & { event: WorkspaceEventDto }) {
  const [revision, refresh] = useState(0); const [error,setError] = useState(""); const [busy,setBusy] = useState(false);
  const resource = useWorkspaceResource<{ members: EventMemberDto[] }>(token, `/events/${eventId}/members`, revision);
  const canInvite = event.access.permissions.includes('INVITE');
  async function save(path: string, body: unknown, method = 'POST') { setBusy(true); setError(''); try { await workspaceRequest(token, `/events/${eventId}/members${path}`, body, method); refresh(n => n + 1); } catch(e) { setError(e instanceof Error ? e.message : 'Request failed'); } finally { setBusy(false); } }
  return <Section title={ar ? 'إدارة الفرق والصلاحيات' : 'Teams & permissions'} description={ar ? 'صلاحيات تشغيلية للتطبيق منفصلة عن العقود القانونية' : 'Operational app permissions are separate from legal employment contracts'}>
    {(error || resource.error) && <p role="alert" className="text-red-500">{error || resource.error}</p>}
    <div className="grid gap-3">{resource.data?.members.map(member => <article className="rounded border border-hairline p-3" key={member.id}><strong>{member.user.name}</strong><p className="text-sm">{member.role} · {member.subteam ?? '—'} · {member.status}</p><p>{member.workScope}</p><p className="text-xs text-ink-muted">{member.permissions.join(' · ')} · {ar ? 'ظهور للعميل' : 'Client visible'}: {String(member.clientVisible)} · {ar ? 'استقبال المهام' : 'Receives tasks'}: {String(member.canReceive)}</p>{canInvite && !event.access.support && <div className="mt-2 flex flex-wrap gap-2"><button className={workspaceButton} disabled={busy} onClick={() => void save(`/${member.id}`, { clientVisible: !member.clientVisible }, 'PATCH')}>{ar ? 'تغيير ظهور العميل' : 'Toggle client visibility'}</button><button className={workspaceButton} disabled={busy} onClick={() => void save(`/${member.id}`, { canReceive: !member.canReceive }, 'PATCH')}>{ar ? 'تغيير الاستقبال' : 'Toggle receiving'}</button><button className={workspaceButton} disabled={busy} onClick={() => void save(`/${member.id}`, { status: member.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE' }, 'PATCH')}>{member.status === 'ACTIVE' ? (ar ? 'إلغاء الوصول' : 'Revoke access') : (ar ? 'إعادة التفعيل' : 'Restore access')}</button></div>}</article>)}</div>
    {canInvite && <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void save('', { userId: f.get('userId'), role: f.get('role'), subteam: f.get('subteam') || null, workScope: f.get('workScope') || null, permissions: f.getAll('permissions'), clientVisible: f.get('clientVisible') === 'on', canReceive: f.get('canReceive') === 'on' }); }}>
      <label>{ar ? 'معرف العضو المسجل' : 'Registered user ID'}<input name="userId" required className={workspaceInput}/></label>
      <label>{ar ? 'الدور' : 'Role'}<select name="role" className={workspaceInput}>{EVENT_MEMBER_ROLES.map(role => <option key={role}>{role}</option>)}</select></label>
      <label>{ar ? 'الفريق الفرعي' : 'Sub-team'}<select name="subteam" className={workspaceInput}><option value="">—</option>{EVENT_SUBTEAMS.map(team => <option key={team}>{team}</option>)}</select></label>
      <label>{ar ? 'نطاق العمل' : 'Work scope'}<textarea name="workScope" maxLength={2000} className={workspaceInput}/></label>
      <fieldset className="flex flex-wrap gap-3"><legend>{ar ? 'الصلاحيات' : 'Permissions'}</legend>{EVENT_PERMISSIONS.map(permission => <label key={permission}><input type="checkbox" name="permissions" value={permission} defaultChecked={permission === 'VIEW'}/> {permission}</label>)}</fieldset>
      <div className="flex gap-3"><label><input type="checkbox" name="clientVisible"/> {ar ? 'ظاهر للعميل' : 'Visible to client'}</label><label><input type="checkbox" name="canReceive" defaultChecked/> {ar ? 'مستقبل للمهام' : 'Task receiver'}</label></div>
      <button className={workspaceButton} disabled={busy}>{ar ? 'إضافة عضو' : 'Add member'}</button>
    </form>}
  </Section>;
}

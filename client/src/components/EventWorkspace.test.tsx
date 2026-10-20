import { expect,it,vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { testEvent } from '../lib/workspaceWorkflow.test';
const state=vi.hoisted(()=>({ approved:false, plans:[] as unknown[], eventError:'' }));
vi.mock('../lib/workspaceApi',()=>({useWorkspaceResource: (_token:string,path:string)=>path.endsWith('/updates')?{data:{updates:[]}}:path.endsWith('/plans')?{data:{plans:state.plans}}:state.eventError?{error:state.eventError}:{data:{event:{...testEvent,planApproved:state.approved}}},workspaceRequest:vi.fn()}));
import { EventWorkspace, approvalBridgeActive, displayedEvent, type ApprovalBridge } from './EventWorkspace';
import { tabUnlocked, workspaceTabs } from '../lib/workspaceWorkflow';
const draft={id:'plan_new',version:1,status:'DRAFT',source:'DETERMINISTIC_ADVISORY',advisory:true,sourceLabel:'',summary:'Synthetic advisory',content:{logistics:['Arrivals'],hotelDistribution:{totalRooms:14},vehicleRequirements:{total:5},teamRequirements:[{subteam:'AIRPORT',minimumPeople:1}],scopeOfWork:['Arrivals']},generatedBy:{id:'u',name:'Synthetic'},approvedBy:null,approvedAt:null,createdAt:'2026-10-20T00:00:00Z'};
it('renders the locked event workspace and accessible bilingual plan guidance',()=>{
 state.approved=false;state.plans=[];const html=renderToStaticMarkup(<EventWorkspace token="synthetic-token" eventId="evt_test" isArabic={false}/>);
 expect(html).toContain('Synthetic summit');expect(html).toContain('Approve the plan to unlock'); expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(5);
 const ar=renderToStaticMarkup(<EventWorkspace token="synthetic-token" eventId="evt_test" isArabic/>);expect(ar).toContain('صندوق البريد');expect(ar).toContain('اعتمد الخطة');
});
it('uses persisted approval to enable operational navigation',()=>{
 state.approved=true;const html=renderToStaticMarkup(<EventWorkspace token="synthetic-token" eventId="evt_test" isArabic={false}/>);expect(html).not.toContain('Approve the plan to unlock');expect(html).toContain('Radar &amp; tracking');
});
it('opens a newly created event directly on its Plan tab with all five sections and the locked draft',()=>{
 state.approved=false;state.plans=[draft];
 const html=renderToStaticMarkup(<EventWorkspace token="synthetic-token" eventId="evt_test" isArabic={false} landing={{tab:'plan',planError:null,manual:false}}/>);
 expect(html).toContain('Operational plan');
 for(const key of ['logistics','hotelDistribution','vehicleRequirements','teamRequirements','scopeOfWork'])expect(html).toContain(`data-plan-section="${key}"`);
 expect(html).toContain('Locked draft');expect(html).toContain('Rules-based advisory — AI provider not configured');
 expect(html).toContain('Approve plan &amp; unlock operations');
 // Operational tabs remain locked until approval.
 expect(html).toContain('Approve the plan to unlock');
});
it('keeps the new event and offers a plan-generation retry after a failed automatic generation',()=>{
 state.approved=false;state.plans=[];
 const html=renderToStaticMarkup(<EventWorkspace token="synthetic-token" eventId="evt_test" isArabic={false} landing={{tab:'plan',planError:'Synthetic provider outage',manual:false}}/>);
 expect(html).toContain('The event was saved, but the plan proposal could not be generated');
 expect(html).toContain('Synthetic provider outage');expect(html).toContain('Retry plan generation');
 expect(html).toContain('Synthetic summit');
});
it('holds the approval response only while its own refetch is in flight; a denied or locked answer wins',()=>{
 const scope='synthetic-token:evt_test',locked={...testEvent,planApproved:false},unlocked={...testEvent,planApproved:true,approvedPlanId:'plan_new'};
 // Approve succeeded at revision 3; the bridge is for the refetch at revision 4.
 const bridge:ApprovalBridge={scope,revision:4,event:unlocked};
 const operational=(event:ReturnType<typeof displayedEvent>)=>event?workspaceTabs.filter(tab=>!['overview','plan','guests'].includes(tab)&&tabUnlocked(event,tab)):[];
 // In flight (previous locked data kept, or nothing yet): the explicit approval unlocks immediately.
 for(const pending of [{data:{event:locked},refreshing:true},{}]){
  expect(approvalBridgeActive(bridge,scope,4,pending)).toBe(true);
  expect(operational(displayedEvent(bridge,scope,4,pending))).toEqual(['vendors','teams','permissions','inbox','radar']);
 }
 // Denied refetch (access revoked): nothing renders from the bridge, no operational child can mount.
 const denied={error:'Event not found'};
 expect(approvalBridgeActive(bridge,scope,4,denied)).toBe(false);
 expect(displayedEvent(bridge,scope,4,denied)).toBeUndefined();
 // Fresh server answer is still locked: the server wins, every operational tab is locked again.
 const lockedAnswer={data:{event:locked}};
 expect(approvalBridgeActive(bridge,scope,4,lockedAnswer)).toBe(false);
 expect(displayedEvent(bridge,scope,4,lockedAnswer)).toBe(locked);
 expect(operational(displayedEvent(bridge,scope,4,lockedAnswer))).toEqual([]);
 // A confirmed approval also ends the bridge (the server's object is used).
 const confirmed={...unlocked,name:'Synthetic summit (server)'};
 expect(displayedEvent(bridge,scope,4,{data:{event:confirmed}})).toBe(confirmed);
 // Never across sessions, events or later refetches.
 for(const [otherScope,otherRevision] of [['other-token:evt_test',4],['synthetic-token:evt_other',4],[scope,5]] as const){
  expect(displayedEvent(bridge,otherScope,otherRevision,{data:{event:locked},refreshing:true})).toBe(locked);
 }
});
it('renders the real fetch error with Retry and no operational children after a denied refresh',()=>{
 state.plans=[draft];state.approved=true;
 const before=renderToStaticMarkup(<EventWorkspace token="synthetic-token" eventId="evt_test" isArabic={false} landing={{tab:'plan',planError:null,manual:false}}/>);
 expect(before).toContain('Synthetic summit');expect(before).toContain('Operational plan');
 state.eventError='Forbidden: event access was revoked';
 const after=renderToStaticMarkup(<EventWorkspace token="synthetic-token" eventId="evt_test" isArabic={false} landing={{tab:'plan',planError:null,manual:false}}/>);
 state.eventError='';
 expect(after).toContain('role="alert"');expect(after).toContain('Forbidden: event access was revoked');expect(after).toContain('Retry');
 for(const text of ['Synthetic summit','Operational plan','Radar &amp; tracking','Vendors','Event sections','Plan approved'])expect(after,text).not.toContain(text);
});
it('opens the manual plan form when the event was created in manual mode',()=>{
 state.approved=false;state.plans=[];
 const html=renderToStaticMarkup(<EventWorkspace token="synthetic-token" eventId="evt_test" isArabic={false} landing={{tab:'plan',planError:null,manual:true}}/>);
 expect(html).toContain('name="summary"');expect(html).not.toContain('Retry plan generation');
});

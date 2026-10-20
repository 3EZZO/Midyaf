import { describe, expect, it } from "vitest";
import { PLAN_SECTIONS, approvePlan, canViewRfq, categorizeEvents, createEventWithPlan, eventSetupBody, generateAdvisoryPlan, landingAfterSetup, planSections, tabUnlocked, unlockedTabs, workspaceTabs, type WorkspaceRequester } from "./workspaceWorkflow";
import type { EventPlanDto, WorkspaceEventDto } from "@shared/overhaul";
export const testEvent: WorkspaceEventDto = {
 id:'evt_test',organizationId:'org_test',name:'Synthetic summit',brief:null,venue:'Hall',locationLabel:'Riyadh',venueLat:null,venueLng:null,hotelZone:'North',planningMode:'AI',operationalStatus:'PLANNING',vipGuestCount:4,regularGuestCount:20,carCount:4,startAt:'2026-11-01T06:00:00Z',endAt:'2026-11-02T18:00:00Z',arrivalStartAt:null,departureEndAt:null,planApproved:false,planApprovedAt:null,approvedPlanId:null,contractSigned:false,contractSignedAt:null,access:{permissions:['VIEW','EDIT','SCOPE','INVITE'],eventRole:'PROJECT_MANAGER',organizationRole:null,support:false,guest:false}
};
it('categorizes actual company events without inventing KPI values',()=>{
 const grouped=categorizeEvents([testEvent,{...testEvent,id:'active',operationalStatus:'ACTIVE'},{...testEvent,id:'past',operationalStatus:'COMPLETED'}]);
 expect(grouped.PLANNING.map(e=>e.id)).toEqual(['evt_test']); expect(grouped.ACTIVE.map(e=>e.id)).toEqual(['active']); expect(grouped.COMPLETED.map(e=>e.id)).toEqual(['past']);
});
it('unlocks all operational tabs only from persisted explicit approval',()=>{
 for(const tab of workspaceTabs) { expect(tabUnlocked(testEvent,tab)).toBe(['overview','plan','guests'].includes(tab)); expect(tabUnlocked({...testEvent,planApproved:true},tab)).toBe(true); }
});

/**
 * RADAR-ORGANIZER-001: the setup flow is exercised through its actions with a
 * scripted requester standing in for the /workspace API (the server side of
 * the same flow runs against the real router in workspaceEvents.test.ts).
 */
const draftPlan: EventPlanDto = {
 id:'plan_new',version:1,status:'DRAFT',source:'DETERMINISTIC_ADVISORY',advisory:true,sourceLabel:'Deterministic advisory fallback',summary:'Synthetic advisory',
 content:{logistics:{phases:[]},hotelDistribution:{totalRooms:14},vehicleRequirements:{total:5},teamRequirements:[{subteam:'AIRPORT',minimumPeople:1}],scopeOfWork:['Arrivals']},
 generatedBy:{id:'u',name:'Synthetic'},approvedBy:null,approvedAt:null,createdAt:'2026-10-20T00:00:00Z'
};
type Call={path:string;body:unknown;method?:string};
function scripted(responses:Array<(call:Call)=>unknown>){
 const calls:Call[]=[];
 const request:WorkspaceRequester=async(path,body,method)=>{const call={path,body,method};calls.push(call);const next=responses.shift();if(!next)throw new Error(`unexpected ${path}`);return next(call);};
 return {calls,request};
}
const fields={organizationId:'org_test',name:'Synthetic summit',locationLabel:'Riyadh',planningMode:'AI',hotelZone:'',vipGuestCount:'4',regularGuestCount:'20',carCount:'4',startAt:'2026-11-01T09:00',endAt:'2026-11-02T21:00',arrivalStartAt:'',departureEndAt:''};

describe('event setup workflow',()=>{
 it('builds the strict create body in Riyadh time with no client-owned fields',()=>{
  const body=eventSetupBody(fields);
  expect(body).toEqual({organizationId:'org_test',name:'Synthetic summit',locationLabel:'Riyadh',planningMode:'AI',hotelZone:null,vipGuestCount:4,regularGuestCount:20,carCount:4,startAt:'2026-11-01T06:00:00.000Z',endAt:'2026-11-02T18:00:00.000Z',arrivalStartAt:null,departureEndAt:null});
  expect(body).not.toHaveProperty('planApproved');expect(body).not.toHaveProperty('contractSigned');
 });
 it('creates once, generates the advisory plan through the existing endpoint and lands on the Plan tab',async()=>{
  const {calls,request}=scripted([()=>({event:testEvent}),()=>({plan:draftPlan})]);
  const result=await createEventWithPlan(request,eventSetupBody(fields));
  expect(calls.map(c=>c.path)).toEqual(['/events','/events/evt_test/plans/generate']);
  expect(calls[1].body).toEqual({mode:'ADVISORY'});
  expect(result.plan?.status).toBe('DRAFT');expect(result.planError).toBeNull();
  expect(landingAfterSetup(result)).toEqual({tab:'plan',planError:null,manual:false});
  // The generated draft does not unlock anything by itself.
  expect(unlockedTabs(result.event)).toEqual(['overview','plan','guests']);
 });
 it('keeps the created event on plan failure and retries generation without creating again',async()=>{
  const {calls,request}=scripted([()=>({event:testEvent}),()=>{throw new Error('Synthetic provider outage');}]);
  const result=await createEventWithPlan(request,eventSetupBody(fields));
  expect(result.event.id).toBe('evt_test');expect(result.plan).toBeNull();expect(result.planError).toBe('Synthetic provider outage');
  expect(landingAfterSetup(result)).toEqual({tab:'plan',planError:'Synthetic provider outage',manual:false});
  const retry=scripted([()=>({plan:draftPlan})]);
  expect(await generateAdvisoryPlan(retry.request,result.event.id)).toEqual({plan:draftPlan,planError:null});
  expect([...calls,...retry.calls].filter(c=>c.path==='/events')).toHaveLength(1);
 });
 it('does not invent an advisory plan in manual mode; the Plan tab opens on the manual form',async()=>{
  const manual={...testEvent,planningMode:'MANUAL' as const};
  const {calls,request}=scripted([()=>({event:manual})]);
  const result=await createEventWithPlan(request,eventSetupBody({...fields,planningMode:'MANUAL'}));
  expect(calls.map(c=>c.path)).toEqual(['/events']);
  expect(landingAfterSetup(result)).toEqual({tab:'plan',planError:null,manual:true});
 });
 it('surfaces a failed create without calling plan generation',async()=>{
  const {calls,request}=scripted([()=>{throw new Error('Only organization owners and admins can create events');}]);
  await expect(createEventWithPlan(request,eventSetupBody(fields))).rejects.toThrow('owners and admins');
  expect(calls).toHaveLength(1);
 });
 it('approves explicitly through the existing gate and unlocks every operational tab from the server answer',async()=>{
  const approved={...testEvent,planApproved:true,approvedPlanId:'plan_new',planApprovedAt:'2026-10-20T01:00:00Z'};
  const {calls,request}=scripted([()=>({event:approved,plan:{...draftPlan,status:'APPROVED'}})]);
  const result=await approvePlan(request,'evt_test','plan_new');
  expect(calls).toEqual([{path:'/events/evt_test/plans/plan_new/approve',body:{confirm:true},method:undefined}]);
  expect(unlockedTabs(result.event)).toEqual([...workspaceTabs]);
  // Approval does not activate the event or sign anything.
  expect(result.event.operationalStatus).toBe('PLANNING');expect(result.event.contractSigned).toBe(false);
 });
 it('shows all five plan sections, including manual plans whose scope comes from items',()=>{
  expect(planSections(draftPlan.content).map(s=>s.key)).toEqual([...PLAN_SECTIONS]);
  expect(planSections(draftPlan.content).every(s=>s.value!==null)).toBe(true);
  expect(planSections({items:[{category:'OTHER',quantity:1,note:'Scope'}]}).find(s=>s.key==='scopeOfWork')?.value).toEqual([{category:'OTHER',quantity:1,note:'Scope'}]);
 });
 it('keeps RFQ drafts away from vendors and client viewers',()=>{
  expect(canViewRfq(testEvent)).toBe(true);
  expect(canViewRfq({...testEvent,access:{...testEvent.access,eventRole:'VENDOR'}})).toBe(false);
  expect(canViewRfq({...testEvent,access:{...testEvent.access,eventRole:'CLIENT_VIEWER'}})).toBe(false);
  expect(canViewRfq({...testEvent,access:{...testEvent.access,permissions:['VIEW']}})).toBe(false);
 });
});

import { expect,it,vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildRfqDraft, rfqRequirementsFromPlan, type EventPlanDto } from '@shared/overhaul';
import { testEvent } from '../lib/workspaceWorkflow.test';
const state=vi.hoisted(()=>({ plans:[] as unknown[] }));
vi.mock('../lib/workspaceApi',()=>({useWorkspaceResource:()=>({data:{plans:state.plans}}),workspaceRequest:vi.fn()}));
import { EventPlanEditor, PlanCard, RfqDraftPanel, sourceLabel } from './EventPlanEditor';

const rules={hotelDistribution:{vipSingleRooms:4,regularTwinRooms:10},vehicleRequirements:{vip:4,shuttle:2},teamRequirements:[{subteam:'AIRPORT',minimumPeople:1},{subteam:'HOTELS',minimumPeople:1}]};
const rfq=buildRfqDraft({eventId:'evt_test',planId:'plan_new',planVersion:1,planSource:'DETERMINISTIC_ADVISORY',event:{...testEvent},requirements:rfqRequirementsFromPlan('AI_PROVIDER',{},rules),generatedAt:new Date('2026-10-20T00:00:00Z')});
const plan={id:'plan_new',version:1,status:'DRAFT',source:'DETERMINISTIC_ADVISORY',advisory:true,sourceLabel:'',summary:'Synthetic advisory',content:{logistics:['Arrivals'],hotelDistribution:{totalRooms:14},vehicleRequirements:{total:6},teamRequirements:[],scopeOfWork:['Arrivals'],rfqDraft:rfq},generatedBy:{id:'u',name:'Synthetic'},approvedBy:null,approvedAt:null,createdAt:'2026-10-20T00:00:00Z'} satisfies EventPlanDto;
const card=(over:Partial<Parameters<typeof PlanCard>[0]>={})=>renderToStaticMarkup(<PlanCard plan={plan} ar={false} busy={false} canApprove canDraftRfq onApprove={()=>{}} onDraftRfq={()=>{}} {...over}/>);

it('labels the plan source truthfully: rules fallback, manual or AI advisory',()=>{
 expect(sourceLabel({source:'DETERMINISTIC_ADVISORY'},false)).toBe('Rules-based advisory — AI provider not configured; not AI output');
 expect(sourceLabel({source:'MANUAL'},false)).toBe('Manual plan');
 expect(sourceLabel({source:'AI_PROVIDER'},false)).toContain('advisory');
});
it('shows the stored RFQ draft as a draft with line items, reference and no prices or personal data',()=>{
 const html=card();
 expect(html).toContain(`data-rfq-reference="${rfq.reference}"`);
 expect(html).toContain('Draft — not sent to any vendor');
 for(const category of ['HOTEL_ROOMS','VEHICLES','STAFF'])expect(html).toContain(`data-rfq-category="${category}"`);
 expect(html).toContain('Vendor to quote');expect(html).not.toMatch(/SAR\s*\d|\$\d/);
 expect(html).toContain('Copy draft');expect(html).toContain('Download draft');expect(html).toContain('Regenerate RFQ draft');
 expect(html).not.toContain('Synthetic person');
});
it('offers approval only to approvers and only for drafts',()=>{
 expect(card()).toContain('Approve plan &amp; unlock operations');
 expect(card({canApprove:false})).not.toContain('Approve plan');
 expect(renderToStaticMarkup(<PlanCard plan={{...plan,status:'APPROVED'}} ar={false} busy={false} canApprove canDraftRfq={false} onApprove={()=>{}} onDraftRfq={()=>{}}/>)).not.toContain('Approve plan');
});
it('renders the RFQ panel in Arabic',()=>{
 const html=renderToStaticMarkup(<RfqDraftPanel rfq={rfq} ar/>);
 expect(html).toContain('مسودة طلب عروض الأسعار');expect(html).toContain('لم تُرسل لأي مورد');expect(html).toContain('يحدده المورد');
});
it('hides RFQ drafting from vendors and support while keeping the plan view',()=>{
 state.plans=[plan];
 const vendorEvent={...testEvent,access:{...testEvent.access,eventRole:'VENDOR' as const}};
 const vendor=renderToStaticMarkup(<EventPlanEditor token="t" eventId="evt_test" isArabic={false} event={vendorEvent} onChange={()=>{}}/>);
 expect(vendor).not.toContain('Regenerate RFQ draft');expect(vendor).toContain('data-plan-section="scopeOfWork"');
 const support=renderToStaticMarkup(<EventPlanEditor token="t" eventId="evt_test" isArabic={false} event={{...testEvent,access:{...testEvent.access,support:true}}} onChange={()=>{}}/>);
 expect(support).not.toContain('Regenerate RFQ draft');expect(support).not.toContain('Approve plan');
 const signed=renderToStaticMarkup(<EventPlanEditor token="t" eventId="evt_test" isArabic={false} event={{...testEvent,contractSigned:true}} onChange={()=>{}}/>);
 expect(signed).not.toContain('Regenerate RFQ draft');
});

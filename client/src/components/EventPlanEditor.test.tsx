import { expect,it,vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildRfqDraft, rfqRequirementsFromPlan, type EventPlanDto } from '@shared/overhaul';
import { testEvent } from '../lib/workspaceWorkflow.test';
const state=vi.hoisted(()=>({ plans:[] as unknown[] }));
vi.mock('../lib/workspaceApi',()=>({useWorkspaceResource:()=>({data:{plans:state.plans}}),workspaceRequest:vi.fn()}));
import {
  EventPlanEditor,
  InlinePlanEditor,
  PlanCard,
  RfqDraftPanel,
  isoToRiyadhLocal,
  reorderRow,
  riyadhLocalToIso,
  sourceLabel,
  validateEditablePlan
} from './EventPlanEditor';

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
it('respects server-computed viewerCanApprove for CLIENT_VIEWER and hides Approve from vendors',()=>{
 state.plans=[{...plan,viewerCanApprove:true}];
 const clientEvent={...testEvent,access:{...testEvent.access,organizationRole:null,eventRole:'CLIENT_VIEWER' as const,permissions:['VIEW' as const]}};
 const clientHtml=renderToStaticMarkup(<EventPlanEditor token="t" eventId="evt_test" isArabic={false} event={clientEvent} onChange={()=>{}}/>);
 expect(clientHtml).toContain('Approve plan &amp; unlock operations');
 state.plans=[{...plan,viewerCanApprove:false}];
 const vendorEvent={...testEvent,access:{...testEvent.access,organizationRole:null,eventRole:'VENDOR' as const,permissions:['VIEW' as const]}};
 const vendorHtml=renderToStaticMarkup(<EventPlanEditor token="t" eventId="evt_test" isArabic={false} event={vendorEvent} onChange={()=>{}}/>);
 expect(vendorHtml).not.toContain('Approve plan');
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

it('shows Edit AI Plan only when viewerCanEdit === true, displays planProvenanceLabel, and prefills inline editor',()=>{
 const editedAi: EventPlanDto = {
  ...plan,
  source: 'AI_PROVIDER',
  edited: true,
  viewerCanEdit: true,
  summary: 'Prefilled VIP logistics summary',
  content: {
   hotelDistribution: { zone: 'KAFD', vipSingleRooms: 6, regularTwinRooms: 14 },
   vehicleRequirements: { vip: 6, shuttle: 3 },
   teamRequirements: [{ subteam: 'AIRPORT', minimumPeople: 4 }],
   schedule: [{ subteam: 'AIRPORT', name: 'VIP landing wave', startsAt: '2027-02-10T09:00:00.000Z' }],
   scopeOfWork: ['Airport tarmac escort'],
   items: [{ category: 'VEHICLES', quantity: 6, note: 'Luxury SUVs' }]
  }
 };
 const saveStub = vi.fn(async () => ({ plan: editedAi, created: false }));

 const cardEn = renderToStaticMarkup(<PlanCard plan={editedAi} ar={false} busy={false} canApprove={false} canDraftRfq={false} onApprove={()=>{}} onDraftRfq={()=>{}} onSaveEdit={saveStub}/>);
 expect(cardEn).toContain('Edit AI Plan');
 expect(cardEn).toContain('AI-Generated (Edited)');

 const cardAr = renderToStaticMarkup(<PlanCard plan={editedAi} ar busy={false} canApprove={false} canDraftRfq={false} onApprove={()=>{}} onDraftRfq={()=>{}} onSaveEdit={saveStub}/>);
 expect(cardAr).toContain('تعديل الخطة');
 expect(cardAr).toContain('مولدة بالذكاء الاصطناعي (معدّلة)');

 const readOnly = renderToStaticMarkup(<PlanCard plan={{...editedAi, viewerCanEdit: false}} ar={false} busy={false} canApprove={false} canDraftRfq={false} onApprove={()=>{}} onDraftRfq={()=>{}} onSaveEdit={saveStub}/>);
 expect(readOnly).not.toContain('Edit AI Plan');

 const openEditor = renderToStaticMarkup(<InlinePlanEditor plan={editedAi} ar={false} onSave={saveStub} onCancel={()=>{}}/>);
 expect(openEditor).toContain('data-inline-plan-editor="plan_new"');
 expect(openEditor).toContain('Prefilled VIP logistics summary');
 expect(openEditor).toContain('KAFD');
 expect(openEditor).toContain('VIP landing wave');
 expect(openEditor).toContain('Airport tarmac escort');
 expect(openEditor).toContain('Luxury SUVs');
});

it('validates editable plan client-side with editablePlanSchema and supports row reordering & Riyadh time conversion',()=>{
 expect(reorderRow(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
 expect(reorderRow(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
 expect(reorderRow(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);

 const local = isoToRiyadhLocal('2027-02-10T09:00:00.000Z');
 expect(local).toBe('2027-02-10T12:00');
 expect(riyadhLocalToIso(local)).toBe('2027-02-10T09:00:00.000Z');
 expect(riyadhLocalToIso('')).toBeNull();

 const bad = validateEditablePlan({
  summary: 'X',
  hotelDistribution: { zone: null, vipSingleRooms: 0, regularTwinRooms: 0 },
  vehicleRequirements: { vip: 0, shuttle: 0 },
  teamRequirements: [],
  schedule: [],
  scopeOfWork: [],
  items: []
 }, false);
 expect(bad.ok).toBe(false);

 const badAr = validateEditablePlan({
  summary: 'X',
  hotelDistribution: { zone: null, vipSingleRooms: 0, regularTwinRooms: 0 },
  vehicleRequirements: { vip: 0, shuttle: 0 },
  teamRequirements: [],
  schedule: [],
  scopeOfWork: [],
  items: []
 }, true);
 expect(badAr.ok).toBe(false);
 if (!badAr.ok) expect(badAr.message).toContain('يرجى التحقق');

 const good = validateEditablePlan({
  summary: 'Complete operational plan',
  hotelDistribution: { zone: 'Diriyah', vipSingleRooms: 4, regularTwinRooms: 8 },
  vehicleRequirements: { vip: 4, shuttle: 2 },
  teamRequirements: [{ subteam: 'HOTELS', minimumPeople: 3 }],
  schedule: [{ subteam: 'HOTELS', name: 'Check-in desk', startsAt: '2027-02-10T09:00:00.000Z' }],
  scopeOfWork: ['Hotel hospitality desk', '   '],
  items: [{ category: 'HOTEL_ROOMS', quantity: 12, note: '   ' }]
 }, false);
 expect(good.ok).toBe(true);
 if (good.ok) {
  expect(good.payload.scopeOfWork).toEqual(['Hotel hospitality desk']);
  expect(good.payload.items).toEqual([{ category: 'HOTEL_ROOMS', quantity: 12 }]);
 }
});

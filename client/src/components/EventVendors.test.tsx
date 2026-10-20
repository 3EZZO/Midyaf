import { expect,it,vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildRfqDraft, rfqRequirementsFromPlan } from '@shared/overhaul';
import { testEvent } from '../lib/workspaceWorkflow.test';
const state=vi.hoisted(()=>({ paths:[] as Array<string|null>, rfq:null as unknown }));
vi.mock('../lib/workspaceApi',()=>({useWorkspaceResource:(_token:string,path:string|null)=>{state.paths.push(path);return path?.endsWith('/rfq')?{data:{rfq:state.rfq,planVersion:1}}:path?{data:{members:[]}}:{key:''};},workspaceRequest:vi.fn()}));
import { EventVendors } from './EventVendors';
const rules={hotelDistribution:{vipSingleRooms:2,regularTwinRooms:5},vehicleRequirements:{vip:2,shuttle:1},teamRequirements:[]};
const rfq=buildRfqDraft({eventId:'evt_test',planId:'plan_a',planVersion:1,planSource:'MANUAL',event:{...testEvent},requirements:rfqRequirementsFromPlan('AI_PROVIDER',null,rules),generatedAt:new Date('2026-10-20T00:00:00Z')});
const approved={...testEvent,planApproved:true};
it('shows the approved plan RFQ draft to the event team, marked as not sent, beside the existing vendor guidance',()=>{
 state.paths=[];state.rfq=rfq;
 const html=renderToStaticMarkup(<EventVendors token="t" eventId="evt_test" isArabic={false} event={approved}/>);
 expect(state.paths).toContain('/events/evt_test/rfq');
 expect(html).toContain('RFQ for the approved plan');expect(html).toContain(rfq.reference);expect(html).toContain('Draft — not sent to any vendor');
 expect(html).toContain('Assign an approved vendor through Teams &amp; permissions');
});
it('explains a missing draft instead of inventing one',()=>{
 state.paths=[];state.rfq=null;
 expect(renderToStaticMarkup(<EventVendors token="t" eventId="evt_test" isArabic={false} event={approved}/>)).toContain('No draft for the approved plan yet');
});
it('never requests or shows the RFQ draft for vendors or client viewers',()=>{
 for(const eventRole of ['VENDOR','CLIENT_VIEWER'] as const){
  state.paths=[];state.rfq=rfq;
  const html=renderToStaticMarkup(<EventVendors token="t" eventId="evt_test" isArabic={false} event={{...approved,access:{...approved.access,eventRole}}}/>);
  expect(state.paths).not.toContain('/events/evt_test/rfq');expect(html).not.toContain('RFQ');
 }
});

import { expect, it } from "vitest";
import { categorizeEvents, tabUnlocked, workspaceTabs } from "./workspaceWorkflow";
import type { WorkspaceEventDto } from "@shared/overhaul";
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

import{expect,it}from'vitest';import{dispatchFlows}from'./TaskDispatch';import{testEvent}from'../lib/workspaceWorkflow.test';
it('offers all six chains only to their stored sender roles',()=>{
 expect(dispatchFlows({...testEvent,access:{...testEvent.access,eventRole:null,organizationRole:null,guest:true}})).toEqual(['GUEST_TO_LM','GUEST_TO_SUPERVISOR','GUEST_TO_CAPTAIN']);
 expect(dispatchFlows({...testEvent,access:{...testEvent.access,organizationRole:null,eventRole:'LOGISTICS_MANAGER',permissions:['VIEW','EDIT']}})).toEqual(['LM_TO_SUPERVISOR','LM_TO_CAPTAIN_EMERGENCY']);
 expect(dispatchFlows({...testEvent,access:{...testEvent.access,organizationRole:'OWNER',eventRole:null}})).toEqual(['ORGANIZER_TO_LM']);
 expect(dispatchFlows({...testEvent,access:{...testEvent.access,support:true}})).toEqual([]);
});

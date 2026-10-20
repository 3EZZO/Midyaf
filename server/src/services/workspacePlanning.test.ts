import {expect,it,vi} from 'vitest';
import {generateWorkspacePlan} from './workspacePlanning.js';
const event={vipGuestCount:3,regularGuestCount:20,carCount:5,hotelZone:'Private hotel zone',locationLabel:'Private precise address',venue:'Private event name',startAt:new Date('2026-11-01'),endAt:new Date('2026-11-03'),arrivalStartAt:null,departureEndAt:null};
const plan={summary:'Advisory estimate, subject to approval',logistics:['Coordinate arrivals'],hotelDistribution:['Estimate 13 rooms'],vehicleRequirements:['Estimate five cars'],teamRequirements:['Confirm supervisor'],scopeOfWork:['Confirm approved scope']};
it('sends only anonymous counts and duration, validates all five sections and never approves',async()=>{
 const provider=vi.fn(async()=>JSON.stringify(plan)),result=await generateWorkspacePlan(event,provider);
 expect(provider).toHaveBeenCalledWith({vipCount:3,regularCount:20,vehicleCount:5,durationDays:2});expect(JSON.stringify(provider.mock.calls)).not.toContain('Private');expect(result.source).toBe('AI_PROVIDER');expect(result.advisory).toBe(true);expect(result).not.toHaveProperty('approvedAt');
});
it.each(['missing','timeout','invalid','extra'])('retains deterministic planning when provider is %s',async(reason)=>{
 const provider=async()=>{if(reason==='timeout')throw Error('Timeout');return reason==='missing'?null:reason==='extra'?JSON.stringify({...plan,approved:true}):'{"summary":"Unstructured"}';};
 const result=await generateWorkspacePlan(event,provider);expect(result.source).toBe('DETERMINISTIC_ADVISORY');expect(result.content).toHaveProperty('scopeOfWork');
});

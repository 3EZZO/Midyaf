import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import type{MemoryPrisma}from'../testing/memoryPrisma.js';import type{Harness}from'../testing/httpHarness.js';
const memory=vi.hoisted(()=>({current:undefined as unknown as MemoryPrisma}));
vi.mock('../db.js',async()=>{const{createMemoryPrisma}=await import('../testing/memoryPrisma.js');memory.current=createMemoryPrisma();return{prisma:memory.current.prisma};});
const{startHarness}=await import('../testing/httpHarness.js');const{buildWorkspaceTestWorld}=await import('../testing/memoryPrisma.js');const router=(await import('./workspace.js')).default;
const{actors:a,seed}=buildWorkspaceTestWorld();let http:Harness;
beforeAll(async()=>{http=await startHarness([['/w',router]]);});afterAll(async()=>{await http.close();});beforeEach(()=>{memory.current.seed(structuredClone(seed));});
it('separates captain-to-guest and guest-to-destination estimates without fabricating live routing',async()=>{
 const trip=memory.current.rows('trip')[0];Object.assign(trip,{originLat:24.71,originLng:46.61,destinationLat:24.85,destinationLng:46.8});memory.current.rows('vehicle')[0].lastSeenAt=new Date();
 const result=await http.post('/w/events/evt_a/trips/trip_1/eta',a.lm,{});expect(result.status).toBe(200);
 expect(result.body.eta.captainToGuest.source).toBe('APPROXIMATE');expect(result.body.eta.guestToDestination.minutes).toBeGreaterThan(result.body.eta.captainToGuest.minutes);
 expect(memory.current.rows('trip')[0].etaSource).toBe('APPROXIMATE');
 expect((await http.post('/w/events/evt_a/trips/trip_1/eta',a.capB,{})).status).toBe(404);
});
it('withholds private movements before calling routing and suppresses stale guest GPS',async()=>{
 expect((await http.post('/w/events/evt_a/trips/trip_2/eta',a.owner,{})).status).toBe(403);
 Object.assign(memory.current.rows('eventGuest')[0],{locationConsent:true,lastLat:24.7,lastLng:46.6,lastSeenAt:new Date(Date.now()-360000)});
 const result=await http.get('/w/events/evt_a/telemetry',a.lm);expect(result.status).toBe(200);
 expect(result.body.telemetry.guests.find((g:{id:string})=>g.id==='eg_gv01').position).toBe(null);
 expect(result.body.telemetry.weather.available).toBe(false);
});
it('withholds a private vehicle position in the fleet update response as in the snapshot',async()=>{
 // veh_2 carries masked guest G02, granted to the LM only.
 const snapshot=await http.get('/w/events/evt_a/telemetry',a.owner);
 expect(snapshot.body.telemetry.vehicles.find((v:{id:string})=>v.id==='veh_2')).toMatchObject({position:null,positionWithheld:true});
 const updated=await http.patch('/w/events/evt_a/vehicles/veh_2',a.owner,{label:'Synthetic van'});
 expect(updated.status).toBe(200);expect(updated.body.vehicle).toMatchObject({label:'Synthetic van',position:null,positionWithheld:true});
 const granted=await http.patch('/w/events/evt_a/vehicles/veh_2',a.lm,{label:'Synthetic van 2'});
 expect(granted.status).toBe(200);expect(granted.body.vehicle.position).toMatchObject({lat:24.71,lng:46.61});
 const open=await http.patch('/w/events/evt_a/vehicles/veh_1',a.owner,{label:'Synthetic sedan 2'});
 expect(open.body.vehicle).toMatchObject({positionWithheld:false,position:{lat:24.7,lng:46.6}});
});
const vehicleRow=(id:string)=>memory.current.rows('vehicle').find(v=>v.id===id)!;
const tripRow=(id:string)=>memory.current.rows('trip').find(t=>t.id===id)!;
function addCompletedTrip(){memory.current.rows('trip').push({...structuredClone(tripRow('trip_1')),id:'trip_done',status:'COMPLETED',inZone:true,scheduledAt:new Date('2026-10-30T05:00:00Z')});}
it('keeps a manual out-of-zone status, the vehicle zone flag and its open trip consistent',async()=>{
 addCompletedTrip();
 const out=await http.patch('/w/events/evt_a/vehicles/veh_1',a.lm,{status:'OUT_OF_ZONE'});
 expect(out.status).toBe(200);expect(out.body.vehicle).toMatchObject({status:'OUT_OF_ZONE',inZone:false});
 expect(vehicleRow('veh_1').inZone).toBe(false);expect(tripRow('trip_1').inZone).toBe(false);
 // A completed trip keeps its historical observation.
 expect(tripRow('trip_done').inZone).toBe(true);
 const snapshot=(await http.get('/w/events/evt_a/telemetry',a.lm)).body.telemetry;
 expect(snapshot.vehicles.find((v:{id:string})=>v.id==='veh_1').inZone).toBe(false);
 expect(snapshot.trips.find((t:{id:string})=>t.id==='trip_1').inZone).toBe(false);
 const back=await http.patch('/w/events/evt_a/vehicles/veh_1',a.lm,{status:'AVAILABLE'});
 expect(back.body.vehicle).toMatchObject({status:'AVAILABLE',inZone:true});expect(tripRow('trip_1').inZone).toBe(true);
 // A label edit reports nothing about the zone.
 tripRow('trip_1').inZone=false;
 expect((await http.patch('/w/events/evt_a/vehicles/veh_1',a.lm,{label:'Synthetic sedan 3'})).status).toBe(200);
 expect(tripRow('trip_1').inZone).toBe(false);
});
it('mirrors out-of-zone and return-to-zone position frames onto the open trip only',async()=>{
 addCompletedTrip();
 const out=await http.post('/w/events/evt_a/vehicles/veh_1/position',a.cap,{lat:24.9,lng:46.9,inZone:false});
 expect(out.status).toBe(200);expect(out.body.vehicle).toMatchObject({status:'OUT_OF_ZONE',inZone:false});
 expect(tripRow('trip_1').inZone).toBe(false);expect(tripRow('trip_done').inZone).toBe(true);
 const back=await http.post('/w/events/evt_a/vehicles/veh_1/position',a.cap,{lat:24.7,lng:46.6,inZone:true});
 expect(back.status).toBe(200);expect(back.body.vehicle).toMatchObject({status:'AVAILABLE',inZone:true});
 expect(vehicleRow('veh_1')).toMatchObject({inZone:true,status:'AVAILABLE',lastLat:24.7});
 expect(tripRow('trip_1').inZone).toBe(true);expect(tripRow('trip_done').inZone).toBe(true);
});
it('re-checks the reporting captain under the locks when revoked or reassigned in flight',async()=>{
 // The change commits between the route's pre-checks and its transaction.
 memory.current.beforeNext('$raw','$queryRaw',()=>{memory.current.rows('eventMembership').find(m=>m.id==='em_evt_a_u_cap')!.status='REVOKED';});
 expect((await http.post('/w/events/evt_a/vehicles/veh_1/position',a.cap,{lat:25,lng:47,inZone:false})).status).toBe(404);
 expect(vehicleRow('veh_1')).toMatchObject({lastLat:24.7,inZone:true,status:'ASSIGNED_TO_TASK',lastSeenAt:null});
 expect(tripRow('trip_1').inZone).toBe(true);
 memory.current.seed(structuredClone(seed));
 memory.current.beforeNext('$raw','$queryRaw',()=>{vehicleRow('veh_1').driverId=null;});
 expect((await http.post('/w/events/evt_a/vehicles/veh_1/position',a.cap,{lat:25,lng:47,inZone:false})).status).toBe(403);
 expect(vehicleRow('veh_1')).toMatchObject({lastLat:24.7,inZone:true,lastSeenAt:null});expect(tripRow('trip_1').inZone).toBe(true);
 memory.current.seed(structuredClone(seed));
 memory.current.beforeNext('$raw','$queryRaw',()=>{memory.current.rows('eventMembership').find(m=>m.id==='em_evt_a_u_cap')!.status='REVOKED';});
 expect((await http.patch('/w/events/evt_a/trips/trip_1',a.cap,{status:'EN_ROUTE_TO_PICKUP'})).status).toBe(404);
 expect(tripRow('trip_1').status).toBe('SCHEDULED');
});
it('re-checks the fleet manager and the privacy viewer of a vehicle update under the locks',async()=>{
 memory.current.beforeNext('$raw','$queryRaw',()=>{memory.current.rows('eventMembership').find(m=>m.id==='em_evt_a_u_lm')!.status='REVOKED';});
 expect((await http.patch('/w/events/evt_a/vehicles/veh_1',a.lm,{status:'OUT_OF_ZONE'})).status).toBe(404);
 expect(vehicleRow('veh_1')).toMatchObject({status:'ASSIGNED_TO_TASK',inZone:true});expect(tripRow('trip_1').inZone).toBe(true);
 expect(memory.current.rows('auditLog').some(r=>r.action==='workspace.vehicle.update')).toBe(false);
 memory.current.seed(structuredClone(seed));
 // The LM's grant for the private passenger of veh_2 is revoked in flight.
 memory.current.beforeNext('$raw','$queryRaw',()=>{const grants=memory.current.rows('guestPrivacyGrant');grants.splice(grants.findIndex(g=>g.id==='pg_g02_lm'),1);});
 const stale=await http.patch('/w/events/evt_a/vehicles/veh_2',a.lm,{label:'Synthetic van 3'});
 expect(stale.status).toBe(200);expect(stale.body.vehicle).toMatchObject({label:'Synthetic van 3',position:null,positionWithheld:true});
});
it('exposes only the authenticated guest journey and captain own fleet',async()=>{
 const own=await http.get('/w/events/evt_a/my-journey',a.guest);expect(own.status).toBe(200);expect(own.body.guest.guestCode).toBe('GV01');expect(own.body.trips).toHaveLength(1);
 expect((await http.get('/w/events/evt_b/my-journey',a.guest)).status).toBe(404);
 const captain=await http.get('/w/events/evt_a/telemetry',a.cap);expect(captain.body.telemetry.scope).toBe('CAPTAIN_SELF');expect(captain.body.telemetry.vehicles.map((v:{id:string})=>v.id)).toEqual(['veh_1']);expect(captain.body.telemetry.guests).toEqual([]);
});

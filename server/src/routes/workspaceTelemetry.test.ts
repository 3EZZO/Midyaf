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
it('exposes only the authenticated guest journey and captain own fleet',async()=>{
 const own=await http.get('/w/events/evt_a/my-journey',a.guest);expect(own.status).toBe(200);expect(own.body.guest.guestCode).toBe('GV01');expect(own.body.trips).toHaveLength(1);
 expect((await http.get('/w/events/evt_b/my-journey',a.guest)).status).toBe(404);
 const captain=await http.get('/w/events/evt_a/telemetry',a.cap);expect(captain.body.telemetry.scope).toBe('CAPTAIN_SELF');expect(captain.body.telemetry.vehicles.map((v:{id:string})=>v.id)).toEqual(['veh_1']);expect(captain.body.telemetry.guests).toEqual([]);
});

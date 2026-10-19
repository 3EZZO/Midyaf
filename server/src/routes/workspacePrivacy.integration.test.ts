import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {Router} from 'express';
import type {MemoryPrisma} from '../testing/memoryPrisma.js';
import type {Harness} from '../testing/httpHarness.js';
const memory=vi.hoisted(()=>({current:undefined as unknown as MemoryPrisma}));
vi.mock('../db.js',async()=>{const {createMemoryPrisma}=await import('../testing/memoryPrisma.js');memory.current=createMemoryPrisma();return{prisma:memory.current.prisma};});
const {startHarness}=await import('../testing/httpHarness.js');
const {buildWorkspaceTestWorld}=await import('../testing/memoryPrisma.js');
const {legacyWorkspaceBoundary,loadLegacyBoundary,sanitizeLegacyPayload}=await import('../utils/legacyWorkspaceBoundary.js');
const {requireAuth}=await import('../middleware/auth.js');
const events=(await import('./events.js')).default,workspace=(await import('./workspace.js')).default,messages=(await import('./messages.js')).default;
const {actors:a,seed}=buildWorkspaceTestWorld();let http:Harness;
beforeAll(async()=>{const legacy=Router();legacy.use(requireAuth,legacyWorkspaceBoundary);legacy.use('/events',events);legacy.use('/messages',messages);http=await startHarness([['/legacy',legacy],['/workspace',workspace]]);});
afterAll(async()=>{await http.close();});beforeEach(()=>{memory.current.seed(structuredClone(seed));});
it('excludes new organization events from the real legacy list and blocks direct mutation/export paths',async()=>{
 const result=await http.get('/legacy/events',a.lmOutsider);expect(result.status).toBe(200);expect(JSON.stringify(result.body)).not.toContain('evt_a');expect(JSON.stringify(result.body)).not.toContain('org_a');
 expect((await http.get('/legacy/events/evt_a',a.sa)).status).toBe(404);
 expect((await http.post('/legacy/events/evt_a/guests/import',a.sa,{guests:[]})).status).toBe(404);
});
it('redacts shared-user identity, old audit JSON, packed telemetry and indirect driver positions',async()=>{
 const guest=memory.current.rows('eventGuest').find(g=>g.id==='eg_gv01')!;Object.assign(guest,{privacyMasked:true,fullName:'PRIVATE FULL NAME',hotelName:'PRIVATE HOTEL'});
 const boundary=await loadLegacyBoundary();
 const payload=sanitizeLegacyPayload({users:[{id:'u_guest',name:'PRIVATE FULL NAME',email:'private@example.test',passport:'PRIVATE PASSPORT'}],drivers:[{id:'drv_cap',currentLat:24.765432,currentLng:46.654321,user:{id:'u_cap',name:'Captain'}}],audits:[{id:'audit_1',eventId:'evt_a',afterData:{fullName:'PRIVATE FULL NAME',hotel:'PRIVATE HOTEL'}}],notes:['Trip to PRIVATE HOTEL for PRIVATE FULL NAME','T1|drv_cap|24.765432|46.654321']},boundary);
 const json=JSON.stringify(payload);expect(json).not.toMatch(/PRIVATE|24\.765432|46\.654321|T1\|/);expect(json).toContain('GV01');
});
it('checks revoked access on actual thread detail, reply and unread routes',async()=>{
 const dispatched=await http.post('/workspace/events/evt_a/dispatch',a.lm,{flow:'LM_TO_SUPERVISOR',recipientUserIds:[a.sup.id],subject:'Scoped thread',body:'Synthetic update'});
 expect(dispatched.status).toBe(201);const id=dispatched.body.dispatch.conversationId;
 expect((await http.get(`/legacy/messages/conversations/${id}`,a.sup)).status).toBe(200);
 memory.current.rows('eventMembership').find(m=>m.userId===a.sup.id)!.status='REVOKED';
 expect((await http.get(`/legacy/messages/conversations/${id}`,a.sup)).status).toBe(404);
 expect((await http.post(`/legacy/messages/conversations/${id}/messages`,a.sup,{body:'Forbidden reply'})).status).toBe(404);
 expect((await http.get('/legacy/messages/unread-count',a.sup)).body.unread).toBe(0);
});
it('fails closed if the privacy catalog cannot be loaded',async()=>{
 memory.current.failNext('eventGuest','findMany',new Error('synthetic outage'));expect((await http.get('/legacy/events',a.sa)).status).toBe(500);
});

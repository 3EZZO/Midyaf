import type { RequestHandler } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from './http.js';
import type { AuthRequest } from '../types/auth.js';

/** New organization data is served exclusively through scoped workspace APIs.
 * Legacy global-role APIs receive neither the records nor their indirect JSON references.
 * This boundary runs before legacy handlers, including downloads and AI calls.
 */
export type LegacyBoundary = { ids: Set<string>; workspaceUsers: Set<string>; users: Map<string,string>; drivers: Set<string>; replacements: Map<string,string> };
export async function loadLegacyBoundary(): Promise<LegacyBoundary> {
 const events=await prisma.event.findMany({where:{organizationId:{not:null}},select:{id:true,organizationId:true},take:10001});
 if(events.length>10000)throw new HttpError(503,'Workspace boundary capacity exceeded');
 const eventIds=events.filter(e=>Boolean(e.organizationId)).map(e=>e.id);
 const [enrolled,organizations,applications,documents]=await Promise.all([
  prisma.user.findMany({where:{onboardingKind:{not:null}},select:{id:true},take:10001}),
  prisma.organization.findMany({select:{id:true},take:10001}),
  prisma.onboardingApplication.findMany({select:{id:true},take:10001}),
  prisma.onboardingDocument.findMany({select:{id:true},take:10001})
 ]);
 if([enrolled,organizations,applications,documents].some(rows=>rows.length>10000))throw new HttpError(503,'Workspace boundary capacity exceeded');
 const boundary:LegacyBoundary={ids:new Set([...eventIds,...organizations.map(row=>row.id),...applications.map(row=>row.id),...documents.map(row=>row.id)]),workspaceUsers:new Set(enrolled.map(row=>row.id)),users:new Map(),drivers:new Set(),replacements:new Map()};
 if(!eventIds.length)return boundary;
 const where={eventId:{in:eventIds}},select={id:true} as const,take=10001;
 const results=await Promise.allSettled([
  prisma.guest.findMany({where,select:{id:true,userId:true},take}),
  prisma.task.findMany({where,select,take}),prisma.booking.findMany({where,select,take}),
  prisma.activityIntake.findMany({where,select,take}),prisma.fileAsset.findMany({where,select,take}),
  prisma.auditLog.findMany({where,select,take}),
  prisma.eventGuest.findMany({where:{...where,privacyMasked:true},select:{id:true,guestId:true,guestCode:true,fullName:true,contactPhone:true,contactEmail:true,hotelName:true,ticketNumber:true},take}),
  prisma.trip.findMany({where:{...where,passengers:{some:{eventGuest:{privacyMasked:true}}}},select:{id:true,driverId:true},take})
 ]);
 for(const result of results)if(result.status==='rejected')throw result.reason;
 const [guests,tasks,bookings,intakes,files,audits,masked,trips]=await Promise.all([
  results[0].status==='fulfilled'?results[0].value:[],results[1].status==='fulfilled'?results[1].value:[],results[2].status==='fulfilled'?results[2].value:[],results[3].status==='fulfilled'?results[3].value:[],results[4].status==='fulfilled'?results[4].value:[],results[5].status==='fulfilled'?results[5].value:[],results[6].status==='fulfilled'?results[6].value:[],results[7].status==='fulfilled'?results[7].value:[]
 ]);
 for(const rows of [guests,tasks,bookings,intakes,files,audits,masked,trips]) { if(rows.length>10000)throw new HttpError(503,'Workspace boundary capacity exceeded');for(const row of rows)boundary.ids.add(row.id); }
 for(const guest of masked){
  const linked=guests.find(g=>g.id===guest.guestId);if(linked)boundary.users.set(linked.userId,guest.guestCode);
  for(const value of [guest.fullName,guest.contactPhone,guest.contactEmail,guest.hotelName,guest.ticketNumber])if(value&&value.length>=4)boundary.replacements.set(value,guest.guestCode);
 }
 for(const trip of trips)if(trip.driverId)boundary.drivers.add(trip.driverId);
 const intakeIds=intakes.map(row=>row.id),guestIds=guests.map(row=>row.id);
 const [plans,quotes,journeys,riders]=await Promise.all([
  prisma.aiLogisticsPlan.findMany({where:{intakeId:{in:intakeIds}},select,take}),prisma.vendorQuote.findMany({where:{intakeId:{in:intakeIds}},select,take}),prisma.guestJourneyRecord.findMany({where:{guestId:{in:guestIds}},select,take}),prisma.hospitalityRider.findMany({where:{guestId:{in:guestIds}},select,take})
 ]);
 const contracts=await prisma.vendorContract.findMany({where:{quoteId:{in:quotes.map(q=>q.id)}},select,take});
 for(const rows of [plans,quotes,journeys,riders,contracts]){if(rows.length>10000)throw new HttpError(503,'Workspace boundary capacity exceeded');for(const row of rows)boundary.ids.add(row.id);}
 return boundary;
}
const OMIT=Symbol('omit');
const refs=new Set(['id','eventId','guestId','taskId','intakeId','quoteId','entityId','conversationId']);
const positionKeys=/^(currentLat|currentLng|lastLat|lastLng|lat|lng|latitude|longitude|position|location|route|routePolyline|activeRoute|etaMinutes)$/i;
export function sanitizeLegacyPayload(value:unknown,boundary:LegacyBoundary):unknown {
 function visit(node:unknown,depth:number):unknown {
  if(depth>30)return null;
  if(typeof node==='string'){
   for(const id of [...boundary.ids,...boundary.drivers]) if(node.includes(id))return OMIT;
   let text=node;for(const [secret,code]of boundary.replacements)text=text.split(secret).join(code);return text;
  }
  if(!node||typeof node!=='object'||node instanceof Date||Buffer.isBuffer(node))return node;
  if(Array.isArray(node))return node.map(item=>visit(item,depth+1)).filter(item=>item!==OMIT);
  const row:Record<string,unknown>=Object.fromEntries(Object.entries(node));
  if(Object.entries(row).some(([key,ref])=>['id','userId','actorUserId'].includes(key)&&typeof ref==='string'&&boundary.workspaceUsers.has(ref)))return OMIT;
  if(Object.entries(row).some(([key,ref])=>refs.has(key)&&typeof ref==='string'&&boundary.ids.has(ref)))return OMIT;
  const userId=typeof row.id==='string'?row.id:typeof row.userId==='string'?row.userId:null;
  if(userId&&boundary.users.has(userId))return {id:userId,name:boundary.users.get(userId),email:'',phone:'',role:row.role};
  const driver=(typeof row.id==='string'&&boundary.drivers.has(row.id))||(typeof row.driverId==='string'&&boundary.drivers.has(row.driverId));
  const clean:Record<string,unknown>={};
  for(const [key,child]of Object.entries(row)){
   if(driver&&positionKeys.test(key)){clean[key]=null;continue;}
   const next=visit(child,depth+1);if(next!==OMIT)clean[key]=next;
  }
  return clean;
 }
 const result=visit(value,0);return result===OMIT?null:result;
}
function references(value:unknown,ids:Set<string>,depth=0):boolean {
 if(depth>30)throw new HttpError(400,'Request is nested too deeply');
 if(typeof value==='string')return ids.has(value);
 if(!value||typeof value!=='object')return false;
 return Object.values(value).some(child=>references(child,ids,depth+1));
}
const checked=new WeakSet<object>();
const scopedMessageResponses=new WeakSet<object>();
/** Called only after the scoped thread router validates participation, current
 * event access and its grant-aware privacy redactor. Lists are never exempt. */
export function markScopedMessageResponse(req:AuthRequest){scopedMessageResponses.add(req);}
export const legacyWorkspaceBoundary:RequestHandler=(req:AuthRequest,res,next)=>{
 if(checked.has(req)||req.path==='/health'){next();return;}
 Promise.resolve().then(async()=>{
  if(!req.user)requireAuth(req,res,()=>undefined);
  const boundary=await loadLegacyBoundary();checked.add(req);
  const protectedIds=new Set([...boundary.ids,...boundary.drivers,...[...boundary.users.keys(),...boundary.workspaceUsers].filter(id=>id!==req.user!.id)]);
  const pathIds=req.path.split('/').map(part=>decodeURIComponent(part));
  if(pathIds.some(id=>protectedIds.has(id))||references(req.query,protectedIds)||references(req.body,protectedIds))throw new HttpError(404,'Record not found');
  if(boundary.workspaceUsers.has(req.user!.id)&&req.method==='POST'&&/messages\/conversations$/.test(`${req.baseUrl}${req.path}`))throw new HttpError(409,'Use the scoped event inbox');
  // Global legacy mutations and provider prompts cannot operate over new tenant data.
  if(boundary.ids.size&&req.method!=='GET'&&/(?:\/ai(?:\/|$)|divert-fleet|operations\/telemetry|operations\/geofences)/.test(`${req.baseUrl}${req.path}`)){
   throw new HttpError(409,'Use the event workspace for scoped operations');
  }
  const json=res.json.bind(res);
  const outputBoundary=/messages\/conversations\/[^/]+/.test(`${req.baseUrl}${req.path}`)?{...boundary,workspaceUsers:new Set<string>()}:boundary;
  res.json=(body:unknown)=>json(scopedMessageResponses.has(req)?body:sanitizeLegacyPayload(body,outputBoundary));
 }).then(()=>next(),next);
};

export async function isWorkspaceDriver(driverId:string) {
 return Boolean(await prisma.trip.findFirst({where:{driverId,event:{organizationId:{not:null}}},select:{id:true}}));
}
export async function isWorkspaceGuest(userId:string) {
 return Boolean(await prisma.guest.findFirst({where:{userId,event:{organizationId:{not:null}}},select:{id:true}}));
}

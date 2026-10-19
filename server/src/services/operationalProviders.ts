import {z} from 'zod';
import {env} from '../env.js';

export type Point={lat:number;lng:number};
export type RouteEstimate={minutes:number|null;source:'PROVIDER'|'APPROXIMATE'|'UNAVAILABLE';provider:string;at:string;route:Point[]};
const point=z.object({lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180)});
const cache=new Map<string,{until:number;value:RouteEstimate}>();
let active=0;
export function approximateRoute(from:Point|null,to:Point|null):RouteEstimate {
 const at=new Date().toISOString();
 if(!from||!to||!point.safeParse(from).success||!point.safeParse(to).success)return{minutes:null,source:'UNAVAILABLE',provider:'Coordinates unavailable',at,route:[]};
 const radians=(v:number)=>v*Math.PI/180,dlat=radians(to.lat-from.lat),dlng=radians(to.lng-from.lng);
 const h=Math.sin(dlat/2)**2+Math.cos(radians(from.lat))*Math.cos(radians(to.lat))*Math.sin(dlng/2)**2;
 const km=6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
 return{minutes:Math.min(1440,Math.ceil(km*1.35/30*60)),source:'APPROXIMATE',provider:'Distance estimate · 30 km/h · no traffic',at,route:[]};
}
async function boundedJson(response:Response) {
 if(!response.ok||Number(response.headers.get('content-length')??0)>1048576||!response.body)throw Error('Provider unavailable');
 const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576)throw Error('Provider response too large');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
/** Server configuration only: never accept a proxy URL or a personal label from HTTP input. */
export async function estimateRoute(from:Point|null,to:Point|null,config=env.OSRM_BASE_URL,fetcher:typeof fetch=fetch):Promise<RouteEstimate> {
 const fallback=approximateRoute(from,to);
 if(!config||!from||!to||fallback.source==='UNAVAILABLE'||active>=4)return fallback;
 let base:URL;try{base=new URL(config);if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)))return fallback;if(base.username||base.password||base.search||base.hash)return fallback;}catch{return fallback;}
 const key=`${base.href}:${from.lat},${from.lng}:${to.lat},${to.lng}`;
 const old=cache.get(key);if(old&&old.until>Date.now())return old.value;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);active++;
 try{
  const url=new URL(`${base.pathname.replace(/\/$/,'')}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`,base.origin);
  url.search=new URLSearchParams({overview:'simplified',geometries:'geojson',steps:'false',alternatives:'false',skip_waypoints:'true'}).toString();
  const response=await boundedJson(await fetcher(url,{signal:controller.signal,redirect:'error',headers:{Accept:'application/json'}}));
  const route=z.object({code:z.literal('Ok'),routes:z.array(z.object({duration:z.number().finite().min(0).max(86400),geometry:z.object({type:z.literal('LineString'),coordinates:z.array(z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)])).min(2).max(5000)})})).min(1).max(3)}).parse(response).routes[0];
  const value:RouteEstimate={minutes:Math.ceil(route.duration/60),source:'PROVIDER',provider:'OSRM · road routing · no live traffic',at:new Date().toISOString(),route:route.geometry.coordinates.map(([lng,lat])=>({lat,lng}))};
  if(cache.size>=1000)cache.delete(cache.keys().next().value!);cache.set(key,{until:Date.now()+30000,value});return value;
 }catch{return fallback;}finally{clearTimeout(timer);active--;}
}
export async function dualEta(captain:Point|null,pickup:Point|null,destination:Point|null){
 const [captainToGuest,guestToDestination]=await Promise.all([estimateRoute(captain,pickup),estimateRoute(pickup,destination)]);
 return{captainToGuest,guestToDestination,advisory:'Routing estimates are advisory; traffic and operational delays are not included.'};
}

import {z} from 'zod';
import {env} from '../env.js';
import type { WeatherCondition, WeatherSnapshotDto } from '../../../shared/overhaul.js';

export type Point={lat:number;lng:number};
export type RouteEstimate={minutes:number|null;source:'PROVIDER'|'APPROXIMATE'|'UNAVAILABLE';provider:string;at:string;route:Point[]};
const point=z.object({lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180)});
const cache=new Map<string,{until:number;value:RouteEstimate}>();
const weatherCache=new Map<string,{until:number;value:WeatherSnapshotDto}>();
const OPEN_METEO_DEFAULT_BASE_URL='https://api.open-meteo.com';
const RIYADH_DEFAULT_POINT:Point={lat:24.7136,lng:46.6753};
let active=0;
let activeWeather=0;
export function approximateRoute(from:Point|null,to:Point|null):RouteEstimate {
 const at=new Date().toISOString();
 if(!from||!to||!point.safeParse(from).success||!point.safeParse(to).success)return{minutes:null,source:'UNAVAILABLE',provider:'Coordinates unavailable',at,route:[]};
 const radians=(v:number)=>v*Math.PI/180,dlat=radians(to.lat-from.lat),dlng=radians(to.lng-from.lng);
 const h=Math.sin(dlat/2)**2+Math.cos(radians(from.lat))*Math.cos(radians(to.lat))*Math.sin(dlng/2)**2;
 const km=6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
 return{minutes:Math.min(1440,Math.ceil(km*1.35/30*60)),source:'APPROXIMATE',provider:'Distance estimate · 30 km/h · no traffic',at,route:[]};
}
async function boundedJson(response:Response,maxBytes=1048576) {
 if(!response.ok||Number(response.headers.get('content-length')??0)>maxBytes||!response.body)throw Error('Provider unavailable');
 const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('Provider response too large');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function parseSafeBaseUrl(config:string):URL|null {
 try{
  const base=new URL(config);
  if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)))return null;
  if(base.username||base.password||base.search||base.hash)return null;
  return base;
 }catch{return null;}
}
/** Server configuration only: never accept a proxy URL or a personal label from HTTP input. */
export async function estimateRoute(from:Point|null,to:Point|null,config=env.OSRM_BASE_URL,fetcher:typeof fetch=fetch):Promise<RouteEstimate> {
 const fallback=approximateRoute(from,to);
 if(!config||!from||!to||fallback.source==='UNAVAILABLE'||active>=4)return fallback;
 const base=parseSafeBaseUrl(config);
 if(!base)return fallback;
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

/** Maps WMO weather interpretation code + wind speed into an operational condition & sandstorm advisory. */
export function classifyWeather(weatherCode:number,windSpeedKmh:number):{condition:WeatherCondition;sandstormRisk:boolean} {
 const storm=weatherCode>=95&&weatherCode<=99;
 const rain=(weatherCode>=51&&weatherCode<=67)||(weatherCode>=80&&weatherCode<=82);
 const fogOrHaze=weatherCode===45||weatherCode===48;
 const sandstormRisk=windSpeedKmh>=35||(fogOrHaze&&windSpeedKmh>=25)||storm;
 if(storm)return{condition:'STORM',sandstormRisk};
 if(sandstormRisk&&!rain)return{condition:'DUST_WIND',sandstormRisk:true};
 if(rain)return{condition:'RAIN',sandstormRisk};
 if(weatherCode===0||weatherCode===1)return{condition:'CLEAR',sandstormRisk:false};
 if(weatherCode===2||weatherCode===3||fogOrHaze)return{condition:'CLOUDY',sandstormRisk};
 return{condition:'UNKNOWN',sandstormRisk};
}

const openMeteoResponseSchema=z.object({
 current:z.object({
  time:z.string().min(1).max(64),
  temperature_2m:z.number().finite().min(-60).max(70),
  wind_speed_10m:z.number().finite().min(0).max(300),
  weather_code:z.number().int().min(0).max(99)
 })
});

export function clearWeatherCacheForTest(){
 weatherCache.clear();
}

/**
 * Live weather via Open-Meteo ($0, no API key, 10-minute server-side cache).
 * Automatically disabled in NODE_ENV=test unless a config URL is explicitly supplied.
 */
export async function fetchWeather(
 target:Point|null=RIYADH_DEFAULT_POINT,
 config?:string|null,
 fetcher:typeof fetch=fetch
):Promise<WeatherSnapshotDto> {
 const resolvedConfig=config!==undefined
  ? config
  : (env.WEATHER_BASE_URL ?? (env.NODE_ENV==='test'?null:OPEN_METEO_DEFAULT_BASE_URL));
 const unavailable=(source='Weather feed unavailable'):WeatherSnapshotDto=>({
  available:false,
  source,
  observedAt:null
 });
 if(!resolvedConfig||activeWeather>=4)return unavailable(env.NODE_ENV==='test'&&config===undefined?'No weather feed configured':'Weather feed unavailable');
 const base=parseSafeBaseUrl(resolvedConfig);
 if(!base)return unavailable('Invalid weather feed configuration');
 const coords=target&&point.safeParse(target).success?target:RIYADH_DEFAULT_POINT;
 const latKey=coords.lat.toFixed(2),lngKey=coords.lng.toFixed(2);
 const key=`${base.href}:${latKey},${lngKey}`;
 const cached=weatherCache.get(key);
 if(cached&&cached.until>Date.now())return cached.value;

 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
 activeWeather++;
 try{
  const url=new URL(`${base.pathname.replace(/\/$/,'')}/v1/forecast`,base.origin);
  url.search=new URLSearchParams({
   latitude:latKey,
   longitude:lngKey,
   current:'temperature_2m,wind_speed_10m,weather_code',
   timezone:'Asia/Riyadh'
  }).toString();
  const payload=await boundedJson(await fetcher(url,{signal:controller.signal,redirect:'error',headers:{Accept:'application/json'}}),65536);
  const {current}=openMeteoResponseSchema.parse(payload);
  const {condition,sandstormRisk}=classifyWeather(current.weather_code,current.wind_speed_10m);
  const value:WeatherSnapshotDto={
   available:true,
   source:'Open-Meteo',
   observedAt:new Date().toISOString(),
   temperatureC:Number(current.temperature_2m.toFixed(1)),
   windSpeedKmh:Number(current.wind_speed_10m.toFixed(1)),
   weatherCode:current.weather_code,
   condition,
   sandstormRisk
  };
  if(weatherCache.size>=200)weatherCache.delete(weatherCache.keys().next().value!);
  weatherCache.set(key,{until:Date.now()+600_000,value});
  return value;
 }catch{
  const fallbackValue=unavailable('Open-Meteo temporarily unavailable');
  // Negative-cache failures for 60s so telemetry polls never stall repeatedly on an upstream outage.
  if(weatherCache.size>=200)weatherCache.delete(weatherCache.keys().next().value!);
  weatherCache.set(key,{until:Date.now()+60_000,value:fallbackValue});
  return fallbackValue;
 }finally{
  clearTimeout(timer);
  activeWeather--;
 }
}

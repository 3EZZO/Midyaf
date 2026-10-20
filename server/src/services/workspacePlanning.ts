import OpenAI from 'openai';
import {z} from 'zod';
import {env} from '../env.js';
import {buildAdvisoryPlan} from '../utils/workspacePolicy.js';
type PlanningEvent=Parameters<typeof buildAdvisoryPlan>[0];
const section=z.array(z.string().trim().min(1).max(800)).min(1).max(12);
export const structuredPlan=z.object({summary:z.string().trim().min(1).max(2000),logistics:section,hotelDistribution:section,vehicleRequirements:section,teamRequirements:section,scopeOfWork:section}).strict();
type AnonymousScope={vipCount:number;regularCount:number;vehicleCount:number;durationDays:number};
let pending=0;
let windowStart=0,windowCalls=0;
async function complete(scope:AnonymousScope):Promise<string|null>{
 if(!env.OPENAI_API_KEY||pending>=2)return null;
 if(Date.now()-windowStart>60000){windowStart=Date.now();windowCalls=0;}
 if(windowCalls>=20)return null;windowCalls++;
 pending++;
 try{
  const client=new OpenAI({apiKey:env.OPENAI_API_KEY,timeout:6000,maxRetries:0});
  const response=await client.chat.completions.create({model:env.OPENAI_MODEL,max_tokens:1600,response_format:{type:'json_object'},messages:[{role:'system',content:'Create an advisory event logistics plan using only supplied anonymous counts. Do not invent confirmed inventory, hotel names, prices, personal identities, assignments or contracts. Return exactly summary (string), logistics, hotelDistribution, vehicleRequirements, teamRequirements, scopeOfWork (nonempty arrays of short strings). Human approval is mandatory. Describe estimates and assumptions explicitly.'},{role:'user',content:JSON.stringify(scope)}]});
  return response.choices[0]?.message.content??null;
 }finally{pending--;}
}
export async function generateWorkspacePlan(event:PlanningEvent,provider:(scope:AnonymousScope)=>Promise<string|null>=complete){
 try{
  const durationDays=Math.max(1,Math.ceil(((event.endAt?.getTime()??0)-(event.startAt?.getTime()??0))/86400000));
  const raw=await provider({vipCount:event.vipGuestCount,regularCount:event.regularGuestCount,vehicleCount:event.carCount,durationDays});
  if(raw&&raw.length<=20000){const {summary,...sections}=structuredPlan.parse(JSON.parse(raw));return{source:'AI_PROVIDER' as const,advisory:true,summary,content:{generator:'ai-advisory',...sections}};}
 }catch{/* Missing, timed-out or invalid provider output never replaces the usable fallback. */}
 return{source:'DETERMINISTIC_ADVISORY' as const,advisory:true,...buildAdvisoryPlan(event)};
}

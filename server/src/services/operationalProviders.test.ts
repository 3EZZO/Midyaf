import {expect,it,vi} from 'vitest';
import {approximateRoute,estimateRoute} from './operationalProviders.js';
const a={lat:24.7,lng:46.6},b={lat:24.8,lng:46.7};
it('keeps missing coordinates unavailable and labels distance fallback honestly',async()=>{
 expect(approximateRoute(null,b)).toMatchObject({source:'UNAVAILABLE',minutes:null});
 expect(await estimateRoute(a,b,undefined)).toMatchObject({source:'APPROXIMATE',provider:expect.stringContaining('no traffic')});
 expect(approximateRoute({lat:Infinity,lng:0},b).source).toBe('UNAVAILABLE');
});
it('uses OSRM longitude-latitude order and seconds to minutes, with bounded routing cache',async()=>{
 const fetcher=vi.fn(async(_url:unknown,_options?:unknown)=>new Response(JSON.stringify({code:'Ok',routes:[{duration:121,geometry:{type:'LineString',coordinates:[[46.6,24.7],[46.7,24.8]]}}]})));
 const first=await estimateRoute(a,b,'https://route.example.test',fetcher);
 expect(first).toMatchObject({source:'PROVIDER',minutes:3,route:[a,b]});
 expect(String(fetcher.mock.calls[0][0])).toContain('/46.6,24.7;46.7,24.8?');
 await estimateRoute(a,b,'https://route.example.test',fetcher);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('aborts a stalled route request and retains the approximate fallback',async()=>{
 vi.useFakeTimers();
 try{const fetcher=vi.fn((_url:unknown,options?:RequestInit)=>new Promise<Response>((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(Error('Abort')))));const pending=estimateRoute(a,b,'https://timeout.example.test',fetcher);await vi.advanceTimersByTimeAsync(4001);expect((await pending).source).toBe('APPROXIMATE');}finally{vi.useRealTimers();}
});
it.each(['malformed','oversize','network','redirect'])('falls back safely for %s responses',async(reason)=>{
 const fetcher=vi.fn(async()=>{if(reason==='network')throw Error('Offline');if(reason==='oversize')return new Response('{}',{headers:{'content-length':'2000000'}});if(reason==='redirect')return new Response('',{status:302});return new Response('{"code":"Ok","routes":[{"duration":-1}]}');});
 expect((await estimateRoute(a,b,`https://${reason}.example.test`,fetcher)).source).toBe('APPROXIMATE');
});
it('refuses credential-bearing and insecure nonlocal configurations without calling out',async()=>{
 const fetcher=vi.fn();await estimateRoute(a,b,'https://user:secret@route.example.test',fetcher);await estimateRoute(a,b,'http://untrusted.example.test',fetcher);expect(fetcher).not.toHaveBeenCalled();
});

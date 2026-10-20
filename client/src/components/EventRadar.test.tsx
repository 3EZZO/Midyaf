import {renderToStaticMarkup}from'react-dom/server';import{afterEach,expect,it,vi}from'vitest';import type{GuestDto,TelemetrySnapshotDto}from'@shared/overhaul';
import{testEvent}from'../lib/workspaceWorkflow.test';
const telemetry={eventId:'evt_test',vehicles:[{id:'v1',label:'Synthetic shuttle',plateNumber:'SYN-1',status:'AVAILABLE',driver:{id:'driver',name:'Synthetic captain'},position:null,positionWithheld:true,inZone:true,capacity:4}],trips:[],flights:[],shifts:[],density:[],scope:'FULL'} as unknown as TelemetrySnapshotDto;
const state=vi.hoisted(()=>({telemetry:{} as {data?:unknown;error?:string}}));
// Each path gets the shape its real route returns; /fleet-captains answers {captains:[]}.
vi.mock('../lib/workspaceApi',()=>({useWorkspaceResource:(_token:string,path:string)=>path.includes('/telemetry')?state.telemetry:path.includes('/fleet-captains')?{data:{captains:[]}}:{data:{tasks:[],members:[],recipients:[]}},workspaceRequest:vi.fn()}));
import{EventRadar,guestLabel,radarMapKey,radarShellClassName,radarTelemetry,routePoints}from'./EventRadar';
afterEach(()=>{state.telemetry={data:{telemetry}};});
state.telemetry={data:{telemetry}};
const render=()=>renderToStaticMarkup(<EventRadar token="synthetic" event={{...testEvent,planApproved:true}} isArabic={false}/>);
const controls=['Vehicle status','Map style','Tracking focus','Permitted guest positions','Recenter','Fullscreen'];
it('keeps map controls alongside filters and separate flight panels without fictitious live feeds',()=>{
 const html=render();
 for(const text of ['Tracking focus','Satellite','Vehicle status','Event guest flights','General flights','Captain shifts','Weather: unavailable','Position withheld for privacy'])expect(html).toContain(text);
 expect(html).not.toContain('Jamie Dimon');expect(html).not.toContain('Yasir');
});
it('puts all six radar controls in the shell chrome, before the Leaflet stage, so zoom and fullscreen keep them',()=>{
 const html=render(),shell=html.indexOf('map-shell'),chrome=html.indexOf('map-chrome'),stage=html.indexOf('map-stage');
 expect(shell).toBeGreaterThan(-1);expect(chrome).toBeGreaterThan(shell);expect(stage).toBeGreaterThan(chrome);
 for(const label of controls){const at=html.indexOf(label,chrome);expect(at,label).toBeGreaterThan(chrome);expect(at,label).toBeLessThan(stage);}
 // The vehicle filter used to sit outside the fullscreen shell.
 expect(html.indexOf('Vehicle status')).toBeGreaterThan(shell);
 expect(html).toContain('role="toolbar"');expect(html).toContain('aria-pressed="false"');
});
it('labels every map style by its real Esri source, never OpenStreetMap',()=>{
 const html=render();
 expect(html).not.toContain('OpenStreetMap');
 for(const label of ['Street map (Esri)','Satellite (Esri imagery)','Tactical (Esri dark gray)'])expect(html).toContain(label);
 expect(html).toMatch(/<option value="standard" selected="">Street map \(Esri\)<\/option>/);
});
it('keeps the map shell and controls mounted while telemetry is loading or failing, and still shows the error',()=>{
 state.telemetry={error:'Synthetic telemetry failure'};
 const failed=render();
 expect(failed).toContain('role="alert"');expect(failed).toContain('Synthetic telemetry failure');
 for(const label of controls)expect(failed).toContain(label);
 expect(failed).toContain('map-stage');
 state.telemetry={};
 const loading=render();
 expect(loading).toContain('Loading radar');
 for(const label of controls)expect(loading).toContain(label);
});
it('drops vehicles, trips, consented guest positions and fleet forms when a refresh is denied, keeping the controls and the same map',()=>{
 const sensitive={...telemetry,
  guests:[{id:'g2',guestCode:'GV02',fullName:'Synthetic consented guest',isVip:false,masked:false,position:{lat:24.7,lng:46.6,at:'2026-10-20T08:00:00Z'}}],
  trips:[{id:'t1',vehicleId:'v1',status:'EN_ROUTE_TO_PICKUP',driver:{id:'driver',name:'Synthetic captain'},passengers:[],origin:{label:'Synthetic hotel'},destination:{label:'Synthetic venue'},routePolyline:null,movementWithheld:false,inZone:true,eta:{captainToGuestMinutes:4,guestToDestinationMinutes:9,source:'APPROXIMATE',updatedAt:null}}],
  shifts:[{id:'s1',driver:{id:'driver',name:'Synthetic captain on shift'},status:'ON_SHIFT',available:true,startsAt:'2026-10-20T06:00:00Z',endsAt:'2026-10-20T18:00:00Z'}]} as unknown as TelemetrySnapshotDto;
 const fleetEvent={...testEvent,planApproved:true,access:{...testEvent.access,organizationRole:'OWNER' as const}};
 const view=()=>renderToStaticMarkup(<EventRadar token="synthetic" event={fleetEvent} isArabic={false}/>);
 state.telemetry={data:{telemetry:sensitive}};
 const before=view();
 for(const text of ['Synthetic shuttle','SYN-1','Synthetic captain on shift','GV02 · Synthetic consented guest','Manage vehicles, trips, shifts'])expect(before,text).toContain(text);
 // Access revoked (or consent expired) between polls: the server now answers 403.
 state.telemetry={error:'Forbidden: event access was revoked'};
 const after=view();
 expect(after).toContain('role="alert"');expect(after).toContain('Forbidden: event access was revoked');
 for(const text of ['Synthetic shuttle','SYN-1','Synthetic captain','GV02','Synthetic consented guest','Manage vehicles','Schedule trip','Last successful','last successful'])expect(after,text).not.toContain(text);
 for(const label of controls)expect(after,label).toContain(label);
 expect(after).toContain('map-stage');expect(after).toContain('role="toolbar"');
 // Same map identity before and after, so the Leaflet instance is not recreated by the denial.
 expect(radarMapKey('synthetic',fleetEvent.id)).toBe(radarMapKey('synthetic',fleetEvent.id));
 expect(radarMapKey('synthetic',fleetEvent.id)).not.toContain('telemetry');
 // Even a response object carrying both data and an error renders nothing sensitive.
 expect(radarTelemetry({data:{telemetry:sensitive},error:'Not found'})).toBeUndefined();
 expect(radarTelemetry({data:{telemetry:sensitive}})).toBe(sensitive);
 // The next successful answer renders again (no permanent blank state).
 state.telemetry={data:{telemetry}};
 expect(view()).toContain('Synthetic shuttle');
});
it('keeps Leaflet scoped in normal, native and fallback fullscreen',()=>{
 for(const mode of [null,'native','css'] as const)expect(radarShellClassName(mode).split(' ')).toEqual(expect.arrayContaining(['map-shell','flex-col','overflow-hidden']));
 expect(radarShellClassName('css').split(' ')).toEqual(expect.arrayContaining(['fixed','inset-0','z-map-full']));
 expect(radarShellClassName(null)).not.toContain('fixed');
});
it('shows masked guests as codes and refuses malformed route coordinates',()=>{
 expect(guestLabel({id:'synthetic',guestCode:'GV01',isVip:true,masked:true} satisfies GuestDto)).toBe('GV01');
 expect(routePoints('[{"lat":91,"lng":2}]')).toEqual([]);expect(routePoints('not-json')).toEqual([]);expect(routePoints('[{"lat":24.7,"lng":46.6}]')).toEqual([[24.7,46.6]]);
});

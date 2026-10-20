import {renderToStaticMarkup}from'react-dom/server';import{expect,it,vi}from'vitest';import type{GuestDto,TelemetrySnapshotDto}from'@shared/overhaul';
import{testEvent}from'../lib/workspaceWorkflow.test';
const data=vi.hoisted(()=>({telemetry:{eventId:'evt_test',vehicles:[{id:'v1',label:'Synthetic shuttle',plateNumber:'SYN-1',status:'AVAILABLE',driver:{id:'driver',name:'Synthetic captain'},position:null,positionWithheld:true,inZone:true,capacity:4}],trips:[],flights:[],shifts:[],density:[],scope:'FULL'} as TelemetrySnapshotDto}));
vi.mock('../lib/workspaceApi',()=>({useWorkspaceResource:(_token:string,path:string)=>path.includes('/telemetry')?{data}:{data:{tasks:[],members:[],recipients:[]}},workspaceRequest:vi.fn()}));
import{EventRadar,guestLabel,routePoints}from'./EventRadar';
it('keeps map controls alongside filters and separate flight panels without fictitious live feeds',()=>{
 const html=renderToStaticMarkup(<EventRadar token="synthetic" event={{...testEvent,planApproved:true}} isArabic={false}/>);
 for(const text of ['Tracking focus','Satellite','Vehicle status','Event guest flights','General flights','Captain shifts','Weather: unavailable','Position withheld for privacy'])expect(html).toContain(text);
 expect(html).not.toContain('Jamie Dimon');expect(html).not.toContain('Yasir');
});
it('shows masked guests as codes and refuses malformed route coordinates',()=>{
 expect(guestLabel({id:'synthetic',guestCode:'GV01',isVip:true,masked:true} satisfies GuestDto)).toBe('GV01');
 expect(routePoints('[{"lat":91,"lng":2}]')).toEqual([]);expect(routePoints('not-json')).toEqual([]);expect(routePoints('[{"lat":24.7,"lng":46.6}]')).toEqual([[24.7,46.6]]);
});

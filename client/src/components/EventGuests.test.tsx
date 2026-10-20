import {expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {guestListQuerySchema,WORKSPACE_LIMITS} from '@shared/overhaul';
import {testEvent} from '../lib/workspaceWorkflow.test';
const requested=vi.hoisted(()=>[] as string[]);
vi.mock('../lib/workspaceApi',()=>({useWorkspaceResource:(_token:string,path:string|null)=>{if(path)requested.push(path);return path?.includes('/guests?')?{data:{guests:[{id:'g',guestCode:'GV01',isVip:true,masked:true}],nextCursor:'cursor_next'}}:{data:undefined};},workspaceRequest:vi.fn(),workspaceDownload:vi.fn(),workspaceImport:vi.fn()}));
import {EventGuests,GuestCard} from './EventGuests';
it('renders only the code for a server-masked guest in both languages',()=>{
 for(const isArabic of [true,false]){const html=renderToStaticMarkup(<GuestCard guest={{id:'g',guestCode:'GV01',isVip:true,masked:true}} isArabic={isArabic} canEdit onPrivacy={()=>{}}/>);expect(html).toContain('GV01');expect(html).not.toContain('<h3>');expect(html).not.toContain('<button');}
});
it('requests the guest roster with a query the shared API schema accepts',()=>{
 requested.length=0;
 const html=renderToStaticMarkup(<EventGuests token="synthetic" eventId="evt_test" isArabic={false} event={testEvent}/>);
 const roster=requested.find(path=>path.startsWith('/events/evt_test/guests?'));
 expect(roster).toBeDefined();
 const url=new URL(roster!,'http://contract.test');
 expect(url.pathname).toBe('/events/evt_test/guests');
 const query=Object.fromEntries(url.searchParams);
 expect(guestListQuerySchema.safeParse(query).success).toBe(true);
 const parsed=guestListQuerySchema.parse(query);
 expect(parsed.limit).toBe(WORKSPACE_LIMITS.maxPage);
 expect(parsed.cursor).toBeUndefined();
 // The previous hard-coded page size was rejected by the server with a validation 400.
 expect(guestListQuerySchema.safeParse({limit:'200'}).success).toBe(false);
 expect(html).toContain('GV01');expect(html).toContain('Next page');expect(html).not.toContain('First page');
});

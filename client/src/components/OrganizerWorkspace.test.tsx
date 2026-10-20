import { expect,it,vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@shared/domain';
import { testEvent } from '../lib/workspaceWorkflow.test';
vi.mock('../lib/workspaceApi',()=>({useWorkspaceResource:(_token:string,path:string)=>path==='/onboarding/applications'?{data:{applications:[]}}:path==='/events'?{data:{events:[testEvent,{...testEvent,id:'active',operationalStatus:'ACTIVE'},{...testEvent,id:'past',operationalStatus:'COMPLETED'}]}}:{data:{organizations:[{id:'org_test',name:'Synthetic Co',myRole:'OWNER',kind:'ORGANIZER_COMPANY'}]}},workspaceRequest:vi.fn()}));
import { OrganizerWorkspace } from './OrganizerWorkspace';
const session={accessToken:'synthetic',refreshToken:'synthetic',user:{id:'synthetic-user',role:'ORGANIZER',name:'Synthetic organizer',email:'synthetic@example.test',phone:'',language:'en'}} satisfies Session;
it('shows categorized events and embeds the new-event entry in the Organizer dashboard',()=>{
 const html=renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic={false}/>);expect(html).toContain('Under planning (1)');expect(html).toContain('Active (1)');expect(html).toContain('Completed (1)');expect(html).toContain('New event &amp; planning');expect(html).toContain('24');
});
it('requires authentication and renders the Arabic unified entry',()=>{
 expect(renderToStaticMarkup(<OrganizerWorkspace isArabic={false}/>)).toContain('Sign in');expect(renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic/>)).toContain('إدخال وتجهيز فعالية جديدة');
});

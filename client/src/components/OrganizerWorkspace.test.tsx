import { expect,it,vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@shared/domain';
import type { OrganizationDto } from '@shared/overhaul';
import { testEvent } from '../lib/workspaceWorkflow.test';
vi.mock('../lib/workspaceApi',()=>({useWorkspaceResource:(_token:string,path:string)=>path==='/onboarding/applications'?{data:{applications:[]}}:path==='/events'?{data:{events:[testEvent,{...testEvent,id:'active',operationalStatus:'ACTIVE'},{...testEvent,id:'past',operationalStatus:'COMPLETED'}]}}:{data:{organizations:[{id:'org_test',name:'Synthetic Co',myRole:'OWNER',kind:'ORGANIZER_COMPANY'}]}},workspaceRequest:vi.fn()}));
import { EventSetupForm, OrganizerWorkspace } from './OrganizerWorkspace';
const session={accessToken:'synthetic',refreshToken:'synthetic',user:{id:'synthetic-user',role:'ORGANIZER',name:'Synthetic organizer',email:'synthetic@example.test',phone:'',language:'en'}} satisfies Session;
const organizations=[{id:'org_test',name:'Synthetic Co',myRole:'OWNER',kind:'ORGANIZER_COMPANY'}] as unknown as OrganizationDto[];
it('shows categorized events and embeds the new-event entry in the Organizer dashboard',()=>{
 const html=renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic={false}/>);expect(html).toContain('Under planning (1)');expect(html).toContain('Active (1)');expect(html).toContain('Completed (1)');expect(html).toContain('إدخال وتجهيز فعالية جديدة · Event Setup &amp; AI Planning');expect(html).toContain('24');
 // The form opens on demand; the dashboard itself carries no second creation form.
 expect(html).not.toContain('data-event-setup');
});
it('requires authentication and renders the Arabic unified entry',()=>{
 expect(renderToStaticMarkup(<OrganizerWorkspace isArabic={false}/>)).toContain('Sign in');expect(renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic/>)).toContain('إدخال وتجهيز فعالية جديدة');
});
it('embeds the single setup form under the exact Arabic heading in both languages',()=>{
 for(const isArabic of [true,false]){
  const html=renderToStaticMarkup(<EventSetupForm organizations={organizations} busy={false} isArabic={isArabic} onSubmit={()=>{}}/>);
  const heading=html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]??'';
  expect(heading).toContain('<span lang="ar" dir="rtl">إدخال وتجهيز فعالية جديدة</span>');
  expect(html.match(/<form/g)).toHaveLength(1);
  expect(html.indexOf('<form')).toBeGreaterThan(html.indexOf('إدخال وتجهيز فعالية جديدة'));
  for(const name of ['organizationId','name','locationLabel','hotelZone','planningMode','vipGuestCount','regularGuestCount','carCount','startAt','endAt','arrivalStartAt','departureEndAt'])expect(html).toContain(`name="${name}"`);
  // Assisted planning is the default and is described as advisory with human approval.
  expect(html).toMatch(/<option value="AI" selected="">/);
 }
 expect(renderToStaticMarkup(<EventSetupForm organizations={organizations} busy isArabic={false} onSubmit={()=>{}}/>)).toMatch(/<button[^>]*disabled=""[^>]*>Saving &amp; preparing the plan…<\/button>/);
});

import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import type {Session} from '@shared/domain';
const state=vi.hoisted(()=>({applications:[] as unknown[]}));
vi.mock('../lib/workspaceApi',()=>({useWorkspaceResource:()=>({data:state}),workspaceRequest:vi.fn(),workspaceDownload:vi.fn()}));
import {ApplicantRegistration,OnboardingWorkspace} from './OnboardingWorkspace';
const session={accessToken:'synthetic',refreshToken:'synthetic',user:{id:'applicant',role:'GUEST',name:'Applicant',email:'applicant@example.test',phone:'',language:'en',onboardingPending:true,onboardingKind:'VENDOR'}} satisfies Session;
it('lets unauthenticated applicants choose their own password and applicant type',()=>{
 const html=renderToStaticMarkup(<ApplicantRegistration isArabic={false} onLogin={async()=>{}} onBack={()=>{}}/>);
 expect(html).toContain('Vendor &amp; client registration');expect(html).toContain('new-password');expect(html).toContain('minLength="12"');expect(html).toContain('CLIENT');expect(html).not.toContain('SUPER_ADMIN');
});
it('restricts the pending applicant form to its enrolled organization kind',()=>{
 const html=renderToStaticMarkup(<OnboardingWorkspace session={session} isArabic={false}/>);
 expect(html).toContain('Submit an official request');expect(html).toContain('value="VENDOR"');expect(html).not.toContain('value="CLIENT"');expect(html).not.toContain('Activate account');
});
it('shows Arabic registration without a staff-session prerequisite',()=>{
 expect(renderToStaticMarkup(<ApplicantRegistration isArabic onLogin={async()=>{}} onBack={()=>{}}/>)).toContain('نظام تسجيل الموردين والعملاء');
});

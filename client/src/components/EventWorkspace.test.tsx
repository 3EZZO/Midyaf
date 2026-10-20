import { expect,it,vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { testEvent } from '../lib/workspaceWorkflow.test';
const state=vi.hoisted(()=>({ approved:false }));
vi.mock('../lib/workspaceApi',()=>({useWorkspaceResource: (_token:string,path:string)=>path.endsWith('/updates')?{data:{updates:[]}}:{data:{event:{...testEvent,planApproved:state.approved}}},workspaceRequest:vi.fn()}));
import { EventWorkspace } from './EventWorkspace';
it('renders the locked event workspace and accessible bilingual plan guidance',()=>{
 state.approved=false;const html=renderToStaticMarkup(<EventWorkspace token="synthetic-token" eventId="evt_test" isArabic={false}/>);
 expect(html).toContain('Synthetic summit');expect(html).toContain('Approve the plan to unlock'); expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(5);
 const ar=renderToStaticMarkup(<EventWorkspace token="synthetic-token" eventId="evt_test" isArabic/>);expect(ar).toContain('صندوق البريد');expect(ar).toContain('اعتمد الخطة');
});
it('uses persisted approval to enable operational navigation',()=>{
 state.approved=true;const html=renderToStaticMarkup(<EventWorkspace token="synthetic-token" eventId="evt_test" isArabic={false}/>);expect(html).not.toContain('Approve the plan to unlock');expect(html).toContain('Radar &amp; tracking');
});

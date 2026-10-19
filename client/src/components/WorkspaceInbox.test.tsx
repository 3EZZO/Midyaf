import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('../lib/workspaceApi',()=>({useWorkspaceResource:(_token:string,path:string)=>path?.startsWith('/inbox')?{data:{items:[{conversationId:'synthetic',subject:'Client pickup',preview:'Arrival',messageClass:'TASK',taskSource:'CLIENT_TASK',unreadCount:2,lastMessageAt:'2026-10-19T12:00:00Z'}],nextCursor:null}}:{data:undefined},workspaceRequest:vi.fn()}));
import {taskSourceLabel,WorkspaceInbox} from './WorkspaceInbox';
it('badges persisted client tasks and unread messages, and offers task-source filters',()=>{
 const html=renderToStaticMarkup(<WorkspaceInbox token="synthetic" isArabic={false} eventId="event"/>);
 expect(html).toContain('Client pickup');expect(html).toContain('Client Tasks');expect(html).toContain('Logistics Team Tasks');expect(html).toContain('New message / inquiry / alert');expect(html).toContain('>2</span>');
});
it('does not falsely classify plain messages as logistics tasks',()=>{
 expect(taskSourceLabel(null,false)).toBe(null);expect(taskSourceLabel('CLIENT_TASK',true)).toBe('مهام العميل');
});

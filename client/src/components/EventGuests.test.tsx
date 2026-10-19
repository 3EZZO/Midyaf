import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {GuestCard} from './EventGuests';
it('renders only the code for a server-masked guest in both languages',()=>{
 for(const isArabic of [true,false]){const html=renderToStaticMarkup(<GuestCard guest={{id:'g',guestCode:'GV01',isVip:true,masked:true}} isArabic={isArabic} canEdit onPrivacy={()=>{}}/>);expect(html).toContain('GV01');expect(html).not.toContain('<h3>');expect(html).not.toContain('<button');}
});

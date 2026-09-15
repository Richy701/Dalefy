import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MobilePreview } from '../../src/components/workspace/MobilePreview';
import '../../src/index.css';
import type { Trip } from '../../src/types';
const sample = {
  id:'preview-test', name:'Paris weekend', destination:'Paris, France', start:'2026-09-20', end:'2026-09-22',
  image:'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800', paxCount:'2',
  events:[{id:'dinner',type:'dining',title:'Welcome dinner',location:'Paris',date:'2026-09-20',time:'19:00',description:'An evening together.'}],
  info:[{id:'info',title:'Arrival information',body:'Meet in the hotel lobby.'},{id:'private',title:'Leader only',body:'Must not appear',leaderOnly:true}], documents:[],
} as Trip;
function Harness() {
 const [trip,setTrip]=useState(sample); const [active,setActive]=useState<string|null>(null);
 return <><p>Local verification · real editor preview</p><button onClick={()=>setTrip({...trip,name:'Paris updated instantly'})}>Edit title</button><button onClick={()=>setActive(active?null:'dinner')}>Toggle event editor</button><div style={{height:850,width:520}}><MobilePreview trip={trip} activeEventId={active} onClose={()=>{}}/></div></>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);

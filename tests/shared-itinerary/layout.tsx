import { createRoot } from 'react-dom/client';
import { SharedTripView } from '../../src/pages/SharedTripPage';
import { resolvedBrand } from '../../src/config/brand';
import type { Trip } from '../../src/types';
import '../../src/index.css';
const trip = {
 id:'layout-review',name:'A long weekend in Paris',destination:'Paris, France',start:'2026-10-10',end:'2026-10-13',status:'Published',attendees:'2',
 image:'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1400',
 events:[
 {id:'flight',type:'flight',title:'London to Paris',airline:'British Airways',flightNum:'BA304',depAirport:'LHR',arrAirport:'CDG',date:'2026-10-10',time:'09:00',endTime:'11:20',location:'London to Paris',duration:'1h 20m'},
 {id:'hotel',type:'hotel',title:'A stay in Saint-Germain-des-Prés',date:'2026-10-10',endDate:'2026-10-13',time:'15:00',checkout:'11:00',location:'Saint-Germain-des-Prés, Paris',roomType:'Deluxe double room'},
 {id:'walk',type:'activity',title:'An afternoon along the Seine',date:'2026-10-11',time:'14:00',location:'Pont Neuf, Paris',description:'Meet your guide at the bridge for a walk through the neighbourhood, with time to explore the cafés and galleries.'},
 {id:'dinner',type:'dining',title:'Farewell dinner',date:'2026-10-12',time:'19:30',location:'Paris'}],
 organizer:{name:'Alex Morgan',role:'Trip organiser',email:'organiser@example.com',phone:'+44 20 7946 0000'},
 info:[{id:'arrival',title:'Before you travel',body:'Bring your passport and travel documents. Your organiser can help if your plans change.'}],
 documents:[{id:'doc',name:'Paris traveller information.pdf',url:'#',size:125000,mimeType:'application/pdf',uploadedAt:''}],
} as Trip;
createRoot(document.getElementById('root')!).render(<SharedTripView trip={trip} brand={resolvedBrand()} />);

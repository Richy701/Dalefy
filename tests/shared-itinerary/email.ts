import { renderItineraryEmail } from '../../src/lib/itineraryEmail';
const email = renderItineraryEmail({brandName:'Dalefy',platformName:'Dalefy',tripName:'Barbados',destination:'Barbados',start:'2026-11-25',end:'2026-12-01',message:'Your itinerary is ready. Have a great trip!',shareUrl:'https://dalefy.app/#/shared/sample'});
const frame = document.createElement('iframe');
frame.title='Itinerary email';frame.srcdoc=email.html;frame.style.cssText='border:0;width:100%;height:100vh;display:block';document.body.append(frame);

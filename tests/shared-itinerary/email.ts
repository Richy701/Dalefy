import { renderItineraryEmail } from '../../src/lib/itineraryEmail';
import { EMAIL_TEMPLATES } from '../../src/data/emailTemplates';

const toolbar = document.createElement('div');
toolbar.style.cssText = 'padding:16px;display:flex;gap:12px;flex-wrap:wrap;font:14px system-ui;background:white;border-bottom:1px solid #ddd';
const templates = document.createElement('select');
templates.setAttribute('aria-label', 'Email template');
for (const item of EMAIL_TEMPLATES) templates.add(new Option(item.label, item.id));
const widths = document.createElement('select');
widths.setAttribute('aria-label', 'Preview width');
for (const [label, value] of [['Desktop', '720'], ['Mobile', '375']]) widths.add(new Option(label, value));
toolbar.append(templates, widths);
const frame = document.createElement('iframe');
frame.title = 'Itinerary email';
frame.style.cssText = 'border:0;max-width:100%;height:calc(100vh - 64px);display:block;margin:0 auto;background:white';
frame.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
function render() {
  const selected = EMAIL_TEMPLATES.find(item => item.id === templates.value)!;
  const values: Record<string, string> = { tripName: 'Barbados', dates: '25 November – 1 December 2026', destination: 'Barbados', brandName: 'Dalefy' };
  const message = selected.body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] || key);
  const email = renderItineraryEmail({ template: selected.id, brandName: 'Dalefy', platformName: 'Dalefy', tripName: 'Barbados', destination: 'Barbados', start: '2026-11-25', end: '2026-12-01', message: message || 'A personal note about your upcoming trip.', shareUrl: 'https://dalefy.app/#/shared/sample', shortCode: 'ABC123', organizer: { name: 'Your organiser', role: 'Travel coordinator' } });
  frame.srcdoc = email.html.replace('<head>', '<head><base target="_blank">');
  frame.style.width = `${widths.value}px`;
}
templates.addEventListener('change', render);
widths.addEventListener('change', render);
document.body.append(toolbar, frame);
render();

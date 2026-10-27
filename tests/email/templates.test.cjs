const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const output = mkdtempSync(path.join(require('node:os').tmpdir(), 'dalefy-email-'));
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), ...['src/lib/itineraryEmail.ts', 'src/lib/email/templates.ts', 'src/data/emailTemplates.ts'].map(p => path.join(root, p)), '--outDir', output, '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck'], { cwd: output, stdio: 'pipe' });
const { renderItineraryEmail } = require(path.join(output, 'lib/itineraryEmail.js'));
const { paragraphs } = require(path.join(output, 'lib/email/layout.js'));
const { tripUpdatedEmail, DALEFY_BRAND, inviteEmail, verifyEmail, resetPasswordEmail, magicLinkEmail } = require(path.join(output, 'lib/email/templates.js'));
const { EMAIL_TEMPLATES } = require(path.join(output, 'data/emailTemplates.js'));
after(() => rmSync(output, { recursive: true, force: true }));
const base = { brandName: 'Example Travel', platformName: 'Dalefy', tripName: 'A long journey through Italy & the Mediterranean', start: '2026-11-25', end: '2026-12-01', destination: 'Italy', message: 'Welcome.', shareUrl: 'https://dalefy.app/shared/example' };

test('all traveller templates render with safe text, valid actions and consistent app naming', () => {
  for (const template of EMAIL_TEMPLATES) {
    const message = template.body.replace(/\{\{(\w+)\}\}/g, (_, key) => ({ ...base, dates: '25 November – 1 December' }[key] || ''));
    const email = renderItineraryEmail({ ...base, template: template.id, message });
    assert.ok(email.html.includes(base.shareUrl));
    assert.ok(email.html.includes('Italy &amp; the Mediterranean'));
    assert.ok(!email.html.includes('{{'));
    assert.ok(!email.text.includes('Example Travel app'));
  }
});

test('trip details appear in HTML and text without inventing duration for missing dates', () => {
  const normal = renderItineraryEmail(base);
  for (const label of ['Departure', 'Return', 'Duration', '6 nights']) {
    assert.ok(normal.html.includes(label));
    assert.ok(normal.text.includes(label));
  }
  const unknown = renderItineraryEmail({ ...base, start: '', end: '' });
  assert.ok(unknown.html.includes('Dates to be confirmed'));
  assert.ok(!unknown.html.includes('0 nights'));
  assert.ok(!unknown.html.includes('Invalid Date'));
  assert.ok(renderItineraryEmail({ ...base, end: base.start }).html.includes('Day trip'));
});

test('checklists have semantic list items and escape user content', () => {
  const rendered = paragraphs('Before you travel:\n• Passport\n• <script>alert(1)</script>');
  assert.ok(rendered.html.includes('<ul '));
  assert.equal((rendered.html.match(/<li /g) || []).length, 2);
  assert.ok(!rendered.html.includes('<script>'));
  assert.ok(rendered.text.includes('• Passport'));
});

test('updates prioritise changes and disclose omitted items in HTML and plain text', () => {
  const mail = tripUpdatedEmail({ brand: DALEFY_BRAND, tripName: 'Italy', shareUrl: base.shareUrl, image: 'https://example.com/cover.jpg', changes: Array.from({ length: 15 }, (_, i) => `Change ${i + 1}`) });
  assert.ok(!mail.html.includes('https://example.com/cover.jpg'));
  assert.ok(mail.html.includes('3 more updates'));
  assert.ok(mail.text.includes('3 more updates'));
});


test('all account emails provide matching Outlook and standard actions with sized logos', () => {
  const url = 'https://dalefy.app/action?code=sample&mode=test';
  const emails = [
    inviteEmail({ inviterName: 'Alex', orgName: 'Example', role: 'agent', acceptUrl: url, expiresAt: '2026-11-03' }),
    verifyEmail({ verifyUrl: url }), resetPasswordEmail({ resetUrl: url }), magicLinkEmail({ signInUrl: url }),
    renderItineraryEmail({ ...base, brandName: 'Dalefy', shareUrl: url }),
  ];
  for (const { html, text } of emails) {
    assert.ok(html.includes('<o:PixelsPerInch>96</o:PixelsPerInch>'));
    assert.ok(html.includes('width="600" align="center"'));
    assert.ok(html.includes('width="36" height="36"'));
    assert.ok(html.includes('<v:roundrect href="https://dalefy.app/action?code=sample&amp;mode=test"'));
    assert.ok(html.includes('<a href="https://dalefy.app/action?code=sample&amp;mode=test"'));
    assert.ok(text.includes(url));
    const outlook = html.replace(/<!--\[if !mso\]><!-->[\s\S]*?<!--<!\[endif\]-->/g, '');
    assert.equal((outlook.match(/<v:roundrect/g) || []).length, 1);
    assert.ok(!outlook.includes('fonts.googleapis.com'));
    assert.ok(!outlook.includes('display:inline-block;padding:16px 28px'));
  }
});

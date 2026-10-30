// Send one real message to check a template.
// Usage: node scripts/test-send.js 971501234567 renewal_reminder_before
import { CONFIG } from '../src/config.js';
import { sendTemplate } from '../src/whatsapp.js';
import { preview, TEMPLATE_NAMES } from '../src/templates.js';
import { normalisePhone } from '../src/phone.js';

const to = normalisePhone(process.argv[2]);
const templateName = process.argv[3] || TEMPLATE_NAMES.before;

if (!to) {
  console.log('Usage: node scripts/test-send.js <number> [template name]');
  console.log('Templates:', Object.values(TEMPLATE_NAMES).join(', '));
  process.exit(1);
}

const params = ['Test Customer', 'Establishment Card', '10/11/2026', '30'];
console.log(`\nSending "${templateName}" to +${to}`);
console.log(`Preview: ${preview({ templateName, params })}\n`);

const r = await sendTemplate({ to, templateName, language: CONFIG.wa.lang, params });
console.log(r.ok ? `Sent. Message id: ${r.id}` : `Failed: ${r.error}`);

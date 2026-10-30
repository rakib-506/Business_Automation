// Checks the sheet, rules, data and WhatsApp connection before going live.
// Usage: npm run check-setup
import { CONFIG } from '../src/config.js';
import { listTabs, readTab } from '../src/sheets.js';
import { buildRules } from '../src/rules.js';
import { normalisePhoneList } from '../src/phone.js';
import { parseDate } from '../src/dates.js';

let problems = 0;
const ok = (m) => console.log(`  OK      ${m}`);
const bad = (m) => { problems++; console.log(`  PROBLEM ${m}`); };

console.log('\nChecking setup...\n');

// Google Sheet
let tabs = [];
try {
  tabs = await listTabs();
  ok(`Connected to the Google Sheet (${tabs.length} tabs).`);
} catch (e) {
  bad(`Cannot open the Google Sheet: ${e.message}`);
  console.log('          Check SHEET_ID and share the sheet with the service account as Editor.');
  process.exit(1);
}

for (const t of ['RULES', 'MESSAGE LOG']) {
  tabs.includes(t) ? ok(`Tab "${t}" exists.`) : bad(`Tab "${t}" is missing.`);
}

// Rules
const rules = buildRules((await readTab('RULES')).rows);
ok(`RULES tab has ${rules.size} services.`);

const serviceTabs = tabs.filter((t) => !CONFIG.reservedTabs.includes(t));
for (const t of serviceTabs) {
  if (!rules.has(t.trim().toUpperCase())) bad(`Tab "${t}" is not in the RULES tab and will be skipped.`);
}
for (const [, r] of rules) {
  if (!tabs.includes(r.tab)) bad(`RULES lists "${r.tab}" but no tab has that exact name.`);
}

// Data quality
let badPhones = 0;
let badDates = 0;
let totalRows = 0;
for (const t of serviceTabs) {
  const { rows } = await readTab(t);
  for (const r of rows) {
    const phone = r['Mobile Number'];
    const expiry = r['Expiry Date'];
    const title = r['Title'];
    if (!title && !phone && !expiry) continue;
    totalRows++;

    const { valid, invalid } = normalisePhoneList(phone);
    if (valid.length === 0 || invalid.length) {
      badPhones++;
      if (badPhones <= 5) {
        const what = valid.length === 0 ? 'no usable number' : `part unreadable: ${invalid.join(', ')}`;
        console.log(`          "${t}" row ${r.__rowNumber} (${title}): ${what}`);
      }
    }
    if (!parseDate(expiry)) {
      badDates++;
      if (badDates <= 5) console.log(`          "${t}" row ${r.__rowNumber} (${title}): bad date`);
    }
  }
}
console.log('');
badPhones ? bad(`${badPhones} of ${totalRows} rows have a mobile number problem.`) : ok(`All ${totalRows} mobile numbers look usable.`);
badDates ? bad(`${badDates} of ${totalRows} rows have an unusable expiry date.`) : ok(`All ${totalRows} expiry dates look usable.`);

// WhatsApp connection
const provider = CONFIG.wa.provider;
const key = provider === 'dualhook' ? CONFIG.wa.dualhookKey
  : provider === '360dialog' ? CONFIG.wa.d360Key
  : CONFIG.wa.token;

if (!key || !CONFIG.wa.phoneNumberId) {
  bad(`WhatsApp credentials for "${provider}" are not set (fine for dry runs).`);
} else if (provider === 'dualhook') {
  const fields = 'display_phone_number,quality_rating,status,platform_type,is_on_biz_app,'
    + 'whatsapp_business_manager_messaging_limit,health_status';
  const res = await fetch(`https://api.dualhook.com/v25.0/${CONFIG.wa.phoneNumberId}?fields=${fields}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const j = await res.json();

  if (!res.ok) {
    bad(`Dualhook rejected the request: ${j.error?.message || res.status}`);
    if (res.status === 401) console.log('          The API key is wrong, revoked or expired.');
    if (res.status === 403) console.log('          The phone number ID does not belong to this connection.');
  } else {
    ok(`Connected to ${j.display_phone_number} (quality: ${j.quality_rating}, status: ${j.status}).`);
    const canSend = j.health_status?.can_send_message;
    canSend === 'AVAILABLE' ? ok('Number can send messages.') : bad(`Sending status is "${canSend}".`);
    j.is_on_biz_app === true || j.platform_type === 'SMB_APP'
      ? ok('Coexistence is active (number is also live in the Business app).')
      : bad('This is not a Coexistence number.');

    const tier = j.whatsapp_business_manager_messaging_limit;
    console.log(`  INFO    Daily limit: ${tier}`);
    if (tier === 'TIER_250' && totalRows > 200) {
      bad(`${totalRows} rows, but the daily limit is 250 unique customers.`);
    }
  }
} else {
  const res = await fetch(
    `https://graph.facebook.com/${CONFIG.wa.apiVersion}/${CONFIG.wa.phoneNumberId}?fields=display_phone_number,quality_rating`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  const j = await res.json();
  res.ok
    ? ok(`Connected to ${j.display_phone_number} (quality: ${j.quality_rating}).`)
    : bad(`WhatsApp rejected the credentials: ${j.error?.message}`);
}

console.log(`\n${problems === 0 ? 'Everything is ready.' : `${problems} problem(s) found.`}\n`);

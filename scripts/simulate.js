// Offline simulation: no Google Sheet, no WhatsApp, no cost.
// Plays each scenario day by day and prints the messages that would go out.
// Usage: npm run simulate
process.env.SHEET_ID ||= 'simulation';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||= '{}';
process.env.BUSINESS_NAME ||= 'Sample Typing Center';

const { buildRules, decide } = await import('../src/rules.js');
const { buildMessage, preview } = await import('../src/templates.js');
const { addDays, human } = await import('../src/dates.js');

const rules = buildRules([
  { 'Service Tab Name': 'ESTABLISHMENT CARD', 'Display Name (used in the message)': 'Establishment Card', Mode: 'OFFSET', 'Before Expiry (days)': '30,7', 'After Expiry (days)': '10,25', Enabled: 'YES' },
  { 'Service Tab Name': 'JOB LESS INSURANCE', 'Display Name (used in the message)': 'Job Loss Insurance', Mode: 'OFFSET', 'Before Expiry (days)': '7', 'After Expiry (days)': '20', Enabled: 'YES' },
  { 'Service Tab Name': 'VEHICLE MULKIA', 'Display Name (used in the message)': 'Vehicle Mulkia', Mode: 'OFFSET', 'Before Expiry (days)': '15,0', 'After Expiry (days)': '15', Enabled: 'YES' },
  { 'Service Tab Name': 'CUSTOMER PAYMENT', 'Display Name (used in the message)': 'Payment', Mode: 'RECURRING', 'Repeat Every (days)': 2, 'Max Repeats': 4, Enabled: 'YES' },
]);

function play({ label, tab, expiry, renewOn = null, newExpiry = null, from, days }) {
  console.log(`\n${'='.repeat(78)}\n${label}\n${'='.repeat(78)}`);
  const rule = rules.get(tab);
  const row = {
    title: 'SAMPLE TRADING LLC', customer: '', phones: ['971500000000'], badPhones: [],
    expiry, status: 'Active', lastSeenExpiry: null, sentCodes: [], lastOn: '',
  };

  for (let i = 0; i < days; i++) {
    const today = addDays(from, i);

    if (renewOn && today === renewOn) {
      row.expiry = newExpiry;
      console.log(`\n  ${human(today)}  staff enters new expiry ${human(newExpiry)}\n`);
    }

    const d = decide({ row, rule, today });

    if (d.action === 'send') {
      const msg = buildMessage({ row, rule, event: d.event, today });
      console.log(`  ${human(today)}  [${d.event.code}] ${msg.templateName}`);
      console.log(`              "${preview(msg)}"`);
      row.sentCodes = [...d.sent, d.event.code];
      row.lastSeenExpiry = row.expiry;
    } else if (d.action === 'reset') {
      console.log(`  ${human(today)}  cycle reset for new expiry ${human(row.expiry)}`);
      row.sentCodes = [];
      row.lastSeenExpiry = row.expiry;
      row.status = 'Active';
    } else if (d.action === 'inactive') {
      console.log(`  ${human(today)}  marked Inactive (${d.reason})`);
      row.sentCodes = [...d.sent];
      row.status = 'Inactive';
    }
  }
}

play({ label: 'Renews after the 30-day reminder', tab: 'ESTABLISHMENT CARD',
  expiry: '2026-11-10', renewOn: '2026-10-16', newExpiry: '2027-11-10', from: '2026-10-05', days: 70 });

play({ label: 'Renews after the 7-day reminder', tab: 'ESTABLISHMENT CARD',
  expiry: '2026-11-10', renewOn: '2026-11-06', newExpiry: '2027-11-10', from: '2026-10-05', days: 70 });

play({ label: 'Renews only after the expired notice', tab: 'ESTABLISHMENT CARD',
  expiry: '2026-11-10', renewOn: '2026-11-22', newExpiry: '2027-11-10', from: '2026-10-05', days: 80 });

play({ label: 'Never replies: 30, 7, +10, +25, then Inactive', tab: 'ESTABLISHMENT CARD',
  expiry: '2026-11-10', from: '2026-10-05', days: 90 });

play({ label: 'Job Loss Insurance: 7 before, 20 after', tab: 'JOB LESS INSURANCE',
  expiry: '2026-11-10', from: '2026-10-25', days: 50 });

play({ label: 'Vehicle Mulkia: 15 before, on the day, 15 after', tab: 'VEHICLE MULKIA',
  expiry: '2026-11-10', from: '2026-10-20', days: 50 });

play({ label: 'Customer Payment: every 2 days, 4 times', tab: 'CUSTOMER PAYMENT',
  expiry: '2026-11-10', from: '2026-11-08', days: 15 });

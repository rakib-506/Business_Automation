import { CONFIG } from './config.js';
import { listTabs, readTab, writeBack, appendLog } from './sheets.js';
import { buildRules, decide } from './rules.js';
import { buildMessage, preview } from './templates.js';
import { sendTemplate, sleep } from './whatsapp.js';
import { parseDate, todayInTZ, nowStampInTZ, human } from './dates.js';
import { normalisePhoneList } from './phone.js';

// Accepted header names for each column.
const COLUMNS = {
  title: ['Title', 'Company', 'Company Name'],
  customer: ['Customer Name', 'Customer'],
  phone: ['Mobile Number', 'Mobile', 'Phone', 'WhatsApp Number'],
  expiry: ['Expiry Date', 'Expiry', 'Due Date'],
  status: ['Status'],
  lastSeen: ['SYS Last Seen Expiry'],
  sent: ['SYS Reminders Sent'],
  lastOn: ['SYS Last Reminder On'],
};

function pick(row, names) {
  for (const name of names) {
    const key = Object.keys(row).find((k) => k.toUpperCase() === name.toUpperCase());
    if (key !== undefined && row[key] !== '' && row[key] !== undefined) return row[key];
  }
  return '';
}

function toRow(raw) {
  const phoneCell = pick(raw, COLUMNS.phone);
  const { valid, invalid } = normalisePhoneList(phoneCell);
  return {
    rowNumber: raw.__rowNumber,
    title: String(pick(raw, COLUMNS.title)).trim(),
    customer: String(pick(raw, COLUMNS.customer)).trim(),
    phones: valid,
    badPhones: invalid,
    rawPhone: String(phoneCell).replace(/\s+/g, ' ').trim(),
    expiry: parseDate(pick(raw, COLUMNS.expiry)),
    status: String(pick(raw, COLUMNS.status) || 'Active').trim(),
    lastSeenExpiry: parseDate(pick(raw, COLUMNS.lastSeen)),
    sentCodes: String(pick(raw, COLUMNS.sent)).split(',').map((s) => s.trim()).filter(Boolean),
    lastOn: String(pick(raw, COLUMNS.lastOn)).trim(),
  };
}

export async function run() {
  const today = todayInTZ();
  const stamp = nowStampInTZ();
  console.log(`\n=== WhatsApp reminder run - ${stamp} (${CONFIG.timezone}) ===`);
  if (CONFIG.dryRun) console.log('DRY RUN: nothing will be sent');

  const rules = buildRules((await readTab('RULES')).rows);
  console.log(`Loaded ${rules.size} service rules.`);

  const serviceTabs = (await listTabs()).filter((t) => !CONFIG.reservedTabs.includes(t));
  const logRows = [];
  const totals = { sent: 0, failed: 0, reset: 0, inactive: 0, skipped: 0, errors: 0 };

  for (const tab of serviceTabs) {
    const rule = rules.get(tab.trim().toUpperCase());
    if (!rule) { console.log(`- "${tab}": not in RULES tab, skipped.`); continue; }
    if (!rule.enabled) { console.log(`- "${tab}": disabled, skipped.`); continue; }

    const { header, rows } = await readTab(tab);
    if (rows.length === 0) { console.log(`- "${tab}": empty.`); continue; }

    const updates = [];
    let tabSent = 0;

    for (const raw of rows) {
      const row = toRow(raw);
      if (!row.title && !row.rawPhone && !row.expiry) continue; // blank line

      const d = decide({ row, rule, today });

      if (d.action === 'skip') {
        totals.skipped++;
        continue;
      }

      if (d.action === 'error') {
        totals.errors++;
        updates.push({
          rowNumber: row.rowNumber,
          values: [row.expiry ? human(row.expiry) : '', row.sentCodes.join(','), '', `NEEDS ATTENTION: ${d.reason}`],
        });
        continue;
      }

      if (d.action === 'reset') {
        totals.reset++;
        updates.push({
          rowNumber: row.rowNumber,
          values: [human(row.expiry), '', '', `Renewed - new expiry ${human(row.expiry)}, reminder cycle restarted`],
          status: 'Active',
        });
        continue;
      }

      if (d.action === 'inactive') {
        totals.inactive++;
        updates.push({
          rowNumber: row.rowNumber,
          values: [human(row.expiry), [...d.sent].join(','), '', `Marked Inactive - ${d.reason}`],
          status: 'Inactive',
        });
        logRows.push([stamp, tab, row.rowNumber, row.title, row.rawPhone, 'INACTIVE', '-', 'STATUS', d.reason]);
        continue;
      }

      // action === 'send': every number in the cell gets the same message.
      const msg = buildMessage({ row, rule, event: d.event, today });
      let okCount = 0;
      const errors = [];

      for (const to of row.phones) {
        let result;
        if (CONFIG.dryRun) {
          result = { ok: true, id: 'DRY-RUN' };
          console.log(`  [dry] ${tab} row ${row.rowNumber} -> +${to} [${d.event.code}] ${preview(msg)}`);
        } else {
          result = await sendTemplate({ to, ...msg });
          await sleep(CONFIG.sendDelayMs);
        }

        if (result.ok) { okCount++; totals.sent++; tabSent++; }
        else { totals.failed++; errors.push(`+${to}: ${result.error}`); }

        logRows.push([
          stamp, tab, row.rowNumber, row.title, `'+${to}`,
          d.event.code, msg.templateName,
          result.ok ? (CONFIG.dryRun ? 'DRY-RUN' : 'SENT') : 'FAILED',
          result.ok ? result.id : result.error,
        ]);
      }

      // Counts as done if at least one number received it.
      const codes = new Set(d.sent);
      if (okCount > 0) codes.add(d.event.code);

      const total = row.phones.length;
      let note;
      if (okCount === total) {
        note = `SENT ${d.event.code} (${msg.templateName})` + (total > 1 ? ` to ${total} contacts` : '');
      } else if (okCount > 0) {
        note = `SENT ${d.event.code} to ${okCount} of ${total} - FAILED: ${errors.join(' | ')}`;
      } else {
        note = `FAILED ${d.event.code}: ${errors.join(' | ')}`;
      }
      if (row.badPhones.length) note += ` | unreadable: ${row.badPhones.join(', ')}`;

      updates.push({
        rowNumber: row.rowNumber,
        values: [human(row.expiry), [...codes].join(','), okCount > 0 ? human(today) : row.lastOn, note],
        status: d.expiryChanged ? 'Active' : undefined,
      });
    }

    // A dry run must not write to the sheet, otherwise the next real run
    // would think those reminders were already sent.
    if (updates.length && !CONFIG.dryRun) await writeBack(tab, header, updates);
    console.log(`- "${tab}": ${rows.length} rows checked, ${tabSent} message(s) due.`);
  }

  if (logRows.length && !CONFIG.dryRun) await appendLog(logRows);

  console.log('\n--- Summary -------------------------------');
  console.log(`  Messages sent      : ${totals.sent}${CONFIG.dryRun ? ' (dry run)' : ''}`);
  console.log(`  Send failures      : ${totals.failed}`);
  console.log(`  Renewals detected  : ${totals.reset}`);
  console.log(`  Marked inactive    : ${totals.inactive}`);
  console.log(`  Rows needing fixes : ${totals.errors}`);
  console.log('-------------------------------------------');
  if (CONFIG.dryRun) console.log('  Dry run: no messages sent, sheet not changed.');
  console.log('');

  return totals;
}

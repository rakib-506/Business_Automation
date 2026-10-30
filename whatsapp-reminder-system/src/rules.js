import { CONFIG } from './config.js';
import { addDays, daysBetween } from './dates.js';

// "30,7" -> [7, 30]. Empty, "NONE" or "-" -> []
export function parseOffsets(cell) {
  if (cell === null || cell === undefined) return [];
  const txt = String(cell).trim().toUpperCase();
  if (['', 'NO NEED', 'NONE', 'N/A', '-'].includes(txt)) return [];
  const nums = txt.match(/\d+/g);
  if (!nums) return [];
  return [...new Set(nums.map(Number))].filter((n) => n >= 0).sort((a, b) => a - b);
}

// Reads the RULES tab into a Map keyed by upper-cased tab name.
export function buildRules(rulesRows) {
  const map = new Map();
  for (const r of rulesRows) {
    const tab = String(r['Service Tab Name'] || '').trim();
    const mode = String(r['Mode'] || '').trim().toUpperCase();
    // Rows without a valid Mode are notes for staff, not rules.
    if (!tab || (mode !== 'OFFSET' && mode !== 'RECURRING')) continue;

    const enabled = String(r['Enabled'] ?? 'YES').trim().toUpperCase();

    map.set(tab.toUpperCase(), {
      tab,
      displayName: String(r['Display Name (used in the message)'] || tab).trim(),
      mode,
      before: parseOffsets(r['Before Expiry (days)']),
      after: parseOffsets(r['After Expiry (days)']),
      every: Number(String(r['Repeat Every (days)'] || '').replace(/\D/g, '')) || 0,
      maxRepeats: Number(String(r['Max Repeats'] || '').replace(/\D/g, '')) || 12,
      enabled: !['NO', 'FALSE', '0'].includes(enabled),
    });
  }
  return map;
}

// All reminders for one row, in date order.
// code: saved in "SYS Reminders Sent" (B30 = 30 days before, A10 = 10 days after, R2 = repeat no. 3)
// kind: decides which template is used
export function buildSchedule(rule, expiry) {
  const events = [];

  if (rule.mode === 'RECURRING') {
    const every = rule.every > 0 ? rule.every : 5;
    for (let i = 0; i < rule.maxRepeats; i++) {
      events.push({ code: `R${i}`, dueDate: addDays(expiry, i * every), kind: 'recurring' });
    }
    return events;
  }

  const before = [...rule.before].sort((a, b) => b - a);
  before.forEach((d, i) => {
    const isLast = i === before.length - 1 && before.length > 1;
    events.push({ code: `B${d}`, dueDate: addDays(expiry, -d), kind: isLast ? 'before_last' : 'before' });
  });

  const after = [...rule.after].sort((a, b) => a - b);
  after.forEach((d, i) => {
    const isLast = i === after.length - 1 && after.length > 1;
    events.push({ code: `A${d}`, dueDate: addDays(expiry, d), kind: isLast ? 'after_last' : 'after' });
  });

  return events.sort((x, y) => (x.dueDate < y.dueDate ? -1 : 1));
}

// What to do with one row today: send | reset | inactive | skip | error
export function decide({ row, rule, today }) {
  const expiry = row.expiry;

  if (!expiry) return { action: 'error', reason: 'No / invalid expiry date' };
  if (!row.phones || row.phones.length === 0) {
    return { action: 'error', reason: 'No / invalid mobile number' };
  }

  const status = (row.status || 'Active').trim().toUpperCase();
  if (status === 'PAUSED') return { action: 'skip', reason: 'Paused by staff' };

  // Staff changed the expiry date = renewed, so start the cycle again.
  const expiryChanged = row.lastSeenExpiry && row.lastSeenExpiry !== expiry;
  const sent = expiryChanged ? new Set() : new Set(row.sentCodes);

  if (status === 'INACTIVE' && !expiryChanged) return { action: 'skip', reason: 'Inactive' };

  const schedule = buildSchedule(rule, expiry);
  if (schedule.length === 0) {
    return { action: expiryChanged ? 'reset' : 'skip', reason: 'No reminders configured', sent };
  }

  for (const ev of schedule) {
    if (sent.has(ev.code)) continue;
    const daysLate = daysBetween(ev.dueDate, today);
    if (daysLate < 0) break;
    // Too old to be useful (e.g. a row added late). Skip it without sending.
    if (daysLate > CONFIG.graceDays) { sent.add(ev.code); continue; }
    return { action: 'send', event: ev, sent, expiryChanged, schedule };
  }

  // Close the file only when every reminder is done AND the expiry is well in the past.
  const last = schedule[schedule.length - 1];
  const allDone = schedule.every((e) => sent.has(e.code));
  const pastLastReminder = daysBetween(last.dueDate, today) >= CONFIG.inactiveAfterDays;
  const pastExpiry = daysBetween(expiry, today) >= CONFIG.inactiveAfterDays;
  if (allDone && pastLastReminder && pastExpiry && rule.mode === 'OFFSET' && status !== 'INACTIVE') {
    return { action: 'inactive', sent, reason: 'No response after final reminder' };
  }

  return {
    action: expiryChanged ? 'reset' : 'skip',
    sent,
    reason: expiryChanged ? 'Renewed, cycle reset' : 'Nothing due today',
  };
}

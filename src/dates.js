// Dates are handled as plain YYYY-MM-DD strings in Dubai time,
// so a reminder never moves by a day because of UTC offsets.
import { CONFIG } from './config.js';

export function todayInTZ() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function nowStampInTZ() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CONFIG.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date()).replace(',', '');
}

// Accepts DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD and Google Sheets serial numbers.
export function parseDate(raw) {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim();
  if (!v) return null;

  if (/^\d+(\.\d+)?$/.test(v) && Number(v) > 20000 && Number(v) < 80000) {
    const ms = (Number(v) - 25569) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return toISO(+m[1], +m[2], +m[3]);

  m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return toISO(+m[3], +m[2], +m[1]);

  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function toISO(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const toUTC = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDays(iso, n) {
  return new Date(toUTC(iso) + n * 86400000).toISOString().slice(0, 10);
}

export function daysBetween(fromISO, toISO) {
  return Math.round((toUTC(toISO) - toUTC(fromISO)) / 86400000);
}

// 2026-10-13 -> 13/10/2026
export function human(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

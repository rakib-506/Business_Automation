import { CONFIG } from './config.js';

// "+971 50 123 4567" or "0501234567" -> "971501234567"
// Returns null if the number cannot be used.
export function normalisePhone(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  const international = s.startsWith('+') || s.startsWith('00');

  s = s.replace(/^00/, '').replace(/\D/g, '');
  if (!s) return null;

  const cc = CONFIG.defaultCountryCode;
  if (!international) {
    if (s.startsWith('0')) s = cc + s.slice(1);
    else if (!s.startsWith(cc)) s = cc + s;
  }
  if (s.length < 8 || s.length > 15) return null;
  return s;
}

// A cell can hold several numbers separated by comma, semicolon, slash,
// new line, or just a space before the next "+".
export function normalisePhoneList(raw) {
  const valid = [];
  const invalid = [];
  if (!raw) return { valid, invalid };

  const parts = String(raw)
    .replace(/([0-9])\s*\+/g, '$1|+')
    .split(/[,;\n\r|/]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const n = normalisePhone(part);
    if (!n) invalid.push(part);
    else if (!valid.includes(n)) valid.push(n);
  }
  return { valid, invalid };
}

import { google } from 'googleapis';
import { CONFIG } from './config.js';

let client = null;

async function api() {
  if (client) return client;
  const auth = new google.auth.GoogleAuth({
    credentials: CONFIG.serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  client = google.sheets({ version: 'v4', auth: await auth.getClient() });
  return client;
}

export async function listTabs() {
  const s = await api();
  const res = await s.spreadsheets.get({ spreadsheetId: CONFIG.sheetId, fields: 'sheets.properties' });
  return res.data.sheets.map((x) => x.properties.title);
}

// Returns the header and every row as an object keyed by header name.
export async function readTab(tab) {
  const s = await api();
  const res = await s.spreadsheets.values.get({
    spreadsheetId: CONFIG.sheetId,
    range: `'${tab}'`,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  });
  const values = res.data.values || [];
  if (values.length === 0) return { header: [], rows: [] };

  const header = values[0].map((h) => String(h).trim());
  const rows = values.slice(1).map((cells, i) => {
    const obj = { __rowNumber: i + 2 };
    header.forEach((h, c) => { obj[h] = cells[c] ?? ''; });
    return obj;
  });
  return { header, rows };
}

// Writes the four SYS columns (and Status when needed) in batches.
// updates: [{ rowNumber, values: [lastSeen, sentCodes, lastOn, lastResult], status? }]
export async function writeBack(tab, header, updates) {
  if (updates.length === 0) return;
  const s = await api();

  const col = (name) => {
    const i = header.findIndex((h) => h.toUpperCase() === name.toUpperCase());
    return i < 0 ? null : columnLetter(i + 1);
  };
  const first = col('SYS Last Seen Expiry');
  const last = col('SYS Last Result');
  const statusCol = col('Status');
  if (!first || !last) throw new Error(`Tab "${tab}" is missing the SYS columns.`);

  const data = [];
  for (const u of updates) {
    data.push({ range: `'${tab}'!${first}${u.rowNumber}:${last}${u.rowNumber}`, values: [u.values] });
    if (u.status && statusCol) {
      data.push({ range: `'${tab}'!${statusCol}${u.rowNumber}`, values: [[u.status]] });
    }
  }

  for (let i = 0; i < data.length; i += 400) {
    await s.spreadsheets.values.batchUpdate({
      spreadsheetId: CONFIG.sheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: data.slice(i, i + 400) },
    });
  }
}

export async function appendLog(rows) {
  if (rows.length === 0) return;
  const s = await api();
  await s.spreadsheets.values.append({
    spreadsheetId: CONFIG.sheetId,
    range: `'MESSAGE LOG'!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

function columnLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

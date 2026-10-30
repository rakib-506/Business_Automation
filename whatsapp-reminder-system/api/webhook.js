// Vercel function that records messages WhatsApp could not deliver.
// The daily job marks a message SENT when it is accepted, but a wrong or
// blocked number fails a few minutes later. Those failures are written to
// the DELIVERY ISSUES tab. Replies and normal statuses are ignored, because
// the owner reads replies in the WhatsApp Business app (Coexistence).
import { google } from 'googleapis';

const SHEET_ID = process.env.SHEET_ID;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const TAB = 'DELIVERY ISSUES';
const TZ = 'Asia/Dubai';

const FAILED = new Set(['failed', 'undelivered']);

const REASONS = {
  131026: 'Number is not on WhatsApp, or cannot receive messages',
  131047: 'Needs a template, the 24 hour window is closed',
  131049: 'Meta held it back to protect the customer from too many messages',
  131050: 'Customer opted out of marketing messages',
  131053: 'Media upload problem',
  130472: 'Customer is in a Meta experiment group and was skipped',
  131000: 'Temporary problem on Meta side',
  131042: 'Payment problem on the Meta account',
  131048: 'Spam rate limit, number quality is too low',
  131031: 'The WhatsApp account has been locked',
  130403: 'The business has blocked this customer',
};

let sheetsClient = null;

async function sheets() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheetsClient = google.sheets({ version: 'v4', auth: await auth.getClient() });
  return sheetsClient;
}

export default async function handler(req, res) {
  // One-time check when the webhook URL is saved.
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === VERIFY_TOKEN) {
      return res.status(200).send(q['hub.challenge']);
    }
    return res.status(403).send('wrong verify token');
  }

  if (req.method !== 'POST') return res.status(405).end();

  // Reply fast, otherwise the sender retries and creates duplicates.
  res.status(200).json({ received: true });

  try {
    if (req.body?.event === 'dualhook.test_ping') return;

    const change = req.body?.entry?.[0]?.changes?.[0];
    if (change?.field !== 'messages') return;

    const statuses = change.value?.statuses;
    if (!statuses?.length) return;

    const rows = statuses
      .filter((s) => FAILED.has(s.status))
      .map((s) => {
        const err = s.errors?.[0] || {};
        const code = Number(err.code) || '';
        const detail = err.error_data?.details || err.title || err.message || '';
        return [stamp(), `'${s.recipient_id || ''}`, s.status, code,
          REASONS[code] || detail || 'Unknown reason', detail, s.id || '', 'New'];
      });

    if (rows.length) await append(rows);
  } catch (err) {
    console.error('webhook error:', err);
  }
}

async function append(values) {
  const s = await sheets();
  await s.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${TAB}'!A:H`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

function stamp() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date()).replace(',', '');
}

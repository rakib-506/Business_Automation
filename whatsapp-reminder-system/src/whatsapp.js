import { CONFIG } from './config.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Dualhook mirrors the Meta Graph API, so only the host and key change.
function endpoint() {
  const id = CONFIG.wa.phoneNumberId;
  const json = { 'Content-Type': 'application/json' };

  switch (CONFIG.wa.provider) {
    case 'dualhook':
      return {
        url: `https://api.dualhook.com/v25.0/${id}/messages`,
        headers: { ...json, Authorization: `Bearer ${CONFIG.wa.dualhookKey}` },
      };
    case '360dialog':
      return {
        url: 'https://waba-v2.360dialog.io/messages',
        headers: { ...json, 'D360-API-KEY': CONFIG.wa.d360Key },
      };
    default:
      return {
        url: `https://graph.facebook.com/${CONFIG.wa.apiVersion}/${id}/messages`,
        headers: { ...json, Authorization: `Bearer ${CONFIG.wa.token}` },
      };
  }
}

// One customer can appear in several tabs on the same day.
// Keep at least 6.5 s between messages to the same number.
const lastSentTo = new Map();

async function waitForPairLimit(to) {
  const last = lastSentTo.get(to);
  if (last) {
    const wait = CONFIG.pairDelayMs - (Date.now() - last);
    if (wait > 0) await sleep(wait);
  }
  lastSentTo.set(to, Date.now());
}

// Sends one approved template. Returns { ok, id } or { ok: false, error }.
export async function sendTemplate({ to, templateName, language, params }) {
  const { url, headers } = endpoint();
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components: [{
        type: 'body',
        parameters: params.map((t) => ({ type: 'text', text: String(t).slice(0, 900) })),
      }],
    },
  };

  await waitForPairLimit(to);

  // Retry only rate limits and outages. Other errors are logged, and the
  // reminder is tried again next night because it was not marked as sent.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));

      if (res.ok) return { ok: true, id: data.messages?.[0]?.id || 'sent' };

      if ((res.status === 429 || res.status === 503) && attempt < 2) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        await sleep(retryAfter ? retryAfter * 1000 : 2000 * 2 ** attempt);
        continue;
      }

      const e = data.error || {};
      return { ok: false, error: `${res.status} ${e.code || ''} ${e.message || 'unknown error'}`.trim() };
    } catch (err) {
      if (attempt < 2) { await sleep(2000 * 2 ** attempt); continue; }
      return { ok: false, error: `network: ${err.message}` };
    }
  }
  return { ok: false, error: 'gave up after 3 attempts' };
}

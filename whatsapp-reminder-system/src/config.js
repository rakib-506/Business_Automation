import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing environment variable: ${name} (see .env.example)`);
  }
  return value.trim();
}

const env = (name, fallback = '') => process.env[name]?.trim() || fallback;

export const CONFIG = {
  sheetId: required('SHEET_ID'),
  serviceAccount: JSON.parse(required('GOOGLE_SERVICE_ACCOUNT_JSON')),

  wa: {
    provider: env('WHATSAPP_PROVIDER', 'meta').toLowerCase(), // meta | dualhook | 360dialog
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    token: env('WHATSAPP_ACCESS_TOKEN'),
    dualhookKey: env('DUALHOOK_API_KEY'),
    d360Key: env('D360_API_KEY'),
    lang: env('WHATSAPP_LANG', 'en'),
    apiVersion: 'v21.0',
  },

  businessName: env('BUSINESS_NAME', 'Our Office'),
  defaultCountryCode: env('DEFAULT_COUNTRY_CODE', '971').replace(/\D/g, ''),
  graceDays: Number(process.env.GRACE_DAYS ?? 5),
  inactiveAfterDays: Number(process.env.INACTIVE_AFTER_DAYS ?? 10),
  sendDelayMs: Number(process.env.SEND_DELAY_MS ?? 350),
  // Meta allows one message per 6 seconds to the same number (error 131056).
  pairDelayMs: Number(process.env.PAIR_DELAY_MS ?? 6500),
  dryRun: String(process.env.DRY_RUN).toLowerCase() === 'true',

  timezone: 'Asia/Dubai',

  // Tabs that hold settings or logs, not customers.
  reservedTabs: ['START HERE', 'RULES', 'MESSAGE LOG', 'DELIVERY ISSUES', 'REPLIES'],
};

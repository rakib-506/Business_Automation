import { CONFIG } from './config.js';
import { human, daysBetween } from './dates.js';

// Five approved Utility templates cover every service.
// All take the same four values: {{1}} name, {{2}} service, {{3}} date, {{4}} days
export const TEMPLATE_NAMES = {
  before: 'renewal_reminder_before',
  before_last: 'renewal_reminder_urgent',
  after: 'renewal_expired_notice',
  after_last: 'renewal_final_notice',
  recurring: 'pending_action_reminder',
};

export function buildMessage({ row, rule, event, today }) {
  const person = row.customer.trim();
  const company = row.title.trim();
  const name = person && company ? `${person} (${company})` : person || company || 'Customer';

  // Recurring: reminder number. Others: real days to/from expiry,
  // so the number is still correct if the job ran a day late.
  const days = event.kind === 'recurring'
    ? Number(event.code.replace(/\D/g, '')) + 1
    : Math.abs(daysBetween(today, row.expiry));

  return {
    templateName: TEMPLATE_NAMES[event.kind],
    language: CONFIG.wa.lang,
    params: [name, rule.displayName, human(row.expiry), String(days)],
  };
}

// Text version of each template, used for dry runs and test sends.
export function preview({ templateName, params }) {
  const [name, service, date, days] = params;
  const biz = CONFIG.businessName;
  const text = {
    renewal_reminder_before:
      `Dear ${name}, this is a reminder from ${biz}. Your ${service} will expire on ${date}, ${days} days from today. Please contact us to start the renewal process.`,
    renewal_reminder_urgent:
      `Dear ${name}, your ${service} expires on ${date}, only ${days} days remaining. To avoid any fine or delay, please contact us immediately to complete the renewal.`,
    renewal_expired_notice:
      `Dear ${name}, our records show that your ${service} expired on ${date}, ${days} days ago. Please renew it without further delay to avoid penalties.`,
    renewal_final_notice:
      `Dear ${name}, this is our final reminder about your ${service}, which expired on ${date}, ${days} days ago. If we do not hear from you we will close this file and stop sending reminders.`,
    pending_action_reminder:
      `Dear ${name}, this is reminder no. ${days} from ${biz} about your pending ${service} dated ${date}. Please reply to this message so our team can help you complete it.`,
  };
  return text[templateName] || templateName;
}

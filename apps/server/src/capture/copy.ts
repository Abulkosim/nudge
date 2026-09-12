import type { Item } from '../generated/prisma/client.js';
import {
  formatDate,
  formatInstant,
  reminderInstant,
} from '../time/timezone.js';
export const copy = {
  privateOnly: 'Nudge works in a private chat. Message the bot directly.',
  intro:
    'Nudge reminds you about things you are waiting for from other people.',
  timezone: 'Choose your timezone, or type your city or zone.',
  from: 'From whom?',
  when: 'By when?',
  what: 'What are you waiting for?',
  invalidDate: 'I did not get the date. Try tomorrow, Friday, or 19.09.',
  pastDate: 'That date has passed. Choose today or a later date.',
  truncated: 'Kept the first 500 characters.',
  saved: 'Saved.',
  cancelled: 'Cancelled.',
  noDraft: 'There is nothing to cancel.',
  already: 'Already saved',
  notYours: 'Not yours',
  stale: 'Use the current question.',
  confirm: 'Confirm',
  edit: 'Edit',
  cancel: 'Cancel',
  skip: 'Skip',
  back: 'Back',
  whatLabel: 'What',
  fromLabel: 'From',
  whenLabel: 'When',
  dates: ['Today', 'Tomorrow', 'In 3 days', 'Next week'],
  zoneSet: (zone: string, now: Date) =>
    `Timezone: ${zone}. Local time: ${formatInstant(now, zone)}.`,
  currentZone: (zone: string | null) => `Timezone: ${zone ?? 'not set'}.`,
};
export function card(item: Item, zone: string, now: Date) {
  const singleLine = (text: string) => text.replace(/\s+/g, ' ');
  return `What: ${singleLine(item.what)}\nFrom: ${item.fromWhom ? singleLine(item.fromWhom) : 'not set'}\nExpected: ${item.expectedOn ? formatDate(item.expectedOn) : 'not set'}\nReminder: ${item.expectedOn ? formatInstant(reminderInstant(item.expectedOn, zone, now), zone) : 'none'}`;
}

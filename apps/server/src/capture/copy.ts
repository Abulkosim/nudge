import type { Item, ReminderKind } from '../generated/prisma/client.js';
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
  untilWhen: 'Until when?',
  invalidDate: 'I did not get the date. Try tomorrow, Friday, or 19.09.',
  pastDate: 'That date has passed. Choose today or a later date.',
  truncated: 'Kept the first 500 characters.',
  saved: 'Saved.',
  cancelled: 'Cancelled.',
  noDraft: 'There is nothing to cancel.',
  already: 'Already saved',
  alreadyReceived: 'Already received',
  notOpen: 'Not open',
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
  reminder: 'Reminder',
  stillWaiting: 'Still waiting?',
  received: 'Received',
  snooze: 'Snooze',
  snoozeHour: 'In 1 hour',
  snoozeTomorrow: 'Tomorrow 09:00',
  snoozeDays: 'In 3 days',
  snoozePick: 'Pick a date',
  zoneSet: (zone: string, now: Date) =>
    `Timezone: ${zone}. Local time: ${formatInstant(now, zone)}.`,
  currentZone: (zone: string | null) => `Timezone: ${zone ?? 'not set'}.`,
  receivedCard: (item: Item) => `Received.\nWhat: ${singleLine(item.what)}`,
  snoozedUntil: (at: Date, zone: string) =>
    `Snoozed until ${formatInstant(at, zone)}.`,
};
const singleLine = (text: string) => text.replace(/\s+/g, ' ');
const details = (item: Item) =>
  `What: ${singleLine(item.what)}\nFrom: ${item.fromWhom ? singleLine(item.fromWhom) : 'not set'}\nExpected: ${item.expectedOn ? formatDate(item.expectedOn) : 'not set'}`;
export function card(item: Item, zone: string, now: Date) {
  return `${details(item)}\nReminder: ${item.expectedOn ? formatInstant(reminderInstant(item.expectedOn, zone, now), zone) : 'none'}`;
}
export function reminderCard(item: Item, kind: ReminderKind) {
  return `${kind === 'repeat' ? copy.stillWaiting : copy.reminder}\n${details(item)}`;
}

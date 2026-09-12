import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

export const zones = [
  'Asia/Tashkent',
  'Asia/Almaty',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Europe/Berlin',
  'Europe/London',
];
const key = (value: string) => value.toLowerCase().replace(/\s/g, '');
const aliases: Record<string, string> = {
  tashkent: 'Asia/Tashkent',
  samarkand: 'Asia/Samarkand',
  bukhara: 'Asia/Samarkand',
  almaty: 'Asia/Almaty',
  moscow: 'Europe/Moscow',
  istanbul: 'Europe/Istanbul',
  dubai: 'Asia/Dubai',
  berlin: 'Europe/Berlin',
  london: 'Europe/London',
  newyork: 'America/New_York',
};
const supported = new Map(
  Intl.supportedValuesOf('timeZone').map((zone) => [key(zone), zone]),
);
export function resolveTimezone(text: string): string | null {
  return supported.get(key(text)) ?? aliases[key(text)] ?? null;
}
const hour = 60 * 60 * 1000;
// 09:00 local on the expected date. When that has already passed, an hour from now, so a
// reminder is never scheduled in the past.
export function reminderInstant(date: Date, zone: string, now: Date): Date {
  const morning = new TZDate(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    9,
    0,
    0,
    zone,
  ).getTime();
  return new Date(morning > now.getTime() ? morning : now.getTime() + hour);
}
export function formatDate(date: Date): string {
  return format(new TZDate(date, 'UTC'), 'EEE d MMM yyyy');
}
export function formatInstant(date: Date, zone: string): string {
  return `${format(new TZDate(date, zone), 'EEE d MMM, HH:mm')} ${zone}`;
}

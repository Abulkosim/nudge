import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

const day = 'EEE d MMM';
const wallClock = "yyyy-MM-dd'T'HH:mm";

// A plain calendar date carries no zone, so it is read in UTC and never shifted.
export function formatDate(date: string): string {
  return format(new TZDate(new Date(date), 'UTC'), day);
}
export function formatInstantDate(instant: string, zone: string): string {
  return format(new TZDate(new Date(instant), zone), day);
}
export function formatInstant(instant: string, zone: string): string {
  return format(new TZDate(new Date(instant), zone), `${day}, HH:mm`);
}
export function today(zone: string, now = new Date()): string {
  return format(new TZDate(now, zone), 'yyyy-MM-dd');
}
export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
// What a datetime-local field shows: the instant as the user's own wall clock.
export function toWallClock(instant: string, zone: string): string {
  return format(new TZDate(new Date(instant), zone), wallClock);
}
export function fromWallClock(value: string, zone: string): string | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!parts) return null;
  const [, year, month, date, hours, minutes] = parts;
  const instant = new TZDate(
    Number(year),
    Number(month) - 1,
    Number(date),
    Number(hours),
    Number(minutes),
    0,
    zone,
  ).getTime();
  return Number.isNaN(instant) ? null : new Date(instant).toISOString();
}

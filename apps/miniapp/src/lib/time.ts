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
// Offset of a zone at an instant, in minutes, read from Intl so the host zone plays no part.
function offsetAt(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - instant) / 60000);
}
// A wall clock time can exist twice (autumn fold) or not at all (spring gap). The earliest
// instant that shows this wall clock wins, and a time in the gap moves forward with the clock.
export function fromWallClock(value: string, zone: string): string | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!parts) return null;
  const [, year, month, date, hours, minutes] = parts;
  const guess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(date),
    Number(hours),
    Number(minutes),
  );
  if (Number.isNaN(guess)) return null;
  const offsets = [-1, 0, 1].map((day) =>
    offsetAt(guess + day * 86400000, zone),
  );
  const candidates = offsets
    .map((offset) => guess - offset * 60000)
    .filter((instant) => guess - offsetAt(instant, zone) * 60000 === instant)
    .sort((a, b) => a - b);
  // In the gap no candidate matches: the offset before the jump carries the time forward.
  const instant = candidates[0] ?? guess - Math.min(...offsets) * 60000;
  return new Date(instant).toISOString();
}

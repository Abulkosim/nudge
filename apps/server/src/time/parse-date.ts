import { TZDate } from '@date-fns/tz';
import { addDays, format } from 'date-fns';

type DateResult =
  { date: Date; error?: never } | { date?: never; error: 'invalid' | 'past' };
const weekdays = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];
const months = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

// Dates without a year use this year. Today remains valid after 09:00: expected is a date.
export function parseDate(text: string, now: Date, zone: string): DateResult {
  const local = new TZDate(now, zone);
  const today = format(local, 'yyyy-MM-dd');
  const value = text.trim().toLowerCase().replace(/\s+/g, ' ');
  let year = local.getFullYear();
  let month: number;
  let day: number;
  let offset: number | undefined;
  if (value === 'today') offset = 0;
  if (value === 'tomorrow') offset = 1;
  if (value === 'next week') offset = 7;
  const relative = /^in (\d+) (days?|weeks?)$/.exec(value);
  if (relative)
    offset = Number(relative[1]) * (relative[2]!.startsWith('week') ? 7 : 1);
  const weekday = /^(next )?([a-z]+)$/.exec(value);
  const index = weekdays.indexOf(weekday?.[2] ?? '');
  if (index >= 0) {
    offset = (index - local.getDay() + 7) % 7;
    if (weekday?.[1] && offset === 0) offset = 7;
  }
  if (offset !== undefined) {
    if (!Number.isSafeInteger(offset) || offset > 365000)
      return { error: 'invalid' };
    const date = addDays(local, offset);
    year = date.getFullYear();
    month = date.getMonth() + 1;
    day = date.getDate();
  } else {
    const dotted = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/.exec(value);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const named = /^(?:(\d{1,2}) ([a-z]{3})|([a-z]{3}) (\d{1,2}))$/.exec(value);
    if (dotted) {
      day = Number(dotted[1]);
      month = Number(dotted[2]);
      year = Number(dotted[3] ?? year);
    } else if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      day = Number(iso[3]);
    } else if (named) {
      day = Number(named[1] ?? named[4]);
      month = months.indexOf((named[2] ?? named[3])!) + 1;
    } else return { error: 'invalid' };
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    year < 1000 ||
    year > 9999 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return { error: 'invalid' };
  return date.toISOString().slice(0, 10) < today ? { error: 'past' } : { date };
}

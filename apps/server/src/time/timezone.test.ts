import { expect, it } from 'vitest';
import {
  formatDate,
  formatInstant,
  reminderInstant,
  resolveTimezone,
  zones,
} from './timezone.js';
it.each(zones)('resolves %s ignoring case and spaces', (zone) =>
  expect(resolveTimezone(` ${zone.toUpperCase()} `)).toBe(zone),
);
it.each([
  ['Tashkent', 'Asia/Tashkent'],
  ['Samarkand', 'Asia/Samarkand'],
  ['Bukhara', 'Asia/Samarkand'],
  ['Almaty', 'Asia/Almaty'],
  ['Moscow', 'Europe/Moscow'],
  ['Istanbul', 'Europe/Istanbul'],
  ['Dubai', 'Asia/Dubai'],
  ['Berlin', 'Europe/Berlin'],
  ['London', 'Europe/London'],
  [' NEW  YORK ', 'America/New_York'],
])('resolves city %s', (city, zone) =>
  expect(resolveTimezone(city)).toBe(zone),
);
it('rejects unknown zones and offsets', () => {
  expect(resolveTimezone('Moon/Base')).toBeNull();
  expect(resolveTimezone('+05:00')).toBeNull();
});
it.each([
  ['2026-09-19', 'Asia/Tashkent', '2026-09-19T04:00:00.000Z'],
  ['2026-03-08', 'America/New_York', '2026-03-08T13:00:00.000Z'],
  ['2026-11-01', 'America/New_York', '2026-11-01T14:00:00.000Z'],
  ['2026-03-29', 'Europe/Berlin', '2026-03-29T07:00:00.000Z'],
  ['2026-10-25', 'Europe/Berlin', '2026-10-25T08:00:00.000Z'],
])('09:00 on %s in %s', (date, zone, expected) =>
  expect(
    reminderInstant(new Date(date), zone, new Date('2026-01-01')).toISOString(),
  ).toBe(expected),
);
it('falls back to an hour from now once 09:00 has passed', () => {
  const now = new Date('2026-09-19T10:30:00Z');
  expect(
    reminderInstant(new Date('2026-09-19'), 'Asia/Tashkent', now).toISOString(),
  ).toBe('2026-09-19T11:30:00.000Z');
  expect(
    reminderInstant(
      new Date('2026-09-19'),
      'Asia/Tashkent',
      new Date('2026-09-19T03:59:00Z'),
    ).toISOString(),
  ).toBe('2026-09-19T04:00:00.000Z');
});
it('formats calendar dates without host zone shifts and instants with the zone', () => {
  expect(formatDate(new Date('2026-09-19'))).toBe('Sat 19 Sep 2026');
  expect(formatInstant(new Date('2026-09-19T04:00Z'), 'Asia/Tashkent')).toBe(
    'Sat 19 Sep, 09:00 Asia/Tashkent',
  );
});

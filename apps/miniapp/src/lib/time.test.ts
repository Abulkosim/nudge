import { expect, it } from 'vitest';
import {
  formatDate,
  formatInstant,
  formatInstantDate,
  fromWallClock,
  toWallClock,
  today,
} from './time';

it('reads a calendar date in UTC and an instant in the given zone', () => {
  expect(formatDate('2026-09-19')).toBe('Sat 19 Sep');
  expect(formatDate('2026-01-01')).toBe('Thu 1 Jan');
  expect(formatInstant('2026-09-19T04:00:00.000Z', 'Asia/Tashkent')).toBe(
    'Sat 19 Sep, 09:00',
  );
  expect(formatInstant('2026-09-19T04:00:00.000Z', 'Europe/Berlin')).toBe(
    'Sat 19 Sep, 06:00',
  );
  expect(formatInstantDate('2026-09-19T20:00:00.000Z', 'Asia/Tashkent')).toBe(
    'Sun 20 Sep',
  );
});

it('reads today in the zone, not on the host', () => {
  const midnight = new Date('2026-09-19T20:00:00.000Z');
  expect(today('Asia/Tashkent', midnight)).toBe('2026-09-20');
  expect(today('Europe/Berlin', midnight)).toBe('2026-09-19');
});

it('converts wall clock both ways across both DST changes', () => {
  const zone = 'Europe/Berlin';
  expect(toWallClock('2026-03-29T00:30:00.000Z', zone)).toBe(
    '2026-03-29T01:30',
  );
  expect(toWallClock('2026-03-29T01:30:00.000Z', zone)).toBe(
    '2026-03-29T03:30',
  );
  expect(toWallClock('2026-10-25T00:30:00.000Z', zone)).toBe(
    '2026-10-25T02:30',
  );
  expect(fromWallClock('2026-03-29T01:30', zone)).toBe(
    '2026-03-29T00:30:00.000Z',
  );
  expect(fromWallClock('2026-03-29T03:30', zone)).toBe(
    '2026-03-29T01:30:00.000Z',
  );
  // An hour that never happens lands on the instant the clocks jumped to.
  expect(fromWallClock('2026-03-29T02:30', zone)).toBe(
    '2026-03-29T01:30:00.000Z',
  );
  // An hour that happens twice takes the first of the two.
  expect(fromWallClock('2026-10-25T02:30', zone)).toBe(
    '2026-10-25T00:30:00.000Z',
  );
  expect(fromWallClock('2026-09-19T09:00', 'Asia/Tashkent')).toBe(
    '2026-09-19T04:00:00.000Z',
  );
  for (const invalid of ['', '2026-09-19', 'tomorrow']) {
    expect(fromWallClock(invalid, zone)).toBeNull();
  }
});

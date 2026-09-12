import { describe, expect, it } from 'vitest';
import { parseDate } from './parse-date.js';
const now = new Date('2026-09-12T07:00:00Z');
const parse = (value: string) => parseDate(value, now, 'Asia/Tashkent');
describe('calendar dates', () => {
  it.each([
    ['today', '2026-09-12'],
    [' TOMORROW ', '2026-09-13'],
    ['in 3 days', '2026-09-15'],
    ['in 1 day', '2026-09-13'],
    ['in 2 weeks', '2026-09-26'],
    ['in 1 week', '2026-09-19'],
    ['next week', '2026-09-19'],
    ['Friday', '2026-09-18'],
    ['Saturday', '2026-09-12'],
    ['next saturday', '2026-09-19'],
    ['next Friday', '2026-09-18'],
    ['Sunday', '2026-09-13'],
    ['Monday', '2026-09-14'],
    ['Tuesday', '2026-09-15'],
    ['Wednesday', '2026-09-16'],
    ['Thursday', '2026-09-17'],
    ['19.09', '2026-09-19'],
    ['19.09.2027', '2027-09-19'],
    ['2026-09-19', '2026-09-19'],
    ['19 sep', '2026-09-19'],
    ['sep 19', '2026-09-19'],
    ['29.02.2028', '2028-02-29'],
  ])('%s is %s', (input, expected) =>
    expect(parse(input).date?.toISOString().slice(0, 10)).toBe(expected),
  );
  it.each([
    'yesterday',
    '31.09',
    '29.02.2027',
    '0.12',
    '12.13',
    '2026-02-30',
    '19 nope',
    'in -1 days',
    'in 999999999999 days',
    '2026-9-19',
    '',
  ])('rejects %s', (input) =>
    expect(parse(input)).toEqual({ error: 'invalid' }),
  );
  it.each(['11.09', '2025-09-19', 'jan 1'])('refuses past %s', (input) =>
    expect(parse(input)).toEqual({ error: 'past' }),
  );
  it('uses the local day on either side of midnight', () => {
    const instant = new Date('2026-09-12T23:30:00Z');
    expect(
      parseDate('Sunday', instant, 'Asia/Tashkent').date?.toISOString(),
    ).toBe('2026-09-13T00:00:00.000Z');
    expect(
      parseDate('Saturday', instant, 'America/New_York').date?.toISOString(),
    ).toBe('2026-09-12T00:00:00.000Z');
  });
  it('crosses year and DST boundaries as calendar days', () => {
    expect(
      parseDate(
        'tomorrow',
        new Date('2026-12-31T12:00Z'),
        'Europe/London',
      ).date?.toISOString(),
    ).toBe('2027-01-01T00:00:00.000Z');
    expect(
      parseDate(
        'in 2 days',
        new Date('2026-03-07T17:00Z'),
        'America/New_York',
      ).date?.toISOString(),
    ).toBe('2026-03-09T00:00:00.000Z');
  });
});

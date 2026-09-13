import { expect, it } from 'vitest';
import {
  ApiError,
  ItemListDto,
  ItemStatus,
  ItemSummaryDto,
  UpdateItemBody,
  UpdateMeBody,
  UserDto,
} from './index.js';

it('round-trips scalar DTOs through JSON', () => {
  const user: UserDto = {
    id: 'a34fe175-6999-4bb4-b326-5557eb02644a',
    telegramId: '123456789',
    timezone: null,
    createdAt: '2026-09-12T00:00:00.000Z',
  };
  const item: ItemSummaryDto = {
    id: user.id,
    what: 'Approval',
    fromWhom: null,
    expectedOn: '2026-09-19',
    status: 'open',
    createdAt: user.createdAt,
    receivedAt: null,
    remindAt: '2026-09-19T04:00:00.000Z',
  };
  expect(UserDto.parse(JSON.parse(JSON.stringify(user)))).toEqual(user);
  expect(ItemSummaryDto.parse(JSON.parse(JSON.stringify(item)))).toEqual(item);
  expect(ItemListDto.parse({ items: [item] })).toEqual({ items: [item] });
  expect(ItemStatus.options).toEqual([
    'draft',
    'open',
    'received',
    'cancelled',
  ]);
  const error: ApiError = {
    error: { code: 'conflict', message: 'Item is not open.' },
  };
  expect(ApiError.parse(JSON.parse(JSON.stringify(error)))).toEqual(error);
  expect(
    ApiError.safeParse({ error: { code: 'unknown', message: 'No.' } }).success,
  ).toBe(false);
  expect(UserDto.safeParse({ ...user, telegramId: 123 }).success).toBe(false);
  expect(
    ItemSummaryDto.safeParse({ ...item, expectedOn: 'tomorrow' }).success,
  ).toBe(false);
  expect(ItemSummaryDto.safeParse({ ...item, userId: user.id }).success).toBe(
    true,
  );
});

it('accepts partial item edits and rejects unknown or oversized fields', () => {
  expect(UpdateItemBody.parse({})).toEqual({});
  expect(
    UpdateItemBody.parse({
      what: '  Design  ',
      fromWhom: null,
      expectedOn: null,
      remindAt: '2026-09-19T04:00:00.000Z',
    }),
  ).toEqual({
    what: 'Design',
    fromWhom: null,
    expectedOn: null,
    remindAt: '2026-09-19T04:00:00.000Z',
  });
  for (const invalid of [
    { what: '   ' },
    { what: 'x'.repeat(501) },
    { fromWhom: 'x'.repeat(501) },
    { expectedOn: '2026-09-19T04:00:00.000Z' },
    { remindAt: '2026-09-19' },
    { status: 'received' },
  ]) {
    expect(UpdateItemBody.safeParse(invalid).success).toBe(false);
  }
  expect(UpdateMeBody.parse({ timezone: ' Asia/Tashkent ' })).toEqual({
    timezone: 'Asia/Tashkent',
  });
  expect(UpdateMeBody.safeParse({ timezone: '' }).success).toBe(false);
});

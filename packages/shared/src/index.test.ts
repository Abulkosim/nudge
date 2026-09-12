import { expect, it } from 'vitest';
import { ApiError, ItemDto, ItemStatus, UserDto } from './index.js';

it('round-trips scalar DTOs through JSON', () => {
  const user: UserDto = {
    id: 'a34fe175-6999-4bb4-b326-5557eb02644a',
    telegramId: '123456789',
    timezone: null,
    createdAt: '2026-09-12T00:00:00.000Z',
  };
  const item: ItemDto = {
    id: user.id,
    userId: user.id,
    what: 'Approval',
    fromWhom: null,
    expectedAt: null,
    status: 'open',
    sourceChatId: '-1001234567890',
    sourceMessageId: '123',
    sourceText: null,
    createdAt: user.createdAt,
    updatedAt: user.createdAt,
    receivedAt: null,
  };
  expect(UserDto.parse(JSON.parse(JSON.stringify(user)))).toEqual(user);
  expect(ItemDto.parse(JSON.parse(JSON.stringify(item)))).toEqual(item);
  expect(ItemStatus.options).toEqual([
    'draft',
    'open',
    'received',
    'cancelled',
  ]);
  const error: ApiError = {
    error: { code: 'unauthorized', message: 'Sign in.' },
  };
  expect(ApiError.parse(JSON.parse(JSON.stringify(error)))).toEqual(error);
  expect(
    ApiError.safeParse({ error: { code: 'unknown', message: 'No.' } }).success,
  ).toBe(false);
  expect(UserDto.safeParse({ ...user, telegramId: 123 }).success).toBe(false);
  expect(ItemDto.safeParse({ ...item, expectedAt: 'tomorrow' }).success).toBe(
    false,
  );
});

import { createHmac } from 'node:crypto';
import type { UsersService } from './users/index.js';

export const testToken = '123:test-token';
export const testUser = {
  id: 'a34fe175-6999-4bb4-b326-5557eb02644a',
  telegramId: 123456789n,
  timezone: null,
  createdAt: new Date('2026-09-12T00:00:00.000Z'),
};
export const silentLogger = { warn: () => {}, error: () => {} };
export function fakeUsers(): UsersService {
  return {
    findOrCreateByTelegramId: async () => testUser,
    setTimezone: async (_id, timezone) => ({ ...testUser, timezone }),
  };
}

// Independent signing implementation: object keys, not verifier/query parser helpers.
export function signedData(
  fields: Record<string, string> = {},
  token = testToken,
) {
  const payload = {
    user: JSON.stringify({
      id: Number(testUser.telegramId),
      first_name: 'Test + & name',
    }),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'test-query',
    ...fields,
  };
  const check = Object.entries(payload)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const key = createHmac('sha256', Buffer.from('WebAppData'))
    .update(token, 'utf8')
    .digest();
  const hash = createHmac('sha256', key).update(check, 'utf8').digest('hex');
  return new URLSearchParams({ ...payload, hash }).toString();
}

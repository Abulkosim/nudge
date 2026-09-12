import { once } from 'node:events';
import express from 'express';
import { Bot } from 'grammy';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, UserDto } from '@nudge/shared';
import { createApp } from './app.js';
import { apiErrorHandler } from './api.js';
import { parseConfig } from './config-schema.js';
import { fakeUsers, signedData, testToken, testUser } from './test-helpers.js';
import { authenticate } from './auth/middleware.js';

const config = parseConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://localhost/nudge',
  BOT_TOKEN: testToken,
  BOT_MODE: 'polling',
  PORT: '3000',
  AI_PROVIDER: 'none',
  LOG_LEVEL: 'silent',
});
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});
async function listen(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  closers.push(
    () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address');
  return `http://127.0.0.1:${address.port}`;
}
function setup() {
  const users = fakeUsers();
  const upsert = vi.spyOn(users, 'findOrCreateByTelegramId');
  const logger = { warn: vi.fn(), error: vi.fn() };
  const { app } = createApp(config, new Bot(testToken), users, logger);
  return { app, users, upsert, logger };
}
it('authenticates every API path, returning one safe warning per rejection', async () => {
  const { app, upsert, logger } = setup();
  const base = await listen(app);
  const raw = signedData();
  const cases = [
    { header: '', reason: 'missing_header' },
    { header: `Bearer ${raw}`, reason: 'invalid_scheme' },
    {
      header: `tma ${raw.replace('test-query', 'tampered')}`,
      reason: 'invalid_signature',
    },
  ];
  for (const path of ['/api', '/api/me', '/api/unknown']) {
    for (const { header, reason } of cases) {
      const response = await fetch(`${base}${path}`, {
        headers: header ? { Authorization: header } : {},
      });
      expect(response.status).toBe(401);
      expect(ApiError.parse(await response.json())).toEqual({
        error: {
          code: 'unauthorized',
          message: 'Open Nudge in Telegram to sign in.',
        },
      });
      expect(logger.warn).toHaveBeenLastCalledWith({ reason });
    }
  }
  expect(upsert).not.toHaveBeenCalled();
  expect(logger.warn).toHaveBeenCalledTimes(9);
  expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(raw);
  expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(testToken);
});
it('GET /api/me returns only the verified user, with bigint and date serialized', async () => {
  const { app, upsert, logger } = setup();
  const base = await listen(app);
  const headers = { Authorization: `tma ${signedData()}` };
  for (let i = 0; i < 2; i++) {
    const response = await fetch(`${base}/api/me?telegramId=999`, { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(UserDto.parse(await response.json())).toEqual({
      ...testUser,
      telegramId: '123456789',
      createdAt: testUser.createdAt.toISOString(),
    });
  }
  expect(upsert).toHaveBeenCalledTimes(2);
  expect(upsert).toHaveBeenCalledWith(testUser.telegramId);
  expect(logger.warn).not.toHaveBeenCalled();
  const missing = await fetch(`${base}/api/unknown`, { headers });
  expect(missing.status).toBe(404);
  expect(ApiError.parse(await missing.json()).error.code).toBe('not_found');
});
it('maps bad and oversized JSON to invalid_request after authentication', async () => {
  const { app } = setup();
  const base = await listen(app);
  for (const body of ['{', JSON.stringify({ text: 'x'.repeat(65536) })]) {
    const response = await fetch(`${base}/api/me`, {
      method: 'POST',
      headers: {
        Authorization: `tma ${signedData()}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    expect(response.status).toBe(400);
    expect(ApiError.parse(await response.json()).error.code).toBe(
      'invalid_request',
    );
  }
});
it('does not leak database errors or credentials, but logs them', async () => {
  const { app, upsert, logger } = setup();
  const raw = signedData();
  upsert.mockRejectedValue(new Error('connection refused'));
  const response = await fetch(`${await listen(app)}/api/me`, {
    headers: { Authorization: `tma ${raw}` },
  });
  expect(response.status).toBe(500);
  expect(ApiError.parse(await response.json())).toEqual({
    error: { code: 'internal', message: 'Something went wrong.' },
  });
  expect(logger.warn).not.toHaveBeenCalled();
  // Production config: name and message are logged, the stack is not.
  expect(logger.error).toHaveBeenCalledExactlyOnceWith({
    errorType: 'Error',
    message: 'connection refused',
  });
  expect(JSON.stringify(logger.error.mock.calls)).not.toContain(raw);
});
it('middleware attaches a request-scoped Prisma user and forwards zod failures', async () => {
  const app = express();
  const logger = { warn: vi.fn(), error: vi.fn() };
  app.use(authenticate(fakeUsers(), testToken, 86400));
  app.get('/scoped', (_req, res) => {
    expect(res.locals.user).toEqual(testUser);
    res.json({ ok: true });
  });
  app.get('/invalid', () => {
    z.string().parse(123);
  });
  app.use(apiErrorHandler(logger, { includeStack: true }));
  const base = await listen(app);
  const headers = { Authorization: `tma ${signedData()}` };
  expect((await fetch(`${base}/scoped`, { headers })).status).toBe(200);
  const invalid = await fetch(`${base}/invalid`, { headers });
  expect(invalid.status).toBe(400);
  expect(ApiError.parse(await invalid.json()).error.code).toBe(
    'invalid_request',
  );
});

import { randomInt } from 'node:crypto';
import { once } from 'node:events';
import { PrismaPg } from '@prisma/adapter-pg';
import express from 'express';
import { Bot } from 'grammy';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, ItemListDto, ItemSummaryDto, UserDto } from '@nudge/shared';
import { createApp } from './app.js';
import { apiErrorHandler } from './api.js';
import { parseConfig } from './config-schema.js';
import {
  fakeDeps,
  fakeUsers,
  signedData,
  testToken,
  testUser,
} from './test-helpers.js';
import { authenticate } from './auth/middleware.js';
import { PrismaClient } from './generated/prisma/client.js';
import { createItemsService } from './items/index.js';
import { createUsersService } from './users/index.js';

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
  const { app } = createApp(
    config,
    new Bot(testToken),
    fakeDeps({ users, logger }),
  );
  return { app, users, upsert, logger };
}
const now = new Date('2026-09-13T06:00:00.000Z');
// One signed-in user with a real row, plus a stranger to prove ownership scoping.
async function setupDatabase() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  closers.push(() => prisma.$disconnect());
  const telegramId = BigInt(randomInt(2 ** 31, 2 ** 48 - 1));
  const [user, stranger] = await Promise.all([
    prisma.user.create({ data: { telegramId, timezone: 'Asia/Tashkent' } }),
    prisma.user.create({ data: { telegramId: -telegramId } }),
  ]);
  const scheduler = { enqueue: vi.fn(), cancelJobs: vi.fn() };
  const { app } = createApp(config, new Bot(testToken), {
    users: createUsersService(prisma),
    items: createItemsService(prisma, () => now),
    scheduler,
    logger: { warn: vi.fn(), error: vi.fn() },
  });
  const base = await listen(app);
  const headers = {
    Authorization: `tma ${signedData({
      user: JSON.stringify({ id: Number(telegramId), first_name: 'Local' }),
    })}`,
    'Content-Type': 'application/json',
  };
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${base}${path}`, { ...init, headers });
  const open = (data: { what: string; expectedOn?: string }) =>
    prisma.item.create({
      data: {
        userId: user.id,
        status: 'open',
        what: data.what,
        expectedOn: data.expectedOn ? new Date(data.expectedOn) : null,
      },
    });
  return { prisma, user, stranger, scheduler, call, open };
}
const remind = (prisma: PrismaClient, itemId: string, at: string) =>
  prisma.reminder.create({
    data: {
      itemId,
      scheduledFor: new Date(at),
      kind: 'scheduled',
      status: 'pending',
      jobId: `job-${itemId}`,
    },
  });
const db = it.skipIf(!process.env.DATABASE_URL);
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

it('PATCH /api/me stores a resolved zone and refuses anything else', async () => {
  const users = fakeUsers();
  const setTimezone = vi.spyOn(users, 'setTimezone');
  const { app } = createApp(config, new Bot(testToken), fakeDeps({ users }));
  const base = await listen(app);
  const patch = (body: unknown) =>
    fetch(`${base}/api/me`, {
      method: 'PATCH',
      headers: {
        Authorization: `tma ${signedData()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  const accepted = await patch({ timezone: 'tashkent' });
  expect(accepted.status).toBe(200);
  expect(accepted.headers.get('cache-control')).toBe('no-store');
  expect(UserDto.parse(await accepted.json()).timezone).toBe('Asia/Tashkent');
  expect(setTimezone).toHaveBeenCalledExactlyOnceWith(
    testUser.id,
    'Asia/Tashkent',
  );
  const unknown = await patch({ timezone: 'Moon/Base' });
  expect(unknown.status).toBe(400);
  expect(ApiError.parse(await unknown.json())).toEqual({
    error: { code: 'invalid_request', message: 'Unknown timezone.' },
  });
  for (const body of [{}, { timezone: 'Asia/Tashkent', admin: true }]) {
    expect((await patch(body)).status).toBe(400);
  }
  expect(setTimezone).toHaveBeenCalledOnce();
});

db(
  'lists open and received items, hiding drafts, cancelled and other users',
  async () => {
    const { prisma, user, stranger, call, open } = await setupDatabase();
    const dated = await open({ what: 'Design', expectedOn: '2026-09-19' });
    await open({ what: 'Invoice' });
    await open({ what: 'Keys', expectedOn: '2026-09-15' });
    await remind(prisma, dated.id, '2026-09-19T04:00:00.000Z');
    await prisma.item.createMany({
      data: [
        {
          userId: user.id,
          what: 'Draft',
          status: 'draft',
          awaiting: 'confirm',
        },
        { userId: user.id, what: 'Cancelled', status: 'cancelled' },
        { userId: stranger.id, what: 'Theirs', status: 'open' },
        {
          userId: user.id,
          what: 'Old keys',
          status: 'received',
          receivedAt: new Date('2026-09-10T08:00:00.000Z'),
        },
        {
          userId: user.id,
          what: 'New keys',
          status: 'received',
          receivedAt: new Date('2026-09-12T08:00:00.000Z'),
        },
      ],
    });
    const response = await call('/api/items?status=open');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const waiting = ItemListDto.parse(await response.json());
    expect(waiting.items.map((item) => item.what)).toEqual([
      'Keys',
      'Design',
      'Invoice',
    ]);
    expect(waiting.items.map((item) => item.remindAt)).toEqual([
      null,
      '2026-09-19T04:00:00.000Z',
      null,
    ]);
    expect(waiting.items[1]).toMatchObject({
      id: dated.id,
      expectedOn: '2026-09-19',
      fromWhom: null,
      status: 'open',
      receivedAt: null,
    });
    const received = ItemListDto.parse(
      await (await call('/api/items?status=received')).json(),
    );
    expect(received.items.map((item) => item.what)).toEqual([
      'New keys',
      'Old keys',
    ]);
    expect(received.items[0]?.receivedAt).toBe('2026-09-12T08:00:00.000Z');
    for (const query of ['', '?status=draft', '?status=all']) {
      const invalid = await call(`/api/items${query}`);
      expect(invalid.status).toBe(400);
      expect(ApiError.parse(await invalid.json()).error.code).toBe(
        'invalid_request',
      );
    }
  },
);

db(
  'edits fields and moves the reminder by each of its four rules',
  async () => {
    const { prisma, scheduler, call, open } = await setupDatabase();
    const item = await open({ what: 'Design', expectedOn: '2026-09-19' });
    await remind(prisma, item.id, '2026-09-19T04:00:00.000Z');
    const patch = async (body: unknown) => {
      const response = await call(`/api/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(200);
      return ItemSummaryDto.parse(await response.json());
    };
    const pending = () =>
      prisma.reminder.findMany({
        where: { itemId: item.id, status: 'pending' },
      });
    expect(
      await patch({ what: '  Final design  ', fromWhom: 'Aziz' }),
    ).toMatchObject({
      what: 'Final design',
      fromWhom: 'Aziz',
      expectedOn: '2026-09-19',
      remindAt: '2026-09-19T04:00:00.000Z',
    });
    expect(scheduler.enqueue).not.toHaveBeenCalled();
    expect(scheduler.cancelJobs).toHaveBeenLastCalledWith([]);
    expect((await patch({ expectedOn: '2026-09-19' })).remindAt).toBe(
      '2026-09-19T04:00:00.000Z',
    );
    expect(scheduler.enqueue).not.toHaveBeenCalled();
    expect(await patch({ expectedOn: '2026-09-20' })).toMatchObject({
      expectedOn: '2026-09-20',
      remindAt: '2026-09-20T04:00:00.000Z',
    });
    expect(scheduler.cancelJobs).toHaveBeenLastCalledWith([`job-${item.id}`]);
    expect(scheduler.enqueue).toHaveBeenCalledOnce();
    expect(await pending()).toHaveLength(1);
    expect(
      (await patch({ remindAt: '2026-09-18T10:00:00.000Z' })).remindAt,
    ).toBe('2026-09-18T10:00:00.000Z');
    const [replaced] = await pending();
    expect(
      (await patch({ remindAt: '2026-09-18T10:00:00.000Z' })).remindAt,
    ).toBe('2026-09-18T10:00:00.000Z');
    expect((await pending())[0]?.id).toBe(replaced?.id);
    expect((await patch({ remindAt: null })).remindAt).toBeNull();
    expect(await pending()).toHaveLength(0);
    expect((await patch({ expectedOn: '2026-09-21' })).remindAt).toBe(
      '2026-09-21T04:00:00.000Z',
    );
    expect(await patch({ expectedOn: null })).toMatchObject({
      expectedOn: null,
      remindAt: null,
    });
    expect(await pending()).toHaveLength(0);
    expect(
      await prisma.item.findUniqueOrThrow({ where: { id: item.id } }),
    ).toMatchObject({
      what: 'Final design',
      fromWhom: 'Aziz',
      status: 'open',
    });
  },
);

db('refuses an edit it cannot make, and says which', async () => {
  const { prisma, user, call, open } = await setupDatabase();
  const item = await open({ what: 'Design', expectedOn: '2026-09-19' });
  const patch = (body: unknown, id = item.id) =>
    call(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  const past = await patch({ remindAt: '2026-09-13T05:00:00.000Z' });
  expect(past.status).toBe(400);
  expect(ApiError.parse(await past.json())).toEqual({
    error: { code: 'invalid_request', message: 'Reminder time has passed.' },
  });
  for (const body of [
    { status: 'received' },
    { what: '  ' },
    { remindAt: '2026-09-19' },
  ]) {
    const invalid = await patch(body);
    expect(invalid.status).toBe(400);
    expect(ApiError.parse(await invalid.json()).error.code).toBe(
      'invalid_request',
    );
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { timezone: null },
  });
  const zoneless = await patch({ expectedOn: '2026-09-25' });
  expect(zoneless.status).toBe(409);
  expect(ApiError.parse(await zoneless.json())).toEqual({
    error: { code: 'conflict', message: 'Set a timezone first.' },
  });
  // An explicit instant is absolute, so it needs no zone.
  expect((await patch({ remindAt: '2026-09-18T10:00:00.000Z' })).status).toBe(
    200,
  );
  const draft = await prisma.item.create({
    data: { userId: user.id, what: 'Draft', status: 'draft' },
  });
  const closed = await patch({ what: 'Anything' }, draft.id);
  expect(closed.status).toBe(409);
  expect(ApiError.parse(await closed.json())).toEqual({
    error: { code: 'conflict', message: 'Item is not open.' },
  });
});

db(
  'receives and reopens no matter how often the button is tapped',
  async () => {
    const { prisma, user, scheduler, call, open } = await setupDatabase();
    const item = await open({ what: 'Design', expectedOn: '2026-09-19' });
    await remind(prisma, item.id, '2026-09-19T04:00:00.000Z');
    const post = async (action: string, id = item.id) => {
      const response = await call(`/api/items/${id}/${action}`, {
        method: 'POST',
      });
      return { status: response.status, body: await response.json() };
    };
    const first = await post('receive');
    expect(first.status).toBe(200);
    expect(ItemSummaryDto.parse(first.body)).toMatchObject({
      status: 'received',
      receivedAt: now.toISOString(),
      remindAt: null,
    });
    expect(scheduler.cancelJobs).toHaveBeenLastCalledWith([`job-${item.id}`]);
    const again = await post('receive');
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(scheduler.cancelJobs).toHaveBeenCalledOnce();
    expect(
      await prisma.reminder.count({
        where: { itemId: item.id, status: 'cancelled' },
      }),
    ).toBe(1);
    const reopened = await post('reopen');
    expect(reopened.status).toBe(200);
    expect(ItemSummaryDto.parse(reopened.body)).toMatchObject({
      status: 'open',
      receivedAt: null,
      remindAt: null,
    });
    expect((await post('reopen')).body).toEqual(reopened.body);
    const draft = await prisma.item.create({
      data: { userId: user.id, what: 'Draft', status: 'draft' },
    });
    expect(await post('receive', draft.id)).toMatchObject({
      status: 409,
      body: { error: { code: 'conflict', message: 'Item is not open.' } },
    });
    expect(await post('reopen', draft.id)).toMatchObject({
      status: 409,
      body: {
        error: { code: 'conflict', message: 'Item cannot be reopened.' },
      },
    });
  },
);

db('answers 404 for an item another user owns', async () => {
  const { prisma, stranger, call } = await setupDatabase();
  const theirs = await prisma.item.create({
    data: { userId: stranger.id, what: 'Theirs', status: 'open' },
  });
  const requests: [string, RequestInit][] = [
    [`/api/items/${theirs.id}`, { method: 'PATCH', body: '{"what":"Mine"}' }],
    [`/api/items/${theirs.id}/receive`, { method: 'POST' }],
    [`/api/items/${theirs.id}/reopen`, { method: 'POST' }],
    [`/api/items/${stranger.id}/receive`, { method: 'POST' }],
    [`/api/items/not-a-uuid/reopen`, { method: 'POST' }],
  ];
  for (const [path, init] of requests) {
    const response = await call(path, init);
    expect(response.status).toBe(404);
    expect(ApiError.parse(await response.json())).toEqual({
      error: { code: 'not_found', message: 'Not found.' },
    });
  }
  expect(
    await prisma.item.findUniqueOrThrow({ where: { id: theirs.id } }),
  ).toMatchObject({ what: 'Theirs', status: 'open' });
});

import express, { type ErrorRequestHandler, type Response } from 'express';
import {
  ApiError,
  ItemListDto,
  ItemListQuery,
  ItemSummaryDto,
  UpdateItemBody,
  UpdateMeBody,
  UserDto,
} from '@nudge/shared';
import { z } from 'zod';
import type { Config } from './config-schema.js';
import type { User } from './generated/prisma/client.js';
import type { UsersService } from './users/index.js';
import type { ItemsService, ItemWithReminder } from './items/index.js';
import type { Scheduler } from './reminders/scheduler.js';
import { authenticate } from './auth/middleware.js';
import { AuthError } from './auth/verify-init-data.js';
import { resolveTimezone } from './time/timezone.js';

export interface ApiLogger {
  warn(fields: { reason: string }): void;
  error(fields: { errorType: string; message: string; stack?: string }): void;
}

export interface ApiDeps {
  users: UsersService;
  items: Pick<
    ItemsService,
    'list' | 'summary' | 'update' | 'receive' | 'reopen'
  >;
  scheduler: Pick<Scheduler, 'enqueue' | 'cancelJobs'>;
  logger: ApiLogger;
}

const notOpen = 'Item is not open.';

export function apiErrorHandler(
  logger: ApiLogger,
  { includeStack }: { includeStack: boolean },
): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    // Express closes an already-started response; never forward sensitive error data.
    if (res.headersSent) return next(new Error('Internal API error.'));
    let status = 500;
    let body: ApiError = {
      error: { code: 'internal', message: 'Something went wrong.' },
    };
    if (error instanceof AuthError) {
      logger.warn({ reason: error.reason });
      status = 401;
      body = {
        error: {
          code: 'unauthorized',
          message: 'Open Nudge in Telegram to sign in.',
        },
      };
    } else if (
      error instanceof z.ZodError ||
      (error instanceof Error &&
        'type' in error &&
        (error.type === 'entity.parse.failed' ||
          error.type === 'entity.too.large'))
    ) {
      status = 400;
      body = {
        error: { code: 'invalid_request', message: 'Invalid request.' },
      };
    } else {
      // Unexpected failures are the only ones worth a full error log. Headers never go in.
      const known = error instanceof Error;
      logger.error({
        errorType: known ? error.name : 'UnknownError',
        message: known ? error.message : String(error),
        ...(includeStack && known && error.stack ? { stack: error.stack } : {}),
      });
    }
    res.status(status).json(body);
  };
}

function fail(
  res: Response,
  status: number,
  code: ApiError['error']['code'],
  message: string,
) {
  const body: ApiError = { error: { code, message } };
  res.status(status).json(body);
}

function currentUser(res: Response): User {
  const user = res.locals.user;
  if (!user) throw new AuthError('missing_header');
  return user;
}

function toUser(user: User): UserDto {
  return {
    id: user.id,
    telegramId: user.telegramId.toString(),
    timezone: user.timezone,
    createdAt: user.createdAt.toISOString(),
  };
}

function toSummary(item: ItemWithReminder): ItemSummaryDto {
  return {
    id: item.id,
    what: item.what,
    fromWhom: item.fromWhom,
    // A Prisma date column is UTC midnight, so the calendar date is its ISO prefix.
    expectedOn: item.expectedOn?.toISOString().slice(0, 10) ?? null,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    receivedAt: item.receivedAt?.toISOString() ?? null,
    remindAt: item.reminders[0]?.scheduledFor.toISOString() ?? null,
  };
}

const toDate = (value: string | null | undefined) =>
  value == null ? value : new Date(value);

// An id that is not a uuid cannot name anything the user owns, so it reads as missing.
function itemId(raw: string, res: Response): string | null {
  const parsed = z.uuid().safeParse(raw);
  if (parsed.success) return parsed.data;
  fail(res, 404, 'not_found', 'Not found.');
  return null;
}

export function createApi(
  config: Config,
  { users, items, scheduler, logger }: ApiDeps,
) {
  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Authenticate even unknown routes and malformed bodies before parsing JSON.
  api.use(authenticate(users, config.BOT_TOKEN, config.AUTH_MAX_AGE_SECONDS));
  api.use(express.json({ limit: '64kb' }));
  api.get('/me', (_req, res) => {
    res.json(toUser(currentUser(res)));
  });
  api.patch('/me', async (req, res) => {
    const user = currentUser(res);
    const body = UpdateMeBody.parse(req.body);
    const zone = resolveTimezone(body.timezone);
    if (!zone) return fail(res, 400, 'invalid_request', 'Unknown timezone.');
    res.json(toUser(await users.setTimezone(user.id, zone)));
  });
  api.get('/items', async (req, res) => {
    const user = currentUser(res);
    const { status } = ItemListQuery.parse(req.query);
    const body: ItemListDto = {
      items: (await items.list(user.id, status)).map(toSummary),
    };
    res.json(body);
  });
  api.patch('/items/:id', async (req, res) => {
    const user = currentUser(res);
    const id = itemId(req.params.id, res);
    if (!id) return;
    const body = UpdateItemBody.parse(req.body);
    const result = await items.update(id, user.id, {
      what: body.what,
      fromWhom: body.fromWhom,
      expectedOn: toDate(body.expectedOn),
      remindAt: toDate(body.remindAt),
    });
    if (!result.ok) {
      if (result.reason === 'not_found')
        return fail(res, 404, 'not_found', 'Not found.');
      if (result.reason === 'past')
        return fail(res, 400, 'invalid_request', 'Reminder time has passed.');
      return fail(
        res,
        409,
        'conflict',
        result.reason === 'no_timezone' ? 'Set a timezone first.' : notOpen,
      );
    }
    await scheduler.cancelJobs(result.jobIds);
    if (result.reminder) await scheduler.enqueue(result.reminder);
    res.json(toSummary(result.item));
  });
  api.post('/items/:id/receive', async (req, res) => {
    const user = currentUser(res);
    const id = itemId(req.params.id, res);
    if (!id) return;
    const result = await items.receive(id, user.id);
    if (result) {
      await scheduler.cancelJobs(result.jobIds);
      return res.json(toSummary(result.item));
    }
    const current = await items.summary(id, user.id);
    if (!current) return fail(res, 404, 'not_found', 'Not found.');
    if (current.status !== 'received')
      return fail(res, 409, 'conflict', notOpen);
    res.json(toSummary(current));
  });
  api.post('/items/:id/reopen', async (req, res) => {
    const user = currentUser(res);
    const id = itemId(req.params.id, res);
    if (!id) return;
    const result = await items.reopen(id, user.id);
    if (!result.ok)
      return result.reason === 'not_found'
        ? fail(res, 404, 'not_found', 'Not found.')
        : fail(res, 409, 'conflict', 'Item cannot be reopened.');
    res.json(toSummary(result.item));
  });
  api.use((_req, res) => {
    fail(res, 404, 'not_found', 'Not found.');
  });
  api.use(
    apiErrorHandler(logger, {
      includeStack: config.NODE_ENV !== 'production',
    }),
  );
  return api;
}

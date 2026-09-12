import express, { type ErrorRequestHandler } from 'express';
import { ApiError, UserDto } from '@nudge/shared';
import { z } from 'zod';
import type { Config } from './config-schema.js';
import type { UsersService } from './users/index.js';
import { authenticate } from './auth/middleware.js';
import { AuthError } from './auth/verify-init-data.js';

export interface ApiLogger {
  warn(fields: { reason: string }): void;
  error(fields: { errorType: string; message: string; stack?: string }): void;
}

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

export function createApi(
  config: Config,
  users: UsersService,
  logger: ApiLogger,
) {
  const api = express.Router();
  // Authenticate even unknown routes and malformed bodies before parsing JSON.
  api.use(authenticate(users, config.BOT_TOKEN, config.AUTH_MAX_AGE_SECONDS));
  api.use(express.json({ limit: '64kb' }));
  api.get('/me', (_req, res) => {
    const user = res.locals.user;
    if (!user) throw new AuthError('missing_header');
    const dto: UserDto = {
      id: user.id,
      telegramId: user.telegramId.toString(),
      timezone: user.timezone,
      createdAt: user.createdAt.toISOString(),
    };
    res.setHeader('Cache-Control', 'no-store');
    res.json(dto);
  });
  api.use((_req, res) => {
    const body: ApiError = {
      error: { code: 'not_found', message: 'Not found.' },
    };
    res.status(404).json(body);
  });
  api.use(
    apiErrorHandler(logger, {
      includeStack: config.NODE_ENV !== 'production',
    }),
  );
  return api;
}

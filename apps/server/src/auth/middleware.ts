import type { RequestHandler } from 'express';
import type { User } from '../generated/prisma/client.js';
import type { UsersService } from '../users/index.js';
import { AuthError, verifyInitData } from './verify-init-data.js';

// Optional until middleware succeeds. API handlers must narrow before use.
declare global {
  // Express exposes its shared Locals type through this global namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: User;
    }
  }
}

export function authenticate(
  users: UsersService,
  botToken: string,
  maxAgeSeconds: number,
): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('Authorization');
    if (!header) throw new AuthError('missing_header');
    const match = /^tma (\S+)$/i.exec(header);
    if (!match?.[1]) throw new AuthError('invalid_scheme');
    const user = verifyInitData(match[1], botToken, {
      now: Math.floor(Date.now() / 1000),
      maxAgeSeconds,
    });
    res.locals.user = await users.findOrCreateByTelegramId(BigInt(user.id));
    next();
  };
}

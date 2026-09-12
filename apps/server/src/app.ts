import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webhookCallback, type Bot } from 'grammy';
import type { Config } from './config-schema.js';

export function createApp(
  config: Config,
  bot: Bot,
  miniappDist = fileURLToPath(new URL('../../miniapp/dist/', import.meta.url)),
) {
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  if (config.BOT_MODE === 'webhook') {
    app.post(
      '/telegram/webhook',
      express.json(),
      webhookCallback(bot, 'express', { secretToken: config.WEBHOOK_SECRET! }),
    );
  }
  const index = join(miniappDist, 'index.html');
  const miniappMounted = config.NODE_ENV === 'production' && existsSync(index);
  if (miniappMounted) {
    app.use(
      '/app/assets',
      express.static(join(miniappDist, 'assets'), {
        immutable: true,
        maxAge: '1y',
        index: false,
        fallthrough: false,
      }),
    );
    app.use(
      '/app',
      express.static(miniappDist, {
        index: false,
        redirect: false,
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'no-store');
        },
      }),
    );
    app.get(['/app', '/app/{*path}'], (req, res, next) => {
      if (!req.accepts('html')) return next();
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(index);
    });
  }
  return { app, miniappMounted };
}

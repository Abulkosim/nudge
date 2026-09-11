import express from 'express';
import { webhookCallback, type Bot } from 'grammy';
import type { Config } from './config-schema.js';

export function createApp(config: Config, bot: Bot) {
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
  return app;
}

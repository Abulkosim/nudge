import { once } from 'node:events';
import { Bot } from 'grammy';
import { expect, it } from 'vitest';
import { fakeUsers, silentLogger } from './test-helpers.js';
import { createApp } from './app.js';
import { parseConfig } from './config-schema.js';

it('serves health and checks the webhook secret before handling an update', async () => {
  const config = parseConfig({
    DATABASE_URL: 'postgresql://nudge:nudge@localhost:5432/nudge',
    BOT_TOKEN: '123:dummy',
    BOT_MODE: 'webhook',
    PORT: '3000',
    AI_PROVIDER: 'none',
    LOG_LEVEL: 'silent',
    WEBHOOK_URL: 'https://example.com/telegram/webhook',
    WEBHOOK_SECRET: 'secret',
  });
  const bot = new Bot(config.BOT_TOKEN, {
    botInfo: {
      id: 123,
      is_bot: true,
      first_name: 'Nudge',
      username: 'nudge_test_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
      can_manage_bots: false,
      supports_join_request_queries: false,
    },
  });
  let handled = 0;
  bot.use(() => {
    handled++;
  });
  const server = createApp(config, bot, fakeUsers(), silentLogger).app.listen(
    0,
    '127.0.0.1',
  );
  try {
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP address');
    const url = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${url}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
    for (const secret of [undefined, 'wrong', 'secret']) {
      const response = await fetch(`${url}/telegram/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}),
        },
        body: JSON.stringify({ update_id: 1 }),
      });
      expect(response.status).toBe(secret === 'secret' ? 200 : 401);
    }
    expect(handled).toBe(1);
    expect((await fetch(`${url}/anything-else`)).status).toBe(404);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

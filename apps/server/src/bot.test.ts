import { Bot } from 'grammy';
import { expect, it, vi } from 'vitest';
import { registerStart } from './bot.js';
import { fakeUsers, testToken } from './test-helpers.js';

it('creates the sender before replying to repeated /start commands', async () => {
  const bot = new Bot(testToken, {
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
  const users = fakeUsers();
  const upsert = vi.spyOn(users, 'findOrCreateByTelegramId');
  const reply = vi.fn();
  bot.use(async (ctx, next) => {
    ctx.reply = async () => {
      expect(upsert).toHaveBeenCalledWith(456n);
      reply();
      return {
        message_id: 2,
        date: 1800000000,
        chat: { id: 456, type: 'private', first_name: 'Test' },
        text: 'Reply',
      };
    };
    await next();
  });
  registerStart(bot, users);
  const update = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1800000000,
      from: { id: 456, is_bot: false, first_name: 'Test' },
      chat: { id: 456, type: 'private' as const, first_name: 'Test' },
      text: '/start',
      entities: [{ type: 'bot_command' as const, offset: 0, length: 6 }],
    },
  };
  await bot.handleUpdate(update);
  await bot.handleUpdate(update);
  expect(upsert).toHaveBeenCalledTimes(2);
  expect(reply).toHaveBeenCalledTimes(2);
});

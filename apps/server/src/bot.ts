import type { Bot } from 'grammy';
import type { UsersService } from './users/index.js';

export function registerStart(bot: Bot, users: UsersService) {
  bot.command('start', async (ctx) => {
    if (!ctx.from) return;
    await users.findOrCreateByTelegramId(BigInt(ctx.from.id));
    await ctx.reply(
      'Nudge reminds you about things you are waiting for from other people.',
    );
  });
}

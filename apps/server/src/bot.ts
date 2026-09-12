import type { Bot } from 'grammy';
import type { UsersService } from './users/index.js';
import { copy } from './capture/copy.js';
import { timezoneKeyboard } from './capture/index.js';
export { registerCapture } from './capture/index.js';

export function registerStart(bot: Bot, users: UsersService) {
  bot.command('start', async (ctx) => {
    if (!ctx.from) return;
    if (ctx.chat.type !== 'private') {
      await ctx.reply(copy.privateOnly);
      return;
    }
    const user = await users.findOrCreateByTelegramId(BigInt(ctx.from.id));
    await ctx.reply(
      user.timezone ? copy.intro : `${copy.intro}\n${copy.timezone}`,
      user.timezone ? {} : { reply_markup: timezoneKeyboard(user.id) },
    );
  });
}

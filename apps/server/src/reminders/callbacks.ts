import { InlineKeyboard, type Bot, type Context } from 'grammy';
import type { Item, User } from '../generated/prisma/client.js';
import type { ItemsService } from '../items/index.js';
import type { UsersService } from '../users/index.js';
import type { CaptureReminders } from '../capture/index.js';
import { timezoneKeyboard } from '../capture/index.js';
import { copy } from '../capture/copy.js';
import { parseDate } from '../time/parse-date.js';
import { nextMorning, reminderInstant } from '../time/timezone.js';
import type { Scheduler } from './scheduler.js';

const hour = 60 * 60 * 1000;
const actions = new Set([
  'rc',
  'sn',
  'sb',
  's1',
  's2',
  's3',
  's4',
  'sd0',
  'sd1',
  'sd2',
  'sd3',
]);
const buttons = (itemId: string) =>
  new InlineKeyboard()
    .text(copy.received, `rc:${itemId}`)
    .text(copy.snooze, `sn:${itemId}`);
const snoozeButtons = (itemId: string) =>
  new InlineKeyboard()
    .text(copy.snoozeHour, `s1:${itemId}`)
    .text(copy.snoozeTomorrow, `s2:${itemId}`)
    .text(copy.snoozeDays, `s3:${itemId}`)
    .text(copy.snoozePick, `s4:${itemId}`)
    .row()
    .text(copy.back, `sb:${itemId}`);
function dateButtons(itemId: string) {
  const keyboard = new InlineKeyboard();
  copy.dates.forEach((label, index) =>
    keyboard.text(label, `sd${index}:${itemId}`),
  );
  return keyboard;
}
export function registerReminders(
  bot: Bot,
  users: UsersService,
  items: ItemsService,
  scheduler: Pick<Scheduler, 'enqueue' | 'cancelJobs'>,
  now = () => new Date(),
): CaptureReminders {
  async function apply(
    ctx: Context,
    item: Item,
    zone: string,
    scheduledFor: Date,
    edit: boolean,
  ) {
    const result = await items.snooze(item.id, item.userId, scheduledFor);
    if (!result) return;
    await scheduler.cancelJobs(result.jobIds);
    await scheduler.enqueue(result.reminder);
    const text = copy.snoozedUntil(result.reminder.scheduledFor, zone);
    if (edit)
      await ctx.editMessageText(text, { reply_markup: new InlineKeyboard() });
    else await ctx.reply(text);
  }
  async function answer(
    ctx: Context,
    item: Item,
    user: User,
    text: string,
    edit = false,
  ) {
    if (!user.timezone) {
      await ctx.reply(copy.timezone, {
        reply_markup: timezoneKeyboard(user.id),
      });
      return;
    }
    const parsed = parseDate(text, now(), user.timezone);
    if (parsed.error) {
      await ctx.reply(
        parsed.error === 'past' ? copy.pastDate : copy.invalidDate,
      );
      return;
    }
    await apply(
      ctx,
      item,
      user.timezone,
      reminderInstant(parsed.date, user.timezone, now()),
      edit,
    );
  }
  bot.on('callback_query:data', async (ctx, next) => {
    const [action, id] = ctx.callbackQuery.data.split(':');
    if (!action || !actions.has(action)) return next();
    let response = '';
    try {
      if (ctx.chat?.type !== 'private') {
        response = copy.notYours;
        return;
      }
      const user = await users.findOrCreateByTelegramId(BigInt(ctx.from.id));
      const item = id ? await items.find(id, user.id) : null;
      if (!item) {
        response = copy.notYours;
        return;
      }
      if (action === 'rc') {
        const result = await items.receive(item.id, user.id);
        if (!result) {
          response =
            item.status === 'received' ? copy.alreadyReceived : copy.notOpen;
          return;
        }
        await scheduler.cancelJobs(result.jobIds);
        await ctx.editMessageText(copy.receivedCard(result.item), {
          reply_markup: new InlineKeyboard(),
        });
        return;
      }
      // Marking received needs no clock. Every snooze choice does.
      if (!user.timezone) {
        await ctx.reply(copy.timezone, {
          reply_markup: timezoneKeyboard(user.id),
        });
        return;
      }
      if (item.status !== 'open') {
        response =
          item.status === 'received' ? copy.alreadyReceived : copy.notOpen;
        return;
      }
      if (action === 'sn')
        await ctx.editMessageReplyMarkup({
          reply_markup: snoozeButtons(item.id),
        });
      else if (action === 'sb')
        await ctx.editMessageReplyMarkup({ reply_markup: buttons(item.id) });
      else if (action === 's4') {
        if (await items.askSnoozeDate(item.id, user.id))
          await ctx.reply(copy.untilWhen, {
            reply_markup: dateButtons(item.id),
          });
      } else if (action === 's1')
        await apply(
          ctx,
          item,
          user.timezone,
          new Date(now().getTime() + hour),
          true,
        );
      else if (action === 's2' || action === 's3')
        await apply(
          ctx,
          item,
          user.timezone,
          nextMorning(now(), user.timezone, action === 's2' ? 1 : 3),
          true,
        );
      else
        await answer(
          ctx,
          item,
          user,
          copy.dates[Number(action.slice(2))]!,
          true,
        );
    } finally {
      await ctx.answerCallbackQuery({ text: response });
    }
  });
  return {
    enqueue: (reminder) => scheduler.enqueue(reminder),
    question: (userId) => items.findSnoozeQuestion(userId),
    answer: (ctx, item, user, text) => answer(ctx, item, user, text),
    clearQuestion: (userId) => items.clearSnoozeQuestion(userId),
  };
}

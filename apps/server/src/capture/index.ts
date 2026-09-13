import { InlineKeyboard, type Bot, type Context } from 'grammy';
import type { Item, Reminder, User } from '../generated/prisma/client.js';
import type { UsersService } from '../users/index.js';
import type { ItemsService } from '../items/index.js';
import { parseDate } from '../time/parse-date.js';
import { resolveTimezone, zones } from '../time/timezone.js';
import { card, copy } from './copy.js';

// What capture needs from the reminder flow: the job for a confirmed item, and the snooze
// question that owns a plain text answer before any draft does.
export interface CaptureReminders {
  enqueue(reminder: Reminder): Promise<string | null>;
  question(userId: string): Promise<Item | null>;
  answer(ctx: Context, item: Item, user: User, text: string): Promise<void>;
  clearQuestion(userId: string): Promise<boolean>;
}

export function timezoneKeyboard(userId: string) {
  const keyboard = new InlineKeyboard();
  zones.forEach((zone, index) =>
    keyboard.text(zone, `z${index}:${userId}`).row(),
  );
  return keyboard;
}
const buttons = (item: Item) =>
  new InlineKeyboard()
    .text(copy.confirm, `ok:${item.id}`)
    .text(copy.edit, `ed:${item.id}`)
    .text(copy.cancel, `no:${item.id}`);
function dateButtons(item: Item) {
  const keyboard = new InlineKeyboard();
  copy.dates.forEach((label, index) =>
    keyboard.text(label, `d${index}:${item.id}`),
  );
  return keyboard.row().text(copy.skip, `ds:${item.id}`);
}
export function registerCapture(
  bot: Bot,
  users: UsersService,
  items: ItemsService,
  reminders: CaptureReminders,
  now = () => new Date(),
) {
  async function prompt(ctx: Context, item: Item, user: User) {
    if (item.status !== 'draft') return;
    if (item.awaiting === 'from_whom' || item.awaiting === 'edit_from_whom') {
      await ctx.reply(copy.from, {
        reply_markup: new InlineKeyboard().text(copy.skip, `fs:${item.id}`),
      });
    } else if (item.awaiting === 'edit_what') await ctx.reply(copy.what);
    else if (!user.timezone)
      await ctx.reply(copy.timezone, {
        reply_markup: timezoneKeyboard(user.id),
      });
    else if (item.awaiting === 'confirm')
      await ctx.reply(card(item, user.timezone, now()), {
        reply_markup: buttons(item),
      });
    else await ctx.reply(copy.when, { reply_markup: dateButtons(item) });
  }
  async function setZone(ctx: Context, user: User, zone: string) {
    const updated = await users.setTimezone(user.id, zone);
    await ctx.reply(copy.zoneSet(zone, now()));
    const draft = await items.findDraft(user.id);
    if (draft) await prompt(ctx, draft, updated);
  }
  async function answer(
    ctx: Context,
    item: Item,
    user: User,
    text: string | null,
  ) {
    const step = item.awaiting;
    if (!step) return;
    let data;
    if (step === 'from_whom' || step === 'edit_from_whom')
      data = {
        fromWhom: text?.trim().slice(0, 500) || null,
        awaiting:
          step === 'from_whom'
            ? ('expected_on' as const)
            : ('confirm' as const),
      };
    else if (step === 'edit_what') {
      if (!text?.trim()) return;
      if (text.trim().length > 500) await ctx.reply(copy.truncated);
      data = { what: text.trim().slice(0, 500), awaiting: 'confirm' as const };
    } else if (step === 'expected_on' || step === 'edit_expected_on') {
      if (!user.timezone) {
        await prompt(ctx, item, user);
        return;
      }
      const parsed =
        text === null
          ? { date: null, error: undefined }
          : parseDate(text, now(), user.timezone);
      if (parsed.error) {
        await ctx.reply(
          parsed.error === 'past' ? copy.pastDate : copy.invalidDate,
        );
        return;
      }
      data = { expectedOn: parsed.date, awaiting: 'confirm' as const };
    } else {
      await prompt(ctx, item, user);
      return;
    }
    const updated = await items.updateDraft(item.id, user.id, step, data);
    if (updated) await prompt(ctx, updated, user);
  }
  bot.command('timezone', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const user = await users.findOrCreateByTelegramId(BigInt(ctx.from!.id));
    await ctx.reply(`${copy.currentZone(user.timezone)}\n${copy.timezone}`, {
      reply_markup: timezoneKeyboard(user.id),
    });
  });
  bot.command('cancel', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const user = await users.findOrCreateByTelegramId(BigInt(ctx.from!.id));
    if (await reminders.clearQuestion(user.id)) {
      await ctx.reply(copy.cancelled);
      return;
    }
    const item = await items.findDraft(user.id);
    await ctx.reply(
      item && (await items.cancel(item.id, user.id))
        ? copy.cancelled
        : copy.noDraft,
    );
  });
  bot.on('callback_query:data', async (ctx) => {
    let response = '';
    try {
      if (ctx.chat?.type !== 'private') {
        response = copy.notYours;
        return;
      }
      const user = await users.findOrCreateByTelegramId(BigInt(ctx.from.id));
      const [action, id] = ctx.callbackQuery.data.split(':');
      if (/^z[0-6]$/.test(action!)) {
        if (id !== user.id) {
          response = copy.notYours;
          return;
        }
        await setZone(ctx, user, zones[Number(action!.slice(1))]!);
        return;
      }
      const item = id ? await items.find(id, user.id) : null;
      if (!item) {
        response = copy.notYours;
        return;
      }
      if (item.status !== 'draft') {
        response = copy.already;
        return;
      }
      if (action === 'no') {
        if (await items.cancel(item.id, user.id))
          await ctx.editMessageText(copy.cancelled, {
            reply_markup: new InlineKeyboard(),
          });
        else response = copy.already;
      } else if (action === 'ok') {
        if (!user.timezone) {
          await prompt(ctx, item, user);
          return;
        }
        if (item.awaiting !== 'confirm') {
          response = copy.stale;
          return;
        }
        const result = await items.confirm(item.id, user.id);
        if (result) {
          if (result.reminder) await reminders.enqueue(result.reminder);
          await ctx.editMessageText(
            `${copy.saved}\n${card(result.item, user.timezone, now())}`,
            { reply_markup: new InlineKeyboard() },
          );
        } else response = copy.already;
      } else if (action === 'ed' && item.awaiting === 'confirm') {
        await ctx.editMessageReplyMarkup({
          reply_markup: new InlineKeyboard()
            .text(copy.whatLabel, `ew:${id}`)
            .text(copy.fromLabel, `ef:${id}`)
            .text(copy.whenLabel, `et:${id}`)
            .row()
            .text(copy.back, `bk:${id}`),
        });
      } else if (
        ['ew', 'ef', 'et'].includes(action!) &&
        item.awaiting === 'confirm'
      ) {
        const awaiting =
          action === 'ew'
            ? 'edit_what'
            : action === 'ef'
              ? 'edit_from_whom'
              : 'edit_expected_on';
        const updated = await items.updateDraft(item.id, user.id, 'confirm', {
          awaiting,
        });
        if (updated) await prompt(ctx, updated, user);
      } else if (action === 'bk' && item.awaiting === 'confirm') {
        await ctx.editMessageReplyMarkup({ reply_markup: buttons(item) });
      } else if (
        action === 'fs' &&
        ['from_whom', 'edit_from_whom'].includes(item.awaiting!)
      )
        await answer(ctx, item, user, null);
      else if (
        /^d[0-3s]$/.test(action!) &&
        ['expected_on', 'edit_expected_on'].includes(item.awaiting!)
      )
        await answer(
          ctx,
          item,
          user,
          action === 'ds' ? null : copy.dates[Number(action!.slice(1))]!,
        );
      else response = copy.stale;
    } finally {
      await ctx.answerCallbackQuery({ text: response });
    }
  });
  bot.on('message', async (ctx) => {
    if (ctx.chat.type !== 'private' || !ctx.from) return;
    const text = ctx.message.text ?? ctx.message.caption;
    if (
      !text ||
      text.startsWith('/') ||
      ctx.message.entities?.some((entity) => entity.type === 'bot_command')
    )
      return;
    const user = await users.findOrCreateByTelegramId(BigInt(ctx.from.id));
    const question = await reminders.question(user.id);
    if (question) {
      await reminders.answer(ctx, question, user, text);
      return;
    }
    const draft = await items.findDraft(user.id);
    const zone = resolveTimezone(text);
    if (zone && (!user.timezone || !draft)) {
      await setZone(ctx, user, zone);
      return;
    }
    if (draft) {
      if (
        draft.sourceChatId === BigInt(ctx.chat.id) &&
        draft.sourceMessageId === BigInt(ctx.message.message_id)
      ) {
        await prompt(ctx, draft, user);
        return;
      }
      await answer(ctx, draft, user, text);
      return;
    }
    const origin = ctx.message.forward_origin;
    let fromWhom: string | null = null;
    if (origin?.type === 'user')
      fromWhom = [origin.sender_user.first_name, origin.sender_user.last_name]
        .filter(Boolean)
        .join(' ');
    else if (origin?.type === 'hidden_user') fromWhom = origin.sender_user_name;
    else if (origin?.type === 'chat')
      fromWhom = origin.sender_chat.title ?? null;
    else if (origin?.type === 'channel') fromWhom = origin.chat.title;
    const item = await items.createDraft(user.id, {
      what: text.trim().slice(0, 500),
      fromWhom,
      sourceText: text,
      sourceChatId: BigInt(ctx.chat.id),
      sourceMessageId: BigInt(ctx.message.message_id),
    });
    if (text.trim().length > 500) await ctx.reply(copy.truncated);
    await prompt(ctx, item, user);
  });
}

import { randomUUID } from 'node:crypto';
import { Bot } from 'grammy';
import type { MessageOrigin } from 'grammy/types';
import { expect, it, vi } from 'vitest';
import type { Item, User } from '../generated/prisma/client.js';
import type { ItemsService } from '../items/index.js';
import { registerCapture, registerStart } from '../bot.js';
import { testToken, testUser } from '../test-helpers.js';

function harness(timezone: string | null = 'Asia/Tashkent') {
  const user: User = { ...testUser, timezone };
  const rows: Item[] = [];
  let reminders = 0;
  const items: ItemsService = {
    findDraft: async (id) =>
      rows.find((row) => row.userId === id && row.status === 'draft') ?? null,
    find: async (id, userId) =>
      rows.find((row) => row.id === id && row.userId === userId) ?? null,
    createDraft: async (userId, data) => {
      const existing = rows.find(
        (row) =>
          row.userId === userId &&
          (row.status === 'draft' ||
            row.sourceMessageId === data.sourceMessageId),
      );
      if (existing) return existing;
      const item: Item = {
        ...data,
        id: randomUUID(),
        userId,
        expectedOn: null,
        status: 'draft',
        awaiting: data.fromWhom ? 'expected_on' : 'from_whom',
        createdAt: new Date(),
        updatedAt: new Date(),
        receivedAt: null,
      };
      rows.push(item);
      return item;
    },
    updateDraft: async (id, userId, step, data) => {
      const item = rows.find(
        (row) =>
          row.id === id &&
          row.userId === userId &&
          row.status === 'draft' &&
          row.awaiting === step,
      );
      return item ? Object.assign(item, data) : null;
    },
    confirm: async (id, userId) => {
      const item = rows.find(
        (row) =>
          row.id === id &&
          row.userId === userId &&
          row.status === 'draft' &&
          row.awaiting === 'confirm',
      );
      if (!item || !user.timezone) return null;
      item.status = 'open';
      item.awaiting = null;
      if (item.expectedOn) reminders++;
      return { item, reminder: null };
    },
    cancel: async (id, userId) => {
      const item = rows.find(
        (row) =>
          row.id === id && row.userId === userId && row.status === 'draft',
      );
      if (!item) return false;
      item.status = 'cancelled';
      item.awaiting = null;
      return true;
    },
    receive: async () => null,
    summary: async () => null,
    list: async () => [],
    update: async () => ({ ok: false, reason: 'not_found' }),
    reopen: async () => ({ ok: false, reason: 'not_found' }),
    snooze: async () => null,
    askSnoozeDate: async () => null,
    findSnoozeQuestion: async () => null,
    clearSnoozeQuestion: async () => false,
  };
  const users = {
    findOrCreateByTelegramId: async (id: bigint) =>
      id === 456n ? user : { ...user, id: 'another-user' },
    setTimezone: async (_id: string, zone: string) =>
      Object.assign(user, { timezone: zone }),
  };
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
  const calls = vi.fn();
  bot.api.config.use(async (_prev, method, payload) => {
    calls(method, payload);
    return {
      ok: true,
      result: {
        message_id: 900,
        date: 1800000000,
        chat: { id: 456, type: 'private' },
        text: 'Reply',
      },
    } as never;
  });
  registerStart(bot, users);
  registerCapture(
    bot,
    users,
    items,
    {
      enqueue: async () => 'job',
      question: async () => null,
      answer: async () => {},
      clearQuestion: async () => false,
    },
    () => new Date('2026-09-12T07:00Z'),
  );
  let sequence = 0;
  async function text(
    value: string,
    origin?: MessageOrigin,
    messageId?: number,
  ) {
    const updateId = ++sequence;
    await bot.handleUpdate({
      update_id: updateId,
      message: {
        message_id: messageId ?? updateId,
        date: 1800000000,
        from: { id: 456, is_bot: false, first_name: 'Test' },
        chat: { id: 456, type: 'private', first_name: 'Test' },
        text: value,
        ...(value.startsWith('/')
          ? {
              entities: [
                {
                  type: 'bot_command' as const,
                  offset: 0,
                  length: value.length,
                },
              ],
            }
          : {}),
        ...(origin ? { forward_origin: origin } : {}),
      },
    });
  }
  async function tap(
    action: string,
    sender = 456,
    id = rows[0]?.id ?? user.id,
  ) {
    await bot.handleUpdate({
      update_id: ++sequence,
      callback_query: {
        id: String(sequence),
        from: { id: sender, is_bot: false, first_name: 'Test' },
        chat_instance: 'test',
        data: `${action}:${id}`,
        message: {
          message_id: 900,
          date: 1800000000,
          chat: { id: sender, type: 'private', first_name: 'Test' },
          text: 'Card',
        },
      },
    });
  }
  const replies = () =>
    calls.mock.calls
      .filter(([method]) => method === 'sendMessage')
      .map(([, payload]) => payload.text as string);
  return {
    text,
    tap,
    rows,
    user,
    calls,
    replies,
    reminderCount: () => reminders,
  };
}
it('captures, edits and confirms once, acknowledges every tap', async () => {
  const h = harness();
  await h.text(' Waiting for Aziz to send the design ');
  expect(h.replies().at(-1)).toBe('From whom?');
  await h.text('Aziz');
  expect(h.replies().at(-1)).toBe('By when?');
  await h.text('19 sep');
  expect(h.replies().at(-1)).toBe(
    'What: Waiting for Aziz to send the design\nFrom: Aziz\nExpected: Sat 19 Sep 2026\nReminder: Sat 19 Sep, 09:00 Asia/Tashkent',
  );
  await h.tap('ed');
  await h.tap('ew');
  await h.text('Design v2');
  await h.tap('ed');
  await h.tap('ef');
  await h.text('Aziz team');
  await h.tap('ed');
  await h.tap('et');
  await h.tap('d1');
  await h.tap('ed');
  await h.tap('bk');
  await h.tap('ok');
  await h.tap('ok');
  expect(h.rows).toHaveLength(1);
  expect(h.rows[0]).toMatchObject({
    what: 'Design v2',
    fromWhom: 'Aziz team',
    status: 'open',
    awaiting: null,
  });
  expect(h.reminderCount()).toBe(1);
  expect(
    h.calls.mock.calls.filter(([method]) => method === 'answerCallbackQuery'),
  ).toHaveLength(11);
  expect(h.calls).toHaveBeenLastCalledWith(
    'answerCallbackQuery',
    expect.objectContaining({ text: 'Already saved' }),
  );
  await h.text('/cancel');
  expect(h.replies().at(-1)).toBe('There is nothing to cancel.');
});
it.each<MessageOrigin>([
  {
    type: 'user',
    date: 1,
    sender_user: { id: 1, is_bot: false, first_name: 'Aziz', last_name: 'Ali' },
  },
  { type: 'hidden_user', date: 1, sender_user_name: 'Aziz Ali' },
  {
    type: 'chat',
    date: 1,
    sender_chat: { id: -1, type: 'supergroup', title: 'Aziz Ali' },
  },
  {
    type: 'channel',
    date: 1,
    chat: { id: -1, type: 'channel', title: 'Aziz Ali' },
    message_id: 1,
  },
])('prefills forwarded origin $type', async (origin) => {
  const h = harness();
  await h.text('Design', origin);
  expect(h.rows[0]?.fromWhom).toBe('Aziz Ali');
  expect(h.replies().at(-1)).toBe('By when?');
});
it('requires timezone before the date and resumes after choosing it', async () => {
  const h = harness(null);
  await h.text('/start');
  expect(h.replies().at(-1)).toContain('or type your city or zone');
  await h.text('Design');
  await h.tap('fs');
  expect(h.rows[0]?.awaiting).toBe('expected_on');
  expect(h.replies().at(-1)).toContain('timezone');
  await h.tap('ds');
  expect(h.rows[0]?.awaiting).toBe('expected_on');
  await h.tap('z0', 456, h.user.id);
  expect(h.user.timezone).toBe('Asia/Tashkent');
  expect(h.replies()).toContain(
    'Timezone: Asia/Tashkent. Local time: Sat 12 Sep, 12:00 Asia/Tashkent.',
  );
  expect(h.replies().at(-1)).toBe('By when?');
  await h.tap('ds');
  await h.tap('ok');
  expect(h.reminderCount()).toBe(0);
});
it('accepts typed zones and supports later changes', async () => {
  const h = harness(null);
  await h.text(' new york ');
  expect(h.user.timezone).toBe('America/New_York');
  expect(h.rows).toHaveLength(0);
  await h.text('/timezone');
  await h.text('Europe/Berlin');
  expect(h.user.timezone).toBe('Europe/Berlin');
});
it('cancels drafts by command and button; rejects wrong owners', async () => {
  const h = harness();
  await h.text('Design');
  await h.tap('no', 999);
  expect(h.rows[0]?.status).toBe('draft');
  expect(h.calls).toHaveBeenLastCalledWith(
    'answerCallbackQuery',
    expect.objectContaining({ text: 'Not yours' }),
  );
  await h.tap('z1', 999, h.user.id);
  expect(h.user.timezone).toBe('Asia/Tashkent');
  await h.text('/cancel');
  expect(h.rows[0]?.status).toBe('cancelled');
  await h.text('Reply');
  await h.tap('no', 456, h.rows[1]!.id);
  await h.tap('no', 456, h.rows[1]!.id);
  expect(h.rows[1]?.status).toBe('cancelled');
  expect(h.reminderCount()).toBe(0);
});
it('keeps invalid dates pending and truncates what while preserving source', async () => {
  const h = harness();
  const text = 'x'.repeat(501);
  await h.text(text, undefined, 100);
  expect(h.rows[0]?.what).toHaveLength(500);
  expect(h.rows[0]?.sourceText).toBe(text);
  await h.text(text, undefined, 100);
  expect(h.rows).toHaveLength(1);
  expect(h.rows[0]?.awaiting).toBe('from_whom');
  await h.tap('fs');
  await h.text('nonsense');
  expect(h.replies().at(-1)).toContain('I did not get the date');
  await h.text('11.09');
  expect(h.replies().at(-1)).toContain('That date has passed');
  expect(h.rows[0]?.awaiting).toBe('expected_on');
  await h.tap('ok');
  expect(h.rows[0]?.status).toBe('draft');
  await h.tap('d0');
  await h.tap('fs');
  expect(h.rows[0]?.awaiting).toBe('confirm');
});

it('treats a city as the pending answer once timezone is known', async () => {
  const h = harness();
  await h.text('Design');
  await h.text('London');
  expect(h.rows[0]?.fromWhom).toBe('London');
  expect(h.user.timezone).toBe('Asia/Tashkent');
});

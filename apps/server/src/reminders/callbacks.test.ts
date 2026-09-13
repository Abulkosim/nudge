import { randomUUID } from 'node:crypto';
import { Bot } from 'grammy';
import { expect, it, vi } from 'vitest';
import type { Item, Reminder, User } from '../generated/prisma/client.js';
import type { ItemsService } from '../items/index.js';
import { registerCapture } from '../capture/index.js';
import { testToken, testUser } from '../test-helpers.js';
import { registerReminders } from './callbacks.js';

const now = new Date('2026-09-19T05:00:00Z');
function harness(timezone: string | null = 'Asia/Tashkent') {
  const user: User = { ...testUser, timezone };
  const rows: Item[] = [
    {
      id: 'item-1',
      userId: user.id,
      what: 'Design',
      fromWhom: 'Aziz',
      expectedOn: new Date('2026-09-19'),
      awaiting: null,
      status: 'open',
      sourceChatId: null,
      sourceMessageId: null,
      sourceText: null,
      createdAt: now,
      updatedAt: now,
      receivedAt: null,
    },
  ];
  const reminderRows: Reminder[] = [
    {
      id: 'r1',
      itemId: 'item-1',
      scheduledFor: now,
      jobId: 'job-1',
      kind: 'scheduled',
      status: 'pending',
      sentAt: null,
      createdAt: now,
    },
  ];
  const pendingOf = (itemId: string) =>
    reminderRows.filter(
      (row) => row.itemId === itemId && row.status === 'pending',
    );
  const owned = (id: string, userId: string) =>
    rows.find((row) => row.id === id && row.userId === userId) ?? null;
  const items = {
    find: async (id: string, userId: string) => owned(id, userId),
    findDraft: async () => null,
    receive: async (id: string, userId: string) => {
      const item = owned(id, userId);
      if (item?.status !== 'open') return null;
      const jobIds = pendingOf(id).map((row) => row.jobId!);
      pendingOf(id).forEach((row) => (row.status = 'cancelled'));
      Object.assign(item, {
        status: 'received',
        receivedAt: now,
        awaiting: null,
      });
      return { item, jobIds };
    },
    snooze: async (id: string, userId: string, scheduledFor: Date) => {
      const item = owned(id, userId);
      if (item?.status !== 'open') return null;
      item.awaiting = null;
      const same = pendingOf(id).find(
        (row) =>
          row.kind === 'snooze' &&
          row.scheduledFor.getTime() === scheduledFor.getTime(),
      );
      if (same) return { reminder: same, jobIds: [] };
      const jobIds = pendingOf(id).map((row) => row.jobId!);
      pendingOf(id).forEach((row) => (row.status = 'cancelled'));
      const reminder: Reminder = {
        id: randomUUID(),
        itemId: id,
        scheduledFor,
        jobId: null,
        kind: 'snooze',
        status: 'pending',
        sentAt: null,
        createdAt: now,
      };
      reminderRows.push(reminder);
      return { reminder, jobIds };
    },
    askSnoozeDate: async (id: string, userId: string) => {
      const item = owned(id, userId);
      if (item?.status !== 'open') return null;
      rows.forEach((row) => {
        if (row.awaiting === 'snooze_on') row.awaiting = null;
      });
      item.awaiting = 'snooze_on';
      return item;
    },
    findSnoozeQuestion: async (userId: string) =>
      rows.find(
        (row) =>
          row.userId === userId &&
          row.status === 'open' &&
          row.awaiting === 'snooze_on',
      ) ?? null,
    clearSnoozeQuestion: async (userId: string) => {
      const pending = rows.filter(
        (row) => row.userId === userId && row.awaiting === 'snooze_on',
      );
      pending.forEach((row) => (row.awaiting = null));
      return pending.length > 0;
    },
  } as unknown as ItemsService;
  const users = {
    findOrCreateByTelegramId: async (id: bigint) =>
      id === 456n ? user : { ...user, id: 'another-user' },
    setTimezone: async (_id: string, zone: string) =>
      Object.assign(user, { timezone: zone }),
  };
  const scheduler = {
    enqueue: vi.fn(async () => 'job-2'),
    cancelJobs: vi.fn(),
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
  registerCapture(
    bot,
    users,
    items,
    registerReminders(bot, users, items, scheduler, () => now),
    () => now,
  );
  let sequence = 0;
  async function tap(action: string, sender = 456, id = 'item-1') {
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
          text: 'Reminder',
        },
      },
    });
  }
  async function text(value: string) {
    const updateId = ++sequence;
    await bot.handleUpdate({
      update_id: updateId,
      message: {
        message_id: updateId,
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
      },
    });
  }
  const method = (name: string) =>
    calls.mock.calls
      .filter(([called]) => called === name)
      .map(([, payload]) => payload);
  return { tap, text, rows, reminderRows, scheduler, calls, method, user };
}
it('closes the item on Received and cancels its jobs', async () => {
  const h = harness();
  await h.tap('rc');
  expect(h.rows[0]).toMatchObject({ status: 'received', receivedAt: now });
  expect(h.scheduler.cancelJobs).toHaveBeenCalledWith(['job-1']);
  expect(h.method('editMessageText').at(-1)).toMatchObject({
    text: 'Received.\nWhat: Design',
    reply_markup: { inline_keyboard: [[]] },
  });
  await h.tap('rc');
  expect(h.calls).toHaveBeenLastCalledWith(
    'answerCallbackQuery',
    expect.objectContaining({ text: 'Already received' }),
  );
  expect(h.method('editMessageText')).toHaveLength(1);
});
it('offers the snooze choices, goes back, and snoozes to tomorrow morning', async () => {
  const h = harness();
  await h.tap('sn');
  expect(h.method('editMessageReplyMarkup').at(-1)).toMatchObject({
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'In 1 hour', callback_data: 's1:item-1' },
          { text: 'Tomorrow 09:00', callback_data: 's2:item-1' },
          { text: 'In 3 days', callback_data: 's3:item-1' },
          { text: 'Pick a date', callback_data: 's4:item-1' },
        ],
        [{ text: 'Back', callback_data: 'sb:item-1' }],
      ],
    },
  });
  await h.tap('sb');
  expect(h.method('editMessageReplyMarkup').at(-1)).toMatchObject({
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Received', callback_data: 'rc:item-1' },
          { text: 'Snooze', callback_data: 'sn:item-1' },
        ],
      ],
    },
  });
  await h.tap('s2');
  expect(h.method('editMessageText').at(-1)?.text).toBe(
    'Snoozed until Sun 20 Sep, 09:00 Asia/Tashkent.',
  );
  expect(h.scheduler.cancelJobs).toHaveBeenCalledWith(['job-1']);
  expect(h.scheduler.enqueue).toHaveBeenCalledTimes(1);
  expect(h.reminderRows.filter((row) => row.status === 'pending')).toHaveLength(
    1,
  );
});
it.each([
  ['s1', 'Sat 19 Sep, 11:00 Asia/Tashkent'],
  ['s3', 'Tue 22 Sep, 09:00 Asia/Tashkent'],
])('snoozes with %s', async (action, expected) => {
  const h = harness();
  await h.tap(action);
  expect(h.method('editMessageText').at(-1)?.text).toBe(
    `Snoozed until ${expected}.`,
  );
});
it('repeats the same snooze without adding a second reminder', async () => {
  const h = harness();
  await h.tap('s2');
  await h.tap('s2');
  expect(h.reminderRows.filter((row) => row.status === 'pending')).toHaveLength(
    1,
  );
  expect(h.method('editMessageText')).toHaveLength(2);
});
it('asks for a date and snoozes to 09:00 on the typed answer', async () => {
  const h = harness();
  await h.tap('s4');
  expect(h.rows[0]?.awaiting).toBe('snooze_on');
  expect(h.method('sendMessage').at(-1)).toMatchObject({
    text: 'Until when?',
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Today', callback_data: 'sd0:item-1' },
          { text: 'Tomorrow', callback_data: 'sd1:item-1' },
          { text: 'In 3 days', callback_data: 'sd2:item-1' },
          { text: 'Next week', callback_data: 'sd3:item-1' },
        ],
      ],
    },
  });
  await h.text('nonsense');
  expect(h.method('sendMessage').at(-1)?.text).toContain(
    'I did not get the date',
  );
  await h.text('11.09');
  expect(h.method('sendMessage').at(-1)?.text).toContain(
    'That date has passed',
  );
  expect(h.rows[0]?.awaiting).toBe('snooze_on');
  await h.text('21.09');
  expect(h.method('sendMessage').at(-1)?.text).toBe(
    'Snoozed until Mon 21 Sep, 09:00 Asia/Tashkent.',
  );
  expect(h.rows[0]?.awaiting).toBeNull();
  expect(h.scheduler.enqueue).toHaveBeenCalledTimes(1);
});
it('takes the date from a button and forgets the question on /cancel', async () => {
  const h = harness();
  await h.tap('s4');
  await h.tap('sd1');
  expect(h.method('editMessageText').at(-1)?.text).toBe(
    'Snoozed until Sun 20 Sep, 09:00 Asia/Tashkent.',
  );
  await h.tap('s4');
  await h.text('/cancel');
  expect(h.rows[0]?.awaiting).toBeNull();
  expect(h.method('sendMessage').at(-1)?.text).toBe('Cancelled.');
  await h.text('/cancel');
  expect(h.method('sendMessage').at(-1)?.text).toBe(
    'There is nothing to cancel.',
  );
});
it('refuses another user and asks for a timezone first', async () => {
  const h = harness();
  await h.tap('rc', 999);
  expect(h.rows[0]?.status).toBe('open');
  expect(h.calls).toHaveBeenLastCalledWith(
    'answerCallbackQuery',
    expect.objectContaining({ text: 'Not yours' }),
  );
  const zoneless = harness(null);
  await zoneless.tap('sn');
  expect(zoneless.method('sendMessage').at(-1)?.text).toContain(
    'Choose your timezone',
  );
  expect(zoneless.method('editMessageReplyMarkup')).toHaveLength(0);
});

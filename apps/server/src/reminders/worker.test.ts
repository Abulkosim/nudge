import { GrammyError } from 'grammy';
import { expect, it, vi } from 'vitest';
import type {
  Item,
  Reminder,
  ReminderKind,
  User,
} from '../generated/prisma/client.js';
import { testUser } from '../test-helpers.js';
import type { RemindersService } from './index.js';
import { handleReminderJob, type ReminderJob } from './worker.js';

const now = new Date('2026-09-19T04:00:00Z');
const user: User = { ...testUser, timezone: 'Asia/Tashkent' };
const item: Item & { user: User } = {
  id: 'item-1',
  userId: user.id,
  what: 'Design  v2',
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
  user,
};
const job: ReminderJob = {
  id: 'job-1',
  data: { reminderId: 'r1' },
  retryCount: 0,
  retryLimit: 5,
};
function harness(
  overrides: {
    reminder?: Partial<Reminder>;
    item?: Partial<Item>;
    send?: () => Promise<unknown>;
  } = {},
) {
  const reminder: Reminder & { item: Item & { user: User } } = {
    id: 'r1',
    itemId: item.id,
    scheduledFor: now,
    jobId: 'job-1',
    kind: 'scheduled' as ReminderKind,
    status: 'pending',
    sentAt: null,
    createdAt: now,
    ...overrides.reminder,
    item: { ...item, ...overrides.item },
  };
  const calls = {
    sent: vi.fn(),
    cancelled: vi.fn(),
    failed: vi.fn(),
    repeat: vi.fn(),
    enqueue: vi.fn(),
  };
  const reminders = {
    load: async (id: string) => (id === reminder.id ? reminder : null),
    markSent: calls.sent,
    markCancelled: calls.cancelled,
    markFailed: calls.failed,
    createRepeat: async (itemId: string, scheduledFor: Date) => {
      calls.repeat(itemId, scheduledFor);
      return { ...reminder, id: 'r2', kind: 'repeat' as const, scheduledFor };
    },
  } as unknown as RemindersService;
  const sender = {
    sendMessage: vi.fn<
      (
        chatId: number | string,
        text: string,
        other?: unknown,
      ) => Promise<unknown>
    >(overrides.send ?? (async () => ({}))),
  };
  const logger = { error: vi.fn() };
  return {
    calls,
    sender,
    logger,
    handle: handleReminderJob({
      reminders,
      scheduler: { enqueue: calls.enqueue },
      sender,
      logger,
      now: () => now,
    }),
  };
}
it('sends the reminder, marks it sent and books one repeat for the next morning', async () => {
  const h = harness();
  await h.handle(job);
  expect(h.sender.sendMessage).toHaveBeenCalledWith(
    String(user.telegramId),
    'Reminder\nWhat: Design v2\nFrom: Aziz\nExpected: Sat 19 Sep 2026',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Received', callback_data: 'rc:item-1' },
            { text: 'Snooze', callback_data: 'sn:item-1' },
          ],
        ],
      },
    },
  );
  expect(h.calls.sent).toHaveBeenCalledWith('r1', now);
  expect(h.calls.repeat).toHaveBeenCalledWith(
    'item-1',
    new Date('2026-09-20T04:00:00.000Z'),
  );
  expect(h.calls.enqueue).toHaveBeenCalledTimes(1);
});
it('opens a repeat with its own heading and never books another', async () => {
  const h = harness({ reminder: { kind: 'repeat' } });
  await h.handle(job);
  expect(h.sender.sendMessage.mock.calls[0]?.[1]).toContain('Still waiting?');
  expect(h.calls.repeat).not.toHaveBeenCalled();
  expect(h.calls.enqueue).not.toHaveBeenCalled();
});
it('shows what is missing when the item has no sender or date', async () => {
  const h = harness({ item: { fromWhom: null, expectedOn: null } });
  await h.handle(job);
  expect(h.sender.sendMessage.mock.calls[0]?.[1]).toBe(
    'Reminder\nWhat: Design v2\nFrom: not set\nExpected: not set',
  );
});
it.each(['sent', 'cancelled', 'failed'] as const)(
  'does nothing for a %s reminder',
  async (status) => {
    const h = harness({ reminder: { status } });
    await h.handle(job);
    expect(h.sender.sendMessage).not.toHaveBeenCalled();
    expect(h.calls.sent).not.toHaveBeenCalled();
  },
);
it('ignores a job whose reminder is gone', async () => {
  const h = harness();
  await h.handle({ ...job, data: { reminderId: 'missing' } });
  await h.handle({ ...job, data: {} });
  expect(h.sender.sendMessage).not.toHaveBeenCalled();
});
it('cancels the reminder instead of sending once the item is received', async () => {
  const h = harness({ item: { status: 'received' } });
  await h.handle(job);
  expect(h.calls.cancelled).toHaveBeenCalledWith('r1');
  expect(h.sender.sendMessage).not.toHaveBeenCalled();
});
it.each([
  [403, 'Forbidden: bot was blocked by the user'],
  [400, 'Bad Request: chat not found'],
])('marks the reminder failed without retrying on %i', async (code, text) => {
  const h = harness({
    send: () => {
      throw new GrammyError(
        text,
        { ok: false, error_code: code, description: text },
        'sendMessage',
        {},
      );
    },
  });
  await expect(h.handle(job)).resolves.toBeUndefined();
  expect(h.calls.failed).toHaveBeenCalledWith('r1');
  expect(h.calls.sent).not.toHaveBeenCalled();
  expect(h.logger.error.mock.calls[0]?.[0]).toMatchObject({
    reminderId: 'r1',
    itemId: 'item-1',
    jobId: 'job-1',
    telegramCode: code,
  });
});
it('rethrows a transient failure and gives up only on the last retry', async () => {
  const h = harness({
    send: () => {
      throw new Error('socket hang up');
    },
  });
  await expect(h.handle(job)).rejects.toThrow('socket hang up');
  expect(h.calls.failed).not.toHaveBeenCalled();
  await expect(h.handle({ ...job, retryCount: 5 })).rejects.toThrow(
    'socket hang up',
  );
  expect(h.calls.failed).toHaveBeenCalledWith('r1');
});

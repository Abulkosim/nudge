import { GrammyError } from 'grammy';
import type { PgBoss } from 'pg-boss';
import type { Item, Reminder, User } from '../generated/prisma/client.js';
import { reminderCard, copy } from '../capture/copy.js';
import { nextMorning } from '../time/timezone.js';
import type { RemindersService } from './index.js';
import { reminderQueue, type Scheduler } from './scheduler.js';

const day = 24 * 60 * 60;
export interface ReminderJob {
  id: string;
  data: unknown;
  retryCount: number;
  retryLimit: number;
}
// Payloads come back from the database, so the id is checked rather than asserted.
function reminderIdOf(data: unknown) {
  if (typeof data !== 'object' || data === null || !('reminderId' in data))
    return undefined;
  return typeof data.reminderId === 'string' ? data.reminderId : undefined;
}
export interface ReminderSender {
  sendMessage(
    chatId: number | string,
    text: string,
    other?: { reply_markup?: unknown },
  ): Promise<unknown>;
}
export interface WorkerLogger {
  error(fields: Record<string, unknown>, message: string): void;
}
export interface WorkerDeps {
  reminders: RemindersService;
  scheduler: Pick<Scheduler, 'enqueue'>;
  sender: ReminderSender;
  logger: WorkerLogger;
  now?: () => Date;
}
// Telegram refuses these for good: retrying only burns jobs.
function isPermanent(error: unknown) {
  return (
    error instanceof GrammyError &&
    (error.error_code === 403 ||
      (error.error_code === 400 &&
        error.description.toLowerCase().includes('chat not found')))
  );
}
const buttons = (item: Item) => ({
  inline_keyboard: [
    [
      { text: copy.received, callback_data: `rc:${item.id}` },
      { text: copy.snooze, callback_data: `sn:${item.id}` },
    ],
  ],
});
export function handleReminderJob(deps: WorkerDeps) {
  const now = deps.now ?? (() => new Date());
  return async function handle(job: ReminderJob) {
    const reminderId = reminderIdOf(job.data);
    if (!reminderId) return;
    let itemId: string | undefined;
    try {
      const reminder = await deps.reminders.load(reminderId);
      if (!reminder || reminder.status !== 'pending') return;
      itemId = reminder.itemId;
      const item: Item & { user: User } = reminder.item;
      if (item.status !== 'open') {
        await deps.reminders.markCancelled(reminderId);
        return;
      }
      await deps.sender.sendMessage(
        String(item.user.telegramId),
        reminderCard(item, reminder.kind),
        { reply_markup: buttons(item) },
      );
      await deps.reminders.markSent(reminderId, now());
      if (reminder.kind !== 'repeat' && item.user.timezone)
        await scheduleRepeat(deps, reminder, item.user.timezone, now());
    } catch (error) {
      const permanent = isPermanent(error);
      if (permanent || job.retryCount >= job.retryLimit)
        await deps.reminders.markFailed(reminderId);
      deps.logger.error(
        {
          reminderId,
          itemId,
          jobId: job.id,
          errorType: error instanceof Error ? error.name : 'UnknownError',
          telegramCode:
            error instanceof GrammyError ? error.error_code : undefined,
        },
        'Reminder delivery failed',
      );
      if (!permanent) throw error;
    }
  };
}
async function scheduleRepeat(
  deps: WorkerDeps,
  reminder: Reminder,
  zone: string,
  now: Date,
) {
  const repeat = await deps.reminders.createRepeat(
    reminder.itemId,
    nextMorning(now, zone, 1),
  );
  await deps.scheduler.enqueue(repeat);
}
export async function startReminderWorker(
  boss: Pick<PgBoss, 'createQueue' | 'work'>,
  deps: WorkerDeps,
) {
  await boss.createQueue(reminderQueue, {
    policy: 'standard',
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 60,
    deleteAfterSeconds: 7 * day,
  });
  const handle = handleReminderJob(deps);
  return boss.work(
    reminderQueue,
    { batchSize: 1, pollingIntervalSeconds: 5, includeMetadata: true },
    async (jobs) => {
      for (const job of jobs) await handle(job);
    },
  );
}

import type { Reminder } from '../generated/prisma/client.js';
import type { RemindersService } from './index.js';

export const reminderQueue = 'reminder.send';
export interface ReminderPayload {
  reminderId: string;
}
export interface JobQueue {
  send(
    name: string,
    data: ReminderPayload,
    options: { startAfter: Date; singletonKey: string },
  ): Promise<string | null>;
  cancel(name: string, id: string | string[]): Promise<unknown>;
}
export function createScheduler(boss: JobQueue, reminders: RemindersService) {
  async function enqueue(reminder: Reminder) {
    // The reminder id as singleton key is what stops a replayed enqueue from queueing twice.
    const jobId = await boss.send(
      reminderQueue,
      { reminderId: reminder.id },
      { startAfter: reminder.scheduledFor, singletonKey: reminder.id },
    );
    if (jobId === null)
      return (await reminders.find(reminder.id))?.jobId ?? null;
    return reminders.setJobId(reminder.id, jobId);
  }
  return {
    enqueue,
    async cancelJobs(jobIds: string[]) {
      if (jobIds.length) await boss.cancel(reminderQueue, jobIds);
    },
    async scheduleMissing() {
      const missing = await reminders.pendingWithoutJob();
      for (const reminder of missing) await enqueue(reminder);
      return missing.length;
    },
  };
}
export type Scheduler = ReturnType<typeof createScheduler>;

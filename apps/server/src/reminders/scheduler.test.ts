import { expect, it, vi } from 'vitest';
import type { Reminder } from '../generated/prisma/client.js';
import type { RemindersService } from './index.js';
import { createScheduler, reminderQueue } from './scheduler.js';

function reminder(id: string, jobId: string | null = null): Reminder {
  return {
    id,
    itemId: 'item',
    scheduledFor: new Date('2026-09-19T04:00Z'),
    jobId,
    kind: 'scheduled',
    status: 'pending',
    sentAt: null,
    createdAt: new Date('2026-09-12T00:00Z'),
  };
}
function harness(rows: Reminder[], sent: (string | null)[]) {
  const queued = [...sent];
  const boss = {
    send: vi.fn(async () => queued.shift() ?? null),
    cancel: vi.fn(async () => undefined),
  };
  const reminders = {
    find: async (id: string) => rows.find((row) => row.id === id) ?? null,
    pendingWithoutJob: async () =>
      rows.filter((row) => row.status === 'pending' && row.jobId === null),
    setJobId: async (id: string, jobId: string) => {
      const row = rows.find((item) => item.id === id);
      if (row && row.jobId === null) row.jobId = jobId;
      return row?.jobId ?? null;
    },
  } as unknown as RemindersService;
  return { boss, scheduler: createScheduler(boss, reminders) };
}
it('stores the job id it gets back from the queue', async () => {
  const rows = [reminder('r1')];
  const { boss, scheduler } = harness(rows, ['job-1']);
  expect(await scheduler.enqueue(rows[0]!)).toBe('job-1');
  expect(rows[0]!.jobId).toBe('job-1');
  expect(boss.send).toHaveBeenCalledWith(
    reminderQueue,
    { reminderId: 'r1' },
    { startAfter: rows[0]!.scheduledFor, singletonKey: 'r1' },
  );
});
it('keeps the job the row already has when the singleton blocks the insert', async () => {
  const rows = [reminder('r1', 'job-1')];
  const { scheduler } = harness(rows, [null]);
  expect(await scheduler.enqueue(rows[0]!)).toBe('job-1');
  expect(rows[0]!.jobId).toBe('job-1');
});
it('queues only the pending rows that have no job', async () => {
  const rows = [
    reminder('r1'),
    reminder('r2', 'job-2'),
    { ...reminder('r3'), status: 'sent' as const },
  ];
  const { boss, scheduler } = harness(rows, ['job-1']);
  expect(await scheduler.scheduleMissing()).toBe(1);
  expect(boss.send).toHaveBeenCalledTimes(1);
  expect(boss.send).toHaveBeenCalledWith(
    reminderQueue,
    { reminderId: 'r1' },
    expect.objectContaining({ singletonKey: 'r1' }),
  );
});
it('cancels the given jobs and nothing when the list is empty', async () => {
  const { boss, scheduler } = harness([], []);
  await scheduler.cancelJobs([]);
  expect(boss.cancel).not.toHaveBeenCalled();
  await scheduler.cancelJobs(['job-1', 'job-2']);
  expect(boss.cancel).toHaveBeenCalledWith(reminderQueue, ['job-1', 'job-2']);
});

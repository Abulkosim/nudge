import { randomInt } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma/client.js';
import { createItemsService } from '../items/index.js';
import { createRemindersService } from './index.js';

const at = (iso: string) => new Date(iso);
it.skipIf(!process.env.DATABASE_URL)(
  'closes items, replaces reminders on snooze and finds the ones missing a job',
  async () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    const user = await prisma.user.create({
      data: {
        telegramId: -BigInt(randomInt(1, 2 ** 48 - 1)),
        timezone: 'Asia/Tashkent',
      },
    });
    const items = createItemsService(prisma);
    const reminders = createRemindersService(prisma);
    const open = async (what: string) => {
      const item = await prisma.item.create({
        data: {
          userId: user.id,
          what,
          expectedOn: at('2026-09-19'),
          status: 'open',
        },
      });
      await prisma.reminder.create({
        data: {
          itemId: item.id,
          scheduledFor: at('2026-09-19T04:00Z'),
          jobId: `job-${item.id}`,
          kind: 'scheduled',
        },
      });
      return item;
    };
    try {
      const first = await open('Design');
      const received = await items.receive(first.id, user.id);
      expect(received?.item.status).toBe('received');
      expect(received?.item.receivedAt).toBeInstanceOf(Date);
      expect(received?.jobIds).toEqual([`job-${first.id}`]);
      expect(
        await prisma.reminder.count({
          where: { itemId: first.id, status: 'cancelled' },
        }),
      ).toBe(1);
      expect(await items.receive(first.id, user.id)).toBeNull();
      expect(await items.receive(first.id, 'wrong-user')).toBeNull();

      const second = await open('Invoice');
      expect(
        await items.snooze(second.id, 'wrong-user', at('2026-09-20T04:00Z')),
      ).toBeNull();
      const snoozed = await items.snooze(
        second.id,
        user.id,
        at('2026-09-20T04:00Z'),
      );
      expect(snoozed?.jobIds).toEqual([`job-${second.id}`]);
      expect(snoozed?.reminder).toMatchObject({
        kind: 'snooze',
        status: 'pending',
        jobId: null,
      });
      const again = await items.snooze(
        second.id,
        user.id,
        at('2026-09-20T04:00Z'),
      );
      expect(again?.reminder.id).toBe(snoozed?.reminder.id);
      expect(again?.jobIds).toEqual([]);
      expect(
        await prisma.reminder.count({
          where: { itemId: second.id, status: 'pending' },
        }),
      ).toBe(1);

      expect((await items.askSnoozeDate(second.id, user.id))?.awaiting).toBe(
        'snooze_on',
      );
      const third = await open('Approval');
      await items.askSnoozeDate(third.id, user.id);
      expect((await items.findSnoozeQuestion(user.id))?.id).toBe(third.id);
      expect((await items.find(second.id, user.id))?.awaiting).toBeNull();
      expect(await items.clearSnoozeQuestion(user.id)).toBe(true);
      expect(await items.clearSnoozeQuestion(user.id)).toBe(false);
      expect(await items.findSnoozeQuestion(user.id)).toBeNull();
      expect(await items.askSnoozeDate(first.id, user.id)).toBeNull();

      const thirdReminder = await prisma.reminder.findFirstOrThrow({
        where: { itemId: third.id },
      });
      const missing = await reminders.pendingWithoutJob();
      expect(missing.map((row) => row.id)).toContain(snoozed!.reminder.id);
      expect(missing.map((row) => row.id)).not.toContain(thirdReminder.id);
      expect(
        missing.every((row) => row.jobId === null && row.status === 'pending'),
      ).toBe(true);
      expect(await reminders.setJobId(snoozed!.reminder.id, 'job-x')).toBe(
        'job-x',
      );
      expect(await reminders.setJobId(snoozed!.reminder.id, 'job-y')).toBe(
        'job-x',
      );
      const sentAt = at('2026-09-20T04:00Z');
      await reminders.markSent(snoozed!.reminder.id, sentAt);
      expect(await reminders.find(snoozed!.reminder.id)).toMatchObject({
        status: 'sent',
        sentAt,
      });
      await reminders.markFailed(snoozed!.reminder.id);
      expect((await reminders.find(snoozed!.reminder.id))?.status).toBe('sent');
      const repeat = await reminders.createRepeat(
        third.id,
        at('2026-09-21T04:00Z'),
      );
      expect(repeat).toMatchObject({ kind: 'repeat', status: 'pending' });
      expect((await reminders.load(repeat.id))?.item.user.id).toBe(user.id);
    } finally {
      await prisma.reminder.deleteMany({
        where: { item: { userId: user.id } },
      });
      await prisma.item.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.$disconnect();
    }
  },
);

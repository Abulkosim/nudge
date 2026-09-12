import { randomInt } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma/client.js';
import { createItemsService } from './index.js';
it.skipIf(!process.env.DATABASE_URL)(
  'persists drafts, enforces one draft, confirms atomically and guards ownership',
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
    const input = {
      what: 'Design',
      fromWhom: null,
      sourceText: 'Design',
      sourceChatId: 1n,
      sourceMessageId: 1n,
    };
    try {
      const service = createItemsService(prisma);
      const draft = await service.createDraft(user.id, input);
      await prisma.$disconnect();
      await prisma.$connect();
      expect(
        (await createItemsService(prisma).findDraft(user.id))?.awaiting,
      ).toBe('from_whom');
      await expect(
        prisma.item.create({ data: { userId: user.id, what: 'Duplicate' } }),
      ).rejects.toMatchObject({ code: 'P2002' });
      expect((await service.createDraft(user.id, input)).id).toBe(draft.id);
      expect(await service.find(draft.id, 'wrong-user')).toBeNull();
      expect(await service.cancel(draft.id, 'wrong-user')).toBe(false);
      expect(
        await service.updateDraft(draft.id, user.id, 'expected_on', {
          what: 'Stale',
        }),
      ).toBeNull();
      await service.updateDraft(draft.id, user.id, 'from_whom', {
        expectedOn: new Date('2026-09-19'),
        awaiting: 'confirm',
      });
      const confirmed = await Promise.all([
        service.confirm(draft.id, user.id),
        service.confirm(draft.id, user.id),
      ]);
      expect(confirmed.filter(Boolean)).toHaveLength(1);
      expect(confirmed.find(Boolean)?.item).toMatchObject({
        status: 'open',
        awaiting: null,
      });
      const reminders = await prisma.reminder.findMany({
        where: { itemId: draft.id },
      });
      expect(reminders).toHaveLength(1);
      expect(reminders[0]).toMatchObject({
        status: 'pending',
        jobId: null,
        scheduledFor: new Date('2026-09-19T04:00Z'),
      });
      expect((await service.createDraft(user.id, input)).id).toBe(draft.id);
      const skipped = await service.createDraft(user.id, {
        ...input,
        sourceMessageId: 2n,
      });
      await service.updateDraft(skipped.id, user.id, 'from_whom', {
        awaiting: 'confirm',
      });
      expect((await service.confirm(skipped.id, user.id))?.reminder).toBeNull();
      const cancelled = await service.createDraft(user.id, {
        ...input,
        sourceMessageId: 3n,
      });
      expect(await service.cancel(cancelled.id, user.id)).toBe(true);
      expect(await service.cancel(cancelled.id, user.id)).toBe(false);
      expect(await service.confirm(cancelled.id, user.id)).toBeNull();
      const noZone = await service.createDraft(user.id, {
        ...input,
        sourceMessageId: 4n,
      });
      await service.updateDraft(noZone.id, user.id, 'from_whom', {
        awaiting: 'confirm',
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { timezone: null },
      });
      expect(await service.confirm(noZone.id, user.id)).toBeNull();
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

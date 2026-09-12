import type {
  Awaiting,
  Item,
  PrismaClient,
  Reminder,
} from '../generated/prisma/client.js';
import { reminderInstant } from '../time/timezone.js';

type DraftInput = Pick<
  Item,
  'what' | 'fromWhom' | 'sourceText' | 'sourceChatId' | 'sourceMessageId'
>;
type DraftChanges = Partial<
  Pick<Item, 'what' | 'fromWhom' | 'expectedOn' | 'awaiting'>
>;
const jobIdsOf = (reminders: Pick<Reminder, 'jobId'>[]) =>
  reminders
    .map((reminder) => reminder.jobId)
    .filter((jobId): jobId is string => jobId !== null);
export function createItemsService(
  prisma: PrismaClient,
  now = () => new Date(),
) {
  return {
    async findDraft(userId: string): Promise<Item | null> {
      return prisma.item.findFirst({ where: { userId, status: 'draft' } });
    },
    async find(itemId: string, userId: string): Promise<Item | null> {
      return prisma.item.findFirst({ where: { id: itemId, userId } });
    },
    async createDraft(userId: string, data: DraftInput) {
      // Serialize capture per user, including replay after confirmation or cancellation.
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        const existing = await tx.item.findFirst({
          where: {
            userId,
            OR: [
              { status: 'draft' },
              {
                sourceChatId: data.sourceChatId,
                sourceMessageId: data.sourceMessageId,
              },
            ],
          },
        });
        return (
          existing ??
          tx.item.create({
            data: {
              ...data,
              userId,
              awaiting: data.fromWhom ? 'expected_on' : 'from_whom',
            },
          })
        );
      });
    },
    async updateDraft(
      itemId: string,
      userId: string,
      step: Awaiting,
      data: DraftChanges,
    ) {
      const changed = await prisma.item.updateMany({
        where: { id: itemId, userId, status: 'draft', awaiting: step },
        data,
      });
      return changed.count
        ? prisma.item.findUnique({ where: { id: itemId } })
        : null;
    },
    async confirm(itemId: string, userId: string) {
      return prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user?.timezone) return null;
        const changed = await tx.item.updateMany({
          where: { id: itemId, userId, status: 'draft', awaiting: 'confirm' },
          data: { status: 'open', awaiting: null },
        });
        if (!changed.count) return null;
        const item = await tx.item.findUniqueOrThrow({ where: { id: itemId } });
        const reminder = item.expectedOn
          ? await tx.reminder.create({
              data: {
                itemId,
                scheduledFor: reminderInstant(
                  item.expectedOn,
                  user.timezone,
                  now(),
                ),
                kind: 'scheduled',
                status: 'pending',
                jobId: null,
              },
            })
          : null;
        return { item, reminder };
      });
    },
    async cancel(itemId: string, userId: string) {
      const result = await prisma.item.updateMany({
        where: { id: itemId, userId, status: 'draft' },
        data: { status: 'cancelled', awaiting: null },
      });
      return result.count > 0;
    },
    async receive(itemId: string, userId: string) {
      return prisma.$transaction(async (tx) => {
        const closed = await tx.item.updateMany({
          where: { id: itemId, userId, status: 'open' },
          data: { status: 'received', receivedAt: now(), awaiting: null },
        });
        if (!closed.count) return null;
        const pending = await tx.reminder.findMany({
          where: { itemId, status: 'pending' },
        });
        await tx.reminder.updateMany({
          where: { itemId, status: 'pending' },
          data: { status: 'cancelled' },
        });
        const item = await tx.item.findUniqueOrThrow({ where: { id: itemId } });
        return { item, jobIds: jobIdsOf(pending) };
      });
    },
    async snooze(itemId: string, userId: string, scheduledFor: Date) {
      // Lock the item so a double tap cannot replace the same reminder twice.
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Item" WHERE "id" = ${itemId} FOR UPDATE`;
        const item = await tx.item.findFirst({
          where: { id: itemId, userId, status: 'open' },
        });
        if (!item) return null;
        await tx.item.updateMany({
          where: { id: itemId, userId, awaiting: 'snooze_on' },
          data: { awaiting: null },
        });
        const pending = await tx.reminder.findMany({
          where: { itemId, status: 'pending' },
        });
        const same = pending.find(
          (reminder) =>
            reminder.kind === 'snooze' &&
            reminder.scheduledFor.getTime() === scheduledFor.getTime(),
        );
        if (same) return { reminder: same, jobIds: [] };
        await tx.reminder.updateMany({
          where: { itemId, status: 'pending' },
          data: { status: 'cancelled' },
        });
        const reminder = await tx.reminder.create({
          data: {
            itemId,
            scheduledFor,
            kind: 'snooze',
            status: 'pending',
            jobId: null,
          },
        });
        return { reminder, jobIds: jobIdsOf(pending) };
      });
    },
    async askSnoozeDate(itemId: string, userId: string): Promise<Item | null> {
      return prisma.$transaction(async (tx) => {
        const asked = await tx.item.updateMany({
          where: { id: itemId, userId, status: 'open' },
          data: { awaiting: 'snooze_on' },
        });
        if (!asked.count) return null;
        await tx.item.updateMany({
          where: { userId, awaiting: 'snooze_on', id: { not: itemId } },
          data: { awaiting: null },
        });
        return tx.item.findUniqueOrThrow({ where: { id: itemId } });
      });
    },
    async findSnoozeQuestion(userId: string): Promise<Item | null> {
      return prisma.item.findFirst({
        where: { userId, status: 'open', awaiting: 'snooze_on' },
      });
    },
    async clearSnoozeQuestion(userId: string) {
      const cleared = await prisma.item.updateMany({
        where: { userId, awaiting: 'snooze_on' },
        data: { awaiting: null },
      });
      return cleared.count > 0;
    },
  };
}
export type ItemsService = ReturnType<typeof createItemsService>;

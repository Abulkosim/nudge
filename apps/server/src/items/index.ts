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
// A key that is absent means "leave it alone", a null value means "clear it".
export interface ItemChanges {
  what?: string | undefined;
  fromWhom?: string | null | undefined;
  expectedOn?: Date | null | undefined;
  remindAt?: Date | null | undefined;
}
export type ItemWithReminder = Item & { reminders: Reminder[] };
export type EditOutcome =
  | {
      ok: true;
      item: ItemWithReminder;
      reminder: Reminder | null;
      jobIds: string[];
    }
  | { ok: false; reason: 'not_found' | 'not_open' | 'no_timezone' | 'past' };
const jobIdsOf = (reminders: Pick<Reminder, 'jobId'>[]) =>
  reminders
    .map((reminder) => reminder.jobId)
    .filter((jobId): jobId is string => jobId !== null);
// The single pending reminder the Mini App shows, earliest first if a row ever slipped past.
const withReminder = {
  reminders: {
    where: { status: 'pending' } as const,
    orderBy: { scheduledFor: 'asc' } as const,
    take: 1,
  },
};
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
    async summary(
      itemId: string,
      userId: string,
    ): Promise<ItemWithReminder | null> {
      return prisma.item.findFirst({
        where: { id: itemId, userId },
        include: withReminder,
      });
    },
    async list(
      userId: string,
      status: 'open' | 'received',
    ): Promise<ItemWithReminder[]> {
      return prisma.item.findMany({
        where: { userId, status },
        include: withReminder,
        orderBy:
          status === 'open'
            ? [
                { expectedOn: { sort: 'asc', nulls: 'last' } },
                { createdAt: 'asc' },
              ]
            : [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
      });
    },
    // One transaction per edit: the row, its pending reminders and the replacement.
    async update(
      itemId: string,
      userId: string,
      changes: ItemChanges,
    ): Promise<EditOutcome> {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Item" WHERE "id" = ${itemId} FOR UPDATE`;
        const item = await tx.item.findFirst({ where: { id: itemId, userId } });
        if (!item) return { ok: false, reason: 'not_found' };
        if (item.status !== 'open') return { ok: false, reason: 'not_open' };
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        let next: Date | null | undefined;
        if (changes.remindAt !== undefined) {
          if (changes.remindAt && changes.remindAt.getTime() <= now().getTime())
            return { ok: false, reason: 'past' };
          next = changes.remindAt;
        } else if (changes.expectedOn !== undefined) {
          if (changes.expectedOn === null) next = null;
          else if (
            item.expectedOn?.getTime() !== changes.expectedOn.getTime()
          ) {
            if (!user.timezone) return { ok: false, reason: 'no_timezone' };
            next = reminderInstant(changes.expectedOn, user.timezone, now());
          }
        }
        await tx.item.update({
          where: { id: itemId },
          data: {
            ...(changes.what === undefined ? {} : { what: changes.what }),
            ...(changes.fromWhom === undefined
              ? {}
              : { fromWhom: changes.fromWhom }),
            ...(changes.expectedOn === undefined
              ? {}
              : { expectedOn: changes.expectedOn }),
          },
        });
        let reminder: Reminder | null = null;
        let jobIds: string[] = [];
        if (next !== undefined) {
          const pending = await tx.reminder.findMany({
            where: { itemId, status: 'pending' },
          });
          // A resent save with the same instant keeps the reminder it already has.
          const same = pending.find(
            (row) =>
              row.kind === 'scheduled' &&
              row.scheduledFor.getTime() === next?.getTime(),
          );
          if (same) reminder = same;
          else {
            await tx.reminder.updateMany({
              where: { itemId, status: 'pending' },
              data: { status: 'cancelled' },
            });
            jobIds = jobIdsOf(pending);
            if (next)
              reminder = await tx.reminder.create({
                data: {
                  itemId,
                  scheduledFor: next,
                  kind: 'scheduled',
                  status: 'pending',
                  jobId: null,
                },
              });
          }
        }
        return {
          ok: true,
          reminder,
          jobIds,
          item: await tx.item.findUniqueOrThrow({
            where: { id: itemId },
            include: withReminder,
          }),
        };
      });
    },
    async reopen(itemId: string, userId: string): Promise<EditOutcome> {
      return prisma.$transaction(async (tx) => {
        const item = await tx.item.findFirst({ where: { id: itemId, userId } });
        if (!item) return { ok: false, reason: 'not_found' };
        if (item.status !== 'open' && item.status !== 'received')
          return { ok: false, reason: 'not_open' };
        await tx.item.updateMany({
          where: { id: itemId, userId, status: 'received' },
          data: { status: 'open', receivedAt: null },
        });
        return {
          ok: true,
          reminder: null,
          jobIds: [],
          item: await tx.item.findUniqueOrThrow({
            where: { id: itemId },
            include: withReminder,
          }),
        };
      });
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
        const item = await tx.item.findUniqueOrThrow({
          where: { id: itemId },
          include: withReminder,
        });
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

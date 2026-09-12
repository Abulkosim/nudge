import type {
  DraftStep,
  Item,
  PrismaClient,
} from '../generated/prisma/client.js';
import { reminderInstant } from '../time/timezone.js';

type DraftInput = Pick<
  Item,
  'what' | 'fromWhom' | 'sourceText' | 'sourceChatId' | 'sourceMessageId'
>;
type DraftChanges = Partial<
  Pick<Item, 'what' | 'fromWhom' | 'expectedOn' | 'draftStep'>
>;
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
              draftStep: data.fromWhom ? 'expected_on' : 'from_whom',
            },
          })
        );
      });
    },
    async updateDraft(
      itemId: string,
      userId: string,
      step: DraftStep,
      data: DraftChanges,
    ) {
      const changed = await prisma.item.updateMany({
        where: { id: itemId, userId, status: 'draft', draftStep: step },
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
          where: { id: itemId, userId, status: 'draft', draftStep: 'confirm' },
          data: { status: 'open', draftStep: null },
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
        data: { status: 'cancelled', draftStep: null },
      });
      return result.count > 0;
    },
  };
}
export type ItemsService = ReturnType<typeof createItemsService>;

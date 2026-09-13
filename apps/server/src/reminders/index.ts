import type { PrismaClient, Reminder } from '../generated/prisma/client.js';

export function createRemindersService(prisma: PrismaClient) {
  return {
    async find(reminderId: string): Promise<Reminder | null> {
      return prisma.reminder.findUnique({ where: { id: reminderId } });
    },
    async load(reminderId: string) {
      return prisma.reminder.findUnique({
        where: { id: reminderId },
        include: { item: { include: { user: true } } },
      });
    },
    async pendingWithoutJob(): Promise<Reminder[]> {
      return prisma.reminder.findMany({
        where: { status: 'pending', jobId: null },
      });
    },
    async setJobId(reminderId: string, jobId: string) {
      const stored = await prisma.reminder.updateMany({
        where: { id: reminderId, jobId: null },
        data: { jobId },
      });
      if (stored.count) return jobId;
      const row = await prisma.reminder.findUnique({
        where: { id: reminderId },
      });
      return row?.jobId ?? null;
    },
    async markSent(reminderId: string, sentAt: Date) {
      await prisma.reminder.updateMany({
        where: { id: reminderId, status: 'pending' },
        data: { status: 'sent', sentAt },
      });
    },
    async markCancelled(reminderId: string) {
      await prisma.reminder.updateMany({
        where: { id: reminderId, status: 'pending' },
        data: { status: 'cancelled' },
      });
    },
    async markFailed(reminderId: string) {
      await prisma.reminder.updateMany({
        where: { id: reminderId, status: 'pending' },
        data: { status: 'failed' },
      });
    },
    async createRepeat(itemId: string, scheduledFor: Date): Promise<Reminder> {
      return prisma.reminder.create({
        data: {
          itemId,
          scheduledFor,
          kind: 'repeat',
          status: 'pending',
          jobId: null,
        },
      });
    },
  };
}
export type RemindersService = ReturnType<typeof createRemindersService>;

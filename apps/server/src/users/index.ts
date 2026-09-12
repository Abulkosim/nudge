import type { PrismaClient, User } from '../generated/prisma/client.js';

export interface UsersService {
  setTimezone(userId: string, timezone: string): Promise<User>;
  findOrCreateByTelegramId(telegramId: bigint): Promise<User>;
}

export function createUsersService(prisma: PrismaClient): UsersService {
  return {
    setTimezone(id, timezone) {
      return prisma.user.update({ where: { id }, data: { timezone } });
    },
    findOrCreateByTelegramId(telegramId) {
      // A nonempty update keeps this a native ON CONFLICT upsert under concurrency.
      return prisma.user.upsert({
        where: { telegramId },
        create: { telegramId },
        update: { telegramId },
      });
    },
  };
}

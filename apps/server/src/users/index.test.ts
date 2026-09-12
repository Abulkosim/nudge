import { randomInt } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma/client.js';
import { createUsersService } from './index.js';

it.skipIf(!process.env.DATABASE_URL)(
  'upserts one user across repeated and concurrent calls',
  async () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    const telegramId = -BigInt(randomInt(1, 2 ** 48 - 1));
    try {
      const users = createUsersService(prisma);
      const first = await users.findOrCreateByTelegramId(telegramId);
      await prisma.user.update({
        where: { id: first.id },
        data: { timezone: 'Asia/Tashkent' },
      });
      const second = await users.findOrCreateByTelegramId(telegramId);
      expect(second.id).toBe(first.id);
      expect(second.createdAt).toEqual(first.createdAt);
      expect(second.timezone).toBe('Asia/Tashkent');
      const concurrent = await Promise.all(
        Array.from({ length: 4 }, () =>
          users.findOrCreateByTelegramId(telegramId - 1n),
        ),
      );
      expect(new Set(concurrent.map((user) => user.id)).size).toBe(1);
      expect(await prisma.user.count({ where: { telegramId } })).toBe(1);
    } finally {
      await prisma.user.deleteMany({
        where: { telegramId: { in: [telegramId, telegramId - 1n] } },
      });
      await prisma.$disconnect();
    }
  },
);

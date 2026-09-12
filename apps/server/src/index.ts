import { PrismaPg } from '@prisma/adapter-pg';
import { Bot, GrammyError } from 'grammy';
import { PgBoss } from 'pg-boss';
import type { Server } from 'node:http';
import { PrismaClient } from './generated/prisma/client.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { createApp } from './app.js';
import { registerStart } from './bot.js';
import { createUsersService } from './users/index.js';
import { startSmokeWorker } from './smoke.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  }),
});
const boss = new PgBoss(config.DATABASE_URL);
const bot = new Bot(config.BOT_TOKEN, { client: { timeoutSeconds: 10 } });
const users = createUsersService(prisma);
registerStart(bot, users);
let server: Server | undefined;
let polling: Promise<void> | undefined;
let stopping = false;

function reportError(error: unknown) {
  // Telegram transport errors can contain the token in a request URL.
  if (error instanceof GrammyError) {
    logger.error(
      { code: error.error_code, description: error.description },
      error.error_code === 401 || error.error_code === 404
        ? 'Telegram authentication failed: check BOT_TOKEN'
        : 'Telegram API failed',
    );
  } else {
    logger.error(
      {
        errorType: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
      },
      'Server failed; check database connectivity and Telegram access',
    );
  }
}

function checkpoint() {
  if (stopping) throw new Error('Startup interrupted');
}

async function start() {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  checkpoint();
  logger.info('Database connected');
  await boss.start();
  checkpoint();
  await startSmokeWorker(boss, logger);
  checkpoint();
  const { app, miniappMounted } = createApp(config, bot, users, logger);
  if (config.NODE_ENV === 'production' && !miniappMounted) {
    logger.warn('Mini App build missing. /app is unavailable.');
  }
  await new Promise<void>((resolve, reject) => {
    server = app.listen(config.PORT, '0.0.0.0', (error) =>
      error ? reject(error) : resolve(),
    );
    server.once('error', reject);
  });
  logger.info({ port: config.PORT }, 'Express listening');
  checkpoint();
  await bot.init();
  checkpoint();
  if (config.BOT_MODE === 'webhook') {
    await bot.api.setWebhook(config.WEBHOOK_URL!, {
      secret_token: config.WEBHOOK_SECRET!,
    });
    logger.info('Telegram webhook registered');
  } else {
    polling = bot.start({
      onStart: () => logger.info('Telegram polling started'),
    });
    void polling.catch((error: unknown) => {
      if (!stopping) {
        reportError(error);
        void shutdown(1);
      }
    });
  }
}

async function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => {
    logger.error('Shutdown timed out');
    process.exit(1);
  }, 15000);
  timeout.unref();
  await startup.catch(() => {});
  for (const close of [
    async () => {
      if (bot.isRunning()) await bot.stop();
      await polling?.catch(() => {});
    },
    async () => {
      if (server?.listening)
        await new Promise<void>((resolve, reject) =>
          server!.close((error) => (error ? reject(error) : resolve())),
        );
    },
    async () => {
      await boss.stop({ graceful: true, timeout: 5000 });
    },
    async () => {
      await prisma.$disconnect();
    },
  ]) {
    try {
      await close();
    } catch (error) {
      reportError(error);
      code = 1;
    }
  }
  logger.info('Shutdown complete');
  process.exit(code);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1);
    logger.info({ signal }, 'Shutting down');
    void shutdown(0);
  });
}
boss.on('error', (error: unknown) => {
  reportError(error);
  void shutdown(1);
});
const startup = start();
void startup.catch((error: unknown) => {
  if (!stopping) {
    reportError(error);
    void shutdown(1);
  }
});

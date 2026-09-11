import type { PgBoss } from 'pg-boss';
import type { Logger } from 'pino';

export async function startSmokeWorker(
  boss: Pick<PgBoss, 'createQueue' | 'work' | 'send'>,
  logger: Logger,
) {
  // Exclusive policy enforces the key across queued and active jobs.
  await boss.createQueue('smoke.ping', { policy: 'exclusive' });
  await boss.work('smoke.ping', async (jobs) => {
    for (const job of jobs) logger.info({ jobId: job.id }, 'smoke.ping ran');
  });
  return boss.send(
    'smoke.ping',
    {},
    { startAfter: 30, singletonKey: 'bootstrap' },
  );
}

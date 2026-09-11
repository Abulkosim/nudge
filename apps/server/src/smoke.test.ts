import { expect, it, vi } from 'vitest';
import { pino } from 'pino';
import { PgBoss } from 'pg-boss';
import { startSmokeWorker } from './smoke.js';

it('uses the same singleton key across boots with an exclusive queue', async () => {
  const pending = new Set<string>();
  const boss = new PgBoss('postgresql://nudge:nudge@localhost:5432/nudge');
  vi.spyOn(boss, 'createQueue').mockResolvedValue(undefined);
  vi.spyOn(boss, 'work').mockResolvedValue('worker');
  const send = vi
    .spyOn(boss, 'send')
    .mockImplementation(async (_name, _data, options) => {
      const key = options?.singletonKey;
      if (!key) throw new Error('Missing singleton key');
      if (pending.has(key)) return null;
      pending.add(key);
      return 'job';
    });
  const logger = pino({ level: 'silent' });
  expect(await startSmokeWorker(boss, logger)).toBe('job');
  expect(await startSmokeWorker(boss, logger)).toBeNull();
  expect(pending.size).toBe(1);
  expect(boss.createQueue).toHaveBeenCalledWith('smoke.ping', {
    policy: 'exclusive',
  });
  expect(boss.send).toHaveBeenNthCalledWith(
    1,
    'smoke.ping',
    {},
    { startAfter: 30, singletonKey: 'bootstrap' },
  );
  expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
});

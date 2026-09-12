import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Bot } from 'grammy';
import { expect, it } from 'vitest';
import { fakeUsers, silentLogger } from './test-helpers.js';
import { createApp } from './app.js';
import { parseConfig } from './config-schema.js';

const config = parseConfig({
  DATABASE_URL: 'postgresql://nudge:nudge@localhost:5432/nudge',
  BOT_TOKEN: '123:dummy',
  BOT_MODE: 'polling',
  PORT: '3000',
  AI_PROVIDER: 'none',
  LOG_LEVEL: 'silent',
});

it.each([
  { production: true, built: true },
  { production: true, built: false },
  { production: false, built: true },
])(
  'serves the SPA only with a production build: %j',
  async ({ production, built }) => {
    const directory = await mkdtemp(join(tmpdir(), 'nudge-miniapp-'));
    const dist = join(directory, 'dist');
    const index = '<!doctype html><title>Nudge</title><div id="root"></div>';
    if (built) {
      await mkdir(join(dist, 'assets'), { recursive: true });
      await writeFile(join(dist, 'index.html'), index);
      await writeFile(join(dist, 'assets', 'index-a1b2c3d4.js'), 'export {};');
    }
    const { app, miniappMounted } = createApp(
      { ...config, NODE_ENV: production ? 'production' : 'development' },
      new Bot(config.BOT_TOKEN),
      fakeUsers(),
      silentLogger,
      dist,
    );
    expect(miniappMounted).toBe(production && built);
    const server = app.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Expected TCP address');
      const base = `http://127.0.0.1:${address.port}`;
      for (const path of [
        '/app',
        '/app/',
        '/app/index.html',
        '/app/deep/link',
      ]) {
        const response = await fetch(`${base}${path}`);
        expect(response.status).toBe(production && built ? 200 : 404);
        if (production && built) {
          expect(await response.text()).toBe(index);
          expect(response.headers.get('cache-control')).toBe('no-store');
        }
      }
      const asset = await fetch(`${base}/app/assets/index-a1b2c3d4.js`);
      expect(asset.status).toBe(production && built ? 200 : 404);
      if (production && built) {
        expect(asset.headers.get('cache-control')).toBe(
          'public, max-age=31536000, immutable',
        );
        expect((await fetch(`${base}/app/assets/missing.js`)).status).toBe(404);
        expect(
          (
            await fetch(`${base}/app/deep/link`, {
              headers: { Accept: 'application/json' },
            })
          ).status,
        ).toBe(404);
        expect(
          (await fetch(`${base}/app/deep/link`, { method: 'POST' })).status,
        ).toBe(404);
      }
      expect((await fetch(`${base}/application`)).status).toBe(404);
      expect((await fetch(`${base}/health`)).status).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(directory, { recursive: true, force: true });
    }
  },
);

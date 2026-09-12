import { describe, expect, it } from 'vitest';
import { parseConfig } from './config-schema.js';

const env = {
  DATABASE_URL: 'postgresql://nudge:nudge@localhost:5432/nudge',
  BOT_TOKEN: '123:dummy',
  BOT_MODE: 'polling',
  PORT: '3000',
  AI_PROVIDER: 'none',
  LOG_LEVEL: 'info',
};
describe('config', () => {
  it('rejects a missing BOT_TOKEN', () => {
    const missing: NodeJS.ProcessEnv = { ...env };
    delete missing.BOT_TOKEN;
    expect(() => parseConfig(missing)).toThrow('BOT_TOKEN');
  });
  it('requires WEBHOOK_URL in webhook mode', () => {
    expect(() =>
      parseConfig({ ...env, BOT_MODE: 'webhook', WEBHOOK_SECRET: 'secret' }),
    ).toThrow('WEBHOOK_URL');
  });
  it('requires the webhook secret and an enabled provider key', () => {
    expect(() =>
      parseConfig({
        ...env,
        BOT_MODE: 'webhook',
        WEBHOOK_URL: 'https://example.com/telegram/webhook',
      }),
    ).toThrow('WEBHOOK_SECRET');
    expect(() => parseConfig({ ...env, AI_PROVIDER: 'anthropic' })).toThrow(
      'ANTHROPIC_API_KEY',
    );
  });
  it('accepts blank unused keys and parses the port', () => {
    expect(
      parseConfig({
        ...env,
        WEBHOOK_URL: '',
        WEBHOOK_SECRET: '',
        ANTHROPIC_API_KEY: '',
        MINIAPP_URL: '',
      }).PORT,
    ).toBe(3000);
  });
  it('lists malformed keys without exposing their values', () => {
    expect(() =>
      parseConfig({
        ...env,
        DATABASE_URL: 'private-secret',
        PORT: 'invalid',
        LOG_LEVEL: 'bad',
      }),
    ).toThrow(/DATABASE_URL:[\s\S]*PORT:[\s\S]*LOG_LEVEL:/);
    expect(() =>
      parseConfig({ ...env, DATABASE_URL: 'private-secret' }),
    ).not.toThrow('private-secret');
  });
});

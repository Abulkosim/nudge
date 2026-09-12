// Production on Railway, applied with `railway config plan` and `railway config apply`.
// Secrets stay in Railway: preserve() keeps whatever value is set there.
import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
} from 'railway/iac';

export default defineRailway(() => {
  const db = postgres('Postgres');

  const server = service('server', {
    source: github('Abulkosim/nudge', { branch: 'main' }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    deploy: {
      numReplicas: 1,
      healthcheckPath: '/health',
      healthcheckTimeout: 120,
      // Restart on failure is Railway's default and reads back as unset, so naming it here
      // would show as drift on every plan. Only the retry count is ours.
      restartPolicyMaxRetries: 3,
    },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      BOT_TOKEN: preserve(),
      BOT_MODE: 'webhook',
      WEBHOOK_URL: 'https://${{RAILWAY_PUBLIC_DOMAIN}}/telegram/webhook',
      WEBHOOK_SECRET: preserve(),
      MINIAPP_URL: 'https://${{RAILWAY_PUBLIC_DOMAIN}}/app/',
      AI_PROVIDER: 'none',
      LOG_LEVEL: 'info',
    },
  });

  return project('nudge', { resources: [db, server] });
});

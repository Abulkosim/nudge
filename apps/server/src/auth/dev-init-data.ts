import { createHmac } from 'node:crypto';
import { z } from 'zod';

if (process.env.NODE_ENV === 'production') {
  console.error('dev:init-data is unavailable in production.');
  process.exit(1);
}
const env = z
  .object({
    BOT_TOKEN: z.string().min(1),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  })
  .safeParse(process.env);
const id = z.coerce
  .number()
  .int()
  .positive()
  .max(2 ** 52 - 1)
  .safeParse(process.argv[2]);
if (!env.success || !id.success) {
  console.error(
    'Set local BOT_TOKEN and PORT, then pass a positive Telegram id.',
  );
  process.exit(1);
}
const params = new URLSearchParams({
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: id.data, first_name: 'Local test' }),
});
params.sort();
const secret = createHmac('sha256', 'WebAppData')
  .update(env.data.BOT_TOKEN)
  .digest();
params.set(
  'hash',
  createHmac('sha256', secret)
    .update([...params].map(([key, value]) => `${key}=${value}`).join('\n'))
    .digest('hex'),
);
const raw = params.toString();
// Explicit local credential output, never used by the running server or its logger.
console.log(raw);
console.log(
  `curl -sS -H 'Authorization: tma ${raw}' 'http://localhost:${env.data.PORT}/api/me'`,
);

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export type AuthFailureReason =
  | 'missing_header'
  | 'invalid_scheme'
  | 'malformed'
  | 'missing_hash'
  | 'invalid_hash'
  | 'invalid_signature'
  | 'invalid_auth_date'
  | 'expired'
  | 'future_auth_date'
  | 'invalid_user';

export class AuthError extends Error {
  constructor(readonly reason: AuthFailureReason) {
    super('Unauthorized');
    this.name = 'AuthError';
  }
}

const telegramUser = z.object({
  id: z
    .number()
    .int()
    .positive()
    .max(2 ** 52 - 1),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_bot: z.boolean().optional(),
  is_premium: z.boolean().optional(),
  added_to_attachment_menu: z.boolean().optional(),
  allows_write_to_pm: z.boolean().optional(),
  photo_url: z.string().optional(),
});

/** now is Unix time in seconds. No clock, I/O or logging inside verification. */
export function verifyInitData(
  raw: string,
  botToken: string,
  { now, maxAgeSeconds }: { now: number; maxAgeSeconds: number },
): z.infer<typeof telegramUser> {
  if (
    !raw ||
    !botToken ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(maxAgeSeconds) ||
    maxAgeSeconds <= 0
  ) {
    throw new AuthError('malformed');
  }
  // URLSearchParams silently repairs invalid escapes/UTF-8. Reject those first.
  try {
    decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    throw new AuthError('malformed');
  }
  if (raw.split('&').some((part) => !part.includes('=')))
    throw new AuthError('malformed');
  const params = new URLSearchParams(raw);
  const keys = [...params.keys()];
  if (
    new Set(keys).size !== keys.length ||
    keys.some((key) => !/^[a-z_]+$/.test(key))
  ) {
    throw new AuthError('malformed');
  }
  const hash = params.get('hash');
  if (hash === null) throw new AuthError('missing_hash');
  if (!/^[a-fA-F0-9]{64}$/.test(hash)) throw new AuthError('invalid_hash');
  params.delete('hash');
  params.sort();
  // Telegram bot-token validation includes signature, if present. Only hash is excluded.
  // https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
  const data = [...params].map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(data).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex')))
    throw new AuthError('invalid_signature');
  const authDate = params.get('auth_date');
  if (
    !authDate ||
    !/^\d+$/.test(authDate) ||
    !Number.isSafeInteger(Number(authDate))
  ) {
    throw new AuthError('invalid_auth_date');
  }
  const age = now - Number(authDate);
  if (age < 0) throw new AuthError('future_auth_date');
  if (age > maxAgeSeconds) throw new AuthError('expired');
  let user: unknown;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    throw new AuthError('invalid_user');
  }
  const parsed = telegramUser.safeParse(user);
  if (!parsed.success) throw new AuthError('invalid_user');
  return parsed.data;
}

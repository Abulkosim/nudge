import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.url({ protocol: /^https?$/ }).optional(),
);
const schema = z
  .object({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    BOT_TOKEN: z.string().trim().min(1),
    BOT_MODE: z.enum(['polling', 'webhook']),
    WEBHOOK_URL: optionalUrl,
    WEBHOOK_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,256}$/)
        .optional(),
    ),
    PORT: z.coerce.number().int().min(1).max(65535),
    MINIAPP_URL: optionalUrl,
    AI_PROVIDER: z.enum(['none', 'anthropic']),
    ANTHROPIC_API_KEY: optionalText,
    LOG_LEVEL: z.enum([
      'fatal',
      'error',
      'warn',
      'info',
      'debug',
      'trace',
      'silent',
    ]),
  })
  .superRefine((env, ctx) => {
    if (env.BOT_MODE === 'webhook') {
      if (!env.WEBHOOK_URL || !env.WEBHOOK_URL.startsWith('https://'))
        ctx.addIssue({
          code: 'custom',
          path: ['WEBHOOK_URL'],
          message: 'HTTPS URL required in webhook mode',
        });
      if (!env.WEBHOOK_SECRET)
        ctx.addIssue({
          code: 'custom',
          path: ['WEBHOOK_SECRET'],
          message: 'Required in webhook mode',
        });
    }
    if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY)
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'Required for anthropic',
      });
  });

export function parseConfig(env: NodeJS.ProcessEnv) {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid environment:\n${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')}`,
    );
  return result.data;
}
export type Config = ReturnType<typeof parseConfig>;

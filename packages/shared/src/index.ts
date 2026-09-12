import { z } from 'zod';

const integerString = z.string().regex(/^-?(0|[1-9]\d*)$/);
const timestamp = z.iso.datetime();

export const UserDto = z.object({
  id: z.uuid(),
  telegramId: z.string().regex(/^[1-9]\d*$/),
  timezone: z.string().nullable(),
  createdAt: timestamp,
});
export type UserDto = z.infer<typeof UserDto>;

export const ItemStatus = z.enum(['draft', 'open', 'received', 'cancelled']);
export type ItemStatus = z.infer<typeof ItemStatus>;

// Scalar Prisma fields only. Relations have their own API representations.
export const ItemDto = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  what: z.string(),
  fromWhom: z.string().nullable(),
  expectedAt: timestamp.nullable(),
  status: ItemStatus,
  sourceChatId: integerString.nullable(),
  sourceMessageId: integerString.nullable(),
  sourceText: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  receivedAt: timestamp.nullable(),
});
export type ItemDto = z.infer<typeof ItemDto>;

export const ApiError = z.object({
  error: z.object({
    code: z.enum([
      'unauthorized',
      'forbidden',
      'not_found',
      'invalid_request',
      'internal',
    ]),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

import { z } from 'zod';

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

// What a list row and a detail screen need. Source fields and ownership stay on the server.
export const ItemSummaryDto = z.object({
  id: z.uuid(),
  what: z.string(),
  fromWhom: z.string().nullable(),
  expectedOn: z.iso.date().nullable(),
  status: ItemStatus,
  createdAt: timestamp,
  receivedAt: timestamp.nullable(),
  // The instant of the item's single pending reminder, null when it has none.
  remindAt: timestamp.nullable(),
});
export type ItemSummaryDto = z.infer<typeof ItemSummaryDto>;

export const ItemListDto = z.object({ items: z.array(ItemSummaryDto) });
export type ItemListDto = z.infer<typeof ItemListDto>;

export const ItemListQuery = z.object({
  status: z.enum(['open', 'received']),
});
export type ItemListQuery = z.infer<typeof ItemListQuery>;

export const UpdateItemBody = z
  .object({
    what: z.string().trim().min(1).max(500).optional(),
    fromWhom: z.string().trim().max(500).nullable().optional(),
    expectedOn: z.iso.date().nullable().optional(),
    remindAt: timestamp.nullable().optional(),
  })
  .strict();
export type UpdateItemBody = z.infer<typeof UpdateItemBody>;

export const UpdateMeBody = z
  .object({ timezone: z.string().trim().min(1).max(64) })
  .strict();
export type UpdateMeBody = z.infer<typeof UpdateMeBody>;

export const ApiError = z.object({
  error: z.object({
    code: z.enum([
      'unauthorized',
      'forbidden',
      'not_found',
      'invalid_request',
      'conflict',
      'internal',
    ]),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

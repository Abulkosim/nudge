import { ApiError } from '@nudge/shared';
import { z } from 'zod';
import { telegram } from '@/telegram';

export class ApiClientError extends Error {
  constructor(
    readonly code: ApiError['error']['code'],
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiFetch<S extends z.ZodType>(
  path: `/api/${string}`,
  schema: S,
  options: RequestInit = {},
): Promise<z.output<S>> {
  const url = new URL(path, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith('/api/')
  ) {
    throw new Error('API requests must stay under /api/.');
  }
  const initData = telegram.getSnapshot().initData;
  if (!initData) throw new Error('Open Nudge in Telegram to continue.');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `tma ${initData}`);
  headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...options, headers, redirect: 'error' });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiError.safeParse(data);
    if (parsed.success)
      throw new ApiClientError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
      );
    throw new ApiClientError(
      'internal',
      `Request failed (${response.status}).`,
      response.status,
    );
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new ApiClientError(
      'internal',
      'Invalid server response.',
      response.status,
    );
  return parsed.data;
}

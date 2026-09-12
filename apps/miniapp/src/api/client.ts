import { telegram } from '@/telegram';

export async function apiFetch(
  path: `/api/${string}`,
  options: RequestInit = {},
): Promise<unknown> {
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
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  const data: unknown = await response.json();
  return data;
}

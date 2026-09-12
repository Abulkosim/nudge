import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { UserDto } from '@nudge/shared';
import { apiFetch, ApiClientError } from './client';

const mock = vi.hoisted(() => ({ initData: 'query_id=abc&hash=signed' }));
vi.mock('@/telegram', () => ({ telegram: { getSnapshot: () => mock } }));
afterEach(() => {
  vi.unstubAllGlobals();
  mock.initData = 'query_id=abc&hash=signed';
});

it('sends raw initData as authorization and parses JSON', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    apiFetch('/api/items', z.object({ ok: z.boolean() }), {
      headers: { 'X-Request-ID': '123' },
    }),
  ).resolves.toEqual({ ok: true });
  const [url, options] = fetchMock.mock.calls[0]!;
  expect(String(url)).toBe(`${window.location.origin}/api/items`);
  const headers = new Headers(options?.headers);
  expect(headers.get('Authorization')).toBe('tma query_id=abc&hash=signed');
  expect(headers.get('X-Request-ID')).toBe('123');
});
it('rejects browser mock credentials without making a request', async () => {
  mock.initData = '';
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await expect(apiFetch('/api/items', UserDto)).rejects.toThrow(
    'Open Nudge in Telegram',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects paths escaping the API and HTTP errors', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 })),
  );
  await expect(apiFetch('/api/../outside', UserDto)).rejects.toThrow(
    'under /api/',
  );
  await expect(apiFetch('/api/items', UserDto)).rejects.toThrow('401');
});

it('maps shared error responses to a typed client error', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'unauthorized', message: 'Sign in.' } },
          { status: 401 },
        ),
      ),
  );
  const request = apiFetch('/api/me', UserDto);
  await expect(request).rejects.toBeInstanceOf(ApiClientError);
  await expect(request).rejects.toMatchObject({
    code: 'unauthorized',
    status: 401,
    message: 'Sign in.',
  });
});
it('rejects a successful response with the wrong shape', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 123 })));
  await expect(apiFetch('/api/me', UserDto)).rejects.toMatchObject({
    code: 'internal',
    message: 'Invalid server response.',
  });
});

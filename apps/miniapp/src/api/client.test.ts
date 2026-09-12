import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch } from './client';

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
    apiFetch('/api/items', { headers: { 'X-Request-ID': '123' } }),
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
  await expect(apiFetch('/api/items')).rejects.toThrow(
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
  await expect(apiFetch('/api/../outside')).rejects.toThrow('under /api/');
  await expect(apiFetch('/api/items')).rejects.toThrow('401');
});

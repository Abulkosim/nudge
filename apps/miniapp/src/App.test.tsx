import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';

const mock = vi.hoisted(() => ({
  snapshot: {
    status: 'loading' as 'loading' | 'ready' | 'error',
    initData: '',
  },
  listener: () => {},
  ready: vi.fn(),
}));
vi.mock('@/telegram', () => ({
  telegram: {
    getSnapshot: () => mock.snapshot,
    subscribe: (listener: () => void) => {
      mock.listener = listener;
      return () => {};
    },
    ready: mock.ready,
  },
}));
beforeEach(() => {
  mock.snapshot = { status: 'loading', initData: '' };
});

it('shows loading, then the placeholder when Telegram is ready', () => {
  render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading...');
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  act(() => {
    mock.snapshot = { status: 'ready', initData: '' };
    mock.listener();
  });
  expect(
    screen.getByRole('heading', { name: 'Mini App coming soon.' }),
  ).toBeInTheDocument();
  expect(mock.ready).toHaveBeenCalledOnce();
});
it('shows a plain failure state', () => {
  mock.snapshot = { status: 'error', initData: '' };
  render(<App />);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not open Nudge.');
  expect(mock.ready).toHaveBeenCalledOnce();
});

afterEach(() => vi.unstubAllGlobals());
it('fetches me once and shows signed in, including StrictMode', async () => {
  mock.snapshot = { status: 'ready', initData: 'signed-data' };
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      id: 'a34fe175-6999-4bb4-b326-5557eb02644a',
      telegramId: '123',
      timezone: null,
      createdAt: '2026-09-12T00:00:00.000Z',
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  expect(await screen.findByText('Signed in.')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledOnce();
});
it('shows a plain auth error without reflecting server text', async () => {
  mock.snapshot = { status: 'ready', initData: 'signed-data' };
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret')));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not sign in.',
  );
});
it('does not fetch in the browser mock', () => {
  mock.snapshot = { status: 'ready', initData: '' };
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  expect(fetchMock).not.toHaveBeenCalled();
});

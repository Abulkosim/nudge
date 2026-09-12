import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';

const mock = vi.hoisted(() => ({
  snapshot: { status: 'loading' as 'loading' | 'ready' | 'error' },
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
  mock.snapshot = { status: 'loading' };
});

it('shows loading, then the placeholder when Telegram is ready', () => {
  render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading...');
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  act(() => {
    mock.snapshot = { status: 'ready' };
    mock.listener();
  });
  expect(
    screen.getByRole('heading', { name: 'Mini App coming soon.' }),
  ).toBeInTheDocument();
  expect(mock.ready).toHaveBeenCalledOnce();
});
it('shows a plain failure state', () => {
  mock.snapshot = { status: 'error' };
  render(<App />);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not open Nudge.');
  expect(mock.ready).toHaveBeenCalledOnce();
});

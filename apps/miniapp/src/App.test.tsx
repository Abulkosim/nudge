import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';

const mock = vi.hoisted(() => ({
  snapshot: {
    status: 'loading' as 'loading' | 'ready' | 'error',
    initData: '',
    colourScheme: 'light' as 'light' | 'dark',
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
  mock.snapshot = { status: 'loading', initData: '', colourScheme: 'light' };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

const zone = 'Asia/Tashkent';
const me = {
  id: 'a34fe175-6999-4bb4-b326-5557eb02644a',
  telegramId: '123',
  timezone: zone,
  createdAt: '2026-09-12T00:00:00.000Z',
};
const design = {
  id: '0f2b9f1e-6c2a-4a1f-9a1d-2b3c4d5e6f70',
  what: 'Design',
  fromWhom: 'Aziz',
  expectedOn: '2026-09-19',
  status: 'open',
  createdAt: '2026-09-12T00:00:00.000Z',
  receivedAt: null,
  remindAt: '2026-09-19T04:00:00.000Z',
};
const keys = {
  ...design,
  id: '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
  what: 'Keys',
  fromWhom: null,
  expectedOn: null,
  status: 'received',
  receivedAt: '2026-09-20T05:00:00.000Z',
  remindAt: null,
};
const error = (message: string, status = 500) =>
  Response.json(
    { error: { code: 'internal', message } },
    { status, headers: { 'Content-Type': 'application/json' } },
  );
function stubFetch(
  handler: (url: string, init: RequestInit) => Response | undefined,
) {
  const fetchMock = vi.fn((input: unknown, init: RequestInit = {}) => {
    const url = String(input);
    const response = handler(url, init);
    if (!response) throw new Error(`Unexpected request: ${init.method} ${url}`);
    return Promise.resolve(response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const signedIn = () => {
  mock.snapshot = {
    status: 'ready',
    initData: 'signed-data',
    colourScheme: 'light',
  };
};
const bodyOf = (call: [unknown, RequestInit]) =>
  JSON.parse(String(call[1].body)) as unknown;
// Radix listens for pointer events the jsdom click alone does not send.
const press = (element: Element) => {
  fireEvent.pointerDown(
    element,
    new MouseEvent('pointerdown', { bubbles: true }),
  );
  fireEvent.click(element);
};
const openDetail = async (name: RegExp) => {
  fireEvent.click(await screen.findByRole('button', { name }));
  return await screen.findByRole('dialog');
};

it('shows loading, then the placeholder when Telegram is ready', () => {
  render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading...');
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  act(() => {
    mock.snapshot = { status: 'ready', initData: '', colourScheme: 'light' };
    mock.listener();
  });
  expect(
    screen.getByRole('heading', { name: 'Mini App coming soon.' }),
  ).toBeInTheDocument();
  expect(mock.ready).toHaveBeenCalledOnce();
});
it('shows a plain failure state', () => {
  mock.snapshot = { status: 'error', initData: '', colourScheme: 'light' };
  render(<App />);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not open Nudge.');
  expect(mock.ready).toHaveBeenCalledOnce();
});

it('fetches me once and lists what the user is waiting on, including StrictMode', async () => {
  signedIn();
  const fetchMock = stubFetch((url) => {
    if (url.endsWith('/api/me')) return Response.json(me);
    if (url.endsWith('/api/items?status=open'))
      return Response.json({ items: [design] });
    return undefined;
  });
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  const row = await screen.findByRole('button', { name: /Design/ });
  expect(row).toHaveTextContent('from Aziz · Sat 19 Sep');
  expect(row).toHaveTextContent('Reminds Sat 19 Sep, 09:00');
  expect(
    screen.getByRole('tab', { name: /^Waiting on\s*1$/ }),
  ).toBeInTheDocument();
  expect(
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/me')),
  ).toHaveLength(1);
});

it('shows skeleton rows while the list loads', async () => {
  signedIn();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) =>
      String(input).endsWith('/api/me')
        ? Promise.resolve(Response.json(me))
        : new Promise<Response>(() => {}),
    ),
  );
  render(<App />);
  await screen.findByRole('tab', { name: /^Waiting on$/ });
  expect(screen.getByRole('status')).toHaveTextContent('Loading...');
  expect(screen.queryByRole('tab', { name: /Waiting on\s*\d/ })).toBeNull();
});

it('marks a date in the past as overdue', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-20T06:00:00.000Z'));
  signedIn();
  stubFetch((url) => {
    if (url.endsWith('/api/me')) return Response.json(me);
    if (url.endsWith('/api/items?status=open'))
      return Response.json({
        items: [design, { ...keys, status: 'open', receivedAt: null }],
      });
    return undefined;
  });
  render(<App />);
  const overdue = await screen.findByRole('button', { name: /Design/ });
  expect(within(overdue).getByText('Overdue')).toBeInTheDocument();
  const undated = screen.getByRole('button', { name: /Keys/ });
  expect(undated).toHaveTextContent('No date');
  expect(within(undated).queryByText('Overdue')).not.toBeInTheDocument();
});

it('asks for received items when that tab is chosen', async () => {
  signedIn();
  const fetchMock = stubFetch((url) => {
    if (url.endsWith('/api/me')) return Response.json(me);
    if (url.endsWith('/api/items?status=open'))
      return Response.json({ items: [design] });
    if (url.endsWith('/api/items?status=received'))
      return Response.json({ items: [keys] });
    return undefined;
  });
  render(<App />);
  fireEvent.mouseDown(await screen.findByRole('tab', { name: /Received/ }));
  const row = await screen.findByRole('button', { name: /Keys/ });
  expect(row).toHaveTextContent('Received Sun 20 Sep');
  expect(sessionStorage.getItem('nudge.tab')).toBe('received');
  expect(
    fetchMock.mock.calls.some(([url]) =>
      String(url).endsWith('status=received'),
    ),
  ).toBe(true);
});

it('opens the item in a drawer and saves only the fields that changed', async () => {
  signedIn();
  const fetchMock = stubFetch((url, init) => {
    if (url.endsWith('/api/me')) return Response.json(me);
    if (url.endsWith('/api/items?status=open'))
      return Response.json({ items: [design] });
    if (init.method === 'PATCH') return Response.json(design);
    return undefined;
  });
  render(<App />);
  const drawer = await openDetail(/Design/);
  expect(within(drawer).getByRole('heading')).toHaveTextContent('Design');
  expect(
    within(drawer).getByRole('button', { name: /Expected/ }),
  ).toHaveTextContent('Sat 19 Sep 2026');
  expect(within(drawer).getByRole('switch')).toBeChecked();
  expect(
    within(drawer).getByRole('combobox', { name: /Reminder time/ }),
  ).toHaveTextContent('09:00');
  expect(screen.getByText('Times in Asia/Tashkent')).toBeInTheDocument();
  const save = within(drawer).getByRole('button', { name: 'Save' });
  expect(save).toBeDisabled();
  fireEvent.change(within(drawer).getByLabelText('What'), {
    target: { value: 'Final design' },
  });
  fireEvent.click(save);
  expect(await screen.findAllByText('Saved')).not.toHaveLength(0);
  const patch = fetchMock.mock.calls.find(
    ([, init]) => init?.method === 'PATCH',
  );
  expect(String(patch?.[0])).toContain(`/api/items/${design.id}`);
  expect(bodyOf(patch as [unknown, RequestInit])).toEqual({
    what: 'Final design',
  });
});

it('clears the reminder when the switch goes off', async () => {
  signedIn();
  const fetchMock = stubFetch((url, init) => {
    if (url.endsWith('/api/me')) return Response.json(me);
    if (url.endsWith('/api/items?status=open'))
      return Response.json({ items: [design] });
    if (init.method === 'PATCH') return Response.json(design);
    return undefined;
  });
  render(<App />);
  const drawer = await openDetail(/Design/);
  fireEvent.click(within(drawer).getByRole('switch'));
  expect(screen.queryByRole('combobox', { name: /Reminder time/ })).toBeNull();
  fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
  await screen.findAllByText('Saved');
  const patch = fetchMock.mock.calls.find(
    ([, init]) => init?.method === 'PATCH',
  );
  expect(bodyOf(patch as [unknown, RequestInit])).toEqual({ remindAt: null });
});

it('turns a reminder on at 09:00 on the expected date', async () => {
  signedIn();
  const fetchMock = stubFetch((url, init) => {
    if (url.endsWith('/api/me')) return Response.json(me);
    if (url.endsWith('/api/items?status=open'))
      return Response.json({ items: [{ ...design, remindAt: null }] });
    if (init.method === 'PATCH') return Response.json(design);
    return undefined;
  });
  render(<App />);
  const drawer = await openDetail(/Design/);
  const remind = within(drawer).getByRole('switch');
  expect(remind).not.toBeChecked();
  fireEvent.click(remind);
  expect(
    within(drawer).getByRole('combobox', { name: /Reminder time/ }),
  ).toHaveTextContent('09:00');
  fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
  await screen.findAllByText('Saved');
  const patch = fetchMock.mock.calls.find(
    ([, init]) => init?.method === 'PATCH',
  );
  // 09:00 in Asia/Tashkent, which is UTC+5.
  expect(bodyOf(patch as [unknown, RequestInit])).toEqual({
    remindAt: '2026-09-19T04:00:00.000Z',
  });
});

it('moves the reminder when another time is picked', async () => {
  signedIn();
  const fetchMock = stubFetch((url, init) => {
    if (url.endsWith('/api/me')) return Response.json(me);
    if (url.endsWith('/api/items?status=open'))
      return Response.json({ items: [design] });
    if (init.method === 'PATCH') return Response.json(design);
    return undefined;
  });
  render(<App />);
  const drawer = await openDetail(/Design/);
  press(within(drawer).getByRole('combobox', { name: /Reminder time/ }));
  press(await screen.findByRole('option', { name: '10:30' }));
  fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
  await screen.findAllByText('Saved');
  const patch = fetchMock.mock.calls.find(
    ([, init]) => init?.method === 'PATCH',
  );
  expect(bodyOf(patch as [unknown, RequestInit])).toEqual({
    remindAt: '2026-09-19T05:30:00.000Z',
  });
});

it('marks an item received, closes the drawer and says so', async () => {
  signedIn();
  const fetchMock = stubFetch((url, init) => {
    if (url.endsWith('/api/me')) return Response.json(me);
    if (url.endsWith('/api/items?status=open'))
      return Response.json({ items: [design] });
    if (init.method === 'POST')
      return Response.json({ ...design, status: 'received' });
    return undefined;
  });
  render(<App />);
  const drawer = await openDetail(/Design/);
  fireEvent.click(within(drawer).getByRole('button', { name: /Received/ }));
  expect(await screen.findAllByText('Marked received')).not.toHaveLength(0);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(
    fetchMock.mock.calls.some(
      ([url, init]) =>
        String(url).endsWith(`/api/items/${design.id}/receive`) &&
        (init as RequestInit).method === 'POST',
    ),
  ).toBe(true);
});

it('offers the device timezone and stores the chosen one', async () => {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const other = device === zone ? 'Europe/Berlin' : zone;
  signedIn();
  const fetchMock = stubFetch((url, init) => {
    if (url.endsWith('/api/me') && init.method === 'PATCH')
      return Response.json({ ...me, timezone: device });
    if (url.endsWith('/api/me'))
      return Response.json({ ...me, timezone: other });
    if (url.includes('/api/items')) return Response.json({ items: [] });
    return undefined;
  });
  render(<App />);
  const use = await screen.findByRole('button', { name: `Use ${device}` });
  expect(screen.getByText(`Your device is in ${device}.`)).toBeInTheDocument();
  fireEvent.click(use);
  await screen.findByText(
    'Nothing waiting. Send the bot a message to add one.',
  );
  expect(screen.queryByRole('button', { name: `Use ${device}` })).toBeNull();
  const patch = fetchMock.mock.calls.find(
    ([, init]) => init?.method === 'PATCH',
  );
  expect(bodyOf(patch as [unknown, RequestInit])).toEqual({
    timezone: device,
  });
});

it('keeps the stored timezone for the session', async () => {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const other = device === zone ? 'Europe/Berlin' : zone;
  signedIn();
  stubFetch((url) => {
    if (url.endsWith('/api/me'))
      return Response.json({ ...me, timezone: other });
    if (url.includes('/api/items')) return Response.json({ items: [] });
    return undefined;
  });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: `Keep ${other}` }));
  expect(screen.queryByRole('button', { name: `Use ${device}` })).toBeNull();
  expect(sessionStorage.getItem('nudge.keep-timezone')).not.toBeNull();
});

it('shows the API message and retries the list', async () => {
  signedIn();
  let attempt = 0;
  stubFetch((url) => {
    if (url.endsWith('/api/me')) return Response.json(me);
    if (url.includes('/api/items'))
      return attempt++ === 0
        ? error('Something went wrong.')
        : Response.json({ items: [design] });
    return undefined;
  });
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Something went wrong.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: /Design/ })).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('shows a plain auth error without reflecting server text', async () => {
  signedIn();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret')));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not sign in.',
  );
});
it('does not fetch in the browser mock', () => {
  mock.snapshot = { status: 'ready', initData: '', colourScheme: 'light' };
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  expect(fetchMock).not.toHaveBeenCalled();
});

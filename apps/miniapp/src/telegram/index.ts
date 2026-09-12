import {
  init as initSdk,
  isTMA,
  miniApp,
  retrieveRawInitData,
  themeParams,
  viewport,
} from '@tma.js/sdk-react';
import { applyTheme, type ColourScheme, type ThemeParams } from './theme';

export interface TelegramSnapshot {
  readonly status: 'loading' | 'ready' | 'error';
  readonly initData: string;
  readonly themeParams: ThemeParams;
  readonly colourScheme: ColourScheme;
}

let snapshot: TelegramSnapshot = {
  status: 'loading',
  initData: '',
  themeParams: {},
  colourScheme: 'light',
};
const listeners = new Set<() => void>();
let initialization: Promise<void> | undefined;
let native = false;
let notified = false;
let generation = 0;
const disposers: (() => void)[] = [];

function update(next: TelegramSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function syncTheme(theme: ThemeParams, colourScheme: ColourScheme) {
  applyTheme(theme, colourScheme);
  update({ ...snapshot, themeParams: theme, colourScheme });
}

function syncInsets() {
  const safe = viewport.safeAreaInsets();
  const content = viewport.contentSafeAreaInsets();
  for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
    document.documentElement.style.setProperty(
      `--safe-${edge}`,
      `${safe[edge]}px`,
    );
    document.documentElement.style.setProperty(
      `--content-safe-${edge}`,
      `${content[edge]}px`,
    );
  }
}

async function initialize(currentGeneration: number) {
  try {
    native = isTMA();
    if (!native) {
      // A broken Telegram launch must not silently become a browser mock.
      if (/tgWebApp/.test(window.location.hash + window.location.search)) {
        throw new Error('Invalid Telegram launch.');
      }
      const preference = window.matchMedia('(prefers-color-scheme: dark)');
      const sync = () => syncTheme({}, preference.matches ? 'dark' : 'light');
      sync();
      preference.addEventListener('change', sync);
      disposers.push(() => preference.removeEventListener('change', sync));
      update({ ...snapshot, status: 'ready', initData: '' });
      return;
    }
    disposers.push(initSdk());
    themeParams.mount();
    miniApp.mount();
    const sync = () =>
      syncTheme(themeParams.state(), miniApp.isDark() ? 'dark' : 'light');
    sync();
    disposers.push(themeParams.state.sub(sync), miniApp.isDark.sub(sync));
    const initData = retrieveRawInitData() ?? '';
    // The timeout makes a missing host response an error instead of an endless loader.
    await viewport.mount({ timeout: 5000 });
    if (currentGeneration !== generation) return;
    syncInsets();
    disposers.push(
      viewport.safeAreaInsets.sub(syncInsets),
      viewport.contentSafeAreaInsets.sub(syncInsets),
    );
    update({ ...snapshot, status: 'ready', initData });
  } catch {
    if (currentGeneration !== generation) return;
    update({ ...snapshot, status: 'error', initData: '' });
  }
}

export const telegram = {
  init() {
    initialization ??= initialize(generation);
    return initialization;
  },
  ready() {
    if (snapshot.status === 'loading' || notified) return;
    try {
      // Reveal the error screen too if initialization failed after connecting.
      if (native) miniApp.ready();
      notified = true;
    } catch {
      update({ ...snapshot, status: 'error', initData: '' });
    }
  },
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  destroy() {
    generation++;
    for (const dispose of disposers.splice(0).reverse()) dispose();
    if (native) {
      // sdk-react 3.0.23 re-exports sdk 3.3.0, which has no viewport unmount.
      // init cleanup disconnects the host bridge.
      miniApp.unmount();
      themeParams.unmount();
    }
    initialization = undefined;
    native = false;
    notified = false;
    update({ ...snapshot, status: 'loading', initData: '' });
  },
};

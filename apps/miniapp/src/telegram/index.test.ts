import { afterEach, expect, it, vi } from 'vitest';
import { emitEvent, mockTelegramEnv } from '@tma.js/sdk-react';
import { telegram } from './index';

afterEach(() => {
  telegram.destroy();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
  document.documentElement.className = '';
});

it('uses an unauthenticated browser mock and follows system theme changes', async () => {
  const preference = new EventTarget();
  const media = Object.assign(preference, { matches: false });
  vi.stubGlobal('matchMedia', () => media);
  const first = telegram.init();
  expect(telegram.init()).toBe(first);
  await first;
  expect(telegram.getSnapshot()).toMatchObject({
    status: 'ready',
    initData: '',
    colourScheme: 'light',
  });
  media.matches = true;
  preference.dispatchEvent(new Event('change'));
  expect(telegram.getSnapshot().colourScheme).toBe('dark');
  expect(document.documentElement).toHaveClass('dark');
});

it('reports malformed Telegram launches as errors', async () => {
  window.history.replaceState(null, '', '/#tgWebAppThemeParams=broken');
  await telegram.init();
  expect(telegram.getSnapshot().status).toBe('error');
});

it('mounts the real SDK, preserves raw auth and follows host theme and safe areas', async () => {
  const raw = 'auth_date=1700000000&hash=test&signature=test&query_id=abc';
  const ready = vi.fn();
  mockTelegramEnv({
    launchParams: {
      tgWebAppVersion: '8.0',
      tgWebAppPlatform: 'tdesktop',
      tgWebAppData: raw,
      tgWebAppThemeParams: { bg_color: '#ffffff', text_color: '#222222' },
    },
    onEvent: ({ name }) => {
      if (name === 'web_app_request_safe_area')
        emitEvent('safe_area_changed', {
          top: 10,
          right: 0,
          bottom: 20,
          left: 0,
        });
      if (name === 'web_app_request_content_safe_area')
        emitEvent('content_safe_area_changed', {
          top: 30,
          right: 0,
          bottom: 0,
          left: 0,
        });
      if (name === 'web_app_request_viewport')
        emitEvent('viewport_changed', {
          height: 600,
          width: 375,
          is_expanded: true,
          is_state_stable: true,
        });
      if (name === 'web_app_ready') ready();
    },
  });
  await telegram.init();
  expect(telegram.getSnapshot()).toMatchObject({
    status: 'ready',
    initData: raw,
    colourScheme: 'light',
  });
  telegram.ready();
  telegram.ready();
  expect(ready).toHaveBeenCalledOnce();
  emitEvent('theme_changed', {
    theme_params: {
      bg_color: '#17212b',
      text_color: '#ffffff',
      button_color: '#123456',
    },
  });
  expect(telegram.getSnapshot().colourScheme).toBe('dark');
  expect(document.documentElement.style.getPropertyValue('--primary')).toBe(
    '#123456',
  );
  expect(document.documentElement.style.getPropertyValue('--safe-top')).toBe(
    '10px',
  );
  expect(
    document.documentElement.style.getPropertyValue('--content-safe-top'),
  ).toBe('30px');
  emitEvent('safe_area_changed', { top: 15, right: 0, bottom: 0, left: 0 });
  expect(document.documentElement.style.getPropertyValue('--safe-top')).toBe(
    '15px',
  );
});

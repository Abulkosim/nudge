import { afterEach, expect, it } from 'vitest';
import { applyTheme, themeVariables } from './theme';

afterEach(() => {
  document.documentElement.removeAttribute('style');
  document.documentElement.className = '';
});

it('maps Telegram colours to shadcn tokens', () => {
  const theme = {
    bg_color: '#101010',
    text_color: '#eeeeee',
    section_bg_color: '#202020',
    secondary_bg_color: '#303030',
    button_color: '#4080ff',
    button_text_color: '#ffffff',
    hint_color: '#aaaaaa',
    section_separator_color: '#444444',
    destructive_text_color: '#ff0000',
    link_color: '#70a0ff',
  };
  expect(themeVariables(theme, 'dark')).toMatchObject({
    '--background': '#101010',
    '--foreground': '#eeeeee',
    '--card': '#202020',
    '--primary': '#4080ff',
    '--primary-foreground': '#ffffff',
    '--muted': '#303030',
    '--muted-foreground': '#aaaaaa',
    '--border': '#444444',
    '--input': '#444444',
    '--ring': '#4080ff',
    '--destructive': '#ff0000',
    '--link': '#70a0ff',
  });
  applyTheme(theme, 'dark');
  expect(document.documentElement).toHaveClass('dark');
  expect(document.documentElement.style.getPropertyValue('--primary')).toBe(
    '#4080ff',
  );
  applyTheme({}, 'light');
  expect(document.documentElement).not.toHaveClass('dark');
  expect(document.documentElement.style.getPropertyValue('--background')).toBe(
    '#ffffff',
  );
});

it('falls back by scheme and rejects non-colour theme values', () => {
  expect(
    themeVariables({ bg_color: 'url(https://example.com)' }, 'dark')[
      '--background'
    ],
  ).toBe('#17212b');
  expect(themeVariables({}, 'light')['--foreground']).toBe('#222222');
});

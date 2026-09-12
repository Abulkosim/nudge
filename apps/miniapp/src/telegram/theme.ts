export type ColourScheme = 'light' | 'dark';
export type ThemeParams = Readonly<
  Partial<
    Record<
      | 'bg_color'
      | 'text_color'
      | 'hint_color'
      | 'link_color'
      | 'button_color'
      | 'button_text_color'
      | 'secondary_bg_color'
      | 'section_bg_color'
      | 'section_separator_color'
      | 'subtitle_text_color'
      | 'accent_text_color'
      | 'destructive_text_color',
      string
    >
  >
>;

export function themeVariables(theme: ThemeParams, scheme: ColourScheme) {
  const dark = scheme === 'dark';
  const colour = (value: string | undefined, fallback: string) =>
    value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
  const background = colour(theme.bg_color, dark ? '#17212b' : '#ffffff');
  const foreground = colour(theme.text_color, dark ? '#f5f5f5' : '#222222');
  const secondary = colour(
    theme.secondary_bg_color,
    dark ? '#232e3c' : '#f1f3f5',
  );
  const card = colour(theme.section_bg_color, background);
  const muted = colour(
    theme.subtitle_text_color ?? theme.hint_color,
    dark ? '#a3b1c2' : '#66717d',
  );
  const primary = colour(theme.button_color, dark ? '#5288c1' : '#2481cc');
  const primaryForeground = colour(theme.button_text_color, '#ffffff');
  const border = colour(
    theme.section_separator_color,
    dark ? '#3c4858' : '#dce1e6',
  );
  return {
    '--background': background,
    '--foreground': foreground,
    '--card': card,
    '--card-foreground': foreground,
    '--popover': card,
    '--popover-foreground': foreground,
    '--primary': primary,
    '--primary-foreground': primaryForeground,
    '--secondary': secondary,
    '--secondary-foreground': foreground,
    '--muted': secondary,
    '--muted-foreground': muted,
    '--accent': secondary,
    '--accent-foreground': colour(theme.accent_text_color, foreground),
    '--destructive': colour(
      theme.destructive_text_color,
      dark ? '#ff6b6b' : '#c93636',
    ),
    '--border': border,
    '--input': border,
    '--ring': primary,
    '--link': colour(theme.link_color, primary),
  };
}

export function applyTheme(theme: ThemeParams, scheme: ColourScheme) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeVariables(theme, scheme))) {
    root.style.setProperty(name, value);
  }
  root.classList.toggle('dark', scheme === 'dark');
  root.style.colorScheme = scheme;
  // Remove the early paint override once the complete theme is installed.
  root.style.removeProperty('background-color');
  root.style.removeProperty('color');
}

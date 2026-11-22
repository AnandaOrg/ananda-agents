// Theme: System, Light or Dark (dark by default). The choice is saved on the person (PATCH /me) and
// mirrored in a cookie so the server renders the right theme on the first paint.
import { THEMES, type Theme } from '@ananda-agents/shared';

export const THEME_COOKIE = 'aa_theme';

export function asTheme(v: string | undefined): Theme {
  return (THEMES as readonly string[]).includes(v ?? '') ? (v as Theme) : 'dark';
}

/** Apply a theme now (no reload) and remember it in the cookie. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

/** The theme actually showing, for the header's sun/moon button. */
export function resolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

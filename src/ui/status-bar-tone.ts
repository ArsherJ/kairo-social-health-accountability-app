import type { Scheme } from '../theme.ts';

const FIXED_LIGHT_ROUTES = new Set(['/sign-in']);

/** Sign-in stays fixed light; all other surfaces follow the selected scheme. */
export function surfaceScheme(pathname: string, scheme: Scheme): Scheme {
  return FIXED_LIGHT_ROUTES.has(pathname) ? 'light' : scheme;
}

/** Follow the focused surface, not a mounted tab or the phone alone. */
export function statusBarTone(pathname: string, dark: boolean): 'light' | 'dark' {
  return surfaceScheme(pathname, dark ? 'dark' : 'light') === 'dark' ? 'light' : 'dark';
}

import type { Scheme } from '../theme.ts';

const FIXED_LIGHT_ROUTES = new Set([
  '/sign-in',
  '/welcome',
  '/one-sky',
  '/mirror',
  '/connect',
  '/difficulty',
  '/privacy',
  '/name',
]);
const DEEP_BEATS = new Set(['/welcome', '/mirror', '/privacy']);

/** Authored onboarding scenes keep their palette, including shared controls. */
export function surfaceScheme(pathname: string, scheme: Scheme): Scheme {
  return FIXED_LIGHT_ROUTES.has(pathname) ? 'light' : scheme;
}

/** Follow the focused surface, not a mounted tab or the phone alone. */
export function statusBarTone(pathname: string, dark: boolean): 'light' | 'dark' {
  return DEEP_BEATS.has(pathname) || surfaceScheme(pathname, dark ? 'dark' : 'light') === 'dark'
    ? 'light'
    : 'dark';
}

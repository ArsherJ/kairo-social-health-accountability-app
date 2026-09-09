/** Follow the focused route, not mounted tabs, so stacked screens reset ink. */
export function statusBarTone(pathname: string, dark: boolean): 'light' | 'dark' {
  return pathname === '/welcome' || (pathname === '/' && dark) ? 'light' : 'dark';
}

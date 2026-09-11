import { describe, expect, it } from 'vitest';
import { statusBarTone, surfaceScheme } from './status-bar-tone.ts';

describe('focused screen status bar', () => {
  it('uses light ink on the dark Today scene', () => {
    expect(statusBarTone('/', true)).toBe('light');
  });
  it('follows the selected appearance on every tab and stacked screen', () => {
    expect(statusBarTone('/', false)).toBe('dark');
    for (const path of ['/profile', '/flock', '/sky', '/settings']) {
      expect(statusBarTone(path, true)).toBe('light');
      expect(statusBarTone(path, false)).toBe('dark');
    }
  });
  it('lets every onboarding beat follow the selected appearance', () => {
    for (const path of [
      '/welcome',
      '/one-sky',
      '/mirror',
      '/connect',
      '/difficulty',
      '/privacy',
      '/name',
    ]) {
      expect(surfaceScheme(path, 'light')).toBe('light');
      expect(surfaceScheme(path, 'dark')).toBe('dark');
      expect(statusBarTone(path, false)).toBe('dark');
      expect(statusBarTone(path, true)).toBe('light');
    }
  });
  it('keeps sign-in fixed to light', () => {
    expect(surfaceScheme('/sign-in', 'dark')).toBe('light');
    expect(statusBarTone('/sign-in', true)).toBe('dark');
  });
});

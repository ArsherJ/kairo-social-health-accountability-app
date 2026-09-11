import { describe, expect, it } from 'vitest';
import { statusBarTone, surfaceScheme } from './status-bar-tone.ts';

describe('focused screen status bar', () => {
  it('uses light ink on the dark Today scene and welcome beat', () => {
    expect(statusBarTone('/', true)).toBe('light');
    expect(statusBarTone('/welcome', false)).toBe('light');
  });
  it('follows the selected appearance on every tab and stacked screen', () => {
    expect(statusBarTone('/', false)).toBe('dark');
    for (const path of ['/profile', '/flock', '/sky', '/settings']) {
      expect(statusBarTone(path, true)).toBe('light');
      expect(statusBarTone(path, false)).toBe('dark');
    }
  });
  it('keeps authored onboarding surfaces independent of the saved preference', () => {
    for (
      const path of [
        '/welcome',
        '/one-sky',
        '/mirror',
        '/connect',
        '/difficulty',
        '/privacy',
        '/name',
        '/sign-in',
      ]
    ) {
      expect(surfaceScheme(path, 'dark')).toBe('light');
    }
    for (const path of ['/welcome', '/mirror', '/privacy']) {
      expect(statusBarTone(path, false)).toBe('light');
    }
    for (const path of ['/connect', '/name', '/sign-in', '/difficulty', '/one-sky']) {
      expect(statusBarTone(path, true)).toBe('dark');
    }
    expect(surfaceScheme('/settings', 'dark')).toBe('dark');
  });
});

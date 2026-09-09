import { describe, expect, it } from 'vitest';
import { statusBarTone } from './status-bar-tone.ts';

describe('focused screen status bar', () => {
  it('uses light ink on the dark Today scene and welcome beat', () => {
    expect(statusBarTone('/', true)).toBe('light');
    expect(statusBarTone('/welcome', false)).toBe('light');
  });
  it('restores dark ink for light Today and other light surfaces', () => {
    expect(statusBarTone('/', false)).toBe('dark');
    for (const path of ['/profile', '/flock', '/sky', '/settings']) {
      expect(statusBarTone(path, true)).toBe('dark');
    }
  });
});

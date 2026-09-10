import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_OPTIONS,
  DEFAULT_APPEARANCE,
  appearanceHelp,
  parseAppearance,
  resolveScheme,
} from './appearance.ts';

describe('resolveScheme', () => {
  it('follows the phone on the default preference', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
  });

  it('reads a phone that reports nothing as light — never a silent flip to dark', () => {
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
  });

  it('lets an explicit preference win over the phone', () => {
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
  });
});

describe('parseAppearance', () => {
  it('accepts the three preferences and nothing else', () => {
    expect(parseAppearance('light')).toBe('light');
    expect(parseAppearance('dark')).toBe('dark');
    expect(parseAppearance('system')).toBe('system');
    expect(parseAppearance('auto')).toBe(DEFAULT_APPEARANCE);
    expect(parseAppearance(undefined)).toBe(DEFAULT_APPEARANCE);
    expect(parseAppearance(42)).toBe(DEFAULT_APPEARANCE);
  });

  it('defaults to following the phone', () => {
    expect(DEFAULT_APPEARANCE).toBe('system');
    expect(APPEARANCE_OPTIONS[0]?.value).toBe('system');
  });
});

describe('the Settings copy', () => {
  it('has a line for every option and none names a scheme it does not set', () => {
    for (const option of APPEARANCE_OPTIONS) {
      expect(appearanceHelp(option.value).length).toBeGreaterThan(0);
    }
    expect(appearanceHelp('light')).not.toMatch(/night/i);
    expect(appearanceHelp('dark')).not.toMatch(/daylight/i);
  });
});

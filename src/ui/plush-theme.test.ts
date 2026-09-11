import { describe, expect, it } from 'vitest';
import { dark, light } from '../theme.ts';
import { contrastRatio } from './contrast.ts';

describe('the plush palette', () => {
  it('uses warm grounds and a shared apricot fill', () => {
    expect(light.colors.bg.toLowerCase()).toBe('#fbf8f2');
    expect(light.colors.text.toLowerCase()).toBe('#382b29');
    expect(dark.colors.bg.toLowerCase()).toBe('#211c23');
    expect(dark.colors.surface.toLowerCase()).toBe('#302932');
    expect(dark.colors.text.toLowerCase()).toBe('#faf3eb');
    for (const theme of [light, dark]) {
      expect(theme.colors.accent.toLowerCase()).toBe('#f4af82');
    }
  });

  it('reads on the page, card, and supporting washes in either scheme', () => {
    for (const theme of [light, dark]) {
      for (const bg of [
        theme.colors.bg,
        theme.colors.surface,
        theme.ramp.sage[200],
        theme.ramp.teal[200],
      ]) {
        expect(contrastRatio(theme.colors.text, bg)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(theme.ramp.sage[800], theme.ramp.sage[200])).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrastRatio(theme.colors.ink, theme.colors.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

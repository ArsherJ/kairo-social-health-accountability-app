import { expect, it } from 'vitest';
import { screenPalette } from '../theme.ts';
import { contrastRatio } from './contrast.ts';
it.each(Object.entries(screenPalette))(
  '%s reading surfaces meet body text contrast',
  (_name, palette) => {
    for (const foreground of [palette.text, palette.muted]) {
      for (const background of [palette.background, palette.surface]) {
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  },
);

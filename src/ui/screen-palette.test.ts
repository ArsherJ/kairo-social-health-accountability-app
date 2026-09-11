import { expect, it } from 'vitest';
import { themes } from '../theme.ts';
import { contrastRatio } from './contrast.ts';
it.each(Object.entries(themes))(
  '%s reading surfaces meet body text contrast',
  (_name, { colors: palette }) => {
    for (const foreground of [palette.text, palette.subtle]) {
      for (const background of [palette.bg, palette.surface]) {
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  },
);

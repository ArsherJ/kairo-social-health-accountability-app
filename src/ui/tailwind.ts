import { create } from 'twrnc';
import { colors, radius, space } from '../theme.ts';

/** Tailwind utilities, resolved to native styles. No additional native runtime. */
export const tw = create({
  theme: {
    extend: {
      colors,
      spacing: Object.fromEntries(Object.entries(space).map(([key, value]) => [key, `${value}px`])),
      borderRadius: Object.fromEntries(
        Object.entries(radius).map(([key, value]) => [key, `${value}px`]),
      ),
    },
  },
});

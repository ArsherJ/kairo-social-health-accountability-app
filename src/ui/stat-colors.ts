import type { CoreStat } from '@kairo/core';
import { colors, ramp } from '../theme.ts';

/**
 * The stats as colours, which Sunlit deliberately did not have.
 *
 * Through Sunlit the rule was "there is no per-stat hue and there should not be
 * one" — four colours competing is what buried the tier coins the stat rail
 * replaced, and that palette's three families were all spoken for.
 *
 * Playful reverses it, because Playful asks the glyphs to do a job Sunlit never
 * did. A Flock row carries four stat figures at 11pt with no words beside them;
 * a quest is a ring with a glyph in it and no headline. At that size and that
 * density, shape alone is not enough to tell three things apart at a glance —
 * `shoe-print`, `arm-flex` and `brain` are distinguishable when you look and
 * not when you scan. Colour is what makes the row scannable, and the design
 * assigns one per stat throughout.
 *
 * The hues are **not new**, which is what keeps this from being the four-way
 * competition the old rule guarded against: Motion takes the accent (you, your
 * day), Body takes coral (the streak's hue, and the one that means effort), and
 * Mind takes sage — which Sunlit already spent on rest-adjacent surfaces and
 * Playful renders violet. No stat gets gold, because gold means *earned* and a
 * stat is not an achievement.
 *
 * **These are fills and glyph colours, never text colours.** `colors.accent`
 * and `colors.coral` both fail as body text on cream — `contrast.test.ts` pins
 * that — so a caller wanting to *write* a stat's name in its colour needs the
 * matching ink (`accentDeep`, `damage`, `ramp.sage[700]`), not this table.
 *
 * **In its own module, and imported here by relative path**, because it lived
 * in `StatIcon.tsx` and was therefore unreachable from a test: that file
 * reaches `@expo/vector-icons` and so React Native's Flow syntax, which root
 * Vitest cannot parse. That is the same move `stat-names.ts` made out of the
 * same file. `StatIcon.tsx` re-exports this, so no call site moved.
 */
export const STAT_COLORS = {
  AGI: colors.accent,
  STR: colors.coral,
  MND: ramp.sage[500],
} as const satisfies Record<CoreStat, string>;

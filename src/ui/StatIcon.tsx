import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { CoreStat } from '@kairo/core';
import { colors, ramp } from '../theme.ts';

/**
 * The stats as glyphs.
 *
 * Three surfaces render stat identity — the rail coins (`StatCoin`), the
 * expanded bars (`StatBar`) and a squadmate's row (`LeaderboardRow`). They read
 * the same two tables here so they cannot drift, which is the lesson from
 * `tierColors` living in `theme.ts`: the character screen and the squad screen
 * once painted the same stat two different colours because each owned its own
 * copy of the mapping.
 *
 * **MaterialCommunityIcons, which is now the app's only icon family.** From
 * 2026-08-11 this file was the *exception* — solid glyphs for character data
 * against Feather's hairlines for chrome. Playful retired that split by
 * following its own reasoning to the other end: the argument was that a 2px
 * hairline glyph beside a fat display numeral reads as a clerical annotation
 * rather than as part of it, and Playful sets the entire surface in that
 * register. `TabPill` carries the full account.
 */
const ICONS = {
  // Steps and distance. Deliberately *not* `run-fast`: the character screen's
  // whole subject is a human figure standing in the diorama, and a second,
  // 18pt human figure floating on the rail beside them reads as a smaller copy
  // of the character rather than as a label. A footprint says the same thing —
  // more literally, since AGI is driven by steps — with no figure in it.
  AGI: 'shoe-print',
  // Active calories. `arm-flex` over `dumbbell` on content grounds: Kairo is
  // phone-only and requires no equipment (§5), so equipment iconography would
  // promise a gym the app never asks for. A bicep is the body, which is what
  // actually changes here.
  STR: 'arm-flex',
  // Sleep, promoted from the REC bonus (roadmap deviation #41). A brain
  // rather than a moon or a bed: the other glyphs are a body part and the
  // activity itself, and "the organ this stat trains" keeps the same register.
  MND: 'brain',
} as const satisfies Record<CoreStat, React.ComponentProps<typeof MaterialCommunityIcons>['name']>;

/**
 * Re-exported so the seven existing call sites keep one import for a stat's
 * glyph and its name. The table itself lives in `stat-names.ts`, which imports
 * nothing at runtime and can therefore be tested — this file cannot, because
 * `@expo/vector-icons` reaches React Native's Flow syntax.
 */
export { STAT_NAMES, dominanceName } from './stat-names.ts';

/**
 * The stats as colours, which Sunlit deliberately did not have.
 *
 * Through Sunlit the rule here was "there is no per-stat hue and there should
 * not be one" — four colours competing is what buried the tier coins the stat
 * rail replaced, and that palette's three families were all spoken for.
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
 */
export const STAT_COLORS = {
  AGI: colors.accent,
  STR: colors.coral,
  MND: ramp.sage[500],
} as const satisfies Record<CoreStat, string>;

/**
 * One stat glyph.
 *
 * Hidden from assistive tech by default: every caller either sits inside a
 * control that names the stat itself, or draws the abbreviation beside it, and
 * an icon that announced its own name would double-read both cases. A caller
 * that genuinely needs the glyph announced passes its own label instead.
 *
 * Colour defaults to the stat's own hue (`STAT_COLORS`); passing `color`
 * overrides it, which is what a glyph inside an already-coloured surface needs
 * — a white icon on a filled pill.
 */
export function StatIcon({
  stat,
  size,
  color,
}: {
  stat: CoreStat;
  size: number;
  /** Defaults to the stat's own hue. Pass one to override on a filled ground. */
  color?: string;
}) {
  return (
    <MaterialCommunityIcons
      name={ICONS[stat]}
      size={size}
      color={color ?? STAT_COLORS[stat]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

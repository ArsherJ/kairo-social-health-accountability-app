import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { CoreStat } from '@kairo/core';

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
 * **Why this is MaterialCommunityIcons when everything else is Feather.**
 * Not because Feather lacks a bicep — though it does. The split is by register:
 *
 *   - **Feather, 2px hairline** — chrome. Nav discs, back arrows, chevrons.
 *     Things you *operate*.
 *   - **MaterialCommunityIcons, solid** — character data. Things you *are*.
 *
 * The coin is Caprasimo, a fat display face, and a hairline glyph sitting
 * beside a Caprasimo numeral reads as a clerical annotation of a number rather
 * than as part of it. A solid glyph is in the same ink-weight class as the type
 * it stands with. Keep the split total in both directions — a solid glyph in
 * the nav, or a hairline one on a stat, and this stops reading as a decision.
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
 * One stat glyph.
 *
 * Hidden from assistive tech by default: every caller either sits inside a
 * control that names the stat itself, or draws the abbreviation beside it, and
 * an icon that announced its own name would double-read both cases. A caller
 * that genuinely needs the glyph announced passes its own label instead.
 *
 * Colour is always the caller's — there is no per-stat hue and there should not
 * be one. Four colours competing is what buried the tier coins this rail
 * replaced, and the system reserves its three hues for other jobs entirely
 * (terracotta = you, sage = your lane, burnt = a goal slipping).
 */
export function StatIcon({
  stat,
  size,
  color,
}: {
  stat: CoreStat;
  size: number;
  color: string;
}) {
  return (
    <MaterialCommunityIcons
      name={ICONS[stat]}
      size={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

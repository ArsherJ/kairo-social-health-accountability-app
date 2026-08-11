import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { CoreStat } from '@kairo/core';

/**
 * The four stats as glyphs.
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
  // Active minutes. A stopwatch, not `timer-sand` — an hourglass means time
  // running *out*, and END is time you put *in*. The stopwatch is also the
  // instrument the activity itself uses.
  END: 'timer',
  // Hourly movement, and it rhymes with the strain and heart-rate surfaces on
  // the TODAY panel, which read the same underlying signal.
  VIT: 'heart-pulse',
} as const satisfies Record<CoreStat, React.ComponentProps<typeof MaterialCommunityIcons>['name']>;

/**
 * The stats said in full, for screen readers.
 *
 * **Load-bearing, not decoration.** The coins carry no text at all, so this is
 * the entire accessible name of a stat on the rail — the same status
 * `TabPill`'s `LABELS` map has for the nav.
 */
export const STAT_NAMES: Record<CoreStat, string> = {
  AGI: 'Agility',
  STR: 'Strength',
  END: 'Endurance',
  VIT: 'Vitality',
};

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

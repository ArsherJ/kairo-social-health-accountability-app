import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';
import { CORE_STATS, ratingForStatPoints, type CoreStat } from '@kairo/core';
import { colors, font, radius, ramp, shadow, space } from '@/theme.ts';
import { Glass, Meter, Numeral, STAT_COLORS, StatIcon, Text } from '@/ui/index.ts';
import { STAT_NAMES } from '@/ui/StatIcon.tsx';

/**
 * The HUD that floats over the character's sky.
 *
 * Three groups, and the layout is **flow-based within each** — the 2026-08-14
 * rule, which this screen is the original home of. The character HUD was the
 * app's only absolutely-positioned chrome, pinned at `+8`/`+48`/`+48`/`+132`
 * against pill heights nothing enforced, and at large Dynamic Type the pills
 * grew past each other and overlapped. The *groups* are positioned here (a HUD
 * has to sit over a picture), but nothing inside a group is, and no child
 * carries a `top`.
 *
 * Everything here is glass, which is what lets it sit on a picture at all —
 * see `Glass` for why that is a translucent fill and not a blur, and why it
 * must stay one.
 */

/**
 * Level, XP and streak: the row across the top of the sky.
 *
 * Two elements, not five. The level disc, the number and the XP meter are one
 * proposition and read as one stop; the streak is genuinely separate and gets
 * its own. Both halves of the grouping fix on each, because the documented
 * collapse did not happen on the 2026-08-14 build and removing either half is
 * how twelve-stops-per-row comes back.
 */
export function TodayChips({
  level,
  xp,
  streak,
}: {
  level: number;
  xp: { fraction: number; intoLevel: number; neededForNext: number };
  streak: number;
}) {
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View style={styles.chipRow}>
      <Glass
        tone="light"
        radius={radius.pill}
        style={styles.levelChip}
        // `Glass` renders a plain View, so the accessibility props go on the
        // wrapper below rather than on it.
      >
        <View
          accessible
          accessibilityLabel={
            `Level ${level}, ${xp.intoLevel.toLocaleString()} of ` +
            `${xp.neededForNext.toLocaleString()} XP`
          }
          style={styles.levelBody}
        >
          <View {...hidden} style={styles.levelDisc}>
            <Text scale="fixed" style={styles.levelNumber}>
              {level}
            </Text>
          </View>
          {/* The meter alone, with no figure beside it. The label above spells
              the XP out, so the painted number the Sunlit pill carried was a
              second reading of a thing the shape already says — and this pill
              sits on a picture, where every extra glyph costs legibility. */}
          <View {...hidden} style={styles.levelMeter}>
            <Meter fraction={xp.fraction} color={colors.accent} height={8} />
          </View>
        </View>
      </Glass>

      {/* "3 day streak", not "3-day": the hyphenated form is right on screen
          and wrong out loud, the same rule `row-label.ts` tests. */}
      {streak > 0 && (
        <View
          accessible
          accessibilityLabel={`${streak} day streak`}
          style={styles.streakChip}
        >
          {/* Ink on the coral, not cream — `colors.coral` is a fill and cream
              on it measures 2.93:1. Same rule as `colors.accent`, same trap. */}
          <MaterialCommunityIcons
            {...hidden}
            name="fire"
            size={17}
            color={colors.text}
          />
          <Text {...hidden} scale="fixed" style={styles.streakNumber}>
            {streak}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * The three masteries, as a column of glass coins down the right of the sky.
 *
 * **Gated to `full` by the caller** (deviation #37), and that gate is the whole
 * reason this is its own component rather than three more children of
 * `TodayChips`: the stat rail moved to the You tab when the character and Today
 * screens merged, and putting an ungated copy of the same three figures on the
 * screen a brand-new account opens first would quietly undo the disclosure
 * rule. What is drawn here is the same `ratingForStatPoints` over the same
 * lifetime rollups the rail reads — one source, two surfaces.
 *
 * One element for the column, not three: three coins are one proposition
 * ("where you are strong"), and the same reasoning `StatRail` applies to its
 * own row. `StatCoin` is deliberately not reused — it is built for the cream
 * ground and carries its own fill, where these have to be glass on a picture.
 */
export function TodayStatCoins({
  ratings,
}: {
  ratings: Partial<Record<CoreStat, number>> | undefined;
}) {
  const spoken = CORE_STATS.map(
    (stat) => `${STAT_NAMES[stat]} ${ratingForStatPoints(ratings?.[stat] ?? 0)}`,
  ).join(', ');

  return (
    <View accessible accessibilityLabel={spoken} style={styles.coins}>
      {CORE_STATS.map((stat) => (
        <Glass
          key={stat}
          tone="light"
          radius={22}
          style={styles.coin}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.coinBody}
          >
            <StatIcon stat={stat} size={19} color={STAT_COLORS[stat]} />
            <Text scale="fixed" style={styles.coinNumber}>
              {ratingForStatPoints(ratings?.[stat] ?? 0)}
            </Text>
          </View>
        </Glass>
      ))}
    </View>
  );
}

/**
 * The day, in real units, at the foot of the sky.
 *
 * One number per screen, and **never a score total** (deviation #34). The
 * figure is `colors.text` rather than the accent: at 62pt on a pale sky the ink
 * is what reads, and the orange is already spent on the footprint beside it —
 * which is the same split `accentInk` exists to manage, resolved here in favour
 * of the glyph carrying the colour and the numeral carrying the weight.
 *
 * `Numeral` is tabular, so a live refetch does not make it jitter, and one
 * accessible element rather than two — ungrouped, VoiceOver stops on the bare
 * numeral and then on the unit.
 */
export function TodayCount({ steps }: { steps: number }) {
  return (
    <View
      accessible
      accessibilityLabel={`${steps.toLocaleString()} steps today`}
      style={styles.count}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        // `flexWrap`, because this is the widest thing on the screen: six
        // display glyphs at hero size plus the footprint already crowd a 320pt
        // screen before Dynamic Type touches it.
        style={styles.countRow}
      >
        <MaterialCommunityIcons
          name="shoe-print"
          size={26}
          color={colors.accent}
          style={styles.countGlyph}
        />
        <Numeral value={steps} size="hero" color={colors.text} animate />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  // Two content-sized chips in a row overflow rather than wrap, and RN defaults
  // `flexShrink` to 0. The level chip is the one that grows, so it yields.
  levelChip: { flexShrink: 1, paddingVertical: 6, paddingHorizontal: 6 },
  levelBody: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  levelDisc: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ramp.accent[200],
  },
  levelNumber: { ...font.display.small, color: colors.accentDeep },
  levelMeter: { width: 52, paddingRight: space.sm },

  streakChip: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: space.sm,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.coral,
    ...shadow.md,
  },
  streakNumber: { ...font.display.small, fontSize: 16, color: colors.text },

  coins: { alignSelf: 'flex-end', gap: 10, paddingRight: space.lg },
  coin: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  coinBody: { alignItems: 'center', justifyContent: 'center', gap: 1 },
  coinNumber: { ...font.display.label, fontSize: 15, color: colors.text },

  count: { paddingHorizontal: space.lg },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space.sm },
  countGlyph: { paddingBottom: 12 },
});

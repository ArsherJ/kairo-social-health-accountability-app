import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { Gradient, Panel, Text } from '@/ui/index.ts';
import type { Stop } from '@/ui/gradient.ts';
import { monthGrid } from './month-grid.ts';

/** A cleared day: gold into orange, which is `earnedColor` running into "you". */
const CLEARED: Stop[] = [
  { color: ramp.gold[400], at: 0 },
  { color: colors.accent, at: 1 },
];

/**
 * The month, as a run of cleared days.
 *
 * The one genuinely new surface on the You tab. Everything else there was
 * already saying *where you stand*; this is the first that says *what you have
 * been doing*, which is the question a streak number implies and never answers
 * — "12 days" tells you nothing about the eleven weeks before it.
 *
 * **A cleared day is a cleared Daily Walk**, read from `useWalkHistory` — the
 * same rows the streak counts, so the calendar and the streak cannot disagree.
 * That history reads `tiers->>'AGI_base'`, the *unshifted* ladder, which is the
 * whole reason this needs no new column and no new query: the walk baseline is
 * a public-health number that must not move with the user, and `AGI` would
 * bring it to gold at 7,500 steps on an eight-active-hour day.
 *
 * **Three states, not two.** Cleared, short, and *still to come* — a day after
 * today is drawn quiet and is not a miss. On the 3rd of the month a two-state
 * grid shows twenty-eight failures for days that have not happened, which is a
 * worse thing to put in front of somebody than no calendar. `month-grid.ts`
 * owns that distinction and is tested on it.
 *
 * The grid is `flexWrap` over seven columns rather than a real grid: React
 * Native has no `grid-template-columns`, and a wrapped row of `14.28%` cells is
 * the same picture with no measuring.
 */
export function ClearedCalendar({
  today,
  clearedDates,
}: {
  /** The player's own local date (§2), never `new Date()`. */
  today: string | undefined;
  clearedDates: readonly string[];
}) {
  if (!today) return null;

  const grid = monthGrid(today, clearedDates);
  if (grid.cells.length === 0) return null;

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <>
      <View style={styles.head}>
        <Text scale="chrome" style={styles.month}>
          {monthName(grid.month)}
        </Text>
        <View
          accessible
          accessibilityLabel={`${grid.cleared} days cleared this month`}
          style={styles.countChip}
        >
          <MaterialCommunityIcons {...hidden} name="fire" size={14} color={colors.accent} />
          <Text {...hidden} scale="fixed" style={styles.countLabel}>
            {grid.cleared} cleared
          </Text>
        </View>
      </View>

      <Panel style={styles.card}>
        <View {...hidden} style={styles.week}>
          {/* Sunday-first, matching `weekdayOf`'s 0 = Sunday. Initials only,
              and hidden: "S M T W T F S" read aloud is noise, and every cell
              below already names its own full date. */}
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((letter, i) => (
            <View key={i} style={styles.cell}>
              <Text scale="fixed" style={styles.weekLetter}>
                {letter}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.grid}>
          {grid.cells.map((cell, i) => {
            if (cell.kind === 'blank') {
              return <View key={`b${i}`} {...hidden} style={styles.cell} />;
            }

            if (cell.kind === 'future') {
              return (
                <View key={cell.date} {...hidden} style={styles.cell}>
                  <View style={[styles.box, styles.boxFuture]}>
                    <Text scale="fixed" style={styles.futureNumber}>
                      {cell.day}
                    </Text>
                  </View>
                </View>
              );
            }

            return (
              <View
                key={cell.date}
                accessible
                // Each day names itself in full. A grid of thirty-one bare
                // numerals is thirty-one stops that each say "14".
                accessibilityLabel={
                  `${cell.date}${cell.isToday ? ', today' : ''}, ` +
                  `${cell.cleared ? 'cleared' : 'short of the daily walk'}`
                }
                style={styles.cell}
              >
                <View
                  {...hidden}
                  style={[
                    styles.box,
                    cell.cleared ? styles.boxCleared : styles.boxShort,
                    cell.isToday && styles.boxToday,
                  ]}
                >
                  {cell.cleared && <Gradient stops={CLEARED} steps={6} style={styles.fill} />}
                  <Text
                    scale="fixed"
                    style={cell.cleared ? styles.clearedNumber : styles.shortNumber}
                  >
                    {cell.day}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* The key. Three swatches for three states, which is the minimum a
            reader needs to know that a pale square is not a failure. */}
        <View {...hidden} style={styles.legend}>
          <Legend fill={ramp.gold[400]} label="cleared" />
          <Legend fill={ramp.accent[200]} label="short" />
          <Legend fill={ramp.neutral[200]} label="to come" />
        </View>
      </Panel>
    </>
  );
}

function Legend({ fill, label }: { fill: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: fill }]} />
      <Text scale="fixed" style={styles.legendLabel}>
        {label}
      </Text>
    </View>
  );
}

/**
 * "August 2026" from "2026-08".
 *
 * `Intl` rather than a hand-written table, and given an explicit UTC zone: the
 * only `Date` in this feature, built from parts that are already the player's
 * own local month, so there is no zone for it to drift against. Formatting a
 * month name is the one job a local date string genuinely cannot do itself.
 */
function monthName(month: string): string {
  const [year, m] = month.split('-');
  const date = new Date(Date.UTC(Number(year), Number(m) - 1, 1));
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  month: { ...font.display.minor, color: colors.text, flexShrink: 1 },
  countChip: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: ramp.accent[200],
  },
  countLabel: { ...font.body.strong, color: colors.accentDeep },

  card: { paddingVertical: space.md, paddingHorizontal: 14 },
  week: { flexDirection: 'row' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  // Seven equal columns by percentage. A fixed cell width is the two-column
  // row that could not fit past ~1.3x Dynamic Type, in a new place.
  cell: { width: CELL, alignItems: 'center', paddingVertical: 3 },
  weekLetter: { ...font.body.strong, fontSize: 10.5, color: ramp.neutral[500] },
  box: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: { borderRadius: 14 },
  boxCleared: { backgroundColor: ramp.gold[400] },
  boxShort: { backgroundColor: ramp.accent[200] },
  boxFuture: { backgroundColor: ramp.neutral[200] },
  // A ring, not a fill: today may be cleared or short, and a fill would have to
  // replace whichever it is.
  boxToday: { borderWidth: 2.5, borderColor: colors.accent },
  // Ink on gold, never cream — gold is a fill and cream on it is 1.52:1.
  clearedNumber: { ...font.body.body, fontSize: 12, color: colors.text },
  shortNumber: { ...font.body.body, fontSize: 12, color: ramp.neutral[600] },
  futureNumber: { ...font.body.body, fontSize: 12, color: ramp.neutral[500] },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 5 },
  legendLabel: { ...font.body.strong, fontSize: 11, color: colors.muted },
});

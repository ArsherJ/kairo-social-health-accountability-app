import { StyleSheet, View } from 'react-native';
import { colors, font, ramp, space } from '@/theme.ts';
import { Meter, Text } from '@/ui/index.ts';
import {
  fillFraction,
  goalTone,
  paceFraction,
  progressLine,
  statusLine,
} from './goal-copy.ts';
import type { Standing } from './queries.ts';
import type { GoalRow } from './queries.ts';

/**
 * One goal's progress, as a title, a meter and a line of status.
 *
 * The meter carries a **pace marker** — a hairline tick at where the fill should
 * have reached by today. That is the whole difference between a goal and a
 * tally: "42,300 of 60,000" is either fine or a disaster depending on how much
 * of the window is gone, and the marker is what says which without making the
 * reader do the division.
 *
 * The fill colour is the same answer in colour form, and it is the one place the
 * burnt family appears now that sabotage is gone (`src/theme.ts`): terracotta
 * while a goal is yours to win, sage once it is won, burnt when it is slipping.
 */
export function GoalBar({
  row,
  standing,
  windowDays,
  showTitle = true,
}: {
  row: GoalRow;
  standing: Standing;
  /** Null for an open-ended goal, which is what suppresses the pace marker. */
  windowDays: number | null;
  showTitle?: boolean;
}) {
  const { progress } = standing;
  const tone = goalTone(progress);

  // One element rather than three. The pace marker needs no separate
  // announcement — `statusLine` already puts "behind pace" into words, which
  // is why `Meter` stays hidden here rather than being given a label that
  // would say the same thing again in percentages.
  const spokenLabel = [
    showTitle ? row.title : null,
    progressLine(row.kind, progress),
    statusLine(progress),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View accessible accessibilityLabel={spokenLabel}>
      {showTitle && (
        <Text scale="chrome" style={styles.title} numberOfLines={1}>
          {row.title}
        </Text>
      )}

      <View style={styles.numbers}>
        <Text scale="chrome" style={styles.progress}>
          {progressLine(row.kind, progress)}
        </Text>
        <Text scale="chrome" style={[styles.status, styles[tone]]}>
          {statusLine(progress)}
        </Text>
      </View>

      <Meter
        fraction={fillFraction(progress)}
        color={FILL[tone]}
        pace={paceFraction(progress, windowDays) ?? undefined}
        height={8}
      />
    </View>
  );
}

/**
 * Three tones, three jobs — the rule `src/theme.ts` states for the whole app.
 * `done` is sage because a finished goal is an earned thing, not a live one.
 */
const FILL: Record<'done' | 'ok' | 'behind', string> = {
  done: ramp.sage[600],
  ok: colors.accent,
  behind: colors.damage,
};

const styles = StyleSheet.create({
  title: { ...font.display.small, fontSize: 16, color: colors.text },
  numbers: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: space.xs,
    marginBottom: 6,
  },
  progress: { ...font.display.minor, fontSize: 17, color: colors.text, flexShrink: 1 },
  status: { ...font.body.strong, fontSize: 11.5, textAlign: 'right' },
  done: { color: ramp.sage[800] },
  ok: { color: ramp.neutral[700] },
  behind: { color: ramp.accent[900] },
});

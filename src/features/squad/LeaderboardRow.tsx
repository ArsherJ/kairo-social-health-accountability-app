import { StyleSheet, Text, View } from 'react-native';
import { CORE_STATS } from '@kairo/core';
import { boostChipLabel } from './program-copy.ts';
import type { LeaderboardMode, LeaderboardRow as Row } from './queries.ts';
import { colors, font, ramp, radius, space, tierColor } from '@/theme.ts';
import { Avatar, Numeral } from '@/ui/index.ts';

/**
 * One squadmate.
 *
 * Tiers are deliberately the only per-stat detail on this screen: §5 lets
 * squadmates see tiers and totals, never raw steps or hourly movement, so
 * there is no number here to accidentally widen into one.
 *
 * They are dots rather than labelled pills now. Four labelled pills across six
 * rows is twenty-four things to read before you find the one number that
 * ranks anybody, and the stat names never changed row to row — only the
 * colours did, which is exactly what a dot carries.
 */
export function LeaderboardRow({
  row,
  mode,
}: {
  row: Row;
  mode: LeaderboardMode;
}) {
  const isLeader = row.rank === 1;

  // Only on your own row. The character screen shows the *unweighted* total
  // for the same day — stored scores are program-independent (deviation #11) —
  // so anyone who compares the two numbers will find them different. The chip
  // is the explanation; hiding the gap would cost trust in the score.
  const boost = row.is_self ? boostChipLabel(row.program) : null;

  return (
    <View
      style={[
        styles.row,
        isLeader && styles.leader,
        row.is_self && styles.self,
      ]}
    >
      <Text style={[styles.rank, row.is_self && styles.rankSelf]}>{row.rank}</Text>

      <Avatar name={row.character_name} self={row.is_self} />

      <View style={styles.middle}>
        <View style={styles.nameLine}>
          <Text
            style={[styles.name, row.is_self && styles.nameSelf]}
            numberOfLines={1}
          >
            {row.character_name}
          </Text>
          {row.is_self && (
            <View style={styles.youChip}>
              <Text style={styles.you}>YOU</Text>
            </View>
          )}
        </View>

        <View style={styles.metaLine}>
          <Text style={styles.meta}>Lv {row.level}</Text>

          {/* The RPC returns TODAY's streak whatever day is ranked, so on the
              completed board the number and the date would disagree. Showing
              it only on the live board removes the mismatch at zero cost —
              a deliberate choice, not an omission. */}
          {mode === 'current' && row.current_streak > 0 && (
            <Text style={styles.meta}>· {row.current_streak}-day streak</Text>
          )}

          {mode === 'completed' && row.status === 'provisional' && (
            <Text style={styles.meta}>· not final yet</Text>
          )}

          {/* §20 social anti-cheat. A marker the squad can see, never a ban
              and never a score reduction — so it reads as a note, not a
              verdict. */}
          {row.flagged && (
            <View style={styles.flaggedChip}>
              <Text style={styles.flagged}>flagged</Text>
            </View>
          )}

          {boost && (
            <View style={styles.boostChip}>
              <Text style={styles.boostLabel}>{boost}</Text>
            </View>
          )}

          <View style={styles.dots}>
            {CORE_STATS.map((stat) => (
              <View
                key={stat}
                // The stat name is gone from the dot, so it has to survive in
                // the label — otherwise the row announces four unnamed colours.
                accessibilityLabel={`${stat} ${row.tiers?.[stat] ?? 'no tier'}`}
                style={[styles.dot, { backgroundColor: tierColor(row.tiers?.[stat]) }]}
              />
            ))}
          </View>
        </View>
      </View>

      <Numeral
        value={row.total}
        size="minor"
        color={row.is_self ? ramp.accent[800] : colors.text}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
    paddingVertical: 14,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  leader: { backgroundColor: ramp.sage[200] },
  // Your own row wins over the leader tint when you are both — being first is
  // already said by the rank, and losing track of yourself in your own squad
  // is the worse failure.
  self: { backgroundColor: ramp.accent[200], borderWidth: 2, borderColor: ramp.accent[500] },
  rank: { ...font.display.minor, width: 18, color: ramp.neutral[600] },
  rankSelf: { color: ramp.accent[800] },
  middle: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { ...font.display.small, fontSize: 17, color: colors.text, flexShrink: 1 },
  nameSelf: { color: ramp.accent[900] },
  youChip: {
    backgroundColor: colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  you: { ...font.body.label, fontSize: 9, color: colors.bg },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meta: { ...font.body.strong, fontSize: 11.5, color: ramp.neutral[700] },
  flaggedChip: {
    backgroundColor: ramp.accent[300],
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  flagged: { ...font.body.label, fontSize: 9, color: ramp.accent[900] },
  boostChip: {
    backgroundColor: ramp.sage[300],
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  boostLabel: { ...font.body.label, fontSize: 9, color: ramp.sage[900] },
  dots: { flexDirection: 'row', gap: 3, marginLeft: 2 },
  dot: { width: 7, height: 7, borderRadius: radius.pill },
});

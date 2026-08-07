import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CORE_STATS } from '@kairo/core';
import { boostChipLabel } from './program-copy.ts';
import type { LeaderboardMode, LeaderboardRow as Row } from './queries.ts';
import { colors, radius, space, tierColor } from '@/theme.ts';

/**
 * Tiers are deliberately the only per-stat detail on this screen: §5 lets
 * squadmates see tiers and totals, never raw steps or hourly movement, so
 * there is no number here to accidentally widen into one.
 *
 * Pills rather than StatBar — four bars across six rows is twenty-four bars,
 * and the row stops being scannable. Same stat names, same tier colours.
 */

export function LeaderboardRow({
  row,
  mode,
  remaining = 0,
  onDeploy,
}: {
  row: Row;
  mode: LeaderboardMode;
  /** The caller's own bananas left today. Gates the affordance, shown on self. */
  remaining?: number;
  /** Absent on the solo board, where there is nobody to throw at. */
  onDeploy?: (row: Row) => void;
}) {
  // Only on your own row. The character screen shows the *unweighted* total
  // for the same day — stored scores are program-independent (deviation #11) —
  // so anyone who compares the two numbers will find them different. The chip
  // is the explanation; hiding the gap would cost trust in the score.
  const boost = row.is_self ? boostChipLabel(row.program) : null;

  return (
    <View style={[styles.row, row.is_self && styles.self]}>
      <Text style={[styles.rank, row.is_self && styles.rankSelf]}>{row.rank}</Text>

      <View style={styles.middle}>
        <View style={styles.nameLine}>
          <Text
            style={[styles.name, row.is_self && styles.nameSelf]}
            numberOfLines={1}
          >
            {row.character_name}
          </Text>
          {row.is_self && <Text style={styles.you}>YOU</Text>}
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
          {row.flagged && <Text style={styles.flagged}>· flagged</Text>}

          {boost && (
            <View style={styles.boostChip}>
              <Text style={styles.boostLabel}>{boost}</Text>
            </View>
          )}

          {/* Your own ammunition, where you already look for your own row.
              Rendered from the ledger's default when no row exists yet, so a
              new user sees what they have before spending any of it. */}
          {row.is_self && onDeploy && (
            <View style={styles.itemChip}>
              <Text style={styles.itemLabel}>🍌 {remaining}</Text>
            </View>
          )}
        </View>

        <View style={styles.tiers}>
          {CORE_STATS.map((stat) => {
            const tier = row.tiers?.[stat];
            return (
              <View
                key={stat}
                style={[styles.pill, { borderColor: tierColor(tier) }]}
              >
                <Text style={[styles.pillLabel, { color: tierColor(tier) }]}>
                  {stat}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <Text style={[styles.total, row.is_self && styles.totalSelf]}>
        {row.total.toLocaleString()}
      </Text>

      {/* Target and intent in one gesture. A single CTA plus a target picker
          would be two steps, and a long-press would make the mechanic §20.4
          calls the soul of the product undiscoverable.

          Deliberately still active on the "Yesterday" board: a hit always
          lands on the target's CURRENT day, resolved server-side from their
          timezone. Disabling it there would imply you can sabotage the past. */}
      {!row.is_self && onDeploy && (
        <Pressable
          accessibilityRole="button"
          // The emoji alone announces as "banana", which says nothing about
          // what tapping it does.
          accessibilityLabel={`Throw a banana at ${row.character_name}`}
          accessibilityState={{ disabled: remaining === 0 }}
          disabled={remaining === 0}
          onPress={() => onDeploy(row)}
          hitSlop={space.sm}
          style={({ pressed }) => [
            styles.deploy,
            remaining === 0 && styles.deploySpent,
            pressed && styles.deployPressed,
          ]}
        >
          <Text style={styles.deployLabel}>🍌</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    marginTop: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  self: { borderColor: colors.accent },
  rank: {
    width: 28,
    color: colors.muted,
    fontSize: 18,
    fontWeight: '800',
  },
  rankSelf: { color: colors.accent },
  middle: { flex: 1, paddingHorizontal: space.sm },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { color: colors.text, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  nameSelf: { color: colors.accent },
  you: {
    color: colors.bg,
    backgroundColor: colors.accent,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meta: { color: colors.muted, fontSize: 12 },
  flagged: { color: colors.danger, fontSize: 12 },
  boostChip: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  boostLabel: { color: colors.accent, fontSize: 10, fontWeight: '800' },
  itemChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  itemLabel: { color: colors.subtle, fontSize: 10, fontWeight: '800' },
  deploy: {
    marginLeft: space.sm,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deploySpent: { opacity: 0.3 },
  deployPressed: { opacity: 0.6, borderColor: colors.accent },
  deployLabel: { fontSize: 16 },
  tiers: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  pill: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pillLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  total: { color: colors.text, fontSize: 20, fontWeight: '800' },
  totalSelf: { color: colors.accent },
});

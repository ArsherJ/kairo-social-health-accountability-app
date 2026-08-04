import { StyleSheet, Text, View } from 'react-native';
import { CORE_STATS } from '@kairo/core';
import type { LeaderboardMode, LeaderboardRow as Row } from './queries.ts';
import { colors, radius, space, tierColor } from '@/theme.ts';
import { Numeral, Panel } from '@/ui/index.ts';

/**
 * Tiers are deliberately the only per-stat detail on this screen: §5 lets
 * squadmates see tiers and totals, never raw steps or hourly movement, so
 * there is no number here to accidentally widen into one.
 *
 * Pills rather than StatBar — four bars across six rows is twenty-four bars,
 * and the row stops being scannable. Same stat names, same tier colours.
 */

export function LeaderboardRow({ row, mode }: { row: Row; mode: LeaderboardMode }) {
  // Glow means earned (design rule), and the leader's row is the only one
  // that gets it here — a Gold tier pill is the only other thing on this
  // screen allowed to glow.
  const isLeader = row.rank === 1;

  return (
    <Panel
      variant={isLeader ? 'earned' : 'plain'}
      style={row.is_self ? styles.rowSelf : styles.row}
    >
      <View style={styles.content}>
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

        <Numeral
          value={row.total}
          size="minor"
          color={row.is_self ? colors.accent : colors.text}
        />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: space.sm, padding: space.md },
  // `is_self` gets the accent border on top of whatever variant (earned or
  // plain) the leader check picked; a merged object, not a style array,
  // because Panel's `style` prop is typed as a single ViewStyle.
  rowSelf: { marginTop: space.sm, padding: space.md, borderColor: colors.accent },
  content: { flexDirection: 'row', alignItems: 'center' },
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
  tiers: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  pill: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pillLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});

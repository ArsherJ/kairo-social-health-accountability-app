import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CORE_STATS, type CoreStat } from '@kairo/core';
import { TierChip } from '@/ui/index.ts';
import { space } from '@/theme.ts';
import { StatBar } from './StatBar.tsx';
import { statFraction } from './stat-fraction.ts';

/** The human-readable line under each bar, once expanded. */
const STAT_LABELS: Record<CoreStat, string> = {
  AGI: 'Steps and distance',
  STR: 'Active calories',
  END: 'Active minutes',
  VIT: 'Hourly movement',
};

/**
 * Four `TierChip`s, tap to expand into the four `StatBar`s. Collapsed on
 * every mount — the expanded state is a reading aid, not a preference worth
 * remembering.
 */
export function StatRow({
  points,
  tiers,
  lane,
  laneEmptyCopy = null,
}: {
  points: Record<CoreStat, number>;
  tiers: Record<string, string> | undefined;
  /** The user's declared focus. Marked, never scaled — see `StatBar`. */
  lane: CoreStat | null;
  laneEmptyCopy?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? 'Hide per-stat detail' : 'Show per-stat detail'}
        style={styles.row}
      >
        {CORE_STATS.map((stat) => (
          <TierChip
            key={stat}
            stat={stat}
            tier={tiers?.[stat]}
            points={points[stat]}
            fraction={statFraction(points[stat])}
          />
        ))}
      </Pressable>

      {expanded && (
        <View style={styles.detail}>
          {CORE_STATS.map((stat) => (
            <StatBar
              key={stat}
              stat={stat}
              label={STAT_LABELS[stat]}
              points={points[stat]}
              tier={tiers?.[stat]}
              lane={stat === lane}
              laneEmptyCopy={laneEmptyCopy}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: space.lg },
  // 44pt+ comes from the chips' own content (padding + numeral + meter +
  // tier label), not from a forced minHeight here — a shorter row would be
  // dishonest about what is actually tappable.
  row: { flexDirection: 'row', gap: space.sm },
  detail: { marginTop: space.md },
});

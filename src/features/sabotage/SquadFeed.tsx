import { StyleSheet, Text, View } from 'react-native';
import { feedLine, feedTime } from './feed-copy.ts';
import { useSquadFeed } from './queries.ts';
import { colors, font, ramp, space } from '@/theme.ts';

/**
 * Who hit whom, newest first (§8).
 *
 * Being hit has to be visible in-app before push exists — push is workstream C
 * and is best-effort even after it lands — and hits between two other people
 * are what make the mechanic social rather than a private grudge.
 */
export function SquadFeed({ squadId }: { squadId: string | undefined }) {
  const feed = useSquadFeed(squadId);
  const now = new Date();

  return (
    <View style={styles.block}>
      <Text style={styles.heading}>RECENT HITS</Text>

      {/* No spinner. The feed is secondary to the board, and a second spinner
          on one screen reads as breakage rather than progress. */}

      {/* A failed fetch must never render as "nothing happened" — this repo has
          stranded a user once by reading an error as absence. */}
      {feed.isError && <Text style={styles.error}>{feed.error.message}</Text>}

      {feed.isSuccess && feed.data.length === 0 && (
        <Text style={styles.empty}>No hits yet today. Somebody has to start.</Text>
      )}

      {/* A timeline, not a list: the hits happened in an order and to each
          other, and the rule down the left is what says so. It only draws
          where there are entries, so an empty or failed feed has no orphan
          stroke hanging under the heading. */}
      {(feed.data ?? []).length > 0 && (
        <View style={styles.timeline}>
          <View style={styles.rule} />

          <View style={styles.entries}>
            {(feed.data ?? []).map((e) => (
              <View key={e.id} style={styles.line}>
                <Text
                  style={[styles.text, e.target_is_self && styles.hit]}
                  numberOfLines={2}
                >
                  {feedLine({
                    actorName: e.actor_name,
                    targetName: e.target_name,
                    actorIsSelf: e.actor_is_self,
                    targetIsSelf: e.target_is_self,
                    item: e.item,
                  })}
                </Text>
                <Text style={styles.when}>{feedTime(e.created_at, now)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: space.xl },
  heading: { ...font.body.label, textTransform: 'uppercase', color: ramp.neutral[600] },
  timeline: { flexDirection: 'row', marginTop: space.sm },
  rule: { width: 2, borderRadius: 1, backgroundColor: ramp.neutral[300] },
  // `gap`, not a per-row `marginTop`: the rule stretches to the entries' full
  // height, and a leading margin would leave it standing above the first hit.
  entries: { flex: 1, paddingLeft: 12, gap: space.sm },
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  text: { ...font.body.strong, fontSize: 13.5, color: ramp.neutral[700], flexShrink: 1 },
  /** Your own beating, in the family the rest of the app reserves for damage. */
  hit: { color: ramp.accent[900] },
  when: { ...font.body.body, fontSize: 11, color: ramp.neutral[600] },
  empty: { ...font.body.body, fontSize: 14, color: colors.muted, marginTop: space.sm },
  error: { ...font.body.body, fontSize: 14, color: colors.damage, marginTop: space.sm },
});

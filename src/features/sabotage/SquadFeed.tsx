import { StyleSheet, Text, View } from 'react-native';
import { feedLine, feedTime } from './feed-copy.ts';
import { useSquadFeed } from './queries.ts';
import { colors, font, space } from '@/theme.ts';

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

      {(feed.data ?? []).map((e) => (
        <View key={e.id} style={styles.line}>
          <Text style={[styles.text, e.target_is_self && styles.hit]} numberOfLines={2}>
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
  );
}

const styles = StyleSheet.create({
  block: { marginTop: space.xl },
  heading: { color: colors.muted, ...font.label },
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: space.sm,
  },
  text: { color: colors.subtle, fontSize: 14, flexShrink: 1 },
  /** Your own beating, in the colour the rest of the app uses for damage. */
  hit: { color: colors.danger },
  when: { color: colors.muted, fontSize: 12 },
  empty: { color: colors.muted, fontSize: 14, marginTop: space.sm },
  error: { color: colors.danger, fontSize: 14, marginTop: space.sm },
});

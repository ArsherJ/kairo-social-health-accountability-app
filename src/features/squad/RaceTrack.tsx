import { StyleSheet, View } from 'react-native';
import { RACE_FINISH_LINE, rankRacers, type RacerInput } from '@kairo/core';
import { colors, font, space } from '@/theme.ts';
import { Text } from '@/ui/index.ts';
import type { LeaderboardRow } from './queries.ts';
import { QuietLane, RaceLane } from './RaceLane.tsx';

/**
 * The daily race (roadmap deviation #46).
 *
 * Six characters running a track toward one flag at `RACE_FINISH_LINE`, which
 * *is* `DAILY_STEP_BASELINE`, which is the Daily Walk — crossing the line and
 * clearing the walk are the same event, deliberately. One number the app
 * teaches, read socially here and personally by the streak.
 *
 * **Two orderings, one payload.** `squad_leaderboard()` ranks by the
 * program-weighted total (deviation #11), because that is the only way a squad's
 * program can apply at read time. The race ranks by capped steps, which is a
 * different ordering, and it happens here. Both read the same query — do not
 * add a second fetch, and do not "simplify" the ranking into SQL, which would
 * silently delete the program feature.
 */
export interface RaceTrackProps {
  rows: readonly LeaderboardRow[];
  /** Racers who are not squadmates — the solo ghosts. */
  extra?: readonly RacerInput[];
  /**
   * How old the numbers are, e.g. "updated 2 hours ago".
   *
   * **Liveness is stated, never implied.** HealthKit background delivery is
   * opportunistic — data lands when the app opens or when iOS decides to wake
   * it — and a track that looks live while it is hours old is the app making a
   * claim it cannot keep.
   */
  syncedLabel?: string;
}

export function RaceTrack({ rows, extra = [], syncedLabel }: RaceTrackProps) {
  // A row whose `steps` is null has not consented, on one side or the other.
  // It keeps its lane and gets no position — see `QuietLane`.
  const sharing = rows.filter((r) => r.steps !== null);
  const withheld = rows.filter((r) => r.steps === null);

  const racers = rankRacers([
    ...sharing.map((r) => ({
      userId: r.user_id,
      characterName: r.character_name,
      species: r.species,
      steps: r.steps ?? 0,
      total: r.total,
      isSelf: r.is_self,
    })),
    ...extra,
  ]);

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>TODAY'S RACE</Text>
        {/* Imported, never written as a literal: `RACE_FINISH_LINE` derives
            from `THRESHOLDS.AGI.gold`, and a second number here describing the
            same bar is exactly the drift that constant exists to stop. */}
        <Text scale="fixed" style={styles.finishLabel}>
          {RACE_FINISH_LINE.toLocaleString()} steps
        </Text>
      </View>

      {/* No gap between lanes: the finish-line segments have to abut into one
          rule. `RaceLane` carries its own vertical padding instead. */}
      <View>
        {racers.map((racer) => (
          <RaceLane key={racer.userId} racer={racer} />
        ))}

        {/* Below the ranked lanes, because they have no position to rank by —
            interleaving them would imply one. */}
        {withheld.map((r) => (
          <QuietLane
            key={r.user_id}
            characterName={r.character_name}
            species={r.species}
          />
        ))}
      </View>

      {syncedLabel && <Text style={styles.synced}>{syncedLabel}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: space.md },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  eyebrow: { color: colors.accentDeep, ...font.body.label, textTransform: 'uppercase' },
  // Sits over the finish line, naming it once for the whole track rather than
  // per lane. Caprasimo, because every number in this app is.
  finishLabel: { color: colors.muted, ...font.display.label },
  synced: { color: colors.muted, ...font.body.strong, marginTop: space.sm },
});

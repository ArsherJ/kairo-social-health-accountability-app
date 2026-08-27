import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  SKY_PATH_ASPECT,
  currentLocalDate,
  ghostRivals,
  placeRacers,
  rankRacers,
  type RacerInput,
} from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { useTodayBuckets } from '@/features/character/buckets.ts';
import { useTodayScore } from '@/features/character/queries.ts';
import { describeAge } from '@/features/health/sync-status.ts';
import { useSyncStatusStore } from '@/features/health/status-store.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { ghostDayLabel } from '@/features/squad/ghost-day-label.ts';
import { SkyCorridor } from '@/features/squad/SkyCorridor.tsx';
import { SkyMarker } from '@/features/squad/SkyMarker.tsx';
import { SkyStanding } from '@/features/squad/SkyStanding.tsx';
import { useSquadDataConsent } from '@/features/squad/consent.ts';
import { useMySquad, useOwnRecentDays, useSquadLeaderboard } from '@/features/squad/queries.ts';
import { claimDaily } from '@/features/telemetry/daily-marker.ts';
import { track } from '@/features/telemetry/events.ts';
import { Label, Panel, Screen, Text } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';

/**
 * The Sky — the daily race, as one shared corridor (roadmap deviation #56).
 *
 * Everybody flies the same lane at the same flag, which is `RACE_FINISH_LINE`,
 * which *is* `DAILY_STEP_BASELINE`, which is the Daily Walk: crossing the line
 * and clearing the walk are the same event, deliberately. One number the app
 * teaches, read socially here and personally by the streak.
 *
 * **Two orderings, one payload.** `squad_leaderboard()` ranks by the
 * program-weighted total, because that is the only way a squad's program can
 * apply at read time (deviation #11). The race ranks by capped steps, and that
 * happens here. Do not add a second fetch and do not move the ranking into SQL,
 * which would silently delete the program feature.
 *
 * **The consent gate is reciprocal and per row** (deviation #47). A row whose
 * `steps` is null has not consented on one side or the other and cannot be
 * placed on a corridor — it is listed below the picture rather than drawn at
 * zero, because dropping it looks like the member left and drawing it at zero
 * invents a bad day for somebody who may have had a good one.
 *
 * **This screen owns the `race_seen` marker.** It moved here from the Today tab
 * when the race stopped being a card there — the marker measures looking at the
 * race, and this is the only screen that shows one. Once per the user's own
 * local day, in an effect rather than in the body, because `claimDaily` writes
 * to MMKV and `track` writes a row.
 */
export default function Sky() {
  const { width } = useWindowDimensions();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const timeZone = profile.data?.timezone;

  const squad = useMySquad(userId);
  const board = useSquadLeaderboard(squad.data?.id, 'current');
  const buckets = useTodayBuckets(userId, timeZone);
  const score = useTodayScore(userId, timeZone);
  const days = useOwnRecentDays(userId, timeZone);
  const consent = useSquadDataConsent(userId);

  // How old *your own* numbers are, and the line says "your" for a reason.
  // Squadmates' freshness is not knowable from here — the RPC projects totals,
  // not sync times — so this claims only what it can actually check. HealthKit
  // background delivery is opportunistic, and a corridor that reads as live
  // while it is hours old is the app making a promise it has no way to keep.
  // It came across from `RaceTrack`, which carried it when the race was lanes.
  const { lastSyncedAt } = useSyncStatusStore();
  const syncedLabel =
    lastSyncedAt === null
      ? "Your numbers haven't synced yet"
      : `Your numbers updated ${describeAge(Date.now() - lastSyncedAt)}`;

  const localToday = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  const rows = board.data ?? [];
  const withheld = rows.filter((r) => r.steps === null);

  const racers = rankRacers(
    buildRacers({
      inSquad: Boolean(squad.data),
      rows,
      userId,
      characterName: profile.data?.character_name,
      species: profile.data?.species ?? null,
      steps: buckets.data?.totals?.steps ?? 0,
      total: score.data?.total ?? 0,
      recentDays: days.data ?? [],
      localToday,
    }),
  );

  const me = racers.find((r) => r.isSelf);
  const sawRace = racers.length > 1;

  useEffect(() => {
    if (!userId || !localToday || !sawRace) return;
    if (claimDaily(userId, 'race_seen', localToday)) void track(userId, 'race_seen');
  }, [userId, localToday, sawRace]);

  // The corridor's box. Full width less the screen's padding, and its height
  // follows from the design's aspect rather than from a second constant.
  const boxWidth = width - space.lg * 2;
  const boxHeight = boxWidth / SKY_PATH_ASPECT;

  const placements = placeRacers(racers.map((r) => r.progress));

  return (
    <Screen>
      <Label>Today&apos;s sky</Label>

      {/* `isSuccess && !consented`, never `!consented` alone: the query reads
          false while in flight, which is indistinguishable from a refusal
          (deviation #37's lesson again). And this sits below every hook above
          it — an early return placed higher would be a conditional hook, and
          the count would change on the frame consent lands. */}
      {consent.isSuccess && !consent.consented && squad.data && (
        <Panel variant="tint">
          <Text style={styles.note}>
            You are not sharing your totals, so the sky is empty. Turn sharing on
            from the Flock tab to fly with them.
          </Text>
        </Panel>
      )}

      <Panel variant="sky" style={styles.field}>
        <SkyCorridor width={boxWidth}>
          {racers.map((racer, i) => (
            <SkyMarker
              key={racer.userId}
              racer={racer}
              placement={placements[i] as (typeof placements)[number]}
              boxWidth={boxWidth}
              boxHeight={boxHeight}
            />
          ))}
        </SkyCorridor>
      </Panel>

      {me && <SkyStanding me={me} racers={racers} />}

      <Text style={styles.quiet}>{syncedLabel}</Text>

      {/* Below the picture, because they have no position to draw — putting
          them on the corridor would imply one. */}
      {withheld.map((r) => (
        <Text key={r.user_id} style={styles.quiet}>
          {`${r.character_name} is not sharing their totals.`}
        </Text>
      ))}
    </Screen>
  );
}

/**
 * Who is on the corridor.
 *
 * Identical in shape to the Today tab's, and deliberately duplicated rather
 * than shared: the two screens choose their racers for different reasons — this
 * one draws everybody, and Today needs only the bird directly ahead. A shared
 * helper would have to grow a flag to serve both, and the flag is what makes it
 * one function doing two jobs.
 */
function buildRacers(input: {
  inSquad: boolean;
  rows: readonly {
    user_id: string;
    character_name: string;
    species: string | null;
    steps: number | null;
    total: number;
    is_self: boolean;
  }[];
  userId: string | undefined;
  characterName: string | undefined;
  species: string | null;
  steps: number;
  total: number;
  recentDays: readonly { localDate: string; steps: number }[];
  localToday: string | undefined;
}): RacerInput[] {
  if (input.inSquad) {
    return input.rows
      .filter((r) => r.steps !== null)
      .map((r) => ({
        userId: r.user_id,
        characterName: r.character_name,
        species: r.species,
        steps: r.steps ?? 0,
        total: r.total,
        isSelf: r.is_self,
      }));
  }

  const me: RacerInput = {
    userId: input.userId ?? 'self',
    characterName: input.characterName ?? 'You',
    species: input.species,
    steps: input.steps,
    total: input.total,
    isSelf: true,
  };

  const ghosts = ghostRivals(input.recentDays, 3).map((g) => ({
    ...g,
    characterName: input.localToday
      ? ghostDayLabel(g.characterName, input.localToday)
      : g.characterName,
    species: input.species,
  }));

  return [me, ...ghosts];
}

const styles = StyleSheet.create({
  field: { paddingHorizontal: 0, paddingVertical: space.md, overflow: 'hidden' },
  note: { ...font.body.body, fontSize: 14, color: colors.text, lineHeight: 20 },
  quiet: { ...font.body.strong, color: colors.muted, marginTop: space.sm },
});

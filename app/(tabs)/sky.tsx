import { useEffect } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RACE_FINISH_LINE,
  SKY_PATH_ASPECT,
  currentLocalDate,
  ghostRivals,
  placeRacers,
  pointAt,
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
import { SkyFlockRail } from '@/features/squad/SkyFlockRail.tsx';
import { SkyMarker } from '@/features/squad/SkyMarker.tsx';
import { SkyStanding } from '@/features/squad/SkyStanding.tsx';
import { useSquadDataConsent } from '@/features/squad/consent.ts';
import { useMySquad, useOwnRecentDays, useSquadLeaderboard } from '@/features/squad/queries.ts';
import { claimDaily } from '@/features/telemetry/daily-marker.ts';
import { track } from '@/features/telemetry/events.ts';
import { Gradient, Glass, Panel, Text, TAB_PILL_CLEARANCE } from '@/ui/index.ts';
import type { Stop } from '@/ui/gradient.ts';
import { colors, font, radius, ramp, space } from '@/theme.ts';

/**
 * The flight, from the ground at midnight to the ridge at the top.
 *
 * Read bottom-to-top, which is why the stops run in that order visually: the
 * warm end is at the *foot* of the content, where the day starts.
 */
const FLIGHT: Stop[] = [
  { color: ramp.sky[500], at: 0 },
  { color: ramp.sky[400], at: 0.26 },
  { color: '#8fe0ff', at: 0.52 },
  { color: '#cff1ff', at: 0.74 },
  { color: '#ffe9c4', at: 0.92 },
  { color: '#ffc58a', at: 1 },
];

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
  const { width, height } = useWindowDimensions();
  // The flight bleeds to every edge, so the pinned chrome takes the insets
  // itself. There is no `Screen` here: this tab is a picture the size of the
  // glass with things floating on it, not a scrolling column of cards.
  const insets = useSafeAreaInsets();
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
  // It came across from the six-lane track, which carried it before this.
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

  // The corridor is the whole screen wide and four times as tall — the flight
  // is scrolled, not glanced at. Its height follows from the design's aspect
  // rather than from a second constant.
  const boxWidth = width;
  const boxHeight = boxWidth / SKY_PATH_ASPECT;

  const placements = placeRacers(racers.map((r) => r.progress));

  /**
   * Where to open the flight.
   *
   * On your own bird, a third of the way down the viewport — the design's
   * `componentDidMount` does the same thing, and for the same reason: a flight
   * that opens at the ground shows a brand-new day's worth of empty sky, and
   * one that opens at the ridge shows the flag to somebody who has not reached
   * it. Opening on the reader puts what they came for on screen and leaves the
   * climb above them visible as the thing to do.
   *
   * `contentOffset` rather than a `scrollTo` in an effect: the effect version
   * paints at the ground for one frame and then jumps, which reads as the
   * screen glitching every single time it is opened.
   */
  const myY = me ? pointAt(me.progress).y * boxHeight : boxHeight;
  const openAt = Math.max(0, Math.min(boxHeight - height, myY - height / 3));

  return (
    <View style={styles.screen}>
      <ScrollView
        contentOffset={{ x: 0, y: openAt }}
        showsVerticalScrollIndicator={false}
        style={StyleSheet.absoluteFill}
      >
        <View style={{ width: boxWidth, height: boxHeight }}>
          <Gradient stops={FLIGHT} steps={40} />

          {/* Clouds, thinning as the flight climbs. Decoration only — the
              race's meaning is entirely in the birds and the ridge. */}
          {CLOUDS.map((cloud, i) => (
            <View
              key={i}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.cloud,
                {
                  top: boxHeight * cloud.at,
                  left: cloud.left === null ? undefined : boxWidth * cloud.left,
                  right: cloud.right === null ? undefined : boxWidth * cloud.right,
                  width: cloud.w,
                  height: cloud.h,
                  opacity: cloud.opacity,
                },
              ]}
            />
          ))}

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

          {/* The ridge, named once, beside the line the corridor draws.

              `RACE_FINISH_LINE` **is** `DAILY_STEP_BASELINE` by derivation, so
              this figure and the Daily Walk's are one number with two readings.
              No literal appears here and none may — and note the race reaches
              it through raw steps rather than through a tier, which is what
              keeps the whole screen clear of the `AGI`/`AGI_base` trap. */}
          <View
            accessible
            accessibilityLabel={`The ridge, ${RACE_FINISH_LINE.toLocaleString()} steps`}
            style={[styles.ridge, { top: pointAt(1).y * boxHeight - 14 }]}
          >
            <Text
              scale="fixed"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.ridgeText}
            >
              {`${(RACE_FINISH_LINE / 1000).toFixed(0)}k · ridge`}
            </Text>
          </View>

          {/* The ground the day started from. */}
          <View
            accessible
            accessibilityLabel="Midnight, where the day started"
            style={[styles.ground, { top: pointAt(0).y * boxHeight + 24 }]}
          >
            <Text
              scale="fixed"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.groundText}
            >
              midnight
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Pinned over the flight, so scrolling moves the climb underneath it. */}
      <View
        pointerEvents="box-none"
        style={[styles.pinnedTop, { top: insets.top + space.sm }]}
      >
        <SkyFlockRail racers={racers} withheld={withheld} />

        {/* `isSuccess && !consented`, never `!consented` alone: the query reads
            false while in flight, which is indistinguishable from a refusal
            (deviation #37's lesson again). And this sits below every hook above
            it — an early return placed higher would be a conditional hook, and
            the count would change on the frame consent lands. */}
        {consent.isSuccess && !consent.consented && squad.data && (
          <Panel variant="tint" style={styles.consent}>
            <Text style={styles.note}>
              You are not sharing your totals, so the sky is empty. Turn sharing
              on from the Flock tab to fly with them.
            </Text>
          </Panel>
        )}
      </View>

      <View
        pointerEvents="box-none"
        style={[styles.pinnedFoot, { bottom: insets.bottom + TAB_PILL_CLEARANCE }]}
      >
        {me && <SkyStanding me={me} racers={racers} floating />}

        {/* Your own sync time, and it says "your" for a reason — squadmates'
            is not knowable from here, because the RPC projects totals and not
            sync times. On glass rather than on the page, because there is no
            page: the flight runs the full height of the screen. */}
        <Glass tone="dark" radius={radius.lg} style={styles.freshness}>
          <Text
            scale="chrome"
            numberOfLines={1}
            style={styles.freshnessText}
          >
            {syncedLabel}
          </Text>
        </Glass>
      </View>
    </View>
  );
}

/**
 * Where the clouds sit, as fractions of the flight.
 *
 * A module constant rather than a literal in the render body: this array is
 * mapped on every scroll frame's re-render, and a fresh array each time is a
 * fresh key set for React to reconcile.
 */
const CLOUDS = [
  { at: 0.1, left: -0.1, right: null, w: 190, h: 66, opacity: 0.5 },
  { at: 0.23, left: null, right: -0.1, w: 210, h: 70, opacity: 0.55 },
  { at: 0.42, left: -0.13, right: null, w: 220, h: 74, opacity: 0.6 },
  { at: 0.6, left: null, right: 0.05, w: 170, h: 58, opacity: 0.65 },
  { at: 0.78, left: 0.1, right: null, w: 240, h: 78, opacity: 0.7 },
] as const;

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
  screen: { flex: 1, backgroundColor: colors.night },
  cloud: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  /**
   * The ridge and the ground labels sit on the right and centre respectively,
   * clear of the corridor, which runs up the middle. Both are absolutely
   * positioned against the flight — this is drawn geometry, the one place the
   * flow-layout rule does not apply, exactly as `SkyMarker` documents.
   */
  ridge: {
    position: 'absolute',
    right: space.md,
    backgroundColor: ramp.gold[400],
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  ridgeText: { ...font.display.label, fontSize: 13, color: colors.night },
  ground: { position: 'absolute', alignSelf: 'center' },
  groundText: {
    ...font.body.label,
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.75)',
    overflow: 'hidden',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },

  // `box-none` on both pinned layers so a touch that misses the chrome reaches
  // the flight behind it — otherwise two invisible full-width bars would eat
  // the scroll at the top and bottom of the screen.
  pinnedTop: { position: 'absolute', left: space.md, right: space.md },
  consent: { marginTop: space.sm },
  pinnedFoot: { position: 'absolute', left: space.lg, right: space.lg, gap: space.sm },
  freshness: { paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'center' },
  freshnessText: { ...font.body.strong, fontSize: 11, color: colors.bg },

  note: { ...font.body.body, fontSize: 13.5, color: colors.text, lineHeight: 19 },
});

import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSessionStore } from '@/features/auth/session.ts';
import { seedTodayHealthData } from '@/features/health/dev-seed.ts';
import { healthSource } from '@/features/health/health-source.ts';
import { notifyHealthPermissionGranted } from '@/features/health/useHealthSync.ts';
import { StatBar } from '@/features/character/StatBar.tsx';
import { StatRail } from '@/features/character/StatRail.tsx';
import { laneEmptyCopy, laneStat } from '@/features/character/lane.ts';
import { resolveStatDetail, statDetailLine } from '@/features/character/stat-detail.ts';
import { useTodayBuckets, useTodayVitals } from '@/features/character/buckets.ts';
import { useDominantStat, useTodayScore } from '@/features/character/queries.ts';
import { useDisclosure } from '@/features/character/useDisclosure.ts';
import { SPECIES, displaySpecies } from '@/features/character/species.ts';
import { GrowthCard } from '@/features/profile/GrowthCard.tsx';
import { RecordsCard } from '@/features/profile/RecordsCard.tsx';
import { useStatRecords } from '@/features/profile/records.ts';
import { DemoToggle } from '@/features/demo/DemoToggle.tsx';
import { ClearedCalendar } from '@/features/profile/ClearedCalendar.tsx';
import { ProfileHeader } from '@/features/profile/ProfileHeader.tsx';
import { StreakCard } from '@/features/profile/StreakCard.tsx';
import { useProfile, useStreak } from '@/features/profile/queries.ts';
import { useWalkHistory } from '@/features/train/queries.ts';
import { Button, Label, Screen, STAT_NAMES, Text } from '@/ui/index.ts';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import {
  CORE_STATS,
  currentLocalDate,
  ratingForStatPoints,
  type CoreStat,
} from '@kairo/core';

/**
 * `@bagwis` from "Bagwis".
 *
 * Derived, never stored: Kairo has no handle concept and adding a column for
 * one would be a new unique-namespace problem (and a new way to be squatted on)
 * for a string that is only ever decoration. Lowercased and stripped to word
 * characters so a name with a space or an emoji still yields something that
 * reads as a handle rather than as a broken one.
 */
function handleFor(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return slug.length > 0 ? `@${slug}` : '@kairo';
}

/**
 * "Joined August 2026" from a timestamptz.
 *
 * Month and year only. A join *date* is a precise fact about a person that no
 * surface here needs, and this one is rendered beside their character's name on
 * a screen they may hand to a friend.
 */
function joinedLabel(createdAt: string | undefined): string | null {
  if (!createdAt) return null;
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return null;
  return `Joined ${new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(at)}`;
}

/** The human-readable line under each bar, once the rail is expanded. */
const STAT_LABELS: Record<CoreStat, string> = {
  AGI: 'Steps and distance',
  STR: 'Active calories',
  MND: 'Sleep duration',
};


export default function ProfileTab() {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const streak = useStreak(userId);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);

  // The rail and the block it opens came here when the character screen
  // dissolved (2026-08-27). Both queries are already in TanStack's cache from
  // the Today tab on the same keys, so this screen adds no request.
  const disclosure = useDisclosure(userId);
  const score = useTodayScore(userId, profile.data?.timezone);
  const dominance = useDominantStat(userId, profile.data?.timezone);
  const [railOpen, setRailOpen] = useState(false);

  // Both already cached from Today on the same keys, so this screen still adds
  // no request for them. Records is the one genuinely new call, and it is on
  // this screen alone.
  const buckets = useTodayBuckets(userId, profile.data?.timezone);
  const vitals = useTodayVitals(userId, profile.data?.timezone);
  const records = useStatRecords(userId);

  // Only ever used to decide whether a record's year is worth printing, so an
  // undefined timezone yields undefined and `recordDate` falls back to the
  // record's own year — never a wrong date.
  const localToday = profile.data?.timezone
    ? currentLocalDate(new Date(), profile.data.timezone)
    : undefined;

  // Lifetime rollups, which is what the rail reads. `ratingForStatPoints`
  // floors at 1, so an unloaded profile says the same thing a brand-new
  // character's does rather than flashing a dash.
  //
  // `mnd_total`, not `mind_total`: the rollup is spelled for the stat, the
  // score column it sums is `mind_points`, and that split has cost a bug.
  const ratings: Record<CoreStat, number> | undefined = profile.data && {
    AGI: ratingForStatPoints(profile.data.agi_total),
    STR: ratingForStatPoints(profile.data.str_total),
    MND: ratingForStatPoints(profile.data.mnd_total),
  };

  const lifetime: Record<CoreStat, number> | undefined = profile.data && {
    AGI: profile.data.agi_total,
    STR: profile.data.str_total,
    MND: profile.data.mnd_total,
  };

  const todayPoints: Record<CoreStat, number> = {
    AGI: score.data?.agi_points ?? 0,
    STR: score.data?.str_points ?? 0,
    MND: score.data?.mind_points ?? 0,
  };

  const lane = laneStat(dominance.data);
  const laneCopy = laneEmptyCopy(dominance.data);

  // The guidance line, live again. `resolveStatDetail` and `nextTierFor` were
  // orphaned by the 2026-08-27 tab merge — tested, correct, and reachable from
  // nothing, which is why the app could compute "1,240 steps to go" and never
  // say it. Retiring Body's threshold shift is what made re-mounting honest:
  // until then this could not quote Body's ladder at all.
  const nextUp = statDetailLine(
    resolveStatDetail({
      totals: buckets.data?.totals,
      sleepMinutes: vitals.data?.sleepMinutes ?? null,
      lane,
    }),
    STAT_NAMES,
  );

  // The same rows the Daily Walk streak counts, on the same key — already in
  // cache from the Today tab, so the calendar adds no request there and one
  // here for an account that opened You first. `met` is the walk clearing,
  // read from `tiers->>'AGI_base'` in the query rather than re-derived.
  const walk = useWalkHistory(userId, profile.data?.timezone);
  const clearedDates = (walk.data ?? []).filter((d) => d.met).map((d) => d.localDate);

  async function seed() {
    const timeZone = profile.data?.timezone;
    if (!timeZone) return;

    setSeedStatus('Writing to Apple Health…');
    try {
      const result = await seedTodayHealthData(new Date(), timeZone);
      setSeedStatus(
        `Wrote ${result.steps.toLocaleString()} steps across ${result.hoursSeeded}h ` +
          `on ${result.localDate}. Syncing…`,
      );
      // Reuse the permission-granted trigger: same intent, sync right now
      // rather than waiting for the next foreground.
      notifyHealthPermissionGranted();
    } catch (cause) {
      setSeedStatus(cause instanceof Error ? cause.message : 'Seeding failed');
    }
  }

  return (
    <Screen bleed>
      {profile.isPending && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accentDeep} />
        </View>
      )}

      {profile.data && (
        <>
          {/* The name lives in the header now, beside the XP ring, rather than
              as a page title above a bar that said the same numbers. */}
          <ProfileHeader
            name={profile.data.character_name}
            handle={handleFor(profile.data.character_name)}
            totalXp={profile.data.total_xp}
            species={SPECIES[displaySpecies(profile.data.species)].name}
            joined={joinedLabel(profile.data.created_at)}
          />

          <View style={styles.page}>

          {/* Streak errors are silent by design: a failed streak fetch must
              not stop the rest of the screen rendering, and StreakCard reads
              a missing row as zeros — which is what a new user has anyway. */}
          <StreakCard streak={streak.data} />

          {/* The mastery, moved here from the character screen when it
              dissolved. **Still gated on `full`** — deviation #37's list did
              not change, only which file mounts it. A rating over a lifetime
              rollup means nothing on an account with no lifetime.

              The per-stat block comes with it: the rail is a summary you tap
              to open, and a toggle that opens nothing is worse than no toggle.
              `railOpen` can only be set by the rail, so the second condition
              is unreachable in `core` anyway — stated rather than implied, so
              removing the first gate later cannot silently bring it back. */}
          {disclosure.stage === 'full' && (
            <StatRail
              ratings={ratings}
              expanded={railOpen}
              onToggle={() => setRailOpen((open) => !open)}
            />
          )}

          {disclosure.stage === 'full' && railOpen && (
            <View style={styles.detailBlock}>
              {/* What is closest, before the bars that show where everything
                  stands. The question "what should I do next" is the one the
                  bars cannot answer, and it belongs above them rather than
                  after — a reader who has already read three bars has stopped
                  asking. */}
              {nextUp && <Text style={styles.nextUp}>{nextUp}</Text>}

              {CORE_STATS.map((stat) => (
                <StatBar
                  key={stat}
                  stat={stat}
                  label={STAT_LABELS[stat]}
                  todayPoints={todayPoints[stat]}
                  lifetimePoints={lifetime?.[stat]}
                  lane={stat === lane}
                  laneEmptyCopy={laneCopy}
                />
              ))}

              {/* Offered here rather than beside the ratings because expanding
                  the rail is the moment someone is already asking what these
                  numbers mean. A permanent link would be a help affordance
                  competing with the thing it explains. `core` reaches the same
                  screen from Today, which is where it has least else to go on. */}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="How progress works"
                hitSlop={space.sm}
                onPress={() => router.push('/progress')}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Text style={styles.helpLink}>How progress works</Text>
              </Pressable>
            </View>
          )}

          {/* Ungated, deliberately, and the counterpart to the rail above: a
              new account needs to know what the three things *are* before it
              has any of them. This says what each is for and never what has
              been earned. */}
          {/* Under the rail, because somebody reading their lifetime numbers is
              already asking what their best was. Ungated: a record is one of
              the few things that means something on a young account, and an
              account with none reads an invitation rather than a blank. */}
          <RecordsCard records={records.data} today={localToday} />

          <GrowthCard />

          {/* The month, as a run of cleared days — the one genuinely new
              surface on this tab. A cleared day is a cleared Daily Walk, read
              from the same `useWalkHistory` rows the streak counts, so the
              calendar and the streak cannot disagree about a day.

              Ungated on purpose. It is the honest picture of a short history as
              much as a long one: a new account sees a month with two gold
              squares in it and the rest still to come, which is a truthful and
              rather encouraging thing to show somebody on day two. */}
          <ClearedCalendar today={localToday} clearedDates={clearedDates} />
          </View>
        </>
      )}

      {/* Simulator affordance only. A fresh simulator's Health app is empty,
          so without this a working ingest pipeline and a broken one both render
          zero. Compiled out of release builds. */}
      {__DEV__ && (
        <View style={styles.page}>
          {healthSource.policy.supportsReads && (
            <>
              <Button
                label="Seed Apple Health (dev)"
                onPress={() => void seed()}
                variant="secondary"
              />
              {seedStatus !== null && <Text style={styles.devStatus}>{seedStatus}</Text>}
            </>
          )}
          <DemoToggle />
        </View>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  /**
   * Everything below the header, which bleeds. The header pads its own name and
   * handle rows and lets only the scene band run to the edge, so this wrapper
   * starts under it rather than around it.
   */
  page: { paddingHorizontal: space.lg },
  centered: { paddingVertical: space.xl, alignItems: 'center' },
  detailBlock: { marginTop: space.md, gap: space.md },
  /**
   * The guidance line. Accent-deep rather than muted, because unlike the spread
   * aside on Today this one is an instruction — it is the only line on the
   * screen naming something to go and do, and `accentDeep` is the body-size
   * accent role (`accent` itself is a fill and measures 1.9:1 here).
   */
  nextUp: { ...font.body.body, fontSize: 15, lineHeight: 22, color: colors.accentDeep },
  helpLink: {
    ...font.body.strong,
    color: colors.accentDeep,
    marginTop: space.xs,
    textAlign: 'center',
  },
  value: { color: colors.text, ...font.display.minor, fontSize: 19, marginTop: space.xs },
  help: { ...font.body.body, fontSize: 12, color: ramp.neutral[600], marginTop: space.sm, lineHeight: 18 },
  devStatus: { ...font.body.body, fontSize: 13, color: colors.subtle, marginTop: space.sm },
  // `flexWrap` rather than a fixed four-across row: at large Dynamic Type the
  // chips need two lines, and a row that cannot fit clips mid-word.
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  chip: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: ramp.neutral[200],
  },
  chipOn: { backgroundColor: colors.accent },
  chipPressed: { opacity: 0.7 },
  chipLabel: { color: colors.subtle, ...font.body.strong },
  chipLabelOn: { color: colors.bg },
});

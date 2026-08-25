import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { signOut, useSessionStore } from '@/features/auth/session.ts';
import { seedTodayHealthData } from '@/features/health/dev-seed.ts';
import { healthSource } from '@/features/health/health-source.ts';
import { notifyHealthPermissionGranted } from '@/features/health/useHealthSync.ts';
import { BodyMetricsCard } from '@/features/profile/BodyMetricsCard.tsx';
import { DemoToggle } from '@/features/demo/DemoToggle.tsx';
import { NotificationSettingsCard } from '@/features/notifications/NotificationSettingsCard.tsx';
import { ProfileHeader } from '@/features/profile/ProfileHeader.tsx';
import { StreakCard } from '@/features/profile/StreakCard.tsx';
import { SPECIES_NAMES } from '@/features/character/species.ts';
import { useProfile, useStreak } from '@/features/profile/queries.ts';
import { useUpdateProfile } from '@/features/profile/update-profile.ts';
import { Button, Label, Panel, Screen, Text } from '@/ui/index.ts';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import type { QuestTier } from '@kairo/core';

/**
 * The four choices, in ascending order with the automatic rule first.
 *
 * `null` is a real value, not an absent one — it means "use `questTier()`'s
 * trailing-scored-days rule", which is what every account starts on. Sending it
 * through the mutation is how somebody gets *back* to automatic.
 */
const QUEST_TIER_CHOICES: readonly [QuestTier | null, string][] = [
  [null, 'Automatic'],
  ['starter', 'Starter'],
  ['steady', 'Steady'],
  ['strong', 'Strong'],
];

const QUEST_TIER_NAMES: Record<QuestTier, string> = {
  starter: 'Starter',
  steady: 'Steady',
  strong: 'Strong',
};

export default function ProfileTab() {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const streak = useStreak(userId);
  const update = useUpdateProfile(userId);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);

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
    <Screen>
      {profile.isPending && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {profile.data && (
        <>
          {/* The name lives in the header now, beside the XP ring, rather than
              as a page title above a bar that said the same numbers. */}
          <ProfileHeader
            name={profile.data.character_name}
            totalXp={profile.data.total_xp}
          />

          {/* Streak errors are silent by design: a failed streak fetch must
              not stop the rest of the screen rendering, and StreakCard reads
              a missing row as zeros — which is what a new user has anyway. */}
          <StreakCard streak={streak.data} />

          <BodyMetricsCard userId={userId} profile={profile.data} />

          {/* Above Timezone because it is the one on this screen that can be
              wrong without the user knowing: the zone follows the device, but a
              notification permission revoked in iOS Settings is silent. */}
          <NotificationSettingsCard />

          {/* Above Timezone, because this one is a choice and that one is an
              observation. The picker itself is `/species`, groupless — see
              that file for why it cannot live in `(onboard)` alongside the
              onboarding mount. */}
          <Panel>
            <Label>Companion</Label>
            <Text style={styles.value}>
              {profile.data.species === null
                ? 'Not chosen yet'
                : SPECIES_NAMES[profile.data.species]}
            </Text>
            <Text style={styles.help}>
              Cosmetic only — your stats, scores and streak are untouched by
              which animal you play as.
            </Text>
            <Button
              label={profile.data.species === null ? 'Choose a companion' : 'Change'}
              variant="secondary"
              onPress={() => router.push('/species')}
            />
          </Panel>

          {/* Above Timezone for the Companion reason: this one is a choice and
              that one is an observation.

              The copy names the automatic rule's *actual* input, and that
              sentence is doing real work. `questTier()` keys off how many days
              have scored, which measures engagement rather than fitness — so it
              is wrong by construction for a long-standing gentle user and for a
              brand-new athlete alike. A user who finds their quests too easy
              needs to understand why, rather than assume the app measured them
              and got it wrong. That is also why the override **wins outright**
              (see `questTier`): a rule that could veto it would make it a hint.
          */}
          <Panel>
            <Label>Quest difficulty</Label>
            <Text style={styles.value}>
              {profile.data.quest_tier_override === null
                ? 'Automatic'
                : QUEST_TIER_NAMES[profile.data.quest_tier_override]}
            </Text>
            <Text style={styles.help}>
              Kairo picks a difficulty from how long you have been here. If the
              quests feel wrong, choose your own.
            </Text>
            {/* Wraps, because four chips do not fit one line past about 1.3x
                Dynamic Type and a row that cannot fit is the permission
                sheet's 2026-08-17 failure in a new place. */}
            <View style={styles.chips}>
              {QUEST_TIER_CHOICES.map(([value, label]) => {
                const current = (profile.data?.quest_tier_override ?? null) === value;
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: current }}
                    accessibilityLabel={`Quest difficulty: ${label}`}
                    disabled={update.isPending}
                    onPress={() => update.mutate({ quest_tier_override: value })}
                    style={({ pressed }) => [
                      styles.chip,
                      current && styles.chipOn,
                      pressed && styles.chipPressed,
                    ]}
                  >
                    <Text scale="chrome" style={[styles.chipLabel, current && styles.chipLabelOn]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Panel>

          <Panel>
            <Label>Timezone</Label>
            <Text style={styles.value}>{profile.data.timezone}</Text>
            {/* Read-only on purpose. §2 ranks everyone on their own local day,
                and the zone follows the device so travelling does not need a
                settings visit — or let anyone shop for a longer day. */}
            <Text style={styles.help}>
              Follows your device. Your day runs midnight to midnight here, so
              travelling moves your day with you.
            </Text>
          </Panel>
        </>
      )}

      {__DEV__ && (
        // Simulator affordance only. A fresh simulator's Health app is empty,
        // so without this a working ingest pipeline and a broken one both
        // render zero. Compiled out of release builds.
        <>
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
        </>
      )}

      <Button
        label="Sign out"
        onPress={() => void signOut()}
        variant="ghost"
      />

      {/* Below sign-out, and only reachable through a screen that explains
          what it does. Apple requires an in-app path for this; putting it
          anywhere more prominent would make the reversible action compete
          with the irreversible one. */}
      <Button
        label="Delete account"
        onPress={() => router.push('/delete-account')}
        variant="ghost"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { paddingVertical: space.xl, alignItems: 'center' },
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

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { QUEST_TIERS, type QuestTier } from '@kairo/core';
import { signOut, useSessionStore } from '@/features/auth/session.ts';
import { NotificationSettingsCard } from '@/features/notifications/NotificationSettingsCard.tsx';
import { BodyMetricsCard } from '@/features/profile/BodyMetricsCard.tsx';
import { useProfile } from '@/features/profile/queries.ts';
import { useUpdateProfile } from '@/features/profile/update-profile.ts';
import { questTierName } from '@/features/quests/quest-copy.ts';
import { questDifficultyHelp } from '@/features/onboarding/calibration-copy.ts';
import { colors, font, radius, ramp, shadow, space } from '@/theme.ts';
import { BackRow, Screen, Text } from '@/ui/index.ts';

/**
 * Settings — the grouped list behind the gear on the You tab.
 *
 * **This screen is a move, not a new feature.** Quest difficulty, the timezone
 * note, notifications, sign out and delete account were all loose at the foot
 * of the You tab, below the records and the growth card, in a scroll that ran
 * about two and a half screens. They are the same controls with the same
 * behaviour; what changed is that the tab about the player is now about the
 * player, and the app's preferences are one tap away instead of below them.
 *
 * A modal `Stack` screen rather than a fifth tab: this is somewhere you go, do
 * one thing, and leave. The tab bar is deliberately still visible behind it —
 * `setNavHidden` is for full-screen *tasks* (creating a squad, joining one),
 * and a settings list is not one.
 *
 * Three groups, and the order is the argument: **Permissions** first because
 * they are the only things here that change what leaves the phone, **The game**
 * second because quest difficulty is the one setting that changes what the app
 * asks of you, and **Other stuff** last because it ends in the two irreversible
 * actions and nothing should sit under those competing for the same tap.
 */
export default function Settings() {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const update = useUpdateProfile(userId);

  return (
    <Screen>
      <BackRow onPress={() => router.back()} />

      <Text scale="chrome" style={styles.title}>
        Settings
      </Text>

      <Group title="Permissions">
        {/* The card owns its own explanation and its own registration check —
            what it reports is whether a push token exists, which is knowable
            everywhere, rather than the `aps-environment` entitlement, which is
            structurally unreadable on TestFlight. */}
        <NotificationSettingsCard />
      </Group>

      {/* Height, weight and birth year, moved off the You tab — and the only
          place in the app they are ever asked for (deviation #60).

          They belong here for the same reason everything else on this screen
          does: they are the player's own record, not a fact worth putting on
          the screen they hand to a friend. They stay **optional and gate
          nothing** (§5), and they are **inert**: Apple applies the body
          profile from the Health app before Kairo sees a calorie, so Kairo's
          copies of height and weight reach no scoring path at all. Birth year
          is the one with a consumer, and it is display-only — the `220 - age`
          max-heart-rate estimate behind Strain (deviation #24). The card's own
          note says this; `BODY_METRICS_NOTE` is where it is written and tested.

          `profile.data &&` because the card takes a loaded row rather than a
          pending query, and says so. */}
      {profile.data && (
        <Group title="Your body">
          <BodyMetricsCard userId={userId} profile={profile.data} />
        </Group>
      )}

      <Group title="The game">
        {/*
          Quest difficulty. **The copy names the rule that actually applies to
          this account**, and since deviation #63 that is usually not the
          automatic one: onboarding reads a fortnight of days behind the Health
          grant and seeds `quest_tier_override` with what it measured. So the
          help line describes a **seed** — read once, never re-read, and
          therefore unable to rise as the player improves, which is the whole
          reason a trailing median was refused as a standing rule. It is
          **conditional on the row's own value**, because one sentence cannot be
          true of both cohorts: an account on Auto has never been read, and
          telling it otherwise directly beside a value that says "Auto" is the
          kind of false claim this screen has already had to be corrected for.
          `questDifficultyHelp` owns both lines and is tested.

          Automatic is still a real choice and still the fallback: accounts that
          predate calibration, that hit the no-history outcome, that skipped the
          beat, or that clear their override land back on `questTier()`'s
          trailing scored days — engagement rather than fitness, wrong by
          construction for part of the cohort, and named as such so somebody who
          picks it knows what they picked.

          Either way the override **wins outright** (see `questTier`): a rule
          that could veto it would make it a hint.
        */}
        <View style={styles.card}>
          <View style={styles.rowHead}>
            <MaterialCommunityIcons name="target-variant" size={21} color={colors.accent} />
            <Text scale="chrome" style={styles.rowLabel}>
              Quest difficulty
            </Text>
            <Text scale="fixed" style={styles.rowValue}>
              {profile.data?.quest_tier_override
                ? questTierName(profile.data.quest_tier_override)
                : 'Auto'}
            </Text>
          </View>

          <Text style={styles.help}>
            {questDifficultyHelp(profile.data?.quest_tier_override ?? null)}
          </Text>

          {/* Wraps, because four chips do not fit one line past about 1.3x
              Dynamic Type and a row that cannot fit is the permission sheet's
              2026-08-17 failure in a new place. */}
          <View style={styles.chips}>
            {TIER_CHOICES.map(([value, label]) => {
              const current = (profile.data?.quest_tier_override ?? null) === value;
              return (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: current }}
                  accessibilityLabel={`Quest difficulty: ${label}`}
                  disabled={update.isPending || !profile.data}
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
        </View>

        {/* Read-only on purpose, and the lock says so. §2 ranks everyone on
            their own local day and the zone follows the device, so travelling
            needs no settings visit — and nobody can shop for a longer day. */}
        <View style={styles.card}>
          <View style={styles.rowHead}>
            <MaterialCommunityIcons name="earth" size={21} color={ramp.sky[600]} />
            <Text scale="chrome" style={styles.rowLabel}>
              Timezone
            </Text>
            <Text scale="fixed" style={styles.rowValue}>
              {profile.data?.timezone ?? '—'}
            </Text>
            <MaterialCommunityIcons
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              name="lock-outline"
              size={17}
              color={ramp.neutral[500]}
            />
          </View>
          <Text style={styles.help}>
            Follows your device. Your day runs midnight to midnight here, so
            travelling moves your day with you.
          </Text>
        </View>
      </Group>

      <Group title="Other stuff">
        <View style={styles.list}>
          <Row
            icon="logout"
            tint={ramp.neutral[600]}
            label="Sign out"
            onPress={() => void signOut()}
          />
          <View style={styles.divider} />
          {/* Last, and only reachable through a screen that explains what it
              does. Apple requires an in-app path for this; anywhere more
              prominent would make the reversible action compete with the
              irreversible one. */}
          <Row
            icon="delete-outline"
            tint={colors.damage}
            label="Delete account"
            destructive
            onPress={() => router.push('/delete-account')}
          />
        </View>
      </Group>
    </Screen>
  );
}

/**
 * The four choices, in ascending order with the automatic rule first.
 *
 * `null` is a real value, not an absent one — it means "use `questTier()`'s
 * trailing-scored-days rule", which is what every account starts on. Sending it
 * through the mutation is how somebody gets *back* to automatic.
 */
const TIER_CHOICES: readonly [QuestTier | null, string][] = [
  [null, 'Automatic'],
  ...QUEST_TIERS.map((tier): [QuestTier, string] => [tier, questTierName(tier)]),
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text scale="chrome" style={styles.groupTitle}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

/**
 * One tappable row.
 *
 * One accessibility element with both halves of the grouping fix — a glyph, a
 * label and a chevron are three stops otherwise, and a list of six rows is
 * eighteen.
 */
function Row({
  icon,
  tint,
  label,
  destructive = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tint: string;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.chipPressed]}
    >
      <MaterialCommunityIcons {...hidden} name={icon} size={21} color={tint} />
      <Text
        {...hidden}
        scale="chrome"
        style={[styles.rowLabel, destructive && { color: colors.damage }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { ...font.display.major, fontSize: 28, color: colors.text, marginTop: space.sm },
  group: { marginTop: space.lg },
  groupTitle: { ...font.body.label, color: colors.muted, marginLeft: 6, marginBottom: space.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: space.md,
    marginBottom: space.sm,
    gap: space.sm,
    ...shadow.md,
  },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    ...shadow.md,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // `flex: 1` so the value and the lock keep their place when the label wraps
  // at large type, rather than being pushed off the row.
  rowLabel: { flex: 1, ...font.body.body, fontSize: 14, color: colors.text },
  rowValue: { ...font.display.label, color: colors.muted },
  help: { ...font.body.strong, fontSize: 12, lineHeight: 18, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, paddingHorizontal: space.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 49 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: ramp.neutral[200],
  },
  chipOn: { backgroundColor: colors.accent },
  chipPressed: { opacity: 0.6 },
  chipLabel: { ...font.body.body, fontSize: 13, color: ramp.neutral[700] },
  // Ink on the orange, not cream — `colors.accent` is a fill.
  chipLabelOn: { color: colors.text },
});

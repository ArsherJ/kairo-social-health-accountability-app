import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { QUEST_CATALOGUE, type QuestTier } from '@kairo/core';
import { OnboardingCta } from '@/features/onboarding/OnboardingCta.tsx';
import { OnboardingRail } from '@/features/onboarding/OnboardingChrome.tsx';
import { useOnboardingAnswers } from '@/features/onboarding/answers.ts';
import { compactFigure, questUnit } from '@/features/quests/quest-dial.ts';
import { colors, font, radius, ramp, shadow, space } from '@/theme.ts';
import { Gradient, Screen, Text } from '@/ui/index.ts';
import type { Stop } from '@/ui/gradient.ts';

const BAND: Stop[] = [
  { color: ramp.teal[700], at: 0 },
  { color: ramp.sky[600], at: 1 },
];

/**
 * Beat 5 — how hard the daily three should be.
 *
 * **Before the name screen, and written by it.** `quest_tier_override` is in
 * `profiles`' column-level UPDATE grant and not its INSERT grant, so there is
 * nothing to write to until the row exists — and the row may not exist yet,
 * because deviation #22 requires it to commit exactly once on the last screen.
 * The answer is therefore held in `useOnboardingAnswers` and written there.
 * See that store; this screen only collects.
 *
 * **The copy names the automatic rule's actual input**, exactly as the Settings
 * screen does, and for the same reason: `questTier()` keys off how many days
 * have scored, which measures engagement rather than fitness, so it is wrong by
 * construction for a long-standing gentle user and a brand-new athlete alike.
 * Somebody who finds their quests too easy needs to understand why rather than
 * assume the app measured them and got it wrong. That is also why the override
 * **wins outright** — a rule that could veto it would make it a hint.
 *
 * **The sample targets are real**, read from `QUESTS` rather than typed in. A
 * screen that promised "9,000 steps" while the engine dealt something else
 * would be a lie discovered on day one, and the tier tables move.
 */
export default function Difficulty() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const chosen = useOnboardingAnswers((s) => s.questTier);
  const setQuestTier = useOnboardingAnswers((s) => s.setQuestTier);

  return (
    <Screen bleed>
      <View style={styles.band}>
        <Gradient stops={BAND} steps={20} />
        <View style={[styles.bandBody, { paddingTop: insets.top + space.sm }]}>
          <OnboardingRail filled={2} partial={0.5} tone="light" onBack={() => router.back()} />
          <Text scale="chrome" style={styles.headline}>
            Three quests a day.{'\n'}How big?
          </Text>
        </View>
      </View>

      <View style={styles.page}>
        <Choice
          tier={null}
          title="Automatic"
          blurb="Grows with how long you have been here"
          icon="auto-fix"
          tint={ramp.teal[600]}
          wash={colors.tealTint}
          selected={chosen === null}
          onPress={() => setQuestTier(null)}
        />

        {TIERS.map(({ tier, title, icon, tint, wash }) => (
          <Choice
            key={tier}
            tier={tier}
            title={title}
            icon={icon}
            tint={tint}
            wash={wash}
            samples={samplesFor(tier)}
            selected={chosen === tier}
            onPress={() => setQuestTier(tier)}
          />
        ))}

        <View style={styles.note}>
          <MaterialCommunityIcons
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            name="information-outline"
            size={16}
            color={colors.muted}
          />
          <Text style={styles.noteText}>
            Change it any time in Settings. Your choice always wins over the
            automatic rule.
          </Text>
        </View>

        <View style={{ paddingBottom: space.md }}>
          <OnboardingCta
            label="Next"
            tone="ink"
            icon="arrow-right"
            onPress={() => router.push('/privacy')}
          />
        </View>
      </View>
    </Screen>
  );
}

/**
 * One sample per metric for a tier, in the metric's own raw unit.
 *
 * Taken from the authored set rather than written down: `QUEST_CATALOGUE` is the
 * table `pickQuests` deals from, so a tier whose targets move moves this screen
 * with it. One per metric and no more — the point is the *size* of a day, and
 * listing every quest in a tier would be a spreadsheet.
 */
function samplesFor(tier: QuestTier): { icon: string; text: string }[] {
  const seen = new Set<string>();
  const out: { icon: string; text: string }[] = [];

  for (const quest of QUEST_CATALOGUE) {
    if (quest.tier !== tier || seen.has(quest.metric)) continue;
    seen.add(quest.metric);
    const unit = questUnit(quest.metric);
    out.push({
      icon: METRIC_ICON[quest.metric] ?? 'circle-small',
      text: unit ? `${compactFigure(quest.target)} ${unit}` : compactFigure(quest.target),
    });
    if (out.length === 3) break;
  }

  return out;
}

const METRIC_ICON: Record<string, string> = {
  steps: 'shoe-print',
  active_kcal: 'fire',
  active_hours: 'clock-time-four-outline',
  distance_m: 'map-marker-distance',
  sleep_minutes: 'weather-night',
};

const TIERS = [
  {
    tier: 'starter' as const,
    title: 'Starter',
    icon: 'sprout' as const,
    tint: ramp.sage[500],
    wash: ramp.sage[200],
  },
  {
    tier: 'steady' as const,
    title: 'Steady',
    icon: 'walk' as const,
    tint: colors.accent,
    wash: ramp.accent[200],
  },
  {
    tier: 'strong' as const,
    title: 'Strong',
    icon: 'lightning-bolt' as const,
    tint: colors.coral,
    wash: colors.coralTint,
  },
];

/**
 * One option.
 *
 * A whole row is the touch target, and it is **one** accessibility element —
 * a title, three sample chips and a radio are five stops otherwise, times four
 * options. The selected state is carried by `accessibilityState`, not only by
 * the border, so it is knowable without seeing it.
 */
function Choice({
  title,
  blurb,
  icon,
  tint,
  wash,
  samples,
  selected,
  onPress,
}: {
  tier: QuestTier | null;
  title: string;
  blurb?: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tint: string;
  wash: string;
  samples?: { icon: string; text: string }[];
  selected: boolean;
  onPress: () => void;
}) {
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  const spoken = samples?.length ? `${title}. ${samples.map((s) => s.text).join(', ')}` : `${title}. ${blurb ?? ''}`;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={spoken}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed]}
    >
      <View {...hidden} style={[styles.choiceIcon, { backgroundColor: wash }]}>
        <MaterialCommunityIcons name={icon} size={22} color={tint} />
      </View>

      <View {...hidden} style={styles.choiceBody}>
        <Text scale="chrome" style={styles.choiceTitle}>
          {title}
        </Text>
        {blurb && (
          <Text scale="chrome" style={styles.choiceBlurb}>
            {blurb}
          </Text>
        )}
        {samples && (
          <View style={styles.samples}>
            {samples.map((s) => (
              <View key={s.text} style={styles.sample}>
                <MaterialCommunityIcons
                  name={s.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                  size={14}
                  color={tint}
                />
                <Text scale="fixed" style={styles.sampleText}>
                  {s.text}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View {...hidden}>
        {selected ? (
          <MaterialCommunityIcons name="check-circle" size={24} color={ramp.teal[600]} />
        ) : (
          <View style={styles.radio} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  band: {
    borderBottomLeftRadius: 44,
    borderBottomRightRadius: 44,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  bandBody: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.lg },
  headline: { ...font.display.major, fontSize: 28, lineHeight: 34, color: colors.bg },
  page: { paddingHorizontal: space.lg, gap: 12, paddingTop: space.lg },

  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: space.md,
    borderRadius: radius.lg + 2,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    // A border here means *selected*, never *contained* — Panel's rule.
    borderWidth: 2.5,
    borderColor: 'transparent',
    ...shadow.md,
  },
  choiceOn: { borderColor: ramp.teal[600] },
  pressed: { opacity: 0.7 },
  choiceIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // `flex: 1` so the radio keeps its place when the title wraps at large type.
  choiceBody: { flex: 1, gap: 3 },
  choiceTitle: { ...font.display.small, fontSize: 18, color: colors.text },
  choiceBlurb: { ...font.body.strong, color: colors.muted },
  // Wraps, because three chips do not fit one line past about 1.3x Dynamic
  // Type and a row that cannot fit is the permission sheet's 2026-08-17 failure.
  samples: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 2 },
  sample: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sampleText: { ...font.body.strong, fontSize: 11.5, color: colors.subtle },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: ramp.neutral[300],
  },

  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4, marginTop: 4 },
  noteText: { flex: 1, ...font.body.strong, fontSize: 12, lineHeight: 18, color: colors.muted },
});

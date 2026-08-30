import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { OnboardingCta } from '@/features/onboarding/OnboardingCta.tsx';
import { OnboardingRail } from '@/features/onboarding/OnboardingChrome.tsx';
import { useOnboardingAnswers } from '@/features/onboarding/answers.ts';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { Gradient, Text } from '@/ui/index.ts';
import type { Stop } from '@/ui/gradient.ts';

const FIELD: Stop[] = [
  { color: ramp.sage[500], at: 0 },
  { color: ramp.sage[600], at: 0.6 },
  { color: ramp.sage[700], at: 1 },
];

/**
 * Beat 6 — what leaves the phone, before anything does.
 *
 * **The claim here has to be exactly true**, which is why it is written the way
 * it is. The HealthKit permission sheet used to promise squadmates "never your
 * raw numbers", and deviation #47 stopped that being true when the race began
 * projecting capped steps behind a reciprocal consent gate. A stale privacy
 * claim is the worst kind, and that one was rewritten rather than annotated.
 * This screen inherits the corrected wording: **daily totals only, never a
 * route, never an hour-by-hour trail** — which is what `squad_leaderboard()`
 * actually projects.
 *
 * Health data is named first because it is the one thing that leaves the phone
 * at all, and it carries a lock rather than a switch: the app cannot function
 * without it, and a toggle that cannot be turned off is a lie about who is in
 * control. The lock says "required" honestly.
 *
 * Sharing totals is the switch that genuinely changes what other people see.
 * Off means the sky is empty **both ways** — the gate is reciprocal (deviation
 * #47), and saying so here is the difference between a setting and a surprise.
 *
 * Like the difficulty beat, this only **collects**: `squad_data_consent_at` is
 * in the UPDATE grant and not the INSERT grant, and deviation #22 requires the
 * profile row to commit exactly once on the name screen. See
 * `useOnboardingAnswers`.
 */
export default function Privacy() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const shareTotals = useOnboardingAnswers((s) => s.shareTotals);
  const setShareTotals = useOnboardingAnswers((s) => s.setShareTotals);

  return (
    <View style={styles.screen}>
      <Gradient stops={FIELD} steps={24} />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.blob}
      />

      <View
        style={[
          styles.body,
          { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg },
        ]}
      >
        <OnboardingRail filled={2} partial={1} onBack={() => router.back()} />

        <Text scale="chrome" style={styles.headline}>
          Your privacy,{'\n'}your call
        </Text>
        <Text style={styles.intro}>
          Kairo reads your steps to raise your bird and rank your day. You can
          change any of this later in Settings.
        </Text>

        <View style={styles.cards}>
          <Card
            icon="heart-pulse"
            tint={ramp.gold[400]}
            title="Health data"
            body="Steps, active calories, sleep. Required — it is the whole game."
            locked
          />

          <Card
            icon="account-multiple"
            tint="#4ce3ff"
            title="Share totals with your flock"
            body={
              'Daily totals only — never your route, never an hour-by-hour ' +
              'trail. Off means the sky is empty both ways.'
            }
            value={shareTotals}
            onChange={setShareTotals}
          />
        </View>

        <View style={styles.spacer} />

        <OnboardingCta
          label="Looks good"
          tone="glass"
          onPress={() => router.push('/name')}
        />

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Read Kairo's privacy policy"
          hitSlop={space.sm}
          onPress={() => router.push('/progress')}
          style={({ pressed }) => [styles.policy, pressed && { opacity: 0.6 }]}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            name="shield-lock-outline"
            size={15}
            color="rgba(255,255,255,0.7)"
          />
          <Text scale="chrome" style={styles.policyLabel}>
            How Kairo handles your data
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * One disclosure.
 *
 * A locked row is **not** a disabled switch: a switch that cannot move reads as
 * broken, and a disabled one reads as "you could have this and we said no". A
 * lock glyph reads as "this is how the app works", which is the truth.
 *
 * `Switch` rather than a hand-built toggle — React Native's is the platform
 * control, comes with its own haptics and VoiceOver behaviour, and announces
 * its state without being told to. The label goes on the switch itself so the
 * row is one element with a working control in it.
 */
function Card({
  icon,
  tint,
  title,
  body,
  locked = false,
  value,
  onChange,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tint: string;
  title: string;
  body: string;
  locked?: boolean;
  value?: boolean;
  onChange?: (next: boolean) => void;
}) {
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View style={styles.card}>
      <MaterialCommunityIcons {...hidden} name={icon} size={22} color={tint} />

      <View style={styles.cardBody}>
        <Text {...hidden} scale="chrome" style={styles.cardTitle}>
          {title}
        </Text>
        <Text {...hidden} scale="chrome" style={styles.cardText}>
          {body}
        </Text>
      </View>

      {locked ? (
        <View accessible accessibilityLabel={`${title}: required`} style={styles.lock}>
          <MaterialCommunityIcons {...hidden} name="lock" size={13} color={ramp.sage[700]} />
        </View>
      ) : (
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={onChange}
          trackColor={{ true: ramp.teal[500], false: 'rgba(255,255,255,0.22)' }}
          thumbColor={colors.bg}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ramp.sage[600] },
  blob: {
    position: 'absolute',
    top: -70,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  body: { flex: 1, paddingHorizontal: space.lg, gap: space.md },
  headline: { ...font.display.major, fontSize: 30, lineHeight: 36, color: colors.bg, marginTop: space.sm },
  intro: { ...font.body.body, fontSize: 13.5, lineHeight: 21, color: 'rgba(255,255,255,0.82)' },
  cards: { gap: 12, marginTop: space.xs },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: space.md + 2,
    borderRadius: radius.lg + 2,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(36,20,80,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  // `flex: 1` so the control keeps its place when the copy wraps at large type.
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { ...font.display.small, color: colors.bg },
  cardText: { ...font.body.strong, fontSize: 12.5, lineHeight: 18, color: 'rgba(255,255,255,0.65)' },
  lock: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  spacer: { flex: 1 },
  policy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  policyLabel: { ...font.body.body, fontSize: 12.5, color: 'rgba(255,255,255,0.7)' },
});

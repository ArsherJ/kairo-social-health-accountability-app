import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { OnboardingDots, OnboardingRail } from '@/features/onboarding/OnboardingChrome.tsx';
import { beatCta, onboardingBeat, onboardingSkipTarget, valueCardPosition } from '@/features/onboarding/beats.ts';
import { useBeatImpression } from '@/features/onboarding/useBeatImpression.ts';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { OnboardingCta } from '@/features/onboarding/OnboardingCta.tsx';
import { Gradient, Text } from '@/ui/index.ts';
import type { Stop } from '@/ui/gradient.ts';

/** Violet into pink: the flock's own colours, before you have one. */
const FIELD: Stop[] = [
  { color: '#8b5cff', at: 0 },
  { color: ramp.sage[500], at: 0.46 },
  { color: colors.damage, at: 1 },
];

/**
 * Beat 1 of the onboarding run — what this is.
 *
 * **This is the new entry point.** Onboarding was `/connect` → `/name` since
 * deviation #55, which meant the very first thing a brand-new account saw was
 * a permission request, before anything had told them what they were granting
 * it for. That is the worst possible order for the one dialog whose refusal
 * cannot be undone from inside the app, and it is why two value cards now come
 * first.
 *
 * **Every step still sits before the name screen.** The profile row commits
 * exactly once, there — deviation #22's rule is unchanged and this run is
 * arranged around it, not against it. What the two screens after this one
 * collect is held in `useOnboardingAnswers` and written by the name screen; see
 * that store for why it has to work that way.
 *
 * Skip lands on the last beat of the pitch, not past it. It used to name
 * `/connect` — right while the pitch ended there, and wrong since the mirror
 * beat began sitting between the pitch and the ask, because it would route the
 * people most likely to decline around the argument written for them. The
 * destination is derived; see `onboardingSkipTarget`.
 */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const beat = onboardingBeat('welcome');
  useBeatImpression('welcome');

  return (
    <View style={styles.screen}>
      <Gradient stops={FIELD} steps={28} />

      {/* Two soft bodies, placed off both edges so neither resolves into a
          shape you could name. The same device `Diorama` used before it had a
          literal sky to draw. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.blob, { top: -90, left: -70, width: 280, height: 280 }]}
      />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.blob, { bottom: 120, right: -90, width: 300, height: 300, opacity: 0.09 }]}
      />

      <View style={[styles.body, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]}>
        <OnboardingRail
          filled={beat.filled}
          partial={beat.partial}
          onSkip={() => router.replace(onboardingSkipTarget())}
        />

        <View style={styles.middle}>
          <Text scale="chrome" style={styles.eyebrow}>
            WELCOME TO
          </Text>
          <Text scale="fixed" style={styles.wordmark}>
            Kairo
          </Text>

          {/* Three birds in a heap. Decorative — the sentence below says what
              they are, and three identical announced images would say it three
              more times. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.flock}
          >
            <KairoThumbnail pose="walk" size={112} decorative />
            <KairoThumbnail pose="race_victory" size={172} decorative />
            <KairoThumbnail pose="run" size={120} decorative />
          </View>

          {/* "your flock", never "your barkada" — deviation #26 retired that
              word along with "Hunter", and the design's copy predates it. */}
          <Text style={styles.pitch}>
            Your steps raise a bird. Walk with your flock, and who flies highest
            today is settled by real health data — not by talk.
          </Text>
        </View>

        <OnboardingDots {...valueCardPosition(beat)} />

        <OnboardingCta
          label={beatCta(beat)}
          tone="glass"
          icon="arrow-right"
          onPress={() => router.push('/one-sky')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ramp.sage[500] },
  blob: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  // Flow-based and spaced by one flexible middle, so nothing is pinned against
  // a height nothing enforces — the 2026-08-14 rule.
  body: { flex: 1, paddingHorizontal: space.lg, gap: space.lg },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  eyebrow: { ...font.body.label, color: 'rgba(255,255,255,0.72)', letterSpacing: 2 },
  wordmark: { ...font.display.brand, color: colors.bg },
  // The middle bird overlaps its neighbours, which is what makes three figures
  // read as a group rather than as a row.
  flock: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: space.md },
  pitch: {
    ...font.body.body,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.92)',
  },
});

import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { RACE_FINISH_LINE } from '@kairo/core';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { OnboardingCta } from '@/features/onboarding/OnboardingCta.tsx';
import { OnboardingDots, OnboardingRail } from '@/features/onboarding/OnboardingChrome.tsx';
import { beatCta, onboardingBeat, onboardingSkipTarget, valueCardPosition } from '@/features/onboarding/beats.ts';
import { useBeatImpression } from '@/features/onboarding/useBeatImpression.ts';
import { SkyCorridor } from '@/features/squad/SkyCorridor.tsx';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { Gradient, Text } from '@/ui/index.ts';
import type { Stop } from '@/ui/gradient.ts';

/** Daylight, the same ramp the Sky tab climbs. */
const FIELD: Stop[] = [
  { color: ramp.sky[500], at: 0 },
  { color: ramp.sky[400], at: 0.52 },
  { color: '#8fe0ff', at: 1 },
];

/**
 * Beat 2 of the onboarding run — what the game is.
 *
 * One sky, one flag, everybody in it. This is the screen that has to land the
 * single mechanic, and it lands it by showing the actual corridor from the Sky
 * tab rather than an illustration of one: the same `SkyCorridor`, the same
 * geometry from `@kairo/core`, at a fraction of the height. Somebody who
 * reaches the Sky tab on day two should recognise this picture, and they will,
 * because it is the same picture.
 *
 * **`RACE_FINISH_LINE`, never a literal.** It *is* `DAILY_STEP_BASELINE`, which
 * *is* the Daily Walk, so the number this screen teaches is the same number the
 * streak counts and the flag marks — one figure with three readings. `10_000`
 * must not appear here.
 */
export default function OneSky() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const beat = onboardingBeat('one-sky');
  useBeatImpression('one-sky');

  return (
    <View style={styles.screen}>
      <Gradient stops={FIELD} steps={28} />

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.cloud, { top: 130, left: -40, width: 200, height: 66 }]}
      />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.cloud, { top: 430, right: -50, width: 220, height: 70, opacity: 0.55 }]}
      />

      <View
        style={[
          styles.body,
          { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg },
        ]}
      >
        <OnboardingRail
          filled={beat.filled}
          partial={beat.partial}
          onBack={() => router.back()}
          onSkip={() => router.replace(onboardingSkipTarget())}
        />

        <View style={styles.middle}>
          <Text scale="chrome" style={styles.headline}>
            One sky,{'\n'}one flag
          </Text>

          {/* The real corridor, at a third of its height. Decorative here —
              the sentence under it is what teaches the rule, and a screen
              reader given the picture as well would hear the same fact twice. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.track}
          >
            <SkyCorridor width={CORRIDOR}>
              <View style={styles.leader}>
                <KairoThumbnail pose="race_victory" size={64} decorative />
              </View>
              <View style={styles.mid}>
                <KairoThumbnail pose="run" size={54} decorative />
              </View>
              <View style={styles.tail}>
                <KairoThumbnail pose="walk" size={44} decorative />
              </View>
            </SkyCorridor>
          </View>

          <View style={styles.flag}>
            <Text scale="fixed" style={styles.flagLabel}>
              {RACE_FINISH_LINE.toLocaleString()}
            </Text>
          </View>

          <Text style={styles.pitch}>
            Everyone flies the same {RACE_FINISH_LINE.toLocaleString()}-step lane
            each day. Cross the flag and your streak grows — the bird does the
            bragging for you.
          </Text>
        </View>

        <OnboardingDots {...valueCardPosition(beat)} />

        <OnboardingCta
          label={beatCta(beat)}
          tone="glass"
          icon="arrow-right"
          onPress={() => router.push('/mirror')}
        />
      </View>
    </View>
  );
}

/**
 * The corridor's width here, and therefore its height — `SkyCorridor` derives
 * one from the other through `SKY_PATH_ASPECT`, and the path is tall, so a
 * narrow box is what keeps this beat to one screen.
 */
const CORRIDOR = 92;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ramp.sky[400] },
  cloud: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  body: { flex: 1, paddingHorizontal: space.lg, gap: space.lg },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  headline: {
    ...font.display.major,
    fontSize: 36,
    lineHeight: 40,
    textAlign: 'center',
    color: colors.bg,
  },
  track: { alignItems: 'center' },
  // Absolute against drawn geometry, which is the one place that is right —
  // `SkyMarker` makes the same call for the same reason.
  leader: { position: 'absolute', top: 8, alignSelf: 'center' },
  mid: { position: 'absolute', top: '42%', left: -18 },
  tail: { position: 'absolute', bottom: 10, right: -12, opacity: 0.85 },
  flag: {
    backgroundColor: ramp.gold[400],
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  // Ink on gold — gold is a fill and cream on it is 1.52:1.
  flagLabel: { ...font.display.label, color: colors.text },
  pitch: {
    ...font.body.body,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.95)',
  },
});

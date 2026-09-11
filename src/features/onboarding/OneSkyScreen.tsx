import { StyleSheet, View } from 'react-native';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { SkyCorridor } from '@/features/squad/SkyCorridor.tsx';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Text, useStyles } from '@/ui/index.ts';
import { OnboardingCta } from './OnboardingCta.tsx';
import { OnboardingDots } from './OnboardingChrome.tsx';
import { OnboardingFrame } from './OnboardingFrame.tsx';
import { beatCta, type OnboardingBeat, valueCardPosition } from './beats.ts';
import { ONBOARDING_SCREEN_COPY } from './onboarding-screen-copy.ts';

export type OneSkyScreenProps = { beat: OnboardingBeat }
  & { onBack: () => void }
  & { onContinue: () => void }
  & { onSkip: () => void };

const copy = ONBOARDING_SCREEN_COPY.oneSky;
const CORRIDOR = 92;

export function OneSkyScreen({ beat, onBack, onContinue, onSkip }: OneSkyScreenProps) {
  const styles = useStyles(makeStyles);

  return (
    <OnboardingFrame
      beat={beat}
      onBack={onBack}
      onSkip={onSkip}
      footer={
        <>
          <OnboardingDots {...valueCardPosition(beat)} />
          <OnboardingCta label={beatCta(beat)} tone="bright" icon="arrow-right" onPress={onContinue} />
        </>
      }
    >
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
        <Text style={styles.pitch}>{copy.pitch}</Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.corridorCard}
      >
        <SkyCorridor width={CORRIDOR} progress={0.56}>
          <View style={styles.leader}><KairoThumbnail pose="race_victory" size={56} decorative /></View>
          <View style={styles.mid}><KairoThumbnail pose="run" size={48} decorative /></View>
          <View style={styles.tail}><KairoThumbnail pose="walk" size={40} decorative /></View>
        </SkyCorridor>
        <View style={styles.flag}>
          <Text scale="fixed" style={styles.flagLabel}>{copy.finishLine.toLocaleString()}</Text>
        </View>
      </View>
    </OnboardingFrame>
  );
}

const makeStyles = ({ colors, ramp, shadow }: Theme) => StyleSheet.create({
  copy: { alignItems: 'center', gap: space.sm },
  title: { ...font.display.major, fontSize: 36, lineHeight: 40, color: colors.text, textAlign: 'center' },
  pitch: { ...font.body.body, fontSize: 15, lineHeight: 23, color: colors.subtle, textAlign: 'center' },
  corridorCard: {
    minHeight: 315,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: ramp.sky[200],
    ...shadow.md,
  },
  leader: { position: 'absolute', top: 8, alignSelf: 'center' },
  mid: { position: 'absolute', top: '42%', left: -16 },
  tail: { position: 'absolute', bottom: 10, right: -10 },
  flag: { paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: ramp.gold[400] },
  flagLabel: { ...font.display.label, color: colors.ink },
});

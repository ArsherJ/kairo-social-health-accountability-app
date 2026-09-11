import { Image, StyleSheet, View } from 'react-native';
import { KAIRO_POSE_ASSETS } from '@/features/character/character-assets.ts';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Text, useStyles } from '@/ui/index.ts';
import { OnboardingCta } from './OnboardingCta.tsx';
import { OnboardingDots } from './OnboardingChrome.tsx';
import { OnboardingFrame } from './OnboardingFrame.tsx';
import { beatCta, type OnboardingBeat, valueCardPosition } from './beats.ts';
import { ONBOARDING_SCREEN_COPY } from './onboarding-screen-copy.ts';

export type MirrorScreenProps = { beat: OnboardingBeat }
  & { onBack: () => void }
  & { onContinue: () => void };

const copy = ONBOARDING_SCREEN_COPY.mirror;

export function MirrorScreen({ beat, onBack, onContinue }: MirrorScreenProps) {
  const styles = useStyles(makeStyles);

  return (
    <OnboardingFrame
      beat={beat}
      onBack={onBack}
      footer={
        <>
          <OnboardingDots {...valueCardPosition(beat)} />
          <OnboardingCta label={beatCta(beat)} tone="bright" icon="arrow-right" onPress={onContinue} />
        </>
      }
    >
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
        <Text style={styles.correction}>{copy.correction}</Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.stage}
      >
        <View style={styles.ground} />
        <Image source={KAIRO_POSE_ASSETS.idle} style={styles.bird} resizeMode="contain" />
      </View>
      <View style={styles.message}>
        <Text style={styles.pitch}>{copy.pitch}</Text>
        <Text style={styles.turn}>{copy.turn}</Text>
      </View>
    </OnboardingFrame>
  );
}

const makeStyles = ({ colors, ramp, shadow }: Theme) => StyleSheet.create({
  copy: { alignItems: 'center', gap: space.xs },
  title: { ...font.display.major, fontSize: 34, lineHeight: 38, color: colors.text, textAlign: 'center' },
  correction: { ...font.display.minor, lineHeight: 27, color: colors.accentDeep, textAlign: 'center' },
  stage: { minHeight: 190, alignItems: 'center', justifyContent: 'flex-end' },
  ground: { position: 'absolute', bottom: space.md, width: 148, height: 26, borderRadius: radius.pill, backgroundColor: ramp.neutral[300] },
  bird: { width: 170, height: 170 },
  message: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: colors.surface, ...shadow.md },
  pitch: { ...font.body.body, fontSize: 15, lineHeight: 23, color: colors.subtle, textAlign: 'center' },
  turn: { ...font.body.body, fontSize: 15, lineHeight: 23, color: colors.text, textAlign: 'center' },
});

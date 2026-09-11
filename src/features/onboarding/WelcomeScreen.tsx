import { useState } from 'react';
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { KAIRO_POSE_ASSETS } from '@/features/character/character-assets.ts';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Panel, Text, useStyles } from '@/ui/index.ts';
import { OnboardingCta } from './OnboardingCta.tsx';
import { OnboardingDots } from './OnboardingChrome.tsx';
import { OnboardingFrame } from './OnboardingFrame.tsx';
import { beatCta, type OnboardingBeat, onboardingBeat, valueCardPosition } from './beats.ts';
import { ONBOARDING_SCREEN_COPY } from './onboarding-screen-copy.ts';

const copy = ONBOARDING_SCREEN_COPY.welcome;

export type WelcomeScreenProps = { beat?: OnboardingBeat }
  & { onContinue: () => void }
  & { onSkip: () => void };

export function WelcomeScreen({
  onContinue,
  onSkip,
  beat = onboardingBeat('welcome'),
}: WelcomeScreenProps) {
  const [expanded, setExpanded] = useState(false);
  const { width } = useWindowDimensions();
  const styles = useStyles(makeStyles);

  return (
    <OnboardingFrame
      beat={beat}
      onSkip={onSkip}
      footer={
        <>
          <OnboardingDots {...valueCardPosition(beat)} />
          <OnboardingCta
            label={beatCta(beat)}
            tone="bright"
            icon="arrow-right"
            lines={2}
            onPress={onContinue}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            style={({ pressed }) => [styles.detailButton, pressed && styles.pressed]}
          >
            <Text scale="chrome" style={styles.detailLabel}>
              {expanded ? copy.less : copy.detail}
            </Text>
          </Pressable>
        </>
      }
    >
      <Text scale="chrome" style={styles.wordmark}>{copy.wordmark}</Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.stage}
      >
        <View style={styles.halo} />
        <Image
          source={KAIRO_POSE_ASSETS.idle}
          style={{ width: Math.min(width * 0.56, 220), height: Math.min(width * 0.56, 220) }}
          resizeMode="contain"
        />
      </View>
      <View style={styles.copy}>
        <Text scale="chrome" style={styles.eyebrow}>{copy.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
      </View>
      {expanded ? (
        <Panel style={styles.explainer}>
          <Text style={styles.explainerTitle}>{copy.solo}</Text>
          <Text style={styles.explainerBody}>{copy.soloBody}</Text>
          <Text style={styles.explainerTitle}>{copy.flock}</Text>
          <Text style={styles.explainerBody}>{copy.flockBody}</Text>
        </Panel>
      ) : null}
    </OnboardingFrame>
  );
}

const makeStyles = ({ colors, ramp }: Theme) => StyleSheet.create({
  wordmark: { ...font.display.brandSmall, color: colors.muted, textAlign: 'center' },
  stage: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: radius.pill,
    backgroundColor: ramp.sage[200],
  },
  copy: { alignItems: 'center', gap: space.sm },
  eyebrow: { ...font.body.label, color: colors.accentDeep, textAlign: 'center' },
  title: { ...font.display.major, color: colors.text, textAlign: 'center' },
  body: { ...font.body.body, fontSize: 16, lineHeight: 25, color: colors.subtle, textAlign: 'center' },
  detailButton: { minHeight: 48, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
  detailLabel: { ...font.body.body, color: colors.accentDeep },
  pressed: { opacity: 0.65 },
  explainer: { marginTop: 0, gap: space.sm },
  explainerTitle: { ...font.display.small, color: colors.text },
  explainerBody: { ...font.body.body, color: colors.subtle, paddingBottom: space.sm },
});

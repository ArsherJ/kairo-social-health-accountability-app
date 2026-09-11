import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { KAIRO_POSE_ASSETS } from '@/features/character/character-assets.ts';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Text, useStyles, useTheme } from '@/ui/index.ts';
import { OnboardingFrame } from './OnboardingFrame.tsx';
import { onboardingBeat } from './beats.ts';
import { pickTrivia } from './trivia.ts';
import { ONBOARDING_SCREEN_COPY } from './onboarding-screen-copy.ts';

const HATCH = onboardingBeat('hatching');
const copy = ONBOARDING_SCREEN_COPY.hatching;

export function HatchingBeat({ userId }: { userId: string | undefined }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const fact = pickTrivia(userId);
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <OnboardingFrame
      beat={HATCH}
      footer={
        <View {...hidden} style={styles.status}>
          <ActivityIndicator size="small" color={colors.muted} />
          <Text scale="chrome" style={styles.statusLabel}>{copy.status}</Text>
        </View>
      }
    >
      <View
        accessible
        accessibilityLabel={`${copy.eyebrow} ${fact.lead} ${fact.figure} ${fact.tail} ${fact.note}. ${copy.status}`}
        style={styles.card}
      >
        <View {...hidden} style={styles.lamp}>
          <MaterialCommunityIcons name="lightbulb-on" size={30} color={colors.ink} />
        </View>
        <Text {...hidden} scale="chrome" style={styles.eyebrow}>{copy.eyebrow}</Text>
        <Text {...hidden} scale="chrome" style={styles.headline}>
          {fact.lead}{' '}<Text style={styles.figure}>{fact.figure}</Text>{fact.tail ? ` ${fact.tail}` : ''}
        </Text>
        <Text {...hidden} scale="chrome" style={styles.note}>{fact.note}</Text>
        <Image {...hidden} source={KAIRO_POSE_ASSETS.run} style={styles.bird} resizeMode="contain" />
      </View>
    </OnboardingFrame>
  );
}

const makeStyles = ({ colors, ramp, shadow }: Theme) => StyleSheet.create({
  card: {
    minHeight: 470,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    ...shadow.md,
  },
  lamp: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ramp.gold[400],
    marginBottom: space.sm,
  },
  eyebrow: { ...font.body.label, color: colors.muted },
  headline: { ...font.display.major, fontSize: 28, lineHeight: 35, textAlign: 'center', color: colors.text },
  figure: { color: colors.accentDeep },
  note: { ...font.body.body, lineHeight: 21, textAlign: 'center', color: colors.subtle },
  bird: { width: 92, height: 92, marginTop: space.sm },
  status: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  statusLabel: { ...font.body.body, color: colors.muted },
});

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Numeral, Text, useStyles } from '@/ui/index.ts';
import { OnboardingCta } from './OnboardingCta.tsx';
import { OnboardingFrame } from './OnboardingFrame.tsx';
import { beatCta, type OnboardingBeat } from './beats.ts';
import { ONBOARDING_SCREEN_COPY } from './onboarding-screen-copy.ts';

export type ConnectScreenProps = { beat: OnboardingBeat }
  & { onBack: () => void }
  & { onContinue: () => void }
  & {
  supportsPermission: boolean;
  phase: 'asking' | 'revealed';
  busy: boolean;
  failed: boolean;
  steps: number | null;
  privacyCopy: string;
  onConnect: () => void;
};

const copy = ONBOARDING_SCREEN_COPY.connect;

export function ConnectScreen({
  beat,
  onBack,
  onContinue,
  supportsPermission,
  phase,
  busy,
  failed,
  steps,
  privacyCopy,
  onConnect,
}: ConnectScreenProps) {
  const styles = useStyles(makeStyles);
  const hasReading = phase === 'revealed' && steps !== null && steps > 0;

  return (
    <OnboardingFrame
      beat={beat}
      onBack={onBack}
      footer={
        !supportsPermission || phase === 'revealed' ? (
          <OnboardingCta label={copy.continue} tone="bright" icon="arrow-right" onPress={onContinue} />
        ) : (
          <>
            <OnboardingCta label={beatCta(beat)} tone="bright" busy={busy} onPress={onConnect} />
            <OnboardingCta label={copy.notNow} tone="glass" disabled={busy} onPress={onContinue} />
          </>
        )
      }
    >
      <View style={styles.heading}>
        <Text scale="chrome" style={styles.eyebrow}>
          {supportsPermission ? copy.supportedLabel : copy.unsupportedLabel}
        </Text>
        <Text accessibilityRole="header" style={styles.title}>
          {supportsPermission ? copy.supportedTitle : copy.unsupportedTitle}
        </Text>
        <Text style={styles.help}>{supportsPermission ? privacyCopy : copy.unsupportedBody}</Text>
      </View>

      <View style={styles.illustration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.readingDisc}>
          <MaterialCommunityIcons name="shoe-print" size={28} style={styles.readingIcon} />
        </View>
        <KairoThumbnail pose="walk" size={150} decorative />
      </View>

      {hasReading ? (
        <View style={styles.reveal} accessible accessibilityLabel={copy.readingLabel(steps)}>
          <View style={styles.revealRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Numeral value={steps} size="hero" animate />
            <Text scale="fixed" style={styles.revealUnit}>{copy.unit}</Text>
          </View>
          <Text style={styles.revealCaption} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {copy.revealCaption}
          </Text>
        </View>
      ) : null}
      {failed ? <Text selectable style={styles.failed}>{copy.failed}</Text> : null}
      {phase === 'revealed' && (steps === null || steps === 0) ? <Text style={styles.quiet}>{copy.quiet}</Text> : null}
    </OnboardingFrame>
  );
}

const makeStyles = ({ colors, ramp, shadow }: Theme) => StyleSheet.create({
  heading: { gap: space.sm },
  eyebrow: { ...font.body.label, color: colors.accentDeep },
  title: { ...font.body.title, color: colors.text, lineHeight: 27 },
  help: { ...font.body.body, fontSize: 15, lineHeight: 22, color: colors.subtle },
  illustration: {
    minHeight: 205,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: ramp.teal[200],
    ...shadow.sm,
  },
  readingDisc: { width: 58, height: 58, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  readingIcon: { color: colors.teal },
  reveal: { alignItems: 'center' },
  revealRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'center', gap: space.xs },
  revealUnit: { ...font.display.minor, color: colors.accentDeep, flexShrink: 1 },
  revealCaption: { ...font.body.strong, color: colors.subtle, marginTop: space.xs, textAlign: 'center' },
  quiet: { ...font.body.body, color: colors.muted, textAlign: 'center' },
  failed: { ...font.body.strong, color: colors.damage, lineHeight: 19 },
});

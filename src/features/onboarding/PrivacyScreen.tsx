import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Text, useStyles, useTheme } from '@/ui/index.ts';
import { OnboardingCta } from './OnboardingCta.tsx';
import { OnboardingFrame } from './OnboardingFrame.tsx';
import { beatCta, type OnboardingBeat } from './beats.ts';
import { ONBOARDING_SCREEN_COPY } from './onboarding-screen-copy.ts';

export type PrivacyScreenProps = { beat: OnboardingBeat }
  & { onBack: () => void }
  & { onContinue: () => void }
  & {
  shareTotals: boolean;
  onShareTotalsChange: (value: boolean) => void;
  healthCopy: string;
  sharingCopy: string;
  onPolicy: () => void;
};

const copy = ONBOARDING_SCREEN_COPY.privacy;

export function PrivacyScreen({
  beat,
  onBack,
  onContinue,
  shareTotals,
  onShareTotalsChange,
  healthCopy,
  sharingCopy,
  onPolicy,
}: PrivacyScreenProps) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();

  return (
    <OnboardingFrame
      beat={beat}
      onBack={onBack}
      footer={
        <>
          <OnboardingCta label={beatCta(beat)} tone="bright" onPress={onContinue} />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={copy.policyLabel}
            hitSlop={space.sm}
            onPress={onPolicy}
            style={({ pressed }) => [styles.policy, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="shield-lock-outline" size={17} color={colors.accentDeep} />
            <Text scale="chrome" style={styles.policyLabel}>{copy.policyText}</Text>
          </Pressable>
        </>
      }
    >
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
        <Text style={styles.intro}>{copy.intro}</Text>
      </View>
      <View style={styles.cards}>
        <PrivacyCard
          icon="heart-pulse"
          tint={colors.damage}
          title={copy.healthTitle}
          body={healthCopy}
          locked
        />
        <PrivacyCard
          icon="account-multiple"
          tint={colors.teal}
          title={copy.sharingTitle}
          body={sharingCopy}
          value={shareTotals}
          onChange={onShareTotalsChange}
        />
      </View>
    </OnboardingFrame>
  );
}

function PrivacyCard({
  icon, tint, title, body, locked = false, value, onChange,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tint: string;
  title: string;
  body: string;
  locked?: boolean;
  value?: boolean;
  onChange?: (next: boolean) => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors, ramp } = useTheme();
  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;
  return (
    <View style={styles.card}>
      <View {...hidden} style={[styles.iconDisc, { backgroundColor: ramp.neutral[200] }]}>
        <MaterialCommunityIcons name={icon} size={23} color={tint} />
      </View>
      <View {...hidden} style={styles.cardBody}>
        <Text scale="chrome" style={styles.cardTitle}>{title}</Text>
        <Text scale="chrome" style={styles.cardText}>{body}</Text>
      </View>
      {locked ? (
        <View accessible accessibilityLabel={copy.requiredLabel(title)} style={styles.lock}>
          <MaterialCommunityIcons {...hidden} name="lock" size={14} color={colors.accentDeep} />
        </View>
      ) : (
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={onChange}
          trackColor={{ true: colors.teal, false: colors.borderStrong }}
          thumbColor={colors.surface}
        />
      )}
    </View>
  );
}

const makeStyles = ({ colors, shadow }: Theme) => StyleSheet.create({
  heading: { gap: space.sm },
  title: { ...font.display.major, fontSize: 30, lineHeight: 36, color: colors.text },
  intro: { ...font.body.body, lineHeight: 21, color: colors.subtle },
  cards: { gap: space.md },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: colors.surface, ...shadow.md },
  iconDisc: { width: 44, height: 44, borderRadius: radius.md, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: space.xs },
  cardTitle: { ...font.display.small, color: colors.text },
  cardText: { ...font.body.strong, fontSize: 12.5, lineHeight: 18, color: colors.subtle },
  lock: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  policy: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  policyLabel: { ...font.body.body, color: colors.accentDeep },
  pressed: { opacity: 0.65 },
});

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { QUEST_CATALOGUE, type QuestTier } from '@kairo/core';
import { questTierName } from '@/features/quests/quest-copy.ts';
import { compactFigure, questUnit } from '@/features/quests/quest-dial.ts';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Text, useStyles, useTheme } from '@/ui/index.ts';
import type { CalibrationNote } from './calibration-copy.ts';
import { OnboardingCta } from './OnboardingCta.tsx';
import { OnboardingFrame } from './OnboardingFrame.tsx';
import { beatCta, type OnboardingBeat } from './beats.ts';
import { ONBOARDING_SCREEN_COPY } from './onboarding-screen-copy.ts';

export type DifficultyScreenProps = { beat: OnboardingBeat }
  & { onBack: () => void }
  & { onContinue: () => void }
  & {
  chosen: QuestTier | null;
  onChoose: (tier: QuestTier | null) => void;
  note: CalibrationNote | null;
};

const copy = ONBOARDING_SCREEN_COPY.difficulty;

export function DifficultyScreen({ beat, onBack, onContinue, chosen, onChoose, note }: DifficultyScreenProps) {
  const styles = useStyles(makeStyles);
  const { colors, ramp } = useTheme();
  const options = [
    { tier: null, title: copy.automatic, blurb: copy.automaticBlurb, icon: 'auto-fix' as const, tint: colors.teal, wash: colors.tealTint },
    { tier: 'starter' as const, title: questTierName('starter'), icon: 'sprout' as const, tint: colors.sage, wash: ramp.sage[200] },
    { tier: 'steady' as const, title: questTierName('steady'), icon: 'walk' as const, tint: colors.accentDeep, wash: ramp.accent[200] },
    { tier: 'strong' as const, title: questTierName('strong'), icon: 'lightning-bolt' as const, tint: colors.damage, wash: colors.coralTint },
  ];

  return (
    <OnboardingFrame
      beat={beat}
      onBack={onBack}
      footer={<OnboardingCta label={beatCta(beat)} tone="bright" icon="arrow-right" onPress={onContinue} />}
    >
      <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
      {note ? (
        <View style={styles.reading} accessible accessibilityLabel={`${note.line} ${note.privacy}`}>
          <Text scale="chrome" style={styles.readingLine} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{note.line}</Text>
          <Text scale="chrome" style={styles.readingPrivacy} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{note.privacy}</Text>
        </View>
      ) : null}
      <View accessibilityRole="radiogroup" style={styles.choices}>
        {options.map((option) => (
          <Choice
            key={option.tier ?? 'automatic'}
            {...option}
            samples={option.tier === null ? undefined : samplesFor(option.tier)}
            selected={chosen === option.tier}
            onPress={() => onChoose(option.tier)}
          />
        ))}
      </View>
      <View style={styles.note}>
        <MaterialCommunityIcons name="information-outline" size={17} color={colors.muted} />
        <Text style={styles.noteText}>{copy.note}</Text>
      </View>
    </OnboardingFrame>
  );
}

function samplesFor(tier: QuestTier): { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; text: string }[] {
  const seen = new Set<string>();
  const out: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; text: string }[] = [];
  for (const quest of QUEST_CATALOGUE) {
    if (quest.tier !== tier || seen.has(quest.metric)) continue;
    seen.add(quest.metric);
    const unit = questUnit(quest.metric);
    out.push({ icon: METRIC_ICON[quest.metric] ?? 'circle-small', text: unit ? `${compactFigure(quest.target)} ${unit}` : compactFigure(quest.target) });
    if (out.length === 3) break;
  }
  return out;
}

const METRIC_ICON: Record<string, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  steps: 'shoe-print', active_kcal: 'fire', active_hours: 'clock-time-four-outline', distance_m: 'map-marker-distance', sleep_minutes: 'weather-night',
};

function Choice({
  title, blurb, icon, tint, wash, samples, selected, onPress,
}: {
  tier: QuestTier | null;
  title: string;
  blurb?: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tint: string;
  wash: string;
  samples?: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; text: string }[];
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const spoken = samples?.length ? `${title}. ${samples.map((sample) => sample.text).join(', ')}` : `${title}. ${blurb ?? ''}`;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={spoken}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed]}
    >
      <View style={[styles.choiceIcon, { backgroundColor: wash }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <MaterialCommunityIcons name={icon} size={22} color={tint} />
      </View>
      <View style={styles.choiceBody} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text scale="chrome" style={styles.choiceTitle}>{title}</Text>
        {blurb ? <Text scale="chrome" style={styles.choiceBlurb}>{blurb}</Text> : null}
        {samples ? (
          <View style={styles.samples}>
            {samples.map((sample) => (
              <View key={sample.text} style={styles.sample}>
                <MaterialCommunityIcons name={sample.icon} size={14} color={tint} />
                <Text scale="fixed" style={styles.sampleText}>{sample.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {selected ? <MaterialCommunityIcons name="check-circle" size={24} color={colors.teal} /> : <View style={styles.radio} />}
      </View>
    </Pressable>
  );
}

const makeStyles = ({ colors, ramp, shadow }: Theme) => StyleSheet.create({
  title: { ...font.display.major, fontSize: 30, lineHeight: 36, color: colors.text },
  reading: { padding: space.md, gap: space.xs, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: ramp.teal[200] },
  readingLine: { ...font.body.strong, fontSize: 15, lineHeight: 21, color: colors.text },
  readingPrivacy: { ...font.body.body, fontSize: 12, lineHeight: 17, color: colors.muted },
  choices: { gap: space.sm },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.surface, ...shadow.sm },
  choiceOn: { borderColor: colors.teal },
  pressed: { opacity: 0.72 },
  choiceIcon: { width: 46, height: 46, borderRadius: radius.md, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  choiceBody: { flex: 1, gap: 3 },
  choiceTitle: { ...font.display.small, fontSize: 18, color: colors.text },
  choiceBlurb: { ...font.body.strong, color: colors.muted },
  samples: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: 2 },
  sample: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sampleText: { ...font.body.strong, fontSize: 11.5, color: colors.subtle },
  radio: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.borderStrong },
  note: { minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingHorizontal: space.xs },
  noteText: { flex: 1, ...font.body.strong, fontSize: 12, lineHeight: 18, color: colors.muted },
});

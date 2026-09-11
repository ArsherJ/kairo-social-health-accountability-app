import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { KAIRO_BASE_ASSET } from '@/features/character/character-assets.ts';
import { DEFAULT_SPECIES, SPECIES } from '@/features/character/species.ts';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Text, useStyles, useTheme } from '@/ui/index.ts';
import { OnboardingCta } from './OnboardingCta.tsx';
import { OnboardingFrame } from './OnboardingFrame.tsx';
import { beatCta, type OnboardingBeat } from './beats.ts';
import { ONBOARDING_SCREEN_COPY } from './onboarding-screen-copy.ts';

export type NameScreenProps = { beat: OnboardingBeat }
  & { onBack: () => void }
  & {
  name: string;
  onNameChange: (name: string) => void;
  valid: boolean;
  busy: boolean;
  error: string | null;
  keyboardVerticalOffset?: number;
  onSubmit: () => void;
};

const copy = ONBOARDING_SCREEN_COPY.name;
const speciesName = SPECIES[DEFAULT_SPECIES].name;

export function NameScreen({
  beat,
  onBack,
  name,
  onNameChange,
  valid,
  busy,
  error,
  keyboardVerticalOffset = 0,
  onSubmit,
}: NameScreenProps) {
  const [inputFocused, setInputFocused] = useState(false);
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={styles.container}
    >
      <OnboardingFrame
        beat={beat}
        onBack={onBack}
        keyboardShouldPersistTaps="handled"
        footer={
          <>
            {error ? <Text selectable style={styles.error}>{error}</Text> : null}
            <OnboardingCta
              label={beatCta(beat)}
              tone="bright"
              disabled={!valid}
              busy={busy}
              onPress={onSubmit}
            />
            <Text style={styles.footnote}>{copy.footnote}</Text>
          </>
        }
      >
        <View style={styles.stage}>
          <Image
            source={KAIRO_BASE_ASSET}
            style={styles.figure}
            resizeMode="contain"
            accessible
            accessibilityRole="image"
            accessibilityLabel={copy.portraitLabel(speciesName)}
          />
        </View>
        <View style={styles.copy}>
          <Text scale="chrome" style={styles.eyebrow}>{copy.eyebrow}</Text>
          <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
          <Text style={styles.help}>{copy.help(speciesName)}</Text>
        </View>
        <View style={styles.inputCard}>
          <Text scale="chrome" style={styles.fieldLabel}>{copy.fieldLabel}</Text>
          <TextInput
            value={name}
            onChangeText={onNameChange}
            autoFocus
            autoCorrect={false}
            maxLength={copy.maxLength}
            accessibilityLabel={copy.accessibilityLabel}
            accessibilityHint={copy.accessibilityHint}
            maxFontSizeMultiplier={1.4}
            placeholder={copy.placeholder}
            placeholderTextColor={colors.muted}
            selectionColor={colors.accentDeep}
            style={[styles.input, inputFocused && styles.inputFocused]}
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
        </View>
      </OnboardingFrame>
    </KeyboardAvoidingView>
  );
}

const makeStyles = ({ colors, ramp, shadow }: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  stage: { minHeight: 245, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: ramp.sage[200] },
  figure: { width: 210, height: 210 },
  copy: { gap: space.sm },
  eyebrow: { ...font.body.label, color: colors.accentDeep },
  title: { ...font.display.major, color: colors.text },
  help: { ...font.body.body, lineHeight: 22, color: colors.subtle },
  inputCard: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: colors.surface, ...shadow.md },
  fieldLabel: { ...font.body.label, color: colors.muted },
  input: { minHeight: 56, borderBottomWidth: 2, borderBottomColor: colors.borderStrong, color: colors.text, fontSize: 28, fontFamily: font.body.body.fontFamily, paddingVertical: space.sm },
  inputFocused: { borderBottomColor: colors.accentDeep },
  error: { ...font.body.body, color: colors.damage },
  footnote: { ...font.body.strong, color: colors.muted, textAlign: 'center', minHeight: 44, textAlignVertical: 'center' },
});

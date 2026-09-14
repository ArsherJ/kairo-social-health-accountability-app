import { useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { isValidCharacterName, type QuestTier } from '@kairo/core';
import { ConnectScreen } from '../onboarding/ConnectScreen.tsx';
import { DifficultyScreen } from '../onboarding/DifficultyScreen.tsx';
import { HatchingBeat } from '../onboarding/HatchingBeat.tsx';
import { MirrorScreen } from '../onboarding/MirrorScreen.tsx';
import { NameScreen } from '../onboarding/NameScreen.tsx';
import { OneSkyScreen } from '../onboarding/OneSkyScreen.tsx';
import { PrivacyScreen } from '../onboarding/PrivacyScreen.tsx';
import { WelcomeScreen } from '../onboarding/WelcomeScreen.tsx';
import { onboardingSkipTarget } from '../onboarding/beats.ts';
import { calibrationNote } from '../onboarding/calibration-copy.ts';
import { PRIVACY_CLAIM } from '../privacy/claim-copy.ts';
import { PRIVACY_POLICY_URL } from '../support/links.ts';
import { Text, useTheme } from '../../ui/index.ts';
import { font, radius, space } from '../../theme.ts';
import { ONBOARDING_PREVIEW_COPY as copy } from './preview-copy.ts';
import { PREVIEW_BEATS, previewBeatAfter, previewKeyboardOffset } from './onboarding-preview.ts';

type SampleState = 'default' | 'busy' | 'error' | 'hatching';

/**
 * The reading the preview's Health ask pretends to take. Production writes
 * the proposed tier into the answers store the moment a reading lands, so the
 * difficulty beat mounts with the proposal already selected; the preview has
 * no store, so its chosen state starts from the same constant the note reads.
 */
const PREVIEW_CALIBRATION = { outcome: 'proposed', tier: 'steady', medianSteps: 6840 } as const;

export function OnboardingPreviewScreen({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'asking' | 'revealed'>('asking');
  const [chosen, setChosen] = useState<QuestTier | null>(PREVIEW_CALIBRATION.tier);
  const [shareTotals, setShareTotals] = useState(false);
  const [name, setName] = useState('');
  const [sampleState, setSampleState] = useState<SampleState>('default');
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const screenRef = useRef<View>(null);
  const { colors } = useTheme();
  const beat = PREVIEW_BEATS[index] ?? PREVIEW_BEATS[0];
  if (!beat) return null;

  const next = () => setIndex((current) => previewBeatAfter(current));
  const back = () => setIndex((current) => Math.max(0, current - 1));
  const skip = () => {
    const target = onboardingSkipTarget();
    const targetIndex = PREVIEW_BEATS.findIndex((entry) => entry.route === target);
    setIndex(targetIndex >= 0 ? targetIndex : 0);
  };
  const selectBeat = (nextIndex: number) => {
    setIndex(nextIndex);
    setSampleState('default');
  };
  const busy = sampleState === 'busy';
  const failed = sampleState === 'error';

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: space.sm, gap: space.xs, backgroundColor: colors.surface }}>
        <Text scale='chrome' style={{ ...font.body.strong, color: colors.text }}>
          {copy.localOnly}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
          {PREVIEW_BEATS.map((entry, beatIndex) => (
            <PreviewChoice
              key={entry.name}
              label={copy.beatLabels[entry.name]}
              selected={beatIndex === index}
              onPress={() => selectBeat(beatIndex)}
            />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
          {(['default', 'busy', 'error'] as const).map((value) => (
            <PreviewChoice
              key={value}
              label={copy.sampleStates[value]}
              selected={sampleState === value}
              onPress={() => setSampleState(value)}
            />
          ))}
          {beat.name === 'connect' ? (
            <PreviewChoice
              label={copy.sampleStates.hatching}
              selected={sampleState === 'hatching'}
              onPress={() => setSampleState('hatching')}
            />
          ) : null}
          {beat.name === 'name' ? (
            <PreviewChoice label={copy.fillName} selected={false} onPress={() => setName(copy.sampleName)} />
          ) : null}
        </ScrollView>
      </View>

      <View
        ref={screenRef}
        style={{ flex: 1 }}
        onLayout={() => {
          screenRef.current?.measureInWindow((_x, windowY) => {
            setKeyboardOffset(previewKeyboardOffset(windowY));
          });
        }}
      >
        {beat.name === 'welcome' ? (
          <WelcomeScreen beat={beat} onContinue={next} onSkip={skip} />
        ) : beat.name === 'one-sky' ? (
          <OneSkyScreen beat={beat} onBack={back} onContinue={next} onSkip={skip} />
        ) : beat.name === 'mirror' ? (
          <MirrorScreen beat={beat} onBack={back} onContinue={next} />
        ) : beat.name === 'connect' && sampleState === 'hatching' ? (
          <HatchingBeat userId='preview' />
        ) : beat.name === 'connect' ? (
          <ConnectScreen
            beat={beat}
            supportsPermission
            phase={phase}
            busy={busy}
            failed={failed}
            steps={phase === 'revealed' ? PREVIEW_CALIBRATION.medianSteps : null}
            privacyCopy={PRIVACY_CLAIM.connectHealth}
            onBack={back}
            onConnect={() => setPhase('revealed')}
            onContinue={next}
          />
        ) : beat.name === 'difficulty' ? (
          <DifficultyScreen
            beat={beat}
            chosen={chosen}
            onChoose={setChosen}
            note={calibrationNote(PREVIEW_CALIBRATION)}
            onBack={back}
            onContinue={next}
          />
        ) : beat.name === 'privacy' ? (
          <PrivacyScreen
            beat={beat}
            shareTotals={shareTotals}
            onShareTotalsChange={setShareTotals}
            healthCopy={PRIVACY_CLAIM.healthRequired}
            sharingCopy={PRIVACY_CLAIM.sharingTotals}
            onBack={back}
            onContinue={next}
            onPolicy={() => void Linking.openURL(PRIVACY_POLICY_URL)}
            // Inert: the preview never leaves its canvas.
            onCounting={() => {}}
          />
        ) : (
          <NameScreen
            beat={beat}
            name={name}
            onNameChange={setName}
            valid={isValidCharacterName(name)}
            busy={busy}
            error={failed ? copy.sampleError : null}
            keyboardVerticalOffset={keyboardOffset}
            onBack={back}
            onSubmit={() => {
              if (isValidCharacterName(name) && !busy) onComplete();
            }}
          />
        )}
      </View>
    </View>
  );
}

function PreviewChoice({ label, selected, onPress }: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, ramp } = useTheme();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: space.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        borderCurve: 'continuous',
        backgroundColor: selected ? ramp.accent[200] : colors.bg,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Text scale='chrome' style={{ ...font.body.strong, color: selected ? colors.accentDeep : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { evolutionStageForLevel } from '@kairo/core';
import { Diorama } from '../character/Diorama.tsx';
import { TodayChips, TodayCount } from '../character/TodayHud.tsx';
import { TodayNextStep } from '../character/TodayNextStep.tsx';
import { locationName, motionLocationForSteps } from '../character/living-mirror.ts';
import { WhackBanner } from '../whack/WhackBanner.tsx';
import { Panel, Screen, Text } from '../../ui/index.ts';
import { colors, font, space } from '../../theme.ts';
import { tw } from '../../ui/tailwind.ts';
import { PREVIEW_COPY as copy, previewReadings, type PreviewState } from './preview-copy.ts';
import { PREVIEW_POINTS } from './preview-data.ts';
import { PreviewStateNotice } from './PreviewStateNotice.tsx';

export function TodayPreviewScreen({ dark, state, onRetry, onWhackBack }: {
  dark: boolean;
  state: PreviewState;
  onRetry: () => void;
  onWhackBack: () => void;
}) {
  const [details, setDetails] = useState(false);
  const insets = useSafeAreaInsets();
  const steps = state === 'empty' ? 0 : 6840;
  const location = motionLocationForSteps(steps);
  const level = state === 'empty' ? 1 : 12;
  const stage = evolutionStageForLevel(level);
  const ink = dark ? colors.bg : colors.text;
  return (
    <Screen bleed tone={dark ? 'dark' : 'light'}>
      {state === 'loading' || state === 'error'
        ? (
          <View style={{ paddingTop: insets.top }}>
            <PreviewStateNotice state={state} onRetry={onRetry} />
          </View>
        )
        : (
          <>
            <Diorama
              height={470}
              level={level}
              stage={stage}
              location={location}
              dark={dark}
              figure={{ kind: 'stage', stage, pose: steps > 0 ? 'walk' : 'idle' }}
              body={{ tier: 'fit', shade: colors.sage, shadowWeight: 0 }}
              lifetimePoints={PREVIEW_POINTS}
              figureLabel={`${copy.name}, level ${level}, at the ${location}.`}
            >
              <View style={tw.style('flex-1 px-lg pb-sm', { paddingTop: insets.top + space.md })}>
                <TodayChips
                  level={level}
                  xp={{ fraction: 0.62, intoLevel: 620, neededForNext: 1000 }}
                  streak={state === 'empty' ? 0 : 4}
                />
                <View style={tw`flex-1`} />
                <Text scale='chrome' style={{ ...font.body.label, color: ink }}>
                  {locationName(location)}
                </Text>
                <TodayCount steps={steps} color={ink} />
              </View>
            </Diorama>
            <View style={tw`px-lg`}>
              <TodayNextStep
                sentence={copy.next}
                onDetails={() => setDetails((value) => !value)}
                showDetails
                dark={dark}
              />
              {details && (
                <Panel>
                  <Text
                    accessibilityRole='header'
                    style={{ ...font.display.minor, color: colors.text }}
                  >
                    {copy.details}
                  </Text>
                  <Text style={tw.style('pt-sm', font.body.body, { color: colors.subtle })}>
                    {copy.detailsBody}
                  </Text>
                  <Text style={tw.style('pt-md', font.display.small, { color: colors.text })}>
                    {previewReadings(steps, state === 'empty' ? 0 : 342)}
                  </Text>
                </Panel>
              )}
              {state === 'ready' && <WhackBanner senderName='Rty' onWhackBack={onWhackBack} />}
            </View>
          </>
        )}
    </Screen>
  );
}

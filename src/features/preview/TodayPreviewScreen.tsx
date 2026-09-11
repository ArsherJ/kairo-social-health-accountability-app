import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { evolutionStageForLevel } from '@kairo/core';
import { Diorama } from '../character/Diorama.tsx';
import { TodayChips } from '../character/TodayHud.tsx';
import { TodayNextStep } from '../character/TodayNextStep.tsx';
import { QuestRows, TodayTiles } from '../character/TodayBoard.tsx';
import { dateHeading } from '../character/today-board.ts';
import { nextStepSentence } from '../quests/next-step.ts';
import { WhackBanner } from '../whack/WhackBanner.tsx';
import { Panel, Screen, Text, useTheme } from '../../ui/index.ts';
import { font, space } from '../../theme.ts';
import { tw } from '../../ui/tailwind.ts';
import { PREVIEW_COPY as copy, previewReadings, type PreviewState } from './preview-copy.ts';
import { PREVIEW_POINTS, PREVIEW_TODAY, previewDashboard } from './preview-data.ts';
import { PreviewStateNotice } from './PreviewStateNotice.tsx';

export function TodayPreviewScreen({ state, onRetry, onWhackBack }: {
  state: PreviewState;
  onRetry: () => void;
  onWhackBack: () => void;
}) {
  const [details, setDetails] = useState(false);
  const insets = useSafeAreaInsets();
  const dashboard = previewDashboard(state);
  const { day: { steps }, location } = dashboard;
  const level = state === 'empty' ? 1 : 12;
  const stage = evolutionStageForLevel(level);
  const { colors } = useTheme();
  return (
    <Screen bleed>
      {state === 'loading' || state === 'error'
        ? (
          <View style={{ paddingTop: insets.top }}>
            <PreviewStateNotice state={state} onRetry={onRetry} />
          </View>
        )
        : (
          <View style={tw.style('px-lg', { paddingTop: insets.top + space.md })}>
            <View style={tw`flex-row items-center gap-sm pb-md`}>
              <View style={tw`flex-1`}>
                <Text scale='chrome' style={{ ...font.body.label, color: colors.muted }}>
                  {dateHeading(PREVIEW_TODAY)}
                </Text>
                <Text scale='chrome' style={{ ...font.display.major, color: colors.text }}>
                  {copy.name}
                </Text>
              </View>
              <TodayChips
                level={level}
                xp={{ fraction: 0.62, intoLevel: 620, neededForNext: 1000 }}
                streak={state === 'empty' ? 0 : 4}
              />
            </View>
            <Diorama
              height={236}
              level={level}
              stage={stage}
              location={location}
              figure={{ kind: 'pose', pose: steps > 0 ? 'walk' : 'idle' }}
              body={{ tier: 'fit', shade: colors.sage, shadowWeight: 0 }}
              lifetimePoints={PREVIEW_POINTS}
              figureLabel={`${copy.name}, level ${level}, at the ${location}.`}
            />
            <View>
              <TodayNextStep
                sentence={nextStepSentence(dashboard.next, copy.name)}
                onDetails={() => setDetails((value) => !value)}
                showDetails
              />
              <TodayTiles motion={dashboard.motion} body={dashboard.body} mind={dashboard.mind} />
              <QuestRows
                quests={dashboard.quests}
                selected={dashboard.next.kind === 'quest' ? dashboard.next.index : null}
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
          </View>
        )}
    </Screen>
  );
}

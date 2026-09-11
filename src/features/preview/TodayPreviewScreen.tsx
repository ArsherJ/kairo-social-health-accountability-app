import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { evolutionStageForLevel } from '@kairo/core';
import { Diorama } from '../character/Diorama.tsx';
import { TodayChips } from '../character/TodayHud.tsx';
import { TodayNextStep } from '../character/TodayNextStep.tsx';
import { TodayProgressHero } from '../character/TodayProgressHero.tsx';
import { QuestRows, TodayTiles } from '../character/TodayBoard.tsx';
import { dateHeading } from '../character/today-board.ts';
import { ceilingLine } from '../character/kairo-voice.ts';
import { nextStepSentence } from '../quests/next-step.ts';
import { WhackBanner } from '../whack/WhackBanner.tsx';
import { Panel, Screen, Text, useTheme } from '../../ui/index.ts';
import { font, space } from '../../theme.ts';
import { tw } from '../../ui/tailwind.ts';
import { PREVIEW_COPY as copy, previewReadings, type PreviewState } from './preview-copy.ts';
import {
  PREVIEW_POINTS,
  PREVIEW_TODAY,
  previewDashboard,
  type PreviewFixture,
} from './preview-data.ts';
import { PreviewStateNotice } from './PreviewStateNotice.tsx';

export function TodayPreviewScreen({ state, fixture, onRetry, onWhackBack }: {
  state: PreviewState;
  fixture: PreviewFixture;
  onRetry: () => void;
  onWhackBack: () => void;
}) {
  const [details, setDetails] = useState(false);
  const insets = useSafeAreaInsets();
  const dashboard = previewDashboard(state, fixture);
  const { level, mirror } = dashboard;
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
            <View style={tw`flex-row flex-wrap items-center gap-sm pb-md`}>
              <View style={tw`flex-1`}>
                <Text scale='chrome' style={{ ...font.body.label, color: colors.muted }}>
                  {dateHeading(PREVIEW_TODAY)}
                </Text>
                <Text scale='chrome' style={{ ...font.display.major, color: colors.text }}>
                  {dashboard.identity.name}
                </Text>
              </View>
              <TodayChips
                level={level}
                xp={{ fraction: 0.62, intoLevel: 620, neededForNext: 1000 }}
                streak={state === 'empty' ? 0 : 4}
              />
            </View>
            <TodayProgressHero
              motion={dashboard.motion}
              character={(
                <Diorama
                  height={208}
                  level={level}
                  stage={stage}
                  location={mirror.motion.location}
                  figure={mirror.figure}
                  body={mirror.body}
                  lifetimePoints={PREVIEW_POINTS}
                  crest={dashboard.ceilingReached}
                  figureLabel={dashboard.figureLabel}
                />
              )}
            />
            <View>
              <TodayNextStep
                sentence={dashboard.reaction?.sentence ?? (
                  dashboard.ceilingReached
                    ? ceilingLine(dashboard.identity.name)
                    : nextStepSentence(dashboard.next, dashboard.identity.name)
                )}
                onDetails={() => setDetails((value) => !value)}
                showDetails
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
                    {previewReadings(dashboard.day.steps, dashboard.day.activeKcal)}
                  </Text>
                </Panel>
              )}
              <TodayTiles body={dashboard.body} mind={dashboard.mind} />
              <QuestRows
                quests={dashboard.quests}
                selected={dashboard.next.kind === 'quest' ? dashboard.next.index : null}
              />
              {state === 'ready' ? (
                <WhackBanner senderName='Rty' onWhackBack={onWhackBack} />
              ) : null}
            </View>
          </View>
        )}
    </Screen>
  );
}

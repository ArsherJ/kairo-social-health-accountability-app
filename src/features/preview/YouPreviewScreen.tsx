import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { speciesLine } from '../character/species.ts';
import { RecordsCard } from '../profile/RecordsCard.tsx';
import { StreakCard } from '../profile/StreakCard.tsx';
import { GrowthCard } from '../profile/GrowthCard.tsx';
import { ClearedCalendar } from '../profile/ClearedCalendar.tsx';
import { ProfileHeader } from '../profile/ProfileHeader.tsx';
import { Button, Panel, Screen, Text, useTheme } from '../../ui/index.ts';
import { font, space } from '../../theme.ts';
import { tw } from '../../ui/tailwind.ts';
import { PREVIEW_COPY as copy, type PreviewState } from './preview-copy.ts';
import { PREVIEW_POINTS, PREVIEW_RECORDS, PREVIEW_STREAK, PREVIEW_TODAY } from './preview-data.ts';
import { PreviewStateNotice } from './PreviewStateNotice.tsx';

export function YouPreviewScreen(
  { state, onRetry }: { state: PreviewState; onRetry: () => void },
) {
  const [controlsOpen, setControlsOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const ink = colors.text;
  return (
    <Screen bleed>
      {state === 'loading' || state === 'error'
        ? (
          <View style={{ paddingTop: insets.top }}>
            <PreviewStateNotice state={state} onRetry={onRetry} />
          </View>
        )
        : (
          <>
            <ProfileHeader
              name={copy.name}
              handle={copy.handle}
              totalXp={3220}
              speciesLine={speciesLine('eagle')}
              joined={copy.join}
              lifetimePoints={PREVIEW_POINTS}
              onSettings={() => setControlsOpen((open) => !open)}
            />
            <View style={tw`px-lg pb-lg`}>
              {controlsOpen && (
                <Panel>
                  <Text accessibilityRole='header' style={{ ...font.display.small, color: ink }}>
                    Preview controls
                  </Text>
                  <Text style={{ ...font.body.body, color: colors.subtle, marginTop: space.xs }}>
                    {copy.sample}
                  </Text>
                  <Button
                    label={copy.inviteClose}
                    variant='ghost'
                    onPress={() => setControlsOpen(false)}
                  />
                </Panel>
              )}
              <StreakCard streak={state === 'empty' ? null : PREVIEW_STREAK} />
              <RecordsCard
                records={state === 'empty' ? [] : PREVIEW_RECORDS}
                today={PREVIEW_TODAY}
              />
              <GrowthCard />
              <ClearedCalendar
                today={PREVIEW_TODAY}
                clearedDates={state === 'empty'
                  ? []
                  : ['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08']}
              />
            </View>
          </>
        )}
    </Screen>
  );
}

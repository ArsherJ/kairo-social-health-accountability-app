import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KairoThumbnail } from '../character/KairoThumbnail.tsx';
import { speciesLine } from '../character/species.ts';
import { RecordsCard } from '../profile/RecordsCard.tsx';
import { StreakCard } from '../profile/StreakCard.tsx';
import { GrowthCard } from '../profile/GrowthCard.tsx';
import { ClearedCalendar } from '../profile/ClearedCalendar.tsx';
import { Screen, Text, useTheme } from '../../ui/index.ts';
import { font, space } from '../../theme.ts';
import { tw } from '../../ui/tailwind.ts';
import { PREVIEW_COPY as copy, type PreviewState } from './preview-copy.ts';
import { PREVIEW_POINTS, PREVIEW_RECORDS, PREVIEW_STREAK, PREVIEW_TODAY } from './preview-data.ts';
import { PreviewStateNotice } from './PreviewStateNotice.tsx';

export function YouPreviewScreen(
  { state, onRetry }: { state: PreviewState; onRetry: () => void },
) {
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
            <View style={tw.style('px-lg pb-lg', { paddingTop: insets.top + space.lg })}>
              <Text scale='chrome' style={{ ...font.body.label, color: ink }}>{copy.handle}</Text>
              <View style={tw`flex-row items-center gap-md py-lg`}>
                <KairoThumbnail size={88} pose='idle' decorative lifetimePoints={PREVIEW_POINTS} />
                <View style={tw`flex-1 gap-xs`}>
                  <Text accessibilityRole='header' style={{ ...font.display.major, color: ink }}>
                    {copy.name}
                  </Text>
                  <Text style={{ ...font.body.quiet, color: colors.subtle }}>
                    {speciesLine('eagle')}
                  </Text>
                  <Text
                    scale='chrome'
                    style={{ ...font.body.quiet, color: colors.subtle }}
                  >
                    {copy.join}
                  </Text>
                </View>
              </View>
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

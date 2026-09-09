import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KairoThumbnail } from '../character/KairoThumbnail.tsx';
import { speciesLine } from '../character/species.ts';
import { RecordsCard } from '../profile/RecordsCard.tsx';
import { StreakCard } from '../profile/StreakCard.tsx';
import { GrowthCard } from '../profile/GrowthCard.tsx';
import { ClearedCalendar } from '../profile/ClearedCalendar.tsx';
import { Gradient, Screen, Text } from '../../ui/index.ts';
import { colors, font, radius, ramp, space } from '../../theme.ts';
import { tw } from '../../ui/tailwind.ts';
import { PREVIEW_COPY as copy, type PreviewState } from './preview-copy.ts';
import { PREVIEW_POINTS, PREVIEW_RECORDS, PREVIEW_STREAK, PREVIEW_TODAY } from './preview-data.ts';
import { PreviewStateNotice } from './PreviewStateNotice.tsx';

const FIELD = [{ color: ramp.teal[200], at: 0 }, { color: ramp.sky[200], at: 1 }];
export function YouPreviewScreen(
  { dark, state, onRetry }: { dark: boolean; state: PreviewState; onRetry: () => void },
) {
  const insets = useSafeAreaInsets();
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
            <View style={tw.style('px-lg pb-lg', { paddingTop: insets.top + space.lg })}>
              <Text scale='chrome' style={{ ...font.body.label, color: ink }}>{copy.handle}</Text>
              <View
                style={tw.style('items-center justify-center mt-lg py-lg', {
                  borderRadius: radius.xxl,
                  borderCurve: 'continuous',
                  overflow: 'hidden',
                })}
              >
                <Gradient stops={FIELD} />
                <KairoThumbnail size={148} pose='idle' decorative lifetimePoints={PREVIEW_POINTS} />
              </View>
              <View style={tw`items-center pt-md gap-xs`}>
                <Text accessibilityRole='header' style={{ ...font.display.major, color: ink }}>
                  {copy.name}
                </Text>
                <Text style={{ ...font.body.quiet, color: dark ? ramp.sage[300] : colors.subtle }}>
                  {speciesLine('eagle')}
                </Text>
                <Text
                  scale='chrome'
                  style={{ ...font.body.quiet, color: dark ? ramp.sage[300] : colors.subtle }}
                >
                  {copy.join}
                </Text>
              </View>
              <StreakCard streak={state === 'empty' ? null : PREVIEW_STREAK} />
              <RecordsCard
                records={state === 'empty' ? [] : PREVIEW_RECORDS}
                today={PREVIEW_TODAY}
              />
              <GrowthCard />
              <ClearedCalendar
                dark={dark}
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

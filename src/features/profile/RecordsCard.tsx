import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { CORE_STATS, type CoreStat } from '@kairo/core';
import { recordDate, RECORDS_EMPTY, recordValue } from './record-copy.ts';
import type { StatRecord } from './records.ts';
import { Button, Panel, STAT_NAMES, StatIcon, Text } from '../../ui/index.ts';
import { font, radius } from '../../theme.ts';
import { useTheme } from '../../ui/use-theme.ts';
import { tw } from '../../ui/tailwind.ts';
import { BestDayShareButton } from './BestDayShareButton.tsx';
import { BEST_DAY_COPY } from './share-copy.ts';

const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** Select one real best day before opening the platform share sheet. */
export function RecordsCard({ records, today, isError = false, onRetry }: {
  records: readonly StatRecord[] | undefined;
  today: string | undefined;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const { colors, ramp } = useTheme();
  const [selectedStat, setSelectedStat] = useState<CoreStat>('AGI');
  const ordered = CORE_STATS.flatMap((stat) =>
    records?.filter((record) => record.stat === stat) ?? []
  );
  const selected = ordered.find((record) => record.stat === selectedStat) ?? ordered[0];

  return (
    <Panel>
      <Text accessibilityRole='header' style={{ ...font.display.minor, color: colors.text }}>
        {BEST_DAY_COPY.title}
      </Text>
      <Text style={{ ...font.body.quiet, color: colors.subtle, marginTop: 4 }}>
        {BEST_DAY_COPY.note}
      </Text>
      {isError
        ? (
          <View style={tw`pt-md`}>
            <Text accessibilityRole='alert' style={{ ...font.body.body, color: colors.damage }}>
              {BEST_DAY_COPY.error}
            </Text>
            {onRetry && <Button label={BEST_DAY_COPY.retry} variant='ghost' onPress={onRetry} />}
          </View>
        )
        : records === undefined
        ? (
          <ActivityIndicator
            accessibilityLabel={BEST_DAY_COPY.loading}
            color={colors.accentDeep}
            style={tw`py-lg`}
          />
        )
        : ordered.length === 0
        ? (
          <Text style={tw.style('pt-md', font.body.body, { color: colors.subtle })}>
            {RECORDS_EMPTY}
          </Text>
        )
        : (
          <>
            <View style={tw`gap-sm pt-lg`}>
              {ordered.map((record) => {
                const active = selected?.stat === record.stat;
                const value = recordValue(record.stat, record.value);
                const when = recordDate(record.localDate, today);
                return (
                  <Pressable
                    key={record.stat}
                    accessible
                    accessibilityRole='button'
                    accessibilityLabel={`${
                      STAT_NAMES[record.stat]
                    } best day, ${value}, ${when}. Select to share.`}
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedStat(record.stat)}
                    style={({ pressed }) =>
                      tw.style('p-md', {
                        minHeight: 80,
                        borderRadius: radius.lg,
                        borderCurve: 'continuous',
                        borderWidth: 2,
                        borderColor: active ? colors.accent : 'transparent',
                        backgroundColor: active ? ramp.accent[100] : ramp.neutral[100],
                        opacity: pressed ? 0.7 : 1,
                      })}
                  >
                    <View {...hidden} style={tw`flex-row items-center gap-md`}>
                      <StatIcon stat={record.stat} size={25} color={colors.accentDeep} />
                      <View style={tw`flex-1 gap-xs`}>
                        <View style={tw`flex-row flex-wrap justify-between gap-xs`}>
                          <Text scale='chrome' style={{ ...font.body.label, color: colors.subtle }}>
                            {STAT_NAMES[record.stat]}
                          </Text>
                          <Text scale='chrome' style={{ ...font.body.quiet, color: colors.subtle }}>
                            {when}
                          </Text>
                        </View>
                        <Text style={{ ...font.display.minor, color: colors.text }}>{value}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {selected && <BestDayShareButton record={selected} />}
          </>
        )}
    </Panel>
  );
}

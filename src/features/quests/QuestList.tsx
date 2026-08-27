import { StyleSheet, View } from 'react-native';
import { colors, font, ramp, space } from '@/theme.ts';
import { Meter, Panel, Text } from '@/ui/index.ts';
import { questHeadline, questLabel, questProgressLine } from './quest-copy.ts';
import type { TodayQuest } from './queries.ts';

/**
 * Three quests, each one accessibility element.
 *
 * The grouping is explicit and both halves are load-bearing: the parent gets
 * `accessible` + `accessibilityLabel`, and every direct child gets
 * `accessibilityElementsHidden` **and**
 * `importantForAccessibility="no-hide-descendants"`. The documented collapse
 * behaviour did not happen on the 2026-08-14 build; removing either half is how
 * the twelve-stops-per-row bug returns.
 *
 * Flow-based layout throughout — no `top` on any child. Three stacked cards
 * with a bar in each is exactly the shape that overlapped when the character
 * HUD pinned its pills at fixed offsets.
 */
export function QuestList({ quests }: { quests: readonly TodayQuest[] }) {
  if (quests.length === 0) return null;

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View>
      {quests.map(({ quest, state }) => (
        <Panel key={quest.id}>
          <View accessible accessibilityLabel={questLabel(quest, state)} style={styles.body}>
            <View {...hidden} style={styles.headline}>
              {/* `flex: 1` so the headline takes the width it needs and the XP
                  chip is pushed to the end — never a fixed width, which is
                  what tears at large Dynamic Type. */}
              <Text scale="chrome" style={styles.title}>
                {questHeadline(quest)}
              </Text>
              <Text scale="chrome" style={styles.xp}>
                {quest.xp} XP
              </Text>
            </View>

            {/* Unlabelled, so `Meter` hides itself by its own default — the
                line below already says the figures. Wrapped anyway, because
                neither half of the grouping pair is redundant. */}
            <View {...hidden}>
              <Meter
                fraction={state.fraction}
                color={state.met ? colors.accent : ramp.neutral[400]}
                height={8}
              />
            </View>

            <Text {...hidden} scale="chrome" style={styles.progress}>
              {questProgressLine(quest, state)}
            </Text>
          </View>
        </Panel>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
  headline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, color: colors.text, ...font.body.body },
  xp: { color: colors.subtle, ...font.body.strong },
  progress: { color: colors.subtle, ...font.body.strong },
});

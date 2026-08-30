import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';
import type { QuestMetric } from '@kairo/core';
import { colors, font, ramp, space } from '@/theme.ts';
import { Panel, ProgressRing, Text } from '@/ui/index.ts';
import { questLabel } from './quest-copy.ts';
import { questDial } from './quest-dial.ts';
import type { TodayQuest } from './queries.ts';

/**
 * Three quests as rings, on one card.
 *
 * This replaces `QuestList`'s three stacked cards with bars (`QuestList` is
 * still on disk and still tested — it is what a wider layout would want, and
 * deleting it to prove a point would cost the tests with it). The change is not
 * decoration: three cards each with a headline, an XP chip, a bar and a
 * progress line spent most of Today's fold on text that says the same thing
 * four ways. A ring says "how far" in the shape itself, a glyph says which
 * metric, and two short strings carry the figures.
 *
 * **The XP figure is gone from this surface, deliberately.** It was on every
 * quest card as "30 XP", and it is the one number here that is not a raw unit —
 * it describes the reward rather than the day. Clearing a quest still pays it
 * and the completion still latches; what changed is that the player is not
 * asked to price three errands before doing them. It is still spoken:
 * `questLabel` includes it, so a screen reader gets the whole proposition.
 *
 * **One accessibility element per ring, and both halves of the grouping fix.**
 * A ring is a glyph, an arc, a figure and a caption — four stops each, twelve
 * across the card, which is the leaderboard-row bug in a new place. The label
 * comes from `questLabel`, unchanged, so what is spoken here is exactly what
 * was spoken by the cards this replaces.
 */
export function QuestRings({ quests }: { quests: readonly TodayQuest[] }) {
  if (quests.length === 0) return null;

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <Panel style={styles.card}>
      {quests.map(({ quest, state }) => {
        const dial = questDial(quest, state);
        const hue = METRIC_COLORS[quest.metric];

        return (
          <View
            key={quest.id}
            accessible
            accessibilityLabel={questLabel(quest, state)}
            style={styles.slot}
          >
            <View {...hidden} style={styles.slotBody}>
              <ProgressRing
                fraction={dial.fraction}
                size={74}
                thickness={7}
                color={hue.arc}
                track={hue.track}
              >
                <View style={styles.disc}>
                  <MaterialCommunityIcons
                    name={METRIC_ICONS[quest.metric]}
                    size={18}
                    color={hue.arc}
                  />
                  {/* A cleared quest shows a tick where the figure was —
                      `questDial` returns an empty figure for exactly this, so
                      the two cannot disagree about which one is drawn. */}
                  {dial.cleared ? (
                    <MaterialCommunityIcons name="check-bold" size={15} color={hue.arc} />
                  ) : (
                    <Text scale="fixed" style={styles.figure}>
                      {dial.figure}
                    </Text>
                  )}
                </View>
              </ProgressRing>

              <Text
                scale="fixed"
                numberOfLines={1}
                style={[styles.caption, dial.cleared && { color: hue.ink }]}
              >
                {dial.caption}
              </Text>
            </View>
          </View>
        );
      })}
    </Panel>
  );
}

/**
 * A metric's glyph.
 *
 * Three of the five are `StatIcon`'s own — steps, calories and sleep are the
 * three scored stats wearing their quest hats — but this table is deliberately
 * separate rather than reaching into `StatIcon`: a quest metric is not a stat
 * (`distance_m` and `active_hours` score nothing on their own), so a mapping
 * that covered both would have two entries with no stat behind them and invite
 * the reader to think there are five stats.
 */
const METRIC_ICONS: Record<
  QuestMetric,
  React.ComponentProps<typeof MaterialCommunityIcons>['name']
> = {
  steps: 'shoe-print',
  active_kcal: 'fire',
  active_hours: 'clock-time-four-outline',
  distance_m: 'map-marker-distance',
  sleep_minutes: 'weather-night',
};

/**
 * A metric's hue — the arc, the track behind it, and the ink for "cleared".
 *
 * Same three families `STAT_COLORS` uses and for the same reason, extended to
 * the two metrics that are not stats: distance rides with steps because it is
 * the same walk measured differently, and active hours ride with Mind because
 * the ring beside them on the design is violet and because hours-of-movement is
 * the shift input rather than a stat of its own.
 *
 * `arc` and `ink` are a pair and not interchangeable: `colors.accent` and
 * `colors.coral` are fills that fail as text on white (`contrast.test.ts` pins
 * it), so the caption under a cleared ring takes the deeper step.
 */
const METRIC_COLORS: Record<QuestMetric, { arc: string; track: string; ink: string }> = {
  steps: { arc: colors.accent, track: ramp.accent[200], ink: colors.accentDeep },
  active_kcal: { arc: colors.coral, track: colors.coralTint, ink: colors.damage },
  active_hours: { arc: ramp.sage[500], track: ramp.sage[200], ink: ramp.sage[700] },
  distance_m: { arc: colors.accent, track: ramp.accent[200], ink: colors.accentDeep },
  sleep_minutes: { arc: ramp.sage[500], track: ramp.sage[200], ink: ramp.sage[700] },
};

const styles = StyleSheet.create({
  // `space-around` rather than `space-between`: three rings in a row need air
  // at the ends too, or the outer two touch the card's radius.
  card: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 18,
    paddingHorizontal: space.md,
  },
  // No fixed width. At the `fixed` scale's 1.2x cap the caption is the widest
  // part of a slot, and pinning it is the two-column row that could not fit
  // past 1.3x, in a new place.
  slot: { flexShrink: 1 },
  slotBody: { alignItems: 'center', gap: 7 },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  figure: { ...font.display.label, fontSize: 13, color: colors.text },
  caption: { ...font.body.strong, fontSize: 11, color: colors.muted },
});

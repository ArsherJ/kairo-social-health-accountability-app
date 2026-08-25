import { StyleSheet, View } from 'react-native';
import { RACE_FINISH_LINE, rankRacers, type RacerInput } from '@kairo/core';
import { colors, font, ramp, space } from '@/theme.ts';
import { Meter, Panel, Text } from '@/ui/index.ts';
import { raceCardLine } from './race-label.ts';

/**
 * The race, as one card on the Today tab (roadmap deviation #50).
 *
 * The full track lives on the Squad tab. This is the summary — your position,
 * how far the flag is, and the rivals as a strip — and it reads the **same
 * query** the track does. One payload, two renderings; do not add a second
 * fetch, and do not rank in SQL, which would silently delete the program
 * feature (deviation #11). The re-rank by capped steps happens here, exactly as
 * it does in `RaceTrack`.
 *
 * One accessibility element, both halves of the grouping fix. The card draws a
 * line, a bar and up to five rival pips, which ungrouped is seven stops for a
 * card whose whole content is one sentence.
 */
export function RaceCard({ racers }: { racers: readonly RacerInput[] }) {
  const ranked = rankRacers(racers);
  // No self on the track means nothing to summarise — a card that drew rivals
  // and no position would be a leaderboard with the reader missing.
  const me = ranked.find((r) => r.isSelf);
  if (!me) return null;

  const line = raceCardLine({
    rank: me.rank,
    racers: ranked.length,
    // `cappedSteps` never exceeds the line, so this is never negative.
    stepsToFinish: RACE_FINISH_LINE - me.cappedSteps,
    finished: me.finished,
  });

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  const rivals = ranked.filter((r) => !r.isSelf);

  return (
    <Panel variant="lift">
      <View accessible accessibilityLabel={`Today's race. ${line}`} style={styles.body}>
        <Text {...hidden} scale="chrome" style={styles.line}>
          {line}
        </Text>

        {/* Unlabelled, so `Meter` hides itself by its own default — the line
            above already says the distance. Wrapped anyway, because the
            documented collapse did not happen on the 2026-08-14 build and
            neither half of the pair is redundant. */}
        <View {...hidden}>
          <Meter
            fraction={me.progress}
            color={me.finished ? colors.accent : ramp.accent[500]}
            height={12}
          />
        </View>

        {/* The rivals, as a strip. Positions only — no names and no figures:
            the track on the Squad tab is where a rival is a character, and
            repeating that here would make the card the same size as the thing
            it summarises. */}
        {rivals.length > 0 && (
          <View {...hidden} style={styles.strip}>
            {rivals.map((r) => (
              <View
                key={r.userId}
                style={[
                  styles.pip,
                  {
                    backgroundColor: r.finished ? colors.accent : ramp.neutral[300],
                    // A ghost is a day of yours, not a person. Half weight so
                    // the strip reads as rivals-plus-history rather than as a
                    // squad you do not have.
                    opacity: r.isGhost ? 0.5 : 1,
                  },
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
  // Same size and family as the home screen's standing line, because it is the
  // same rhetorical shape — clause · clause, one sentence, no score.
  line: { ...font.body.body, fontSize: 14.5, color: ramp.neutral[800] },
  strip: { flexDirection: 'row', gap: space.xs },
  // `flex: 1` rather than a width: the strip has between one and five pips and
  // a fixed width would leave a ragged edge at every count but one.
  pip: { flex: 1, height: 4, borderRadius: 2 },
});

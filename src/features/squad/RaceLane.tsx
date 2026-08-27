import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { Racer } from '@kairo/core';
import { SPECIES_FIGURES } from '@/features/character/species-art.ts';
import { colors, earnedColor, font, ramp, space } from '@/theme.ts';
import { Avatar, Text } from '@/ui/index.ts';
import { raceLaneLabel } from './race-label.ts';

/**
 * One racer, running one lane.
 *
 * **The lane is a line the figure stands on, not a bar that fills.** A filled
 * bar is leaderboard vocabulary — a quantity, read left to right — and drawing
 * the race with one would make it a leaderboard with rounded corners. A ground
 * rule with a figure somewhere along it is a track, and the difference is the
 * whole reason this screen exists.
 *
 * The finish line is drawn per lane, as a rule on the lane's right edge, with
 * no vertical gap between lanes. The segments abut, so what the eye sees is one
 * continuous line down the whole track — six people running at the same flag,
 * which is the thing a list of rows can never show. Done this way round rather
 * than as one absolutely-positioned rule because **the layout stays flow-based**
 * (see below), and a `position: 'absolute'` element would be the first
 * exception.
 *
 * ### Three rules, each of which has already cost this codebase a build
 *
 * 1. **Flow-based layout only.** No `top` on any child. The character HUD was
 *    the app's only absolutely-positioned chrome, pinned at `+8/+48/+48/+132`,
 *    and those constants assumed pill heights nothing enforced — at large
 *    Dynamic Type the pills grew past each other and overlapped. A track is the
 *    same shape of mistake. The figure is placed by two flex spacers.
 * 2. **One accessibility element per lane, both halves.** The parent gets
 *    `accessible` + `accessibilityLabel`; **every direct child** gets
 *    `accessibilityElementsHidden` **and**
 *    `importantForAccessibility="no-hide-descendants"`. The documented collapse
 *    behaviour did not happen on the 2026-08-14 build, so neither half is
 *    redundant — removing one is how the twelve-stops-per-row bug returns.
 * 3. **`Text` comes from `@/ui`**, with `scale="fixed"` for type locked to the
 *    drawn track geometry.
 */

/** The figure's box. Smaller than the board row's 44pt: six of these stack. */
const FIGURE = 32;

/** The lane rule's thickness, and the finish line's. */
const RULE = 2;

/**
 * Where the name column stops fitting beside the track.
 *
 * The same threshold `HealthAsk` and the consent sheet use, for the same
 * measured reason: past roughly 1.3x, two columns stop both fitting on a 390pt
 * screen. Above it the name moves above its own lane, which costs the
 * continuous finish line and keeps every word — the same trade the disclosure
 * schedule makes, and the right way round.
 */
const STACK_ABOVE = 1.3;

const NAME_WIDTH = 68;

/** Applied to every direct child. Both props, deliberately — see rule 2. */
const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

export function RaceLane({ racer }: { racer: Racer }) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_ABOVE;

  const label = raceLaneLabel({
    rank: racer.rank,
    characterName: racer.characterName,
    isSelf: racer.isSelf,
    progressPercent: racer.progress * 100,
    finished: racer.finished,
    isGhost: racer.isGhost ?? false,
  });

  const name = (
    <Text
      scale="chrome"
      numberOfLines={stacked ? 2 : 1}
      style={[
        styles.name,
        stacked ? styles.nameStacked : { width: NAME_WIDTH },
        racer.isSelf && styles.nameSelf,
        racer.isGhost && styles.nameGhost,
      ]}
    >
      {racer.isSelf ? 'You' : racer.characterName}
    </Text>
  );

  return (
    <View accessible accessibilityLabel={label} style={styles.lane}>
      {stacked && <View {...HIDDEN}>{name}</View>}

      <View {...HIDDEN} style={styles.row}>
        {!stacked && name}

        <View
          style={[
            styles.track,
            // Sage is what this palette already means by "your lane" — the
            // token's own docstring says so. It arrived before the feature it
            // was named for.
            racer.isSelf && styles.trackSelf,
            racer.finished && styles.trackFinished,
          ]}
        >
          {/*
            Flow-based placement: two spacers push the figure along the lane.
            Never a `left` or a `top`.

            The floors keep both spacers as *flexible* children at the extremes.
            `flex: 0` is a different box — no growth and no shrink — and mixing
            one of those into a flex row makes the remaining space resolve
            against a different rule at 0% and 100% than it does everywhere in
            between. A tiny positive flex keeps one rule for every position.
          */}
          <View style={{ flex: Math.max(racer.progress, 0.0001) }} />
          <Figure racer={racer} />
          <View style={{ flex: Math.max(1 - racer.progress, 0.0001) }} />
        </View>

        {/*
          This lane's segment of the finish line. The lanes carry no vertical
          gap between them, so the segments join into one rule down the track.
        */}
        <View style={styles.finish} />
      </View>
    </View>
  );
}

function Figure({ racer }: { racer: Racer }) {
  const style = [styles.figure, racer.isGhost && styles.figureGhost];

  // `Avatar` for anyone predating the species choice — a lane with no runner
  // in it would be less identifiable, not more.
  return racer.species ? (
    <Image
      source={SPECIES_FIGURES[racer.species as keyof typeof SPECIES_FIGURES]}
      style={style}
      resizeMode="contain"
    />
  ) : (
    <View style={style}>
      <Avatar name={racer.characterName} self={racer.isSelf} size={FIGURE} />
    </View>
  );
}

/**
 * A squadmate who is not sharing their totals (deviation #47, spec §4.5).
 *
 * **The lane stays and carries no position.** Both alternatives state something
 * false: dropping the row looks like the member left the squad, and drawing
 * them at zero looks like they did nothing today. Neither is true, and the
 * second is the worse lie — it invents a bad day for someone who may have had
 * a good one.
 */
export function QuietLane({
  characterName,
  species,
}: {
  characterName: string;
  species: string | null;
}) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_ABOVE;

  const name = (
    <Text
      scale="chrome"
      numberOfLines={stacked ? 2 : 1}
      style={[styles.name, styles.nameQuiet, stacked ? styles.nameStacked : { width: NAME_WIDTH }]}
    >
      {characterName}
    </Text>
  );

  return (
    <View
      accessible
      accessibilityLabel={`${characterName} is not sharing their totals`}
      style={styles.lane}
    >
      {stacked && <View {...HIDDEN}>{name}</View>}

      <View {...HIDDEN} style={styles.row}>
        {!stacked && name}

        <View style={[styles.track, styles.trackQuiet]}>
          {species ? (
            <Image
              source={SPECIES_FIGURES[species as keyof typeof SPECIES_FIGURES]}
              style={[styles.figure, styles.figureQuiet]}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.figure, styles.figureQuiet]}>
              <Avatar name={characterName} size={FIGURE} />
            </View>
          )}
          <Text scale="chrome" style={styles.quietLabel} numberOfLines={1}>
            Not sharing
          </Text>
          <View style={{ flex: 1 }} />
        </View>

        <View style={styles.finish} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // **No vertical padding, margin or gap, on the lane or between lanes.** The
  // finish-line segments have to abut into one rule, and *any* vertical space
  // here breaks it into six dashes. The breathing room lives inside the track
  // instead, as `paddingTop` — which the finish rule then spans, because it
  // stretches to the row rather than declaring a height of its own.
  lane: {},
  row: { flexDirection: 'row', alignItems: 'flex-end' },

  name: {
    color: colors.subtle,
    ...font.body.strong,
    flexShrink: 0,
    paddingRight: space.sm,
    paddingBottom: space.xs,
  },
  nameStacked: { alignSelf: 'flex-start', paddingRight: 0, paddingBottom: 2 },
  // Terracotta is what this system means by "you", everywhere else in the app.
  nameSelf: { color: colors.accent },
  nameGhost: { color: colors.muted },
  nameQuiet: { color: colors.muted },

  track: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    // The lane's whole vertical rhythm, and it is here rather than on `lane`
    // so the finish rule can span it — see `lane` above.
    paddingTop: space.sm,
    // The ground the figure runs on. A rule, not a fill — see the note above.
    borderBottomWidth: RULE,
    borderBottomColor: ramp.neutral[300],
  },
  trackSelf: { borderBottomColor: colors.sage },
  // The one moment the lane changes colour, and it marks an event rather than
  // a quantity: you crossed the line. `earnedColor` already means exactly that
  // everywhere else it appears.
  trackFinished: { borderBottomColor: earnedColor },
  trackQuiet: { borderBottomColor: colors.border },

  figure: { width: FIGURE, height: FIGURE },
  // Present, but not running: a ghost is a day of yours, not a rival.
  figureGhost: { opacity: 0.45 },
  figureQuiet: { opacity: 0.3 },

  quietLabel: {
    color: colors.muted,
    ...font.body.strong,
    paddingLeft: space.sm,
    paddingBottom: space.xs,
  },

  // The flag. One rule per lane, stacked into one line down the whole track.
  //
  // **`alignSelf: 'stretch'` and no `height`, deliberately.** A declared height
  // is the bug: anything taller than the row stretches the row to fit it, and
  // anything shorter leaves a gap — either way the segments stop abutting and
  // the one continuous line becomes six dashes, which is the picture that makes
  // this a race rather than six bars. Stretching means the rule is exactly as
  // tall as its lane, whatever Dynamic Type does to that lane's height.
  finish: { width: RULE, alignSelf: 'stretch', backgroundColor: colors.accent },
});

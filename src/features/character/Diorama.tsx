import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { CoreStat, Dominance } from '@kairo/core';
import { SPECIES_NAMES, displaySpecies, type SpeciesId } from './species.ts';
import { colors, ramp, radius } from '@/theme.ts';
import { Gradient } from '@/ui/Gradient.tsx';
import { STAT_NAMES } from '@/ui/StatIcon.tsx';
import type { Stop } from '@/ui/gradient.ts';
import { CharacterFigure } from './CharacterFigure.tsx';
import { speciesFigureLabel } from './species-label.ts';

/**
 * The world the character stands in.
 *
 * This is the redesign's one big move: the character is not an illustration
 * inside a card, they are standing somewhere, and the interface floats over
 * that place. Everything else on the screen is deliberately quiet so this can
 * be the thing you remember.
 *
 * The sky is a gradient rather than a literal outdoors: a photographic
 * landscape would date instantly and fight the flat character art. Deviation
 * #40 briefly painted per-species habitat art over it; those backdrops were
 * retired on 2026-08-28 alongside the move to the static base render, so a
 * gradient is the backdrop again until the Rive character lands.
 *
 * **It is an actual sky now** (Playful, deviation #58), where it was a sage
 * field before. The character is a bird and the tab beside this one is a
 * flight: a green-ish ground under the same animal that climbs a blue corridor
 * on the next screen was the one place the two halves of the metaphor
 * disagreed. The ramp runs blue at the top to cream at the foot, so the page
 * below still opens out of it rather than starting under a band.
 */

/** Daylight, paling toward the ground. Ends on `colors.bg` so the page emerges. */
const SKY: Stop[] = [
  { color: ramp.sky[400], at: 0 },
  { color: '#8fe0ff', at: 0.42 },
  { color: ramp.sky[200], at: 0.74 },
  { color: colors.bg, at: 1 },
];

/**
 * The crest sky — a day that reached the ceiling.
 *
 * **The sky changes, never the bird.** The figure already says four things by
 * shape alone (species, level band, build, presence ring), and a fifth would
 * make the app's centrepiece a readout. Weather is the one register a diorama
 * has that the silhouette does not, so the light on the day changes instead of
 * the animal in it.
 *
 * Held to the same contract every other surface reads: these are 200- and
 * 300-step washes, so the HUD sitting over this stays legible without a single
 * one of its own colours changing. It reads as late afternoon rather than as an
 * alert, which is the intent — this is a good day finishing, not a
 * notification. Under Playful that reading is if anything clearer, because the
 * ordinary sky is now unmistakably *daytime* and the crest is unmistakably
 * *evening*, where sage-into-amber was two washes of similar warmth.
 *
 * **It is always paired with a sentence** (`ceilingLine`). An unexplained
 * change to the one screen somebody opens first is indistinguishable from a
 * bug, which is the failure the whole 2026-08-29 pass exists to remove; adding
 * a new one silently would be an odd way to end it.
 */
const CREST_SKY: Stop[] = [
  { color: ramp.gold[300], at: 0 },
  { color: ramp.accent[300], at: 0.5 },
  { color: colors.bg, at: 1 },
];

/**
 * The dissolve into the page. Alpha, not colour: the sky has to stay visible
 * through the top of the ramp, and only the bottom becomes cream. This is what
 * makes the diorama read as a place the page opens onto rather than as a
 * banner sitting on top of it.
 */
const FADE: Stop[] = [
  { color: '#fff6ec00', at: 0 },
  { color: '#fff6ec59', at: 0.55 },
  { color: colors.bg, at: 1 },
];

export function Diorama({
  height,
  level,
  stage,
  dominance,
  species,
  lifetimePoints,
  crest = false,
  children,
}: {
  height: number;
  /**
   * Spoken by the figure's label, never drawn. `stage` is what the art reads —
   * `evolutionStageForLevel` collapses a level into one of four bands — and
   * four bands is not what someone means by "how far have I got".
   */
  level: number;
  stage: 1 | 2 | 3 | 4;
  dominance?: Dominance;
  species?: SpeciesId | null;
  /** Lifetime per-stat points, for the presence ring. See `aura.ts`. */
  lifetimePoints?: Record<CoreStat, number>;
  /**
   * Today reached the day's ceiling — nothing more can be earned.
   *
   * Changes the sky and nothing else, and only for the rest of that local day.
   * Defaults false so every existing caller is unaffected.
   */
  crest?: boolean;
  /**
   * The floating HUD.
   *
   * Flows from the top of the sky, because the figure above it is absolutely
   * positioned and takes no space in the layout. It used to say "absolutely
   * positioned by the caller"; that is what the 2026-08-14 device pass found
   * overlapping at large Dynamic Type, and the fix — a flowing column, no `top`
   * on any child — is now the contract rather than the caller's option. Pass a
   * `flex: 1` column and space it with flex, never with offsets.
   */
  children?: ReactNode;
}) {
  return (
    <View style={[styles.sky, { height }]}>
      <Gradient stops={crest ? CREST_SKY : SKY} />

      {/* The sun, and three clouds drifting behind the figure.

          These replace the two anonymous soft bodies that stood here while the
          sky was a sage field. The bodies existed so the ramp would not read as
          a swatch, and they were deliberately unnameable — placed off both
          edges so neither resolved into a shape. A blue sky does not need that
          hedge: it can carry the literal objects, and a sun and a few clouds
          are what stop it reading as a gradient.

          All four are `pointerEvents="none"` by virtue of sitting under the
          figure and the HUD, and all four are decoration — the sky's meaning is
          carried by `crest` and by `ceilingLine`, never by the weather here. */}
      <View style={[styles.sun, { top: -height * 0.16, right: -60 }]} />
      <View
        style={[styles.cloud, { top: height * 0.19, left: -40, width: 180, height: 62 }]}
      />
      <View
        style={[
          styles.cloud,
          { top: height * 0.33, right: -30, width: 150, height: 52, opacity: 0.7 },
        ]}
      />
      <View
        style={[
          styles.cloud,
          { top: height * 0.53, left: 44, width: 120, height: 40, opacity: 0.55 },
        ]}
      />

      <Gradient stops={FADE} steps={28} style={{ top: height * 0.46 }} />

      <View
        // The figure is the app's centrepiece and it is drawn, not written —
        // four things are said by shape alone (§6): which animal you are, the
        // ground shadow by level band, the build proportions by dominant stat,
        // the presence ring by mastery. Without a name it is invisible
        // to a screen reader, and the character screen becomes a HUD floating
        // over nothing.
        //
        // Composed in `species-label.ts` rather than here: the conditionals
        // read as obviously right and are wrong at the edges — no dominance
        // yet, and no species at all — so they are a pure module tested in
        // Node, the same treatment `row-label.ts` got. `SPECIES_NAMES` and
        // `STAT_NAMES` are injected, so that module imports no UI and stays
        // loadable by root Vitest.
        //
        // Deliberately said in the app's own vocabulary: a species or "your
        // character", never a Hunter (deviation #26).
        accessible
        accessibilityRole="image"
        accessibilityLabel={speciesFigureLabel({
          // The drawn species, not the stored one — the name has to match the
          // picture (deviation #55).
          species: displaySpecies(species ?? null),
          level,
          dominance: dominance ?? null,
          speciesNames: SPECIES_NAMES,
          statNames: STAT_NAMES,
        })}
        style={[styles.stage, { bottom: height * 0.12 }]}
      >
        {/* `accessible` on the wrapper should collapse this on iOS and did
            not, on the 2026-08-14 build, so the figure is hidden explicitly
            rather than trusting the implicit behaviour. Same fix, same
            reason, as `LeaderboardRow`. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <CharacterFigure
            level={level}
            stage={stage}
            dominance={dominance}
            species={species}
            height={height * 0.6}
            lifetimePoints={lifetimePoints}
          />
        </View>
      </View>

      {/* Outside the figure's element on purpose: the HUD lives here — the
          level and streak pills and the stat rail, each of which names
          itself. Collapsing the whole diorama would swallow them. */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sky: {
    // The rounding is mostly insurance: the fade above reaches cream before
    // the bottom edge, so on most devices there is no visible corner to round.
    // It matters on a short screen, where the ramp runs out of room.
    borderBottomLeftRadius: radius.lg * 1.6,
    borderBottomRightRadius: radius.lg * 1.6,
    overflow: 'hidden',
  },
  /**
   * A cloud: a white capsule, not a circle.
   *
   * The design blurs these; there is no blur here (see `Glass` for why the app
   * owns no native blur) and none is needed — at 46% white on a saturated blue
   * a hard capsule edge is already soft enough to read as vapour, and the
   * figure sits in front of all three.
   */
  cloud: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  /**
   * The sun, mostly off the top-right corner.
   *
   * Gold rather than the accent: this is warmth in the scene and not a figure
   * about the player, and putting `colors.accent` in the sky would be the one
   * orange on this screen that does not mean "you" — which is the distinction
   * `earnedColor`'s own comment spends a paragraph on. A flat disc rather than
   * the design's radial gradient: `Gradient` bands only linearly, and a radial
   * one built from concentric views is a great deal of machinery for a shape
   * that is three-quarters off-screen.
   */
  sun: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: radius.pill,
    backgroundColor: ramp.gold[300],
    opacity: 0.85,
  },
  stage: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});

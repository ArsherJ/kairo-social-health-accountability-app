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
 * The sky is a sage gradient rather than a literal outdoors: a photographic
 * landscape would date instantly and fight the flat character art. Deviation
 * #40 briefly painted per-species habitat art over it; those backdrops were
 * retired on 2026-08-28 alongside the move to the static base render, so the
 * sage gradient is the backdrop again until the Rive character lands.
 */

/** Sage, deepening toward the horizon. */
const SKY: Stop[] = [
  { color: ramp.sage[200], at: 0 },
  { color: ramp.sage[300], at: 0.46 },
  { color: ramp.sage[400], at: 1 },
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
 * Amber's wash and 200-step, held to the same contract every other surface
 * reads: 200 is a wash you can set text on, so the HUD sitting over this stays
 * legible without a single one of its own colours changing. It reads as late
 * afternoon rather than as an alert, which is the intent — this is a good day
 * finishing, not a notification.
 *
 * **It is always paired with a sentence** (`ceilingLine`). An unexplained
 * change to the one screen somebody opens first is indistinguishable from a
 * bug, which is the failure the whole 2026-08-29 pass exists to remove; adding
 * a new one silently would be an odd way to end it.
 */
const CREST_SKY: Stop[] = [
  { color: ramp.accent[200], at: 0 },
  { color: ramp.accent[300], at: 0.5 },
  { color: ramp.sage[300], at: 1 },
];

/**
 * The dissolve into the page. Alpha, not colour: the sky has to stay visible
 * through the top of the ramp, and only the bottom becomes cream. This is what
 * makes the diorama read as a place the page opens onto rather than as a
 * banner sitting on top of it.
 */
const FADE: Stop[] = [
  { color: '#f5ead800', at: 0 },
  { color: '#f5ead859', at: 0.55 },
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
  /** The floating HUD. Absolutely positioned by the caller. */
  children?: ReactNode;
}) {
  return (
    <View style={[styles.sky, { height }]}>
      <Gradient stops={crest ? CREST_SKY : SKY} />

      {/* Two soft bodies behind the figure. They give the sky somewhere to be
          — a flat ramp reads as a swatch — and they are placed off both edges
          so neither resolves into a shape you could name. */}
      <View
        style={[
          styles.body,
          { top: height * 0.3, left: -62, width: 210, height: 210, opacity: 0.55 },
        ]}
      />
      <View
        style={[
          styles.body,
          {
            top: height * 0.44,
            right: -70,
            width: 240,
            height: 240,
            backgroundColor: ramp.sage[100],
            opacity: 0.45,
          },
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
  body: { position: 'absolute', borderRadius: radius.pill, backgroundColor: ramp.sage[200] },
  stage: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { CoreStat, Dominance, EvolutionStage } from '@kairo/core';
import { dioramaSky, radius, type Theme } from '@/theme.ts';
import { Gradient } from '@/ui/Gradient.tsx';
import { useScheme, useStyles } from '@/ui/use-theme.ts';
import { CharacterFigure } from './CharacterFigure.tsx';
import { MotionScenery } from './MotionScenery.tsx';
import type { BodyPresence, MotionLocation, StaticFigureSelection } from './living-mirror.ts';

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

/**
 * The three ramps, per scheme.
 *
 * Built once at module load from `themes` rather than inside the component:
 * `Gradient` re-ramps when the stop array's identity changes, so a fresh array
 * per render would recompute every band on every frame. The light sky pales
 * from blue to the page; the dark one deepens from night to the page, which
 * is the same bird under a different hour.
 *
 * **The crest sky changes, never the bird.** A day that reached the ceiling is
 * late afternoon rather than an alert, in both schemes, and it is always
 * paired with `ceilingLine`.
 */

export function Diorama({
  height,
  level,
  stage,
  location,
  figure,
  body,
  figureLabel,
  dominance,
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
  stage: EvolutionStage;
  /** Which Motion band the scenery draws. Resolved by `living-mirror.ts`. */
  location: MotionLocation;
  /** Which single PNG the figure draws. Resolved by `staticFigureSelection`. */
  figure: StaticFigureSelection;
  /** Body's contribution to the ground shadow. */
  body: BodyPresence;
  /**
   * The figure's accessible name, composed by `livingCharacterLabel`.
   *
   * Supplied rather than built here for the reason `speciesFigureLabel` existed:
   * the conditionals read as obviously right and are wrong at the edges, so they
   * belong in a pure module tested in Node. This renderer interprets nothing.
   */
  figureLabel: string;
  /** Undefined while in flight; null for an unstarted character. Only the
   *  All-Rounder's unconditional presence ring reads it. */
  dominance?: Dominance;
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
  const styles = useStyles(makeStyles);
  const stops = dioramaSky[useScheme()];
  return (
    <View style={[styles.sky, { height }]}>
      <Gradient stops={crest ? stops.crest : stops.sky} />

      {
        /* The sun, and two quiet clouds drifting behind the figure.

          These replace the two anonymous soft bodies that stood here while the
          sky was a sage field. The bodies existed so the ramp would not read as
          a swatch, and they were deliberately unnameable — placed off both
          edges so neither resolved into a shape. A blue sky does not need that
          hedge: it can carry the literal objects, and a sun and a few clouds
          are what stop it reading as a gradient.

          All three are `pointerEvents="none"` by virtue of sitting under the
          figure and the HUD, and all three are decoration — the sky's meaning is
          carried by `crest` and by `ceilingLine`, never by the weather here. */
      }
      <View style={[styles.sun, { top: -height * 0.08, right: -28 }]} />
      <View
        style={[styles.cloud, { top: height * 0.2, left: 18, width: 72, height: 24 }]}
      />
      <View
        style={[styles.cloud, { top: height * 0.34, right: 24, width: 52, height: 18 }]}
      />

      {
        /* Where KAIRO is standing today. Under the fade and the figure, over the
          sky: it is the ground, not weather. Decorative — the location is also
          printed as a word in the HUD. */
      }
      <MotionScenery location={location} />

      <Gradient stops={stops.fade} steps={28} style={{ top: height * 0.46 }} />

      <View
        // The figure is the app's centrepiece and it is drawn, not written —
        // four things are said by shape alone (§6): which animal you are, the
        // ground shadow by level band, the Body weight and tint on that shadow,
        // the presence ring by mastery. Without a name it is invisible to a
        // screen reader, and Today becomes a HUD floating over nothing.
        //
        // Composed by `livingCharacterLabel` and passed in, not built here: the
        // conditionals read as obviously right and are wrong at the edges — no
        // Mind reading, no capability — so they are a pure module tested in
        // Node, the same treatment `row-label.ts` got.
        //
        // Deliberately said in the app's own vocabulary: the character's name
        // and where it is standing, never a Hunter (deviation #26) and never a
        // physique tier.
        accessible
        accessibilityRole='image'
        accessibilityLabel={figureLabel}
        style={[styles.stage, { bottom: height * 0.12 }]}
      >
        {
          /* `accessible` on the wrapper should collapse this on iOS and did
            not, on the 2026-08-14 build, so the figure is hidden explicitly
            rather than trusting the implicit behaviour. Same fix, same
            reason, as `LeaderboardRow`. */
        }
        <View accessibilityElementsHidden importantForAccessibility='no-hide-descendants'>
          <CharacterFigure
            level={level}
            stage={stage}
            figure={figure}
            body={body}
            dominance={dominance}
            height={height * 0.6}
            lifetimePoints={lifetimePoints}
          />
        </View>
      </View>

      {
        /* Outside the figure's element on purpose: the HUD lives here — the
          level and streak pills and the stat rail, each of which names
          itself. Collapsing the whole diorama would swallow them. */
      }
      {children}
    </View>
  );
}

const makeStyles = ({ colors, ramp, scheme }: Theme) =>
  StyleSheet.create({
    /**
     * A card now (deviation #72): the scene is one tile of the dashboard rather
     * than the page's whole header, so it takes the card radius on every corner
     * and clips its own sky.
     */
    sky: {
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      overflow: 'hidden',
    },
    /**
     * A cloud: a white capsule, not a circle.
     *
     * The design blurs these; there is no blur here (see `Glass` for why the app
     * owns no native blur) and none is needed. A low-opacity light surface keeps
     * the capsules behind the figure instead of turning them into status bars.
     */
    cloud: {
      position: 'absolute',
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      backgroundColor: scheme === 'dark' ? colors.text : colors.surface,
      // Faint at night: a bright cloud on a night sky reads as a lamp.
      opacity: scheme === 'dark' ? 0.12 : 0.3,
    },
    /**
     * A compact sun tucked into the top-right corner.
     *
     * Gold rather than the accent: this is warmth in the scene and not a figure
     * about the player, and putting `colors.accent` in the sky would be the one
     * orange on this screen that does not mean "you" — which is the distinction
     * `earnedColor`'s own comment spends a paragraph on. A flat disc rather than
     * the design's radial gradient: `Gradient` bands only linearly, and a radial
     * one built from concentric views is a great deal of machinery for a small
     * supporting shape.
     */
    sun: {
      position: 'absolute',
      width: 104,
      height: 104,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      backgroundColor: ramp.gold[300],
      opacity: scheme === 'dark' ? 0.24 : 0.42,
    },
    stage: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  });

import { StyleSheet, View } from 'react-native';
import { radius, ramp } from '@/theme.ts';
import { MOTION_LOCATIONS, type MotionLocation } from './living-mirror.ts';

/**
 * Where KAIRO is standing, drawn.
 *
 * It receives a resolved `MotionLocation` and interprets no health value —
 * `motionLocationForSteps` decided that, and it is tested. Everything here is
 * decoration and hidden from the accessibility tree, because the location is
 * also printed as a word in the HUD above: a screen reader hears "Climb", not
 * a description of some rounded rectangles.
 *
 * **The layers are cumulative, not five themes.** Each band adds one land mass
 * whose top edge rises and whose fill darkens by a ramp step, so climbing reads
 * as travel rather than as the sky being swapped for another sky. The branch
 * stays drawn at every band because that is where KAIRO lives — it is home, not
 * a failure state — and the Ridge adds a gold glow, `gold` being the token the
 * ridge flag already uses.
 *
 * **It must not import `sky-path.ts` or anything from `features/squad`.** That
 * module is the *race* corridor: `BAND`, `placeRacers` and the `dy < 0`
 * invariant exist to place several birds against one shared finish, and reusing
 * it here would put the race's picture behind a screen that is not the race —
 * the `SoloBoard` failure the codebase already records. Today's scenery is a
 * static backdrop for one band.
 *
 * Plain rounded Views, `theme.ts` tokens and opacity only. No gradient here
 * (`Diorama` owns the sky's), no SVG, no new dependency — the whole reason this
 * ships over the air.
 */
export function MotionScenery({ location }: { location: MotionLocation }) {
  const depth = MOTION_LOCATIONS.indexOf(location);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <View style={styles.horizon} />
      {depth >= 1 && <View style={[styles.land, styles.treeline]} />}
      {depth >= 2 && <View style={[styles.land, styles.valley]} />}
      {depth >= 3 && <View style={[styles.land, styles.climb]} />}
      {depth >= 4 && <View style={styles.ridgeGlow} />}
      <View style={styles.branch} />
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * One hairline where the land meets the sky. Present at every band, so the
   * ground does not appear from nowhere at 2,500 steps.
   */
  horizon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '20%',
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: ramp.sky[300],
    opacity: 0.7,
  },
  /**
   * A land mass: a wide rounded slab that sits off both edges, so its corners
   * never resolve into a shape the eye can name. Each one is taller and one
   * ramp step darker than the last.
   */
  land: {
    position: 'absolute',
    left: '-25%',
    right: '-25%',
    bottom: 0,
    borderTopLeftRadius: radius.xl * 4,
    borderTopRightRadius: radius.xl * 4,
    borderCurve: 'continuous',
  },
  treeline: { height: '24%', backgroundColor: ramp.sky[200], opacity: 0.85 },
  valley: { height: '30%', backgroundColor: ramp.sky[300], opacity: 0.7 },
  climb: { height: '36%', backgroundColor: ramp.sky[400], opacity: 0.45 },
  /**
   * The Ridge. Gold, which is what the system means by *earned* — the same
   * token the ridge flag on the Sky tab carries. A wash rather than a shape:
   * the arrival is announced by the reaction sentence and by the word in the
   * HUD, and a second literal flag here would be two pictures of one finish.
   */
  ridgeGlow: {
    position: 'absolute',
    left: '-15%',
    right: '-15%',
    bottom: 0,
    height: '46%',
    borderTopLeftRadius: radius.xl * 4,
    borderTopRightRadius: radius.xl * 4,
    borderCurve: 'continuous',
    backgroundColor: ramp.gold[300],
    opacity: 0.32,
  },
  /**
   * The branch, always drawn. KAIRO stands on it at every band — a perch that
   * appeared and disappeared with the step count would read as a rendering
   * fault, and Branch is home rather than the absence of progress.
   */
  branch: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    bottom: '18%',
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: ramp.neutral[400],
    opacity: 0.55,
  },
});

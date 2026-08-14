import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { CoreStat, Dominance } from '@kairo/core';
import type { CharacterBody } from '@/features/profile/character-body.ts';
import { colors, ramp, radius } from '@/theme.ts';
import { Gradient } from '@/ui/Gradient.tsx';
import { STAT_NAMES } from '@/ui/StatIcon.tsx';
import type { Stop } from '@/ui/gradient.ts';
import { CharacterFigure } from './CharacterFigure.tsx';

/**
 * The world the character stands in.
 *
 * This is the redesign's one big move: the character is not an illustration
 * inside a card, they are standing somewhere, and the interface floats over
 * that place. Everything else on the screen is deliberately quiet so this can
 * be the thing you remember.
 *
 * The sky is sage rather than a literal outdoors — Kairo is played in Manila
 * traffic and at 6am, and a photographic landscape would date instantly and
 * fight the flat character art. Sage also already means "your lane" in this
 * palette, so the ground the character stands on is the same colour as the
 * progress they are making.
 */

/** Sage, deepening toward the horizon. */
const SKY: Stop[] = [
  { color: ramp.sage[200], at: 0 },
  { color: ramp.sage[300], at: 0.46 },
  { color: ramp.sage[400], at: 1 },
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

/**
 * The figure, in words.
 *
 * `STAT_NAMES` rather than a second map of its own: `Dominance` is
 * `CoreStat | 'balanced' | null`, so the stat case is already named once, and
 * a parallel table here is exactly the drift `StatIcon`'s comment warns about.
 *
 * `balanced` is the All-Rounder and is worth saying — it is a build someone
 * worked toward, not the absence of one.
 */
function describeFigure(stage: 1 | 2 | 3 | 4, dominance?: Dominance): string {
  const base = `Your character, stage ${stage} of 4`;
  if (!dominance) return base;
  if (dominance === 'balanced') return `${base}, balanced build`;
  return `${base}, built for ${STAT_NAMES[dominance]}`;
}

export function Diorama({
  height,
  stage,
  dominance,
  body,
  lifetimePoints,
  children,
}: {
  height: number;
  stage: 1 | 2 | 3 | 4;
  dominance?: Dominance;
  body?: CharacterBody | null;
  /** Lifetime per-stat points, for the presence ring. See `aura.ts`. */
  lifetimePoints?: Record<CoreStat, number>;
  /** The floating HUD. Absolutely positioned by the caller. */
  children?: ReactNode;
}) {
  return (
    <View style={[styles.sky, { height }]}>
      <Gradient stops={SKY} />

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
        // three things are said by shape alone (§6): the ground shadow by
        // level band, the build proportions by dominant stat, the presence
        // ring by ability rating. Without a name it is invisible to a screen
        // reader, and the character screen becomes a HUD floating over
        // nothing.
        //
        // Deliberately said in the app's own vocabulary: "your character",
        // never a Hunter (deviation #26).
        accessible
        accessibilityRole="image"
        accessibilityLabel={describeFigure(stage, dominance)}
        style={[styles.stage, { bottom: height * 0.12 }]}
      >
        {/* `accessible` on the wrapper should collapse this on iOS and did
            not, on the 2026-08-14 build, so the figure is hidden explicitly
            rather than trusting the implicit behaviour. Same fix, same
            reason, as `LeaderboardRow`. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <CharacterFigure
            stage={stage}
            dominance={dominance}
            body={body}
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

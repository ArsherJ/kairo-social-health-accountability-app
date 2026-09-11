import { DAILY_STEP_BASELINE } from '@kairo/core';
import {
  type KairoPose,
  type KairoReactionId,
  type SleepState,
  type StrengthTier,
} from './character-contract.ts';
import { sleepStateFor, strengthTierFor } from './character-resolver.ts';
// Relative, not `@/` — root Vitest defines no alias, so a value import through
// it is a load failure for `living-mirror.test.ts`. `theme.ts` itself is
// import-free apart from an erased `import type`, so it loads in Node.
import { colors, ramp } from '../../theme.ts';
import type { NextStepSelection } from '../quests/next-step.ts';

/**
 * The Motion ladder. **`ridge` is 100% and must stay there.**
 *
 * "Ridge" already names the finish line everywhere else: `RACE_FINISH_LINE`
 * *is* `DAILY_STEP_BASELINE`, the Sky tab draws `10k · ridge`, `trivia.ts` says
 * "steps to the ridge", and `kairo-voice.ts` reserves "cleared the ridge" for
 * progress ≥ 1 — which is the same reason `spreadLine` is forbidden from using
 * the word for a shifted band. The fourth band is `climb` precisely so no
 * screen ever puts two values behind one noun. There is no "cleared" location.
 */
export const MOTION_LOCATIONS = ['branch', 'treeline', 'valley', 'climb', 'ridge'] as const;
export type MotionLocation = (typeof MOTION_LOCATIONS)[number];
export type StaticFigureSelection =
  | { kind: 'base' }
  | { kind: 'pose'; pose: KairoPose }
  | { kind: 'state'; state: SleepState };

export type ReactionKind = 'level' | 'record' | 'daily_walk' | 'workout' | 'motion_location';

/**
 * Two vocabularies on purpose. `kind` is what the model decided; `animation` is
 * what the renderer plays, and it is the existing `KairoReactionId` from the
 * approved asset contract. Keeping them apart is what lets Rive take over the
 * `animation`/`pose` fields later without touching a trigger rule.
 */
export interface LivingReaction {
  kind: ReactionKind;
  occurrence: string;
  pose: KairoPose;
  animation: KairoReactionId;
  sentence: string;
  priority: number;
}

/**
 * Body's contribution to the figure: the ground shadow's weight and tint.
 *
 * **It deliberately does not decide the presence ring.** That is `auraStrength()`
 * in `aura.ts`, which reads the *peak rating across all three stats* and gives
 * the All-Rounder a ring at any rating because that signal is about shape, not
 * magnitude. Deriving the ring from Body alone would silently delete it for
 * every Motion- or Mind-dominant player and for every All-Rounder — and since
 * Today is the only screen that mounts `CharacterFigure` (You uses the
 * decorative `KairoThumbnail`), that would remove it from the app entirely.
 */
export interface BodyPresence { tier: StrengthTier; shade: string; shadowWeight: number }

export function motionLocationForSteps(value: number): MotionLocation {
  const steps = Number.isFinite(value) ? Math.max(0, value) : 0;
  const fraction = Math.min(1, steps / DAILY_STEP_BASELINE);
  if (fraction >= 1) return 'ridge';
  if (fraction >= 0.75) return 'climb';
  if (fraction >= 0.5) return 'valley';
  if (fraction >= 0.25) return 'treeline';
  return 'branch';
}

/** The enum value with a capital. No parallel table of the same five words. */
export function locationName(location: MotionLocation): string {
  return location[0]!.toUpperCase() + location.slice(1);
}

/**
 * The pose the day's steps put the bird in.
 *
 * **`ridge` gets `summit` and not `run`** (deviation #73). The top band is the
 * day's finish, and drawing it identically to 80% of the way there threw away
 * the app's single most important daily event. The pose is *persistent*: the
 * `daily_walk` reaction still fires on the crossing and still wins the priority
 * cascade in `staticFigureSelection` for `REACTION_HOLD_MS`, and this is what
 * the figure falls through to for the rest of the day.
 *
 * The pose name is deliberately not `ridge`. That word already names the step
 * count and the Motion band; a third referent is the collision `CONTEXT.md`
 * records, and no surface speaks `summit`.
 */
function motionPose(location: MotionLocation): KairoPose {
  if (location === 'branch') return 'idle';
  if (location === 'treeline' || location === 'valley') return 'walk';
  if (location === 'climb') return 'run';
  return 'summit';
}

function bodyPresence(points: number): BodyPresence {
  const tier = strengthTierFor(Number.isFinite(points) ? Math.max(0, points) : 0);
  if (tier === 'strong') return { tier, shade: colors.damage, shadowWeight: 0.07 };
  if (tier === 'fit') return { tier, shade: ramp.sage[700], shadowWeight: 0.02 };
  return { tier, shade: ramp.sage[700], shadowWeight: -0.03 };
}

/**
 * Which single PNG the figure draws.
 *
 * **Priority, not composition.** The checked-in art is flattened
 * full-character renders, so there is no pose × Mind state × Body export and
 * manufacturing one is explicitly out of scope. Reaction wins, then a
 * non-neutral Mind reading, then the Motion pose, then the base render.
 *
 * **There is no growth-stage branch** (deviation #73). The v3 pack has one body,
 * so every stage draws the same art and the stage reads as *size* instead —
 * `figureResponse`'s `bodyScale` stands a young bird smaller in an unchanged
 * frame, and the ground shadow widens with it. That is why `stage` is no longer
 * an input here while `CharacterFigure` still takes it as a prop.
 *
 * Restoring per-stage bodies means re-adding a table and a variant, not
 * redesigning this: the seam is one branch wide.
 *
 * This function and `REACTION_HOLD_MS` are the only two things Rive replaces:
 * the trigger vocabulary above stays put, which is why the swap touches no
 * rule about *when* something fires.
 */
export function staticFigureSelection(input: {
  reaction: LivingReaction | null;
  mind: { visible: boolean; state: SleepState };
  motionPose: KairoPose | null;
}): StaticFigureSelection {
  if (input.reaction) return { kind: 'pose', pose: input.reaction.pose };
  // A non-neutral Mind reading outranks the Motion pose, and is wearable-gated:
  // `mind.visible` is false for an account that cannot earn Mind at all, so most
  // players never reach this branch and fall through to their Motion pose.
  if (input.mind.visible && input.mind.state !== 'normal') return { kind: 'state', state: input.mind.state };
  if (input.motionPose) return { kind: 'pose', pose: input.motionPose };
  return { kind: 'base' };
}

/**
 * The day, read off the figure.
 *
 * **It takes no growth stage** (deviation #73). It used to, to pick per-stage
 * body art; the v3 pack has one body, so the stage now reaches only
 * `figureResponse`, which turns it into size. `CharacterFigure` still takes the
 * prop — the shadow, the ring and `bodyScale` all read it.
 */
export function resolveLivingMirror(input: {
  steps: number;
  hasSleepSource: boolean;
  sleepMinutes: number | null;
  lifetimeBodyPoints: number;
  nextStep: NextStepSelection;
  reaction: LivingReaction | null;
}) {
  const location = motionLocationForSteps(input.steps);
  // Both halves matter, and neither is redundant. Without `has_sleep_source` the
  // account cannot earn Mind at all; with it, a night that has not been read yet
  // is still unknown. Unknown is never rendered as zero — the rule
  // `questProgressLine` and `stat-detail.ts`'s `rawFor` already follow.
  const hasMindReading = input.hasSleepSource && input.sleepMinutes !== null && Number.isFinite(input.sleepMinutes);
  const mind = {
    visible: hasMindReading,
    state: hasMindReading ? sleepStateFor(input.sleepMinutes) : 'normal' as SleepState,
    minutes: hasMindReading ? input.sleepMinutes : null,
  };
  const pose = motionPose(location);
  return {
    motion: { location, fraction: Math.min(1, Math.max(0, input.steps) / DAILY_STEP_BASELINE), pose },
    body: bodyPresence(input.lifetimeBodyPoints),
    mind,
    nextStep: input.nextStep,
    reaction: input.reaction,
    figure: staticFigureSelection({ reaction: input.reaction, mind, motionPose: pose }),
  };
}

/**
 * The figure's accessible name.
 *
 * **No physique tier.** Body reads through the ground shadow, which is
 * decoration; saying "slim" or "strong" out loud would put a judgement about
 * somebody's body into a screen reader, which is not what the shadow means and
 * not a thing this app says.
 */
export function livingCharacterLabel(input: {
  characterName: string;
  level: number;
  location: MotionLocation;
  mind: { visible: boolean; state: SleepState };
}): string {
  const rest = input.mind.visible && input.mind.state === 'well_rested'
    ? ', looking well rested'
    : input.mind.visible && input.mind.state === 'sleepy'
      ? ', taking the day calmly'
      : '';
  return `${input.characterName}, level ${input.level}, at the ${locationName(input.location)}${rest}`;
}

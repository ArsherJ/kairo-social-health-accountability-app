import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { LivingReaction, ReactionKind } from './living-mirror.ts';
import {
  markReactionsSeen,
  readObservedLevel,
  readSeenReactions,
  writeObservedLevel,
} from './moments.ts';
import { reactionCandidates, selectLivingReaction, type ReactionCandidateInput } from './living-reaction.ts';

/**
 * One bounded reaction per opening of Today.
 *
 * The house split again: `living-reaction.ts` decides and is tested in Node;
 * this performs the I/O — the MMKV occurrence markers, the focus and foreground
 * listeners, and the timer that ends the reaction.
 */

/**
 * How long a reaction holds before the figure returns to its resting selection.
 *
 * **A fixed timer only because the art is static.** The approved character
 * asset system design forbids a timeout that guesses at an animation's length,
 * because Rive signals its own completion — so this constant dies with
 * `staticFigureSelection` at the V1 swap, and nothing else about the trigger
 * rules moves with it.
 */
export const REACTION_HOLD_MS = 2_200;

/**
 * The floor between one reaction ending and the next being allowed.
 *
 * Openings are focus-driven and unshown occurrences survive the day (that is
 * the point of consuming only the presented one), so without a floor ninety
 * seconds of tab-flicking would drip four celebrations. The floor keeps the
 * drip across a real day and kills it inside one session. One constant; the
 * week-one interviews are what should move it.
 */
export const REACTION_FLOOR_MS = 30_000;

export interface UseLivingReactionInput {
  userId: string | undefined;
  /** Every source of a candidate has resolved or supplied cached data. */
  ready: boolean;
  signals: Omit<ReactionCandidateInput, 'previousLevel'>;
  onImpression: (kind: ReactionKind) => void;
}

export function useLivingReaction(input: UseLivingReactionInput): LivingReaction | null {
  const [active, setActive] = useState<LivingReaction | null>(null);
  const lastEndedAt = useRef(0);
  // Read inside the callback rather than listed as a dependency, so a caller
  // that forgets to memoize `signals`/`onImpression` cannot re-fire the effect.
  const latest = useRef(input);
  latest.current = input;

  const evaluate = useCallback(() => {
    const { userId, ready, signals, onImpression } = latest.current;
    if (!userId || !ready) return;
    if (Date.now() - lastEndedAt.current < REACTION_FLOOR_MS) return;
    try {
      const previousLevel = readObservedLevel(userId);
      const candidates = reactionCandidates({ ...signals, previousLevel });
      const selected = selectLivingReaction(candidates, readSeenReactions(userId));
      // Written whether or not a reaction was selected: the observed level is
      // what makes the *next* increase a level-up, and leaving it behind after
      // a suppressed opening would replay the same level-up later.
      writeObservedLevel(userId, signals.currentLevel);
      if (!selected.reaction) return;
      markReactionsSeen(userId, selected.consumed);
      setActive(selected.reaction);
      onImpression(selected.reaction.kind);
    } catch (error) {
      // MMKV can throw, and a celebration must never break the screen it is
      // shown on — the same guard `markFirstScoreSeen` carries.
      console.warn('[living-mirror] reaction', error);
    }
  }, []);

  // A different account gets its own openings and its own floor.
  useEffect(() => {
    lastEndedAt.current = 0;
    setActive(null);
  }, [input.userId]);

  // Opening #1: the screen gains focus — a cold launch onto Today and every
  // return from another tab both come through here. **Not a mount**: Today is a
  // screen in a persistent tab navigator, so a mount-scoped guard would be one
  // evaluation per app *launch* — walking four thousand steps and coming back
  // from the Sky tab would show nothing.
  useFocusEffect(useCallback(() => { evaluate(); }, [evaluate]));

  // Opening #2: the app returns from the background while Today is already the
  // focused screen, which fires no focus event of its own.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') evaluate();
    });
    return () => sub.remove();
  }, [evaluate]);

  // Data can land after focus. Re-evaluate once `ready` flips; the occurrence
  // markers and the floor are what stop this from repeating.
  useEffect(() => { if (input.ready) evaluate(); }, [input.ready, evaluate]);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      lastEndedAt.current = Date.now();
      setActive(null);
    }, REACTION_HOLD_MS);
    return () => clearTimeout(timer);
  }, [active]);

  return active;
}

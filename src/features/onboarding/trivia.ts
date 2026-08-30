import { DAILY_STEP_BASELINE, QUESTS_PER_DAY, RACE_FINISH_LINE } from '@kairo/core';

/**
 * The facts shown while Kairo is connecting to Health.
 *
 * **Zero runtime imports beyond the keystone**, which is pure TypeScript, so
 * root Vitest can load this — the constraint that shaped `stat-names.ts`,
 * `quest-dial.ts` and `month-grid.ts`. The screen that draws these cannot be
 * tested, because `@expo/vector-icons` reaches React Native's Flow syntax.
 *
 * **Every number here is either the app's own or the size of an action** — a
 * walk's length, a count of stats — and never a claimed effect size. That is a
 * deliberate line: a screen that tells somebody a habit will change a number in
 * their blood by a specific percentage is the app making a medical claim, on
 * the third screen of onboarding, before it has measured anything about them.
 * Naming the *intervention* ("a 12-minute walk") says the useful half without
 * promising the other. Four of the five facts are simply how Kairo works, which
 * has the additional virtue of being certainly true.
 *
 * The spread fact in particular is not a platitude: it is the engine. A day
 * with more active hours gets a **lower** Motion ladder through `spreadShift`,
 * so movement spread across the day genuinely does score better than the same
 * steps in one push. Somebody who reads it and acts on it will see the
 * difference.
 */

export interface Trivia {
  /** The clause before the figure. */
  lead: string;
  /** The figure, painted in the accent. The visual hook. */
  figure: string;
  /** The clause after it. May be empty when the figure ends the sentence. */
  tail: string;
  /** One quieter line under the headline. */
  note: string;
}

/**
 * Built from the constants rather than written down.
 *
 * `RACE_FINISH_LINE` *is* `DAILY_STEP_BASELINE`, which *is* the Daily Walk — one
 * number with three readings — so a literal here would be a fourth copy of it,
 * free to drift. The identity is asserted in the test rather than assumed.
 */
export const TRIVIA: readonly Trivia[] = [
  {
    lead: 'Everyone in Kairo flies the same lane every day —',
    figure: RACE_FINISH_LINE.toLocaleString(),
    tail: 'steps to the ridge.',
    note: 'Same flag for a first-timer and for the fittest person you know.',
  },
  {
    lead: 'Movement spread through the day scores better than one big push.',
    figure: 'Eight active hours',
    tail: 'lowers the bar you are aiming at.',
    note: 'A walk at lunch and a walk after dinner beat the same steps at once.',
  },
  {
    lead: 'A walk after a meal is one of the cheapest habits going.',
    figure: 'Twelve minutes',
    tail: 'is enough to be worth doing.',
    note: 'Three of those a day is most of your daily walk already.',
  },
  {
    lead: 'Kairo scores',
    figure: 'three things',
    tail: '— your steps, your calories and your sleep.',
    note: 'Which means one of the three is earned lying down.',
  },
  {
    lead: 'You get',
    figure: `${QUESTS_PER_DAY} quests a day`,
    tail: ', drawn fresh at your own midnight.',
    note: 'Nothing to check off by hand — your movement clears them.',
  },
];

/**
 * A stable 32-bit hash. FNV-1a.
 *
 * Written out rather than imported so this module keeps its one dependency.
 * `>>> 0` after each step keeps it in unsigned 32-bit range, which is what
 * makes the result identical on every platform rather than drifting once the
 * intermediate exceeds `Number.MAX_SAFE_INTEGER`.
 */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Which fact this account sees.
 *
 * **Deterministic, and that is not a nicety.** `Math.random()` in a render body
 * is a side effect: React may render a component twice, and the fact would
 * change between the two — so the card would visibly swap its own text while
 * being read. Same reasoning `pickQuests` is a pure hash of
 * `(account, date, tier)` rather than a draw.
 *
 * Keyed on the account so a user who backs out and retries sees the same fact
 * rather than a new one each attempt, which would read as a slot machine.
 * Falls back to a fixed fact when there is no id yet — the first entry, which
 * is the one that teaches the rule of the game.
 */
export function pickTrivia(seed: string | undefined): Trivia {
  const first = TRIVIA[0] as Trivia;
  if (!seed) return first;
  return TRIVIA[hash(seed) % TRIVIA.length] ?? first;
}

/** Re-exported so the test can assert the identity without a second import. */
export const _DAILY_STEP_BASELINE = DAILY_STEP_BASELINE;

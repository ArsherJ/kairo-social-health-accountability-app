/**
 * How long the "Did you know?" beat stays up.
 *
 * **What this beat is, and what it is not.** It is not a fabricated wait. Work
 * genuinely is in flight while it shows — `healthSource.readStepsToday` runs
 * behind it, which on a real device with years of Health data and a cold
 * HealthKit daemon is not instant. What this module adds is a **floor**, so the
 * sentence on screen can be read rather than flashed for 180ms on a fast phone.
 *
 * That floor is a real trade and worth naming: on a device where the read
 * returns immediately, the beat is paced rather than caused. The alternatives
 * were both worse — no floor means the card flickers and is never read on
 * exactly the phones most people have, and no beat at all leaves the grant and
 * the reveal butted together with nothing between them. `MIN_VISIBLE_MS` is one
 * constant and setting it to 0 removes the pacing entirely, which is the escape
 * hatch if this ever measures badly.
 *
 * **The window opens when `connectHealth` resolves, not when the button is
 * tapped.** That is the load-bearing detail. iOS presents the Health permission
 * sheet during `connectHealth`, and a card started at tap would spend its whole
 * minimum *behind* that sheet — so somebody who took ten seconds over the
 * permissions would dismiss it and watch the beat vanish in the same frame,
 * having never seen it. Starting the clock after the sheet has resolved is what
 * makes the minimum mean "visible for", which is the only thing it should mean.
 *
 * Pure and clock-free like everything worth testing here: `now` is an argument.
 */

/**
 * Long enough to read one sentence and its note — about twenty words.
 *
 * Deliberately short. This is the fourth screen of an onboarding run, not a
 * splash: the beat has to feel like the app drawing breath, not like the app
 * making you wait.
 */
export const MIN_VISIBLE_MS = 2_400;

export interface HatchingState {
  /** Whether the card is on screen. */
  visible: boolean;
  /** Whether the run may move on to the reveal. */
  mayAdvance: boolean;
}

/**
 * Where the beat is.
 *
 * `openedAt` is when `connectHealth` resolved — the moment the card became
 * genuinely visible. `finishedAt` is when the step read completed, or `null`
 * while it is still running.
 *
 * The card comes down at the later of "the minimum has been served" and "the
 * work is done", so neither a fast read nor a slow one can cut it short: a read
 * that takes four seconds holds the card for four seconds, and one that takes
 * eighty milliseconds still holds it for the minimum.
 */
export function hatchingWindow(input: {
  openedAt: number | null;
  finishedAt: number | null;
  now: number;
}): HatchingState {
  // Not started. Nothing to show, and nothing to advance past — the caller is
  // still on the ask.
  if (input.openedAt === null) return { visible: false, mayAdvance: false };

  const servedAt = input.openedAt + MIN_VISIBLE_MS;
  // `finishedAt ?? Infinity` is what makes an unfinished read hold the card
  // open indefinitely rather than releasing it at the minimum — the beat may
  // not hand over to a reveal that has no number in it yet.
  const clearsAt = Math.max(servedAt, input.finishedAt ?? Number.POSITIVE_INFINITY);

  // `>=` on both sides of one comparison, so there is no frame in which the
  // card is down and the run has not yet been told it may move.
  const done = input.now >= clearsAt;
  return { visible: !done, mayAdvance: done };
}

/**
 * How long to wait before asking again, from a given moment.
 *
 * The component drives itself off a single timer rather than a render loop, so
 * it needs to know when the answer will next change. Returns `null` when the
 * answer cannot change on a timer alone — the read has not landed, so the next
 * change comes from the promise resolving rather than from the clock.
 */
export function msUntilNextChange(input: {
  openedAt: number | null;
  finishedAt: number | null;
  now: number;
}): number | null {
  if (input.openedAt === null) return null;
  if (input.finishedAt === null) {
    // The minimum may still be running down, and it is worth waking for: the
    // read could land during it, and this keeps the two in step.
    const remaining = input.openedAt + MIN_VISIBLE_MS - input.now;
    return remaining > 0 ? remaining : null;
  }

  const clearsAt = Math.max(input.openedAt + MIN_VISIBLE_MS, input.finishedAt);
  const remaining = clearsAt - input.now;
  return remaining > 0 ? remaining : 0;
}

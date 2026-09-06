import { DAILY_STEP_BASELINE } from '@kairo/core';
// By relative path, and never through `@/`: root Vitest defines no alias, so a
// value import through it is a load failure. Same reach `kairo-voice.ts` makes
// for `stat-names.ts`.
import { initialFor } from '../../ui/initial.ts';

/**
 * How many of the flock cleared the Daily Walk, as one mark per member.
 *
 * **The one true cooperative thing a flock can say about itself.** Removing the
 * Battle (deviation #66) left the squad layer entirely comparative — a private
 * board and a capped race — and the panel that recommended the removal listed
 * pooling as one of three reasons a quiet member costs the group nothing. This
 * restores the cooperative reading at zero mechanical cost: no table, no RPC,
 * no grading block, no push. Every figure it needs is already inside
 * `squad_leaderboard()`'s consent projection.
 *
 * **It reverses the week strip's "never a count" rule, and the reversal is the
 * reason it is safe.** That rule was written because "three of four are in" is
 * a claim about a moment that does not exist for everybody at once (§2). The
 * count here is not a claim about a moment: `squad_leaderboard(p_mode =>
 * 'current')` returns *each member's own* local date, so the sentence is "three
 * of four have cleared their own today" — which is true continuously, and which
 * empties for each member at their own local midnight without anybody else's
 * mark moving.
 *
 * **A withheld member is the edge this module exists to get right.** The
 * consent gate is reciprocal and per row (deviation #47), so a squadmate who
 * has not agreed comes back with `steps: null` — no visible total, which means
 * they can be counted neither as cleared nor as missed. They keep a mark, so
 * the row still has one per member and the strip is not silently shorter than
 * the flock, but the mark is its own third state and they are absent from
 * **both** halves of the count. Counting them in the denominator would let a
 * private decision deflate everybody else's number, which is the same leak
 * whole-squad consent gating had.
 *
 * **The label names how many are not sharing, and that is deliberate.** It
 * reveals nothing the screen does not already show — the ring is drawn, and the
 * ranked row beneath it carries four blank stat columns, which is what per-row
 * gating looks like by design (#47's leak is the *opposite* arrangement, where
 * one holdout blanks everybody). Saying "2 of 2 cleared" over five discs would
 * hand a screen-reader user a count that does not match the picture, which is
 * the failure `row-label.ts` exists to prevent. It states a fact about sharing
 * and never a verdict about walking.
 *
 * **The marks keep the order the board handed them.** The Sky rail sorts
 * withheld members last because it has four seats and must choose who to drop;
 * this drops nobody. Sorting rings to the end would group the people who
 * declined into a visible cohort — a louder statement about a private decision
 * than leaving them where the board already puts them.
 *
 * Pure and tested in Node, like every other copy module here: the conditionals
 * are the kind that read as obviously right and are wrong at the edges — a
 * squad of one, a viewer who never consented, a member exactly on the baseline.
 */

/**
 * `squad_leaderboard()`'s current mode is each member's today; completed is
 * each member's yesterday.
 *
 * Structurally `LeaderboardMode`, restated rather than imported: that type
 * lives in `queries.ts`, which pulls in supabase-js, and this module has to
 * stay loadable by root Vitest. The board passes its own `mode` straight
 * through, so the two cannot silently disagree about a value — only about
 * which values exist, and that fails at the call site's type check.
 */
export type FlockWalkMode = 'current' | 'completed';

export interface FlockWalkMember {
  characterName: string;
  /** The day's total, or null when the reciprocal consent gate withholds it. */
  steps: number | null;
}

/**
 * `unmet` deliberately carries no tense. It is "not cleared", and whether that
 * reads as *not yet* or as *missed* depends on which board is showing — which
 * is the label's job, not the mark's.
 */
export type FlockMarkState = 'cleared' | 'unmet' | 'withheld';

export interface FlockMark {
  /** The member's initial, drawn **above** their mark — never on it: the filled disc is a bright fill. */
  letter: string;
  state: FlockMarkState;
}

export interface FlockWalk {
  marks: FlockMark[];
  /**
   * The whole strip, said once. Seven — or six — marks that each speak are a
   * stop per circle for a picture whose meaning is the shape of the row.
   */
  label: string;
}

export function flockWalk({
  members,
  mode,
}: {
  members: readonly FlockWalkMember[];
  mode: FlockWalkMode;
}): FlockWalk | null {
  // A squad of one has nothing cooperative to report, and "1 of 1 walked
  // today" is the app congratulating somebody for being alone — the same
  // sentence the leader line is guarded against saying.
  if (members.length < 2) return null;

  const marks = members.map((m): FlockMark => ({
    letter: initialFor(m.characterName),
    state:
      m.steps === null ? 'withheld' : m.steps >= DAILY_STEP_BASELINE ? 'cleared' : 'unmet',
  }));

  const visible = marks.filter((m) => m.state !== 'withheld').length;
  const withheld = marks.length - visible;

  // Fewer than two visible members is the squad-of-one problem in disguise,
  // and it is the normal state for a viewer who never consented: the gate is
  // reciprocal, so their own row reads null alongside everybody else's.
  if (visible < 2) return null;

  const cleared = marks.filter((m) => m.state === 'cleared').length;
  const day = mode === 'current' ? 'today' : 'yesterday';

  const label = `${cleared} of ${visible} in your flock cleared the Daily Walk ${day}`;
  const note =
    withheld === 0
      ? ''
      : `. ${withheld} ${withheld === 1 ? 'member is' : 'members are'} not sharing totals`;

  return { marks, label: `${label}${note}` };
}

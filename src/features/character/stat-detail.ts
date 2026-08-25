import {
  CORE_STATS,
  nextTierFor,
  statShifts,
  type CoreStat,
  type DayTotals,
} from '@kairo/core';

/** How each stat's raw value reads in a sentence. Copy, so it lives here. */
export const STAT_UNITS: Record<CoreStat, string> = {
  AGI: 'steps',
  STR: 'kcal',
  MND: 'minutes of sleep',
};

/**
 * Why each stat is a stat at all — the medical reasoning §5 has always carried
 * and the app has never shipped.
 *
 * One sentence each, and they live beside `STAT_UNITS` because copy belongs
 * where the other copy is. Rendered in `app/progress.tsx`, the sheet the home
 * shelf's "How progress works" link already opens: the alternative was four
 * more lines on the densest screen in the app, to explain numbers that are
 * already explained there.
 *
 * AGI's carries what VIT's used to, and it has to: spreading movement across
 * the day is now the thing that makes Motion's bands easier rather than a
 * stat of its own (deviation #41), and it is the claim the app most
 * conspicuously never made — a single long workout does not buy off a day
 * spent sitting.
 */
export const STAT_WHY: Record<CoreStat, string> = {
  AGI: 'Daily step count is one of the strongest single predictors of long-term health — more than almost anything else you can measure this easily. Spreading those steps across the day counts for more than one long walk: sitting still the rest of the day carries its own risk.',
  STR: 'Active calories stand in for hard effort. Kairo cannot see what you lifted, but it can see that you worked — and a tracked workout makes this one easier to top out.',
  MND: 'Sleep is when training becomes strength. Seven hours tops it out, and a very long night still counts — recovery is never punished.',
};

/**
 * The same units when there is exactly one left to do.
 *
 * Not a nicety: a gap of exactly one is reachable on every stat, and "1 more
 * minutes of sleep" is the sentence a user would otherwise meet. `kcal` is
 * invariant — "1 more kcal" is already right — and is listed anyway so this
 * table stays a total function over `CoreStat` rather than a partial one with
 * a fallback.
 */
const STAT_UNITS_SINGULAR: Record<CoreStat, string> = {
  AGI: 'step',
  STR: 'kcal',
  MND: 'minute of sleep',
};

/**
 * The unit as it reads beside `gap`. Singular only at exactly one.
 *
 * Private: `resolveStatDetail` already hands callers a `unit` that agrees with
 * the `gap` beside it, so a second entry point is a second chance to disagree.
 */
function unitForGap(stat: CoreStat, gap: number): string {
  return gap === 1 ? STAT_UNITS_SINGULAR[stat] : STAT_UNITS[stat];
}

/**
 * What the screen knows about workouts on the day being described.
 *
 * Three states because two of them are not the same thing: a resolved query
 * with no session today is a fact, and a query still in flight is not. Both
 * `'session'` and `'unknown'` mean "STR's bands may already have moved and
 * this screen cannot say by how much"; only `'none'` licenses quoting STR's
 * ladder.
 *
 * It is the *existence* of a session, never its contents — no new column is
 * read, and §5's owner-only posture on `workout_sessions` is untouched.
 */
export type WorkoutDaySignal = 'none' | 'session' | 'unknown';

/**
 * `useWorkoutSessions`'s result, as the one bit this module needs.
 *
 * Structural on purpose: the hook's rows carry pace and distance, and taking
 * `WorkoutSession` here would invite a later reader to reach for them. A
 * `localDate` is all that decides this.
 *
 * `undefined` sessions — the query in flight or errored — and an unknown
 * `today` both read `'unknown'` rather than `'none'`, because "I have not been
 * told" is not "there is none", and this whole change exists to stop the
 * second being asserted from the first.
 */
export function workoutDaySignal(
  sessions: ReadonlyArray<{ localDate: string }> | undefined,
  today: string | undefined,
): WorkoutDaySignal {
  if (!sessions || !today) return 'unknown';
  return sessions.some((s) => s.localDate === today) ? 'session' : 'none';
}

export type StatDetail =
  | { kind: 'unknown' }
  | { kind: 'maxed' }
  | {
      /**
       * Strength is open and is the only thing left to ask for, but the day
       * carries a workout — so the number is not the screen's to name.
       *
       * A `gap` here would be the unshifted one, and `workoutShift()` can put
       * Gold at 300 kcal on a day this ladder still calls 400. Being told 400
       * and topping out at 300 reads as a broken score (`scoring.ts`), which
       * is worse than being told the direction and no figure.
       */
      kind: 'unquantified';
      /** Only ever STR: it is the one stat whose shift this screen cannot see. */
      stat: 'STR';
      /** This stat is the user's lane — their dominant stat (§6). */
      lane: boolean;
    }
  | {
      kind: 'gap';
      stat: CoreStat;
      /** This stat is the user's lane — their dominant stat (§6). */
      lane: boolean;
      /** Raw units still needed. */
      gap: number;
      /**
       * What closing that gap is worth, in points. Replaces the tier name the
       * copy used to carry: the bands still decide this number — `nextTierFor`
       * is still what finds the threshold — but Bronze/Silver/Gold became
       * internal to scoring, so the sentence names the reward rather than the
       * rank.
       */
      points: number;
      /**
       * The next band is the top one — this is the last step available on this
       * stat today. Carried as a boolean rather than a tier name because
       * Bronze/Silver/Gold are internal to scoring (deviation #23); the copy
       * needs to know *that* it is the last step, never what it is called.
       */
      topsOut: boolean;
      /** Already agreed with `gap` — singular at exactly one. */
      unit: string;
    };

/**
 * A stat's raw value for today.
 *
 * `sleepMinutes` is a second argument rather than a field on `DayTotals`
 * because it is genuinely a different query: `DayTotals` is
 * `aggregateBuckets` over `health_buckets`, and sleep lives in `daily_sleep`.
 * `useTodayVitals` already reads it on this screen, so threading it here costs
 * nothing and closes the one hole MND had while it was a transitional stat.
 *
 * **`null` is not zero.** No sleep row means the night is unknown, and
 * inventing a "0 minutes" raw value would put MND permanently at the bottom
 * of the "closest gap" ranking and let it win the guidance line over stats
 * with real progress. `resolveStatDetail` skips the stat instead.
 */
function rawFor(
  stat: CoreStat,
  totals: DayTotals,
  sleepMinutes: number | null,
): number | null {
  switch (stat) {
    case 'AGI':
      return totals.steps;
    case 'STR':
      return totals.activeKcal;
    case 'MND':
      return sleepMinutes;
  }
}

/**
 * The one line of guidance under the stat row.
 *
 * Named in the stat's own raw unit, because points are not something a user
 * can go outside and do.
 *
 * The user's **lane** wins when it still has room; a lane already at its top
 * band has nothing to ask for and falls through to the closest stat. This
 * preference used to belong to §6's weekly featured stat, which deviation #10
 * retired — the lane is the branch's equivalent "the stat this user cares
 * about", and unlike featured it never widens a ceiling, only chooses what to
 * mention. Its input is now observed dominance rather than a declared focus,
 * which changes where the preference comes from and nothing about this rule.
 *
 * **Strength can be silenced.** The bands the day is judged against move with
 * the day (`statShifts`), and this screen can see the input to AGI's shift but
 * not to STR's — so on a day carrying a workout, STR is dropped from the
 * ranking rather than quoted from the unshifted ladder. Another stat with a
 * real number wins the line; when none is left, `kind: 'unquantified'` says the
 * lever without the figure. Suppression is the whole fix — nothing here
 * estimates a shift it cannot measure.
 */
export function resolveStatDetail({
  totals,
  sleepMinutes,
  verifiedWorkoutMinutes,
  workoutDay = 'none',
  lane,
}: {
  totals: DayTotals | undefined;
  /**
   * Today's attributed sleep, or null when no row exists. `undefined` while
   * the query is in flight — treated exactly like null, because both mean
   * "nothing to say about Mind yet" and neither is a reason to hold the whole
   * line back.
   */
  sleepMinutes?: number | null;
  /**
   * Minutes of workout that cleared `workoutVerified()`, which is what lowers
   * STR's bands (`shifts.ts`).
   *
   * **The home screen has none to pass, and that is a stated gap rather than
   * an oversight.** Verification reads `was_user_entered`,
   * `has_heart_rate_evidence` and `source_bundle_id`, three columns
   * `useWorkoutSessions` deliberately does not select — §5 keeps
   * `workout_sessions` owner-only and out of every projection, and widening
   * that read is a privacy decision, not a plumbing one, and it has not been
   * taken.
   *
   * Until it is, `workoutDay` below is what keeps that gap from reaching the
   * user: absent minutes no longer mean "no shift", they mean "no number".
   * The parameter stays so that the day the figure exists, exactly one call
   * site changes — pass it and the suppression stops, because the shift is
   * then known rather than merely possible.
   *
   * `undefined` is the whole signal here, so there is no default: a `= 0`
   * would make "the caller has nothing" indistinguishable from "the caller
   * measured nothing", which is the bug this closes.
   */
  verifiedWorkoutMinutes?: number;
  /**
   * Whether the day is known to carry a workout session at all.
   *
   * Existence only — `workoutDaySignal()` reads `local_date` and nothing else,
   * so this needs no column `useWorkoutSessions` does not already select and
   * no §5 decision.
   *
   * Defaults to `'none'`, which is the only value that licenses quoting STR's
   * ladder. That default is safe precisely because it is a claim: a caller who
   * has not looked passes `'unknown'` and gets silence.
   */
  workoutDay?: WorkoutDaySignal;
  lane: CoreStat | null;
}): StatDetail {
  if (!totals) return { kind: 'unknown' };

  // The same table `computeDailyScore` scores the day with, not a second copy
  // of it. Reading the unshifted ladder here is the bug this closes: a
  // well-spread day was told "1,240 more steps" and reached Gold at 7,500,
  // and arriving early reads as a broken score rather than a gift.
  const shifts = statShifts({
    activeHours: totals.activeHours,
    verifiedWorkoutMinutes: verifiedWorkoutMinutes ?? 0,
  });

  // AGI's shift is derived from `activeHours`, which this screen has. STR's is
  // derived from minutes it cannot see — so a zero here is an assumption, not
  // a measurement, and on a day with a workout it is the *wrong* assumption up
  // to a quarter of the time. Suppress rather than quote it.
  //
  // Only when the caller has no minutes of its own: passing them makes the
  // shift known and this whole branch inert, which is what keeps the future
  // wiring to a single call site.
  const strShiftUnknowable = verifiedWorkoutMinutes === undefined && workoutDay !== 'none';

  interface Open {
    stat: CoreStat;
    points: number;
    gap: number;
    topsOut: boolean;
    /** Share of the current band still to go, 0–1. Comparable across stats. */
    remaining: number;
  }

  const open: Open[] = [];
  /** STR was open and was silenced, rather than being closed. */
  let strSilenced = false;
  for (const stat of CORE_STATS) {
    const raw = rawFor(stat, totals, sleepMinutes ?? null);
    // Unknown, not zero — see rawFor. A stat with no measurement has no gap
    // worth naming, and a fabricated 0 would make it win the "closest gap"
    // pick over stats with real progress.
    if (raw === null) continue;
    const next = nextTierFor(stat, raw, shifts[stat]);
    // null means there is nothing more to ask for: Gold in the ordinary case,
    // and for MND also a night past the oversleep threshold, where no amount
    // of extra sleep recovers the top band. Either way the stat is closed.
    if (!next) continue;
    // **After `nextTierFor`, never before.** A shift only ever makes a band
    // easier, so a stat the unshifted ladder already calls closed is closed
    // whatever the workout was — and silencing it there would turn a true
    // "every stat is maxed" into a line implying there is something left to do.
    // Reaching here means STR is open on the ladder this screen can see, which
    // is the only case where the real gap is genuinely unknown.
    if (stat === 'STR' && strShiftUnknowable) {
      strSilenced = true;
      continue;
    }
    // The true band width is (threshold - bandLow), not (threshold - 0):
    // gap / (gap + raw) is a fraction of the target value, which only equals
    // "share of band remaining" in the first band, where bandLow is 0.
    const bandWidth = next.gap + raw - next.bandLow;
    open.push({
      stat,
      points: next.pointsGain,
      gap: next.gap,
      topsOut: next.tier === 'gold',
      remaining: next.gap / bandWidth,
    });
  }

  if (open.length === 0) {
    // Silence, not a lie in either direction: "every stat is maxed" would be
    // false while Strength is still open, and a kcal figure would be the
    // unshifted one. The line names the lever and no number.
    if (strSilenced) return { kind: 'unquantified', stat: 'STR', lane: lane === 'STR' };
    return { kind: 'maxed' };
  }

  const preferred = lane ? open.find((c) => c.stat === lane) : undefined;

  // Gaps live in different units — twenty kcal is not comparable to twenty
  // minutes of sleep — so "closest" means furthest through the current band,
  // not smallest raw number. The strict `<` leaves CORE_STATS order breaking
  // exact ties.
  const closest = open.reduce((best, c) => (c.remaining < best.remaining ? c : best));

  const chosen = preferred ?? closest;

  return {
    kind: 'gap',
    stat: chosen.stat,
    lane: chosen.stat === lane,
    gap: chosen.gap,
    points: chosen.points,
    topsOut: chosen.topsOut,
    unit: unitForGap(chosen.stat, chosen.gap),
  };
}

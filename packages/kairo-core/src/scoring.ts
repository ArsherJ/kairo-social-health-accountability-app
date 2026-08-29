import { normalizationFactor } from './capability.ts';
import {
  mindPoints,
  mindTierFor,
  MIND_OVERSLEEP_HOURS,
  MIND_THRESHOLD_HOURS,
} from './mind.ts';
import { shiftedThreshold, statShifts } from './shifts.ts';
import { TIER_POINTS } from './tier-points.ts';
import {
  CORE_STATS,
  type CoreStat,
  type DailyScore,
  type DailyScoreInput,
  type DayTotals,
  type HourBucket,
  type StatResult,
  type Tier,
} from './types.ts';

/**
 * An hour counts as "active" once it contains this many steps.
 *
 * Named for VIT, which it drove until deviation #41. Deliberately not renamed
 * (spec §1 calls it untouched): it is the same 250 steps, now feeding AGI's
 * spread shift instead of VIT's tier, and a rename would make every older
 * reference read as describing a different threshold.
 */
export const VIT_ACTIVE_HOUR_STEPS = 250;

/**
 * The multiple a featured stat scores at, if one is supplied.
 *
 * **Nothing on the write path supplies one** — deviation #10 retired the weekly
 * rotation from stored scoring, because a stored multiplier would stack with a
 * squad program's read-time weight (an AGI week in a running squad = 2.25×).
 * This is kept, and kept tested, because V1 may resurrect the rotation as a
 * read-time projection on All-around boards.
 */
export const FEATURED_STAT_MULTIPLIER = 1.5;


/**
 * A single stat's Gold ceiling (§6). Derived from the tier table rather than
 * repeated, so raising Gold cannot leave a UI sizing bars against the old
 * number with no test to catch it.
 */
export const STAT_POINTS_MAX = TIER_POINTS.gold;

/**
 * Ceilings for a stored day. §5 quotes both figures.
 *
 * These are now the *only* ceilings: with the rotation retired, stored points
 * are always base points, so nothing quietly exceeds them. The `*_FEATURED`
 * variants that used to sit here were deleted with deviation #10 rather than
 * left to describe scores the engine no longer produces.
 *
 * Nothing clamps to either number — scores are replayed, not clamped — so they
 * exist for UI sizing and for tests to check the arithmetic against.
 *
 * **They are now the same figure, and that is the point** (deviation #41,
 * spec §2). Normalization means a phone-only user's two Gold stats reach the
 * same ceiling as a wearable user's three: `(2 x 1,200) x 1.5 + 800` equals
 * `(3 x 1,200) x 1.0 + 800`. A wearable buys a third *route* to the ceiling,
 * not a higher one. The two constants stay separate rather than collapsing
 * into one because they document different routes, and a future change may
 * part them again.
 */
export const MAX_DAILY_SCORE_PHONE_ONLY = 4_400;
export const MAX_DAILY_SCORE_WITH_WEARABLE = 4_400;

const TIER_XP: Record<Tier, number> = {
  none: 0,
  bronze: 10,
  silver: 25,
  gold: 50,
};

/**
 * Minimum raw value to reach each tier, **before** any threshold shift.
 *
 * AGI's and STR's bands are unchanged by deviation #41, which is what keeps
 * replayed history comparable — END and VIT left as stats, not as difficulty.
 * What moved instead is how easily these bands are reached: see
 * `shiftedTierFor`.
 */
const THRESHOLDS: Record<CoreStat, Record<Exclude<Tier, 'none'>, number>> = {
  AGI: { bronze: 1_000, silver: 5_000, gold: 10_000 },
  STR: { bronze: 50, silver: 200, gold: 400 },
  // In minutes, to match the raw unit. Derived from mind.ts so the bands
  // cannot drift apart, exactly as DAILY_STEP_BASELINE derives from AGI gold.
  // Used by nextTierFor's gap arithmetic only — MND's own tier comes from
  // mindTierFor, because the oversleep flattening is not a threshold table.
  MND: {
    bronze: MIND_THRESHOLD_HOURS.bronze * 60,
    silver: MIND_THRESHOLD_HOURS.silver * 60,
    gold: MIND_THRESHOLD_HOURS.gold * 60,
  },
};

/**
 * The public-health daily step baseline — the number the Daily Walk is drawn
 * against.
 *
 * **Derived, never written as a literal.** It is exactly the AGI Gold
 * threshold, and that identity is what lets the walk streak read
 * `tiers->>'AGI' = 'gold'` out of `daily_scores` instead of needing a raw step
 * count nothing stores. Writing `10_000` here twice is how the streak would
 * silently start meaning something else the day a band moved — the same
 * arrangement `STAT_POINTS_MAX` already has with `TIER_POINTS`.
 *
 * The derivation is only half the guard, because it is *too* obedient: this
 * baseline is a public-health number that must never scale with the user
 * (spec §5 of the solo-mode design), so a raised Gold silently dragging it
 * upward would be exactly as wrong as it going stale. `scoring.test.ts` pins
 * it at 10,000 for that reason — raise Gold and the test fails, and a human
 * decides whether the baseline moves with it. It almost certainly should not.
 */
export const DAILY_STEP_BASELINE = THRESHOLDS.AGI.gold;

/**
 * Indexed by how many core stats contributed. Rewards breadth over
 * specialisation.
 *
 * Re-indexed for three stats (deviation #41). Its length must stay
 * `CORE_STATS.length + 1`, and a test pins the top index at 800 — the failure
 * this guards is silent: an array that is too short returns `undefined` for a
 * full-breadth day, which `?? 0` turns into *less* than a partial day pays,
 * inverting the whole rule. That is exactly what happened between Task 3 and
 * Task 4 of the switch.
 */
const CONSISTENCY_BONUS: readonly number[] = [0, 0, 400, 800];

/**
 * The breadth bonus for a day, given how much breadth was available.
 *
 * "Full breadth" means **all the stats available to you** (spec §2) — two
 * without a wearable, three with — so a stat the user cannot earn is counted
 * as though it were already covered rather than held against them. Without
 * that, a phone-only user's perfect day would pay 400 where a wearable user's
 * pays 800, reintroducing on the bonus exactly the gradient normalization
 * removes from stat points. It is why the bonus itself is **not** scaled by
 * `normalizationFactor`: it already accounts for earnable stats here, and
 * scaling as well would count the same adjustment twice.
 *
 * A day with nothing at all pays nothing, whatever the shift would say.
 */
function breadthBonus(contributingStats: number, earnable: number): number {
  if (contributingStats <= 0) return 0;
  const available = Math.min(Math.max(earnable, 1), CORE_STATS.length);
  const index = Math.min(
    CORE_STATS.length,
    contributingStats + (CORE_STATS.length - available),
  );
  return CONSISTENCY_BONUS[index] ?? 0;
}

/**
 * What one minute of verified strength work is worth to Body, in the same unit
 * Body is measured in.
 *
 * **This is a correction, not a bonus.** Active calories systematically
 * under-report resistance work: a hard forty-five minutes under a barbell burns
 * far fewer calories than forty-five minutes of jogging while demanding more of
 * the body, so a stat named Body that reads calories alone measures the wrong
 * thing and had made `STR` a second, quieter `AGI`. The credit is added on top
 * of the calories the session genuinely burned, and stands for the gap between
 * what the session cost and what the calorimeter saw.
 *
 * Sized so that lifting is a *route* to Gold rather than a shortcut past it: an
 * hour of verified strength work lands near the Gold band once its own burned
 * calories are counted, which is the same place an hour of hard cardio lands.
 *
 * **Only strength-type sessions earn it.** A run already reports its calories
 * honestly, and crediting one would pay for the same effort twice — the exact
 * double-count that retiring `workoutShift` was about.
 */
export const STRENGTH_MINUTE_KCAL_CREDIT = 4;

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, t));
}

/**
 * A stat's points for a raw value — continuous between the tier anchors.
 *
 * **The anchors are exact and the space between them is not a step.** Until
 * 2026-08-29 this was `TIER_POINTS[tierFor(raw)]`, so 5,000 steps and 9,999
 * steps were the identical 650 and a four-thousand-step evening walk changed
 * nothing at all. Worse, the race over the very same day moved continuously in
 * raw capped steps, so the two halves of the app disagreed about what a day was
 * worth, on one screen.
 *
 * Interpolating between the anchors fixes that while changing nothing that
 * hangs off them: 250 / 650 / 1,200 still land exactly on the bands, the daily
 * ceiling is still 4,400, `tierFor` is untouched, and the Daily Walk streak and
 * `AGI_base` still read the ladder they always read.
 *
 * **Below Bronze is still zero, deliberately.** Interpolating from the origin
 * would be the obvious next step and it is a trap: `contributingStats` and the
 * streak both key off "did this stat score at all", so fifty steps would score
 * points, count as a scored day, and keep a streak alive. The floor is what
 * makes a day mean something happened.
 */
export function statPointsFor(stat: CoreStat, raw: number, shift = 0): number {
  if (stat === 'MND') return Math.round(mindPoints(raw));

  const t = THRESHOLDS[stat];
  const bronze = shiftedThreshold(t.bronze, shift);
  const silver = shiftedThreshold(t.silver, shift);
  const gold = shiftedThreshold(t.gold, shift);

  if (!Number.isFinite(raw) || raw < bronze) return 0;
  if (raw >= gold) return TIER_POINTS.gold;
  if (raw < silver) {
    return Math.round(
      lerp(TIER_POINTS.bronze, TIER_POINTS.silver, (raw - bronze) / (silver - bronze)),
    );
  }
  return Math.round(
    lerp(TIER_POINTS.silver, TIER_POINTS.gold, (raw - silver) / (gold - silver)),
  );
}

/**
 * The tier a raw value earns, with a threshold shift applied first.
 *
 * A shift makes every band *easier* — it is never a point multiplier, because
 * a stored multiplier stacks with the squad program's read-time weight and
 * that is the trap deviation #10 already sprang once. `shiftedThreshold`
 * clamps the shift, so this cannot make a band harder however it is called.
 */
export function shiftedTierFor(stat: CoreStat, raw: number, shift: number): Tier {
  const t = THRESHOLDS[stat];
  if (raw >= shiftedThreshold(t.gold, shift)) return 'gold';
  if (raw >= shiftedThreshold(t.silver, shift)) return 'silver';
  if (raw >= shiftedThreshold(t.bronze, shift)) return 'bronze';
  return 'none';
}

/**
 * The unshifted tier — the bands as a user has learned them.
 *
 * Delegates rather than repeating the comparisons: two ladders that must agree
 * about where a boundary sits is exactly the sort of duplication that drifts
 * silently. A zero shift is the identity, because `shiftedThreshold` rounds
 * `threshold * 1`.
 */
export function tierFor(stat: CoreStat, raw: number): Tier {
  return shiftedTierFor(stat, raw, 0);
}

export interface NextTier {
  tier: Exclude<Tier, 'none'>;
  /** Raw units still needed to reach it, rounded up. Always > 0. */
  gap: number;
  /**
   * The floor of the current band: the highest tier threshold `raw` is at or
   * above, or 0 when `raw` has not reached bronze. Together with the next
   * threshold (`gap + raw`) this lets a caller compute a true fraction
   * through the current band — `gap / (threshold - bandLow)` — rather than a
   * fraction of the target value, which only agrees with "share of band" in
   * the first band, where the floor is 0.
   */
  bandLow: number;
  /**
   * Points this stat would *gain* by crossing into `tier` — the difference
   * between the two bands, not the new band's value.
   *
   * Here rather than in the caller because it is derived from `TIER_POINTS`,
   * which this module owns and does not export. It exists so the character
   * screen can say "1,240 more steps for +400 AGI": the bands still decide the
   * number, they just stopped being the vocabulary the user reads.
   */
  pointsGain: number;
}

/**
 * The next tier up from a raw value, or null when there is nothing more to ask
 * for on this stat today.
 *
 * Null means Gold in every ordinary case — Gold is the ceiling (§6) and
 * nothing above it exists. **MND has a second way to reach it**, and the
 * distinction is load-bearing: above `MIND_OVERSLEEP_HOURS` the night flattens
 * back to Bronze, and no amount of *more* sleep recovers Gold. Reading the
 * linear table there would report an eleven-hour night as "already gold" while
 * `mindTierFor` scored it Bronze — two functions disagreeing about the same
 * night, on the one screen whose whole job is to say what to do next. So this
 * refuses to answer instead. It is honest in the unit the caller renders: the
 * gap is "raw units still needed", and there is no positive number of extra
 * minutes that helps.
 *
 * Reads the same THRESHOLDS table as `tierFor`, so the two can never disagree
 * about where a boundary sits. Raw values arrive fractional from
 * `active_minutes numeric(6,2)`, and a gap of "0.4 more minutes" is not an
 * instruction, so the gap is rounded up to a whole unit.
 *
 * **`shift` is the day's own threshold shift, and passing it is not
 * optional for a caller that has a day in hand.** Until deviation #41's Phase
 * 3 this function read the unshifted ladder while `shiftedTierFor` scored the
 * shifted one, so a well-spread day was told "1,240 more steps" and reached
 * Gold at 7,500 — arriving early, which reads as a bug in the score rather
 * than as a gift, on the one line whose whole job is to say what to do next.
 * The default of 0 exists for tests and for callers with no day at all; a
 * caller that has one and passes nothing is that bug.
 *
 * `bandLow` is shifted with the ceiling. A band whose top moves and whose
 * floor does not is a wrong fraction on every progress bar computing
 * `gap / (threshold - bandLow)`.
 *
 * MND takes no shift — the trust gate decides *whether* sleep scores, not how
 * easily — so `statShifts` hands it 0 and the branch below is untouched by
 * this parameter in practice.
 */
export function nextTierFor(stat: CoreStat, raw: number, shift = 0): NextTier | null {
  const t = THRESHOLDS[stat];
  const bronze = shiftedThreshold(t.bronze, shift);
  const silver = shiftedThreshold(t.silver, shift);
  const gold = shiftedThreshold(t.gold, shift);
  if (stat === 'MND' && raw / 60 > MIND_OVERSLEEP_HOURS) return null;
  if (raw < bronze) {
    return {
      tier: 'bronze',
      gap: Math.ceil(bronze - raw),
      bandLow: 0,
      pointsGain: TIER_POINTS.bronze - TIER_POINTS.none,
    };
  }
  if (raw < silver) {
    return {
      tier: 'silver',
      gap: Math.ceil(silver - raw),
      bandLow: bronze,
      pointsGain: TIER_POINTS.silver - TIER_POINTS.bronze,
    };
  }
  if (raw < gold) {
    return {
      tier: 'gold',
      gap: Math.ceil(gold - raw),
      bandLow: silver,
      pointsGain: TIER_POINTS.gold - TIER_POINTS.silver,
    };
  }
  return null;
}

export function aggregateBuckets(buckets: readonly HourBucket[]): DayTotals {
  const totals: DayTotals = {
    steps: 0,
    distanceM: 0,
    activeKcal: 0,
    activeMinutes: 0,
    activeHours: 0,
  };

  for (const b of buckets) {
    totals.steps += b.steps;
    totals.distanceM += b.distanceM;
    totals.activeKcal += b.activeKcal;
    totals.activeMinutes += b.activeMinutes;
    if (b.steps >= VIT_ACTIVE_HOUR_STEPS) totals.activeHours += 1;
  }

  return totals;
}

/**
 * The raw value a stat is judged on.
 *
 * Body is the only composite, and the only one whose raw value is not something
 * a health app hands you directly: it is the day's active calories **plus** a
 * credit for verified strength minutes (`STRENGTH_MINUTE_KCAL_CREDIT`). Keeping
 * it a single number in a single unit is what lets the thresholds, the gap line
 * and the interpolation all stay exactly as they are — the composite is a
 * property of the *reading*, not of the ladder.
 */
function rawFor(
  stat: CoreStat,
  totals: DayTotals,
  sleepMinutes: number | null,
  strengthMinutes: number,
): number {
  switch (stat) {
    case 'AGI':
      return totals.steps;
    case 'STR':
      return totals.activeKcal + strengthMinutes * STRENGTH_MINUTE_KCAL_CREDIT;
    case 'MND':
      return sleepMinutes ?? 0;
  }
}

/**
 * The single source of scoring truth, shared verbatim by the Expo client and
 * the Supabase Edge Functions. Pure: no I/O, no clock, no randomness.
 *
 * `healthTotal` is the whole of a day: it is built from that user's own buckets
 * and nothing else, and nothing subtracts from it. Program weighting exists but
 * happens at *read* time in `squad_leaderboard()` (deviation #11), so the stored
 * number stays canonical and program-independent.
 */
export function computeDailyScore(input: DailyScoreInput): DailyScore {
  const { buckets, sleepMinutes = null, featuredStat = null } = input;

  const totals = aggregateBuckets(buckets);

  // END and VIT, spent as generosity instead of as points (spec §2). Computed
  // once, outside the loop, because a shift is a property of the day rather
  // than of the stat reading it — and through `statShifts` rather than
  // inline, because the character sheet's guidance line has to read the same
  // mapping to name the band the day will be judged against.
  const shifts = statShifts({ activeHours: totals.activeHours });

  // Clamped rather than trusted: a negative reading is a bug upstream, and it
  // must not be able to *reduce* the calories a day genuinely burned.
  const strengthMinutes = Math.max(0, input.verifiedStrengthMinutes ?? 0);

  const stats = {} as Record<CoreStat, StatResult>;
  let contributingStats = 0;
  let statPoints = 0;
  let xp = 0;

  for (const stat of CORE_STATS) {
    const raw = rawFor(stat, totals, sleepMinutes, strengthMinutes);
    const shift = shifts[stat];
    // MND's tier is not a threshold comparison: above nine hours the night
    // flattens back to Bronze, which no ladder of minimums can express. It
    // also takes no shift — the trust gate decides *whether* sleep scores,
    // not how easily.
    const tier =
      stat === 'MND' ? mindTierFor(raw) : shiftedTierFor(stat, raw, shift);
    // The same ladder with the shift removed. For AGI this is what the Daily
    // Walk reads: `DAILY_STEP_BASELINE` is a public-health floor and must not
    // move because the user spread their steps out. Identical to `tier`
    // wherever the shift is zero, and for MND, which takes no shift at all.
    const unshiftedTier = stat === 'MND' ? tier : shiftedTierFor(stat, raw, 0);
    const base = statPointsFor(stat, raw, shift);
    const points =
      stat === featuredStat ? Math.round(base * FEATURED_STAT_MULTIPLIER) : base;

    stats[stat] = { tier, unshiftedTier, raw, base, points };

    if (tier !== 'none') contributingStats += 1;
    statPoints += points;
    xp += TIER_XP[tier];
  }

  // §2's normalization: a day's stat points scale by `3 / earnable stats`, so
  // a phone-only user's two Gold stats reach the same ceiling as a wearable
  // user's three. Without it, sleep-as-a-stat would make a wearable worth 27%
  // of the ceiling and a permanent leaderboard gradient — which lands hardest
  // on the users least likely to own one.
  //
  // The caller supplies `earnableStats`; the default is everyone-can-earn-
  // everything, which is the honest reading when nothing is known.
  const factor = normalizationFactor(
    input.earnableStats ?? CORE_STATS.length,
    CORE_STATS.length,
  );
  const normalized = Math.round(statPoints * factor);

  // XP scales by the same factor, and for the same reason. Levels are what a
  // user watches move; leaving XP alone would fix the leaderboard and leave a
  // phone-only user levelling at two-thirds the rate for an equivalent day —
  // the gradient §2 removes, reappearing on the slower surface where it is
  // harder to notice and harder to explain.
  const normalizedXp = Math.round(xp * factor);

  // The consistency bonus is not multiplied by the featured stat — the weekly
  // meta shifts which stat is worth grinding, not the reward for breadth. Nor
  // is it normalized: `breadthBonus` already accounts for earnable stats, and
  // scaling it as well would apply the same correction twice.
  const consistencyBonus = breadthBonus(
    contributingStats,
    input.earnableStats ?? CORE_STATS.length,
  );
  const hasRec = sleepMinutes !== null && sleepMinutes !== undefined;

  return {
    totals,
    stats,
    contributingStats,
    consistencyBonus,
    normalizationFactor: factor,
    hasRec,
    healthTotal: normalized + consistencyBonus,
    xp: normalizedXp,
    featuredStat,
  };
}

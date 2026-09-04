/**
 * Quests — three small things to do today (roadmap deviation #50).
 *
 * **Derived, never stored.** The three quests an account sees are a pure
 * function of `(userId, localDate, tier)`, so the local-midnight reset costs no
 * job, no row and no cron: tomorrow's date simply hashes to a different three.
 * That is the same property a Challenge has, and it buys the same thing — there
 * is nothing stateful for a retroactive Apple revision to invalidate, because
 * progress is replayed from `health_buckets` like everything else. Only the
 * *completion* is stored, because it pays XP and must fire exactly once.
 *
 * Quests read **raw units** — steps, kcal, minutes, metres — never points and
 * never tiers. A quest that said "score 1,200 AGI" would be a target the user
 * cannot go outside and do, which is the exact failure the points spec
 * (2026-08-15) removed from every other surface.
 *
 * Pure and zero-dependency: no I/O, no clock reads, and **no randomness**. The
 * pick is a hash, not `Math.random()` — a random pick would hand the same
 * account a different three on every render, and the user would watch their
 * morning's work disappear.
 */

import { addDays } from './day.ts';
import { median } from './median.ts';

export type QuestTier = 'starter' | 'steady' | 'strong';

/**
 * The tiers in ascending order of demand.
 *
 * A value, not just the type's members, because calibration walks them from
 * gentlest to hardest looking for the last bar the player already clears —
 * and an order written down twice is an order that eventually disagrees.
 */
export const QUEST_TIERS: readonly QuestTier[] = ['starter', 'steady', 'strong'];

/**
 * What a quest counts. Every value is a raw figure the app already reads for
 * some other reason — `aggregateBuckets` produces the first four and
 * `daily_sleep` the fifth — so no quest widens what Kairo collects.
 */
export type QuestMetric =
  | 'steps'
  | 'active_kcal'
  | 'active_hours'
  | 'distance_m'
  | 'sleep_minutes';

export type QuestId = string;

export interface QuestDef {
  /**
   * Stable forever: this is what `quest_completions.quest_id` stores, and a
   * renamed id orphans every completion already banked against it. Retire a
   * quest by deleting the row and leaving the id unused, never by reusing it
   * for a different bar.
   */
  id: QuestId;
  tier: QuestTier;
  metric: QuestMetric;
  /** The bar, in the metric's own raw unit. Cleared inclusively. */
  target: number;
  xp: number;
}

/** Three a day (spec §5.3). Three is a glance; five is a chore list. */
export const QUESTS_PER_DAY = 3;

/**
 * The authored set.
 *
 * Hand-written rather than generated, and that is a stated ongoing cost (spec
 * §13) rather than an oversight: a generated quest cannot be checked for being
 * absurd on a rest day, and the whole point of the tab is that a new user reads
 * three things they could actually do before lunch.
 *
 * **At least six per tier**, so `pickQuests` has something to choose between —
 * with exactly three, every day would show the same three in a different order
 * and the reset would read as a bug. The test pins `QUESTS_PER_DAY * 2`.
 *
 * XP is small on purpose. `MAX_REALISTIC_DAILY_XP` is 200; three quests cap at
 * 60 together, so clearing all three is worth about a third of a strong day.
 * A quest is a garnish on the loop, never a cheaper route through it.
 */
export const QUEST_CATALOGUE: readonly QuestDef[] = [
  // --- starter: a first week. Every bar here is clearable by a normal day
  //     out, so the tab teaches the loop rather than gating it.
  { id: 'starter-steps-3000', tier: 'starter', metric: 'steps', target: 3_000, xp: 10 },
  { id: 'starter-steps-5000', tier: 'starter', metric: 'steps', target: 5_000, xp: 15 },
  { id: 'starter-hours-3', tier: 'starter', metric: 'active_hours', target: 3, xp: 10 },
  { id: 'starter-hours-4', tier: 'starter', metric: 'active_hours', target: 4, xp: 15 },
  { id: 'starter-kcal-150', tier: 'starter', metric: 'active_kcal', target: 150, xp: 10 },
  { id: 'starter-distance-2000', tier: 'starter', metric: 'distance_m', target: 2_000, xp: 15 },
  { id: 'starter-sleep-360', tier: 'starter', metric: 'sleep_minutes', target: 360, xp: 15 },

  // --- steady: the middle of the app. Bars sit near a good ordinary day.
  { id: 'steady-steps-7000', tier: 'steady', metric: 'steps', target: 7_000, xp: 15 },
  { id: 'steady-steps-9000', tier: 'steady', metric: 'steps', target: 9_000, xp: 20 },
  { id: 'steady-hours-6', tier: 'steady', metric: 'active_hours', target: 6, xp: 15 },
  { id: 'steady-kcal-300', tier: 'steady', metric: 'active_kcal', target: 300, xp: 15 },
  { id: 'steady-kcal-400', tier: 'steady', metric: 'active_kcal', target: 400, xp: 20 },
  { id: 'steady-distance-5000', tier: 'steady', metric: 'distance_m', target: 5_000, xp: 20 },
  { id: 'steady-sleep-420', tier: 'steady', metric: 'sleep_minutes', target: 420, xp: 15 },

  // --- strong: for accounts that have been here a month. Still bounded well
  //     under a maxed day, because a quest must never become the goal.
  { id: 'strong-steps-12000', tier: 'strong', metric: 'steps', target: 12_000, xp: 20 },
  { id: 'strong-steps-15000', tier: 'strong', metric: 'steps', target: 15_000, xp: 20 },
  { id: 'strong-hours-8', tier: 'strong', metric: 'active_hours', target: 8, xp: 20 },
  { id: 'strong-kcal-500', tier: 'strong', metric: 'active_kcal', target: 500, xp: 20 },
  { id: 'strong-kcal-650', tier: 'strong', metric: 'active_kcal', target: 650, xp: 20 },
  { id: 'strong-distance-8000', tier: 'strong', metric: 'distance_m', target: 8_000, xp: 20 },
  { id: 'strong-sleep-450', tier: 'strong', metric: 'sleep_minutes', target: 450, xp: 20 },
];

/** Scored days before the middle tier, and before the top one. */
export const QUEST_TIER_STEADY_DAYS = 7;
export const QUEST_TIER_STRONG_DAYS = 28;

/**
 * Which tier of quest this account sees.
 *
 * **The auto rule measures engagement, not capability**, and that is the spec's
 * choice recorded rather than quietly improved: `trailingScoredDays` is a count
 * of days that scored, so a long-standing gentle user is assigned the same tier
 * as a long-standing athlete. The alternative — a trailing median of daily
 * steps, the pattern `challenge.ts` uses — was rejected **as a standing rule**,
 * because a rule that re-reads the window makes the bar rise as the player
 * improves, which is the exact conflation the Daily Walk exists to refuse.
 *
 * **The same median is adopted as a one-shot seed** (deviation #63, and see
 * `calibrateQuestTier` below). Read once, at the Health grant, written into
 * `quest_tier_override` and never read again — so it cannot rise, because
 * nothing re-reads it. That is the whole difference between the rejected rule
 * and the adopted one, and stating only the rejection would leave this comment
 * saying the median was refused while the app ships it.
 *
 * `override` is therefore two things at once: the correction for a rule that is
 * wrong by construction for part of the cohort, and the slot calibration seeds.
 * It **wins outright** either way — a rule that could veto it would make it a
 * hint — and an account that clears its override falls back here, which is what
 * keeps the automatic rule live rather than vestigial.
 *
 * **Both the client and `finalize-days` call this**, with the same lifetime
 * scored-day count and the same `profiles.quest_tier_override`. That is not a
 * convention — if the two resolve different tiers, the server grades and pays
 * for three quests that were never on screen, and a completion latches.
 */
export function questTier(input: {
  trailingScoredDays: number;
  override?: QuestTier | null;
}): QuestTier {
  if (input.override) return input.override;
  const days = input.trailingScoredDays;
  // `NaN >= n` is false, so a failed count falls to 'starter' without a branch
  // of its own — the same guard `disclosureStage` uses.
  if (days >= QUEST_TIER_STRONG_DAYS) return 'strong';
  if (days >= QUEST_TIER_STEADY_DAYS) return 'steady';
  return 'starter';
}

/**
 * FNV-1a, 32-bit. A hash rather than a PRNG because this module takes no seed
 * state and returns no generator — every call must be answerable from its
 * arguments alone, which is what makes "the same three all day" a property of
 * the function rather than of a cache.
 */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    // `Math.imul` keeps the multiply in 32 bits; a plain `*` loses precision
    // past 2^53 and the hash stops being uniform.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Today's three, for this account.
 *
 * Selection is a rotation over the tier's list rather than three independent
 * draws: independent draws collide, and "you have two of the same quest" is the
 * kind of bug that reads as the whole feature being broken.
 *
 * **The rotation is bounded, and the sweep after it is not decoration.** A
 * stride of `1 + (h % (n - 1))` is never `0` and never `n`, so it cannot stand
 * still — but it only visits every slot when it is co-prime with `n`, and `n`
 * is the size of a hand-edited tier in `QUEST_CATALOGUE`. Adding one quest to a
 * seven-entry tier makes `n = 8`, a stride of 4 orbits two slots forever, and
 * an unbounded `while (picked.length < QUESTS_PER_DAY)` would then spin on a
 * render thread rather than fail. So the rotation gets at most one pass and the
 * linear sweep fills whatever it missed — still a pure function of the
 * arguments, still the same three all day.
 */
/**
 * Metrics this account can actually produce.
 *
 * Only sleep can be missing: an iPhone with no sleep source produces no scoring
 * night, so `hasSleepCapability` is false, `earnableStats` is 2, and every
 * `sleep_minutes` quest is unclearable **by construction** — the bar cannot be
 * met on any day, ever, by any behaviour.
 *
 * Until 2026-08-29 `pickQuests` filtered on tier alone and dealt them anyway. A
 * phone-only starter account could be handed `starter-sleep-360` on day one
 * with no route to clearing it and no explanation, on the one surface whose
 * whole job is to be the achievable part of the app.
 */
export function questMetricEarnable(metric: QuestMetric, hasSleep: boolean): boolean {
  return metric !== 'sleep_minutes' || hasSleep;
}

export function pickQuests(input: {
  userId: string;
  /** The player's own local date, `YYYY-MM-DD`. */
  localDate: string;
  tier: QuestTier;
  /**
   * Whether this account has a sleep source, and therefore whether a
   * `sleep_minutes` quest is winnable at all.
   *
   * **It must be the same value the grader used.** The client draws the quests
   * and `finalize-days` re-derives them to pay XP; if the two disagree about
   * capability they deal different threes, and a completion latches against a
   * quest that was never on screen — the identical failure `questTier`'s shared
   * override already guards against. Both sides therefore read one stored
   * column, `profiles.has_sleep_source`, rather than deriving it twice from the
   * same underlying rows.
   *
   * Filtering changes the pool size and therefore the rotation, so a phone-only
   * account sees a different three than it otherwise would. Nothing stored
   * depends on the old draw: completions key on `quest_id`, so anything already
   * banked stays valid.
   */
  hasSleep: boolean;
}): QuestDef[] {
  const pool = QUEST_CATALOGUE.filter(
    (q) => q.tier === input.tier && questMetricEarnable(q.metric, input.hasSleep),
  );
  if (pool.length <= QUESTS_PER_DAY) return [...pool];

  const seed = hash(`${input.userId}:${input.localDate}`);
  const start = seed % pool.length;
  const stride = 1 + (seed % (pool.length - 1));

  const picked: QuestDef[] = [];
  const seen = new Set<number>();

  let index = start;
  for (let step = 0; step < pool.length && picked.length < QUESTS_PER_DAY; step += 1) {
    if (!seen.has(index)) {
      seen.add(index);
      picked.push(pool[index]!);
    }
    index = (index + stride) % pool.length;
  }

  for (let i = 0; i < pool.length && picked.length < QUESTS_PER_DAY; i += 1) {
    if (seen.has(i)) continue;
    seen.add(i);
    picked.push(pool[i]!);
  }

  return picked;
}

/**
 * A day, in the raw units a quest counts.
 *
 * `sleepMinutes` is `number | null` and the others are not, deliberately:
 * `aggregateBuckets` always produces a number for the first four (zero is a
 * real, measured zero), while a missing `daily_sleep` row means the night is
 * *unknown*. Collapsing that to 0 would render a sleep quest as "0 of 420" on a
 * night Kairo has no reading for, which reads as an accusation rather than as
 * silence — the same rule `rawFor` in `stat-detail.ts` follows.
 *
 * A **hand-typed** night is unknown here too, for a different reason: it scores
 * nothing (`scoringSleepMinutes` on the server, `scoredSleepMinutes` on the
 * client), and a quest that cleared off a figure the score refused would pay XP
 * for a number nothing else in the app believes. Both callers apply that gate
 * before they build this, which is why it is not applied here — this module
 * imports nothing and knows nothing about `was_user_entered`.
 */
export interface QuestDay {
  steps: number;
  activeKcal: number;
  activeHours: number;
  distanceM: number;
  sleepMinutes: number | null;
}

export interface QuestState {
  /** The raw figure so far, or null when the metric has no reading. */
  value: number | null;
  /** 0–1, clamped. What the bar draws. */
  fraction: number;
  met: boolean;
}

function rawFor(metric: QuestMetric, day: QuestDay): number | null {
  switch (metric) {
    case 'steps':
      return day.steps;
    case 'active_kcal':
      return day.activeKcal;
    case 'active_hours':
      return day.activeHours;
    case 'distance_m':
      return day.distanceM;
    case 'sleep_minutes':
      return day.sleepMinutes;
  }
}

export function questProgress(quest: QuestDef, day: QuestDay): QuestState {
  const value = rawFor(quest.metric, day);
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return { value, fraction: 0, met: false };
  }
  return {
    value,
    fraction: Math.min(1, value / quest.target),
    met: value >= quest.target,
  };
}

/** Cleared inclusively, at exactly the target. */
export function questMet(quest: QuestDef, day: QuestDay): boolean {
  return questProgress(quest, day).met;
}

/* ------------------------------------------------------------------------- *
 * Calibration — a measured starting tier (deviation #63).
 *
 * `questTier` above measures how long somebody has been here. That is the
 * wrong question to ask a brand-new account, and it has no good answer: on day
 * one every account is a Starter, so an athlete is dealt bars they clear before
 * breakfast and a gentle walker is promoted a week later for reasons that have
 * nothing to do with them.
 *
 * So the run *measures* instead, once, at the Health grant, and proposes. The
 * player still decides — the proposal is pre-selected on the difficulty beat
 * and can be changed there or in Settings, and their answer lands in
 * `quest_tier_override`, which wins outright exactly as it always did.
 *
 * **This lives in `quest.ts` rather than in a module of its own** because it
 * needs both the tier rule and the catalogue. A sibling module importing both
 * would be an import cycle the moment either one wanted the result back, and
 * the alternative — threading `QUEST_CATALOGUE` through as an argument — is the
 * mistake `TIER_POINTS` already made, which broke an out-of-package caller at
 * runtime rather than at compile time.
 *
 * Pure, like everything else here: no clock read, and the window's dates come
 * from the caller.
 * ------------------------------------------------------------------------- */

/**
 * How many complete local days the reading covers.
 *
 * A fortnight is long enough that a quiet week does not decide the answer and
 * short enough to still describe the person's life now. It is deliberately not
 * "since you got the phone": a year-old median measures who somebody used to
 * be.
 */
export const CALIBRATION_WINDOW_DAYS = 14;

/**
 * How many days must actually carry steps before the reading is believed.
 *
 * Four, because below that one ordinary Tuesday is the median. A phone bought
 * last week, a phone that spends the day on a desk, and a Health source that
 * has only just been granted all land here, and all of them mean the same
 * thing: we have not seen enough to say.
 */
export const CALIBRATION_MIN_QUALIFYING_DAYS = 4;

/**
 * Each tier's entry bar, in steps, **derived from the catalogue**.
 *
 * The *minimum* steps target of the tier, not the maximum: a tier's bars should
 * be things you meet on a good day, not things you have already beaten on a
 * median one. Proposing Steady to somebody whose median is 9,000 leaves them
 * two quests they clear by lunch; proposing it at 7,000 leaves them a day worth
 * finishing.
 *
 * Derived so a catalogue edit cannot leave a second number describing the old
 * bars — and pinned as literals by the test beside it, because moving a band
 * silently re-sorts every new account into a different starting tier. Same
 * arrangement `DAILY_STEP_BASELINE` has, for the same reason: the derivation
 * stops it going stale, the literal stops it being too obedient.
 */
export const QUEST_TIER_STEP_BANDS: Readonly<Record<QuestTier, number>> = Object.freeze(
  Object.fromEntries(
    QUEST_TIERS.map((tier) => {
      const targets = QUEST_CATALOGUE.filter(
        (q) => q.tier === tier && q.metric === 'steps',
      ).map((q) => q.target);
      if (targets.length === 0) {
        throw new Error(`No steps quest at tier ${tier} to derive a calibration band from`);
      }
      return [tier, Math.min(...targets)];
    }),
  ) as Record<QuestTier, number>,
);

/**
 * What the reading concluded.
 *
 * Two outcomes and no third: either the fortnight was legible enough to
 * propose a size, or it was not. `no-history` is deliberately **not** "the
 * player declined" and not "the read failed" — HealthKit does not report a
 * read-permission denial, so neither is knowable here, and a surface that
 * claimed either would be asserting something the app cannot know.
 *
 * `medianSteps` rides along for the one sentence that states the measurement
 * back to the player. It is **never persisted and never sent anywhere** — it
 * crosses from the connect beat to the difficulty beat in the in-memory
 * onboarding answers store and dies with the run.
 */
export type QuestCalibration =
  | { outcome: 'proposed'; tier: QuestTier; medianSteps: number }
  | { outcome: 'no-history' };

/**
 * The dates a calibration reading covers, ascending, ending at (and including)
 * the last **complete** local day.
 *
 * Today is the caller's to exclude and this function's to assume: calibration
 * runs seconds after the Health grant, typically mid-morning, so a partial day
 * sitting in the set drags the median down by roughly half a band — a Steady
 * walker proposed Starter because they were asked at 10am.
 */
export function calibrationWindow(lastCompleteLocalDate: string): string[] {
  const dates: string[] = [];
  for (let back = CALIBRATION_WINDOW_DAYS - 1; back >= 0; back -= 1) {
    dates.push(addDays(lastCompleteLocalDate, -back));
  }
  return dates;
}

/**
 * Propose a starting tier from a window of daily step totals.
 *
 * **A zero day is dropped, not counted.** A day summing to zero is
 * indistinguishable from a day the phone spent in a drawer, from a phone
 * bought on Tuesday, and from a Health source that was only just granted — so
 * counting them would median a new-phone player to the floor while the screen
 * claims to have measured them. A non-finite reading goes the same way, for
 * the same reason `questTier` leans on `NaN >= n` being false: a failed number
 * must not become a small one.
 *
 * **The median, never the mean**, so one long hike does not promote somebody
 * for a fortnight. That is the judgment `challenge.ts` already makes about a
 * run history, and both share `median()` rather than restating it.
 *
 * **The floor is Starter, not silence.** A genuinely quiet fortnight *was*
 * measured, and the measurement said "small"; `no-history` means we could not
 * measure at all, which is a different sentence on the screen and has to stay
 * one.
 */
export function calibrateQuestTier(dailySteps: readonly number[]): QuestCalibration {
  const qualifying = dailySteps.filter((steps) => Number.isFinite(steps) && steps > 0);
  if (qualifying.length < CALIBRATION_MIN_QUALIFYING_DAYS) return { outcome: 'no-history' };

  const medianSteps = median(qualifying);

  // Ascending, keeping the last bar cleared — so the answer is the highest tier
  // whose entry bar the median already meets, and Starter when none of them do.
  let tier: QuestTier = QUEST_TIERS[0]!;
  for (const candidate of QUEST_TIERS) {
    if (medianSteps >= QUEST_TIER_STEP_BANDS[candidate]) tier = candidate;
  }

  return { outcome: 'proposed', tier, medianSteps };
}

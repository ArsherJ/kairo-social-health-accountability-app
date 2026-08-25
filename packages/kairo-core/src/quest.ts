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

export type QuestTier = 'starter' | 'steady' | 'strong';

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
 * steps, the pattern `challenge.ts` uses — was rejected because it makes the
 * bar rise as the user improves, which is the exact conflation the Daily Walk
 * exists to refuse.
 *
 * `override` is therefore not a nicety, it is the correction for a rule that is
 * wrong by construction for part of the cohort, and it **wins outright**. A
 * rule that could veto it would make it a hint.
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
export function pickQuests(input: {
  userId: string;
  /** The player's own local date, `YYYY-MM-DD`. */
  localDate: string;
  tier: QuestTier;
}): QuestDef[] {
  const pool = QUEST_CATALOGUE.filter((q) => q.tier === input.tier);
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

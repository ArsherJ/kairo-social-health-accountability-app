#!/usr/bin/env node
/**
 * Replay dry run for the three-stat switch (roadmap deviation #41, spec §2).
 *
 * Why this exists: the switch re-tunes every scoring constant, and the one
 * question that decides whether it may ship is empirical rather than
 * arguable — *does the beta cohort's history survive the change?* Spec §2's
 * acceptance criterion is verbatim:
 *
 *   median per-user daily delta within ±10%, and no user's rank on any past
 *   leaderboard moving more than one place.
 *
 * How it answers it, and the two rules that are load-bearing:
 *
 * 1. **It calls the real `computeDailyScore`.** Every replayed day is
 *    recomputed from that user's stored `health_buckets` through the one
 *    engine, exactly as `sync-health` would. It never transforms an old total
 *    arithmetically — a "new total = old total minus vit_points" shortcut
 *    would be measuring this script's model of the change rather than the
 *    change, and it is precisely the shortcut the replay architecture exists
 *    to make unnecessary (scores are replayed from buckets, never adjusted in
 *    place).
 * 2. **It is read-only, and prints aggregates.** It runs SELECTs through
 *    `supabase/scripts/remote-sql.sh`, writes nothing, applies nothing,
 *    deploys nothing. Per-user identifiers reach stdout only for outliers, and
 *    never a file. Character names are never pulled at all: the leaderboard's
 *    `order by … cname asc` tie-break is fetched pre-resolved as an integer
 *    ordinal so the board can be reproduced exactly without the names.
 *
 * Usage:
 *   node scripts/replay-dry-run.mjs
 *   KAIRO_REPLAY_CACHE=/some/scratch/pull.json node scripts/replay-dry-run.mjs
 *
 * `KAIRO_REPLAY_CACHE` caches the pull so a tuning loop does not re-hit the
 * Management API for every constant it tries. Point it outside the repo — the
 * pull is real user health data and must not be committed.
 *
 * ## Re-running this
 *
 * Spec §2's ±10% criterion is **unmet and deferred, not waived**. The run it
 * was written for could not evaluate it: the cohort was 14 of 15 fixtures,
 * since purged, and what remained was one user over eight days, one of which
 * was a corrupt row. Re-run it — do not re-tune against it — when all three
 * of these hold. Until then the number is arithmetic about a generator.
 *
 * 1. **At least ~20 users with ≥14 scored days each.** Per-user medians need
 *    a window to sit in, and `hasSleepCapability` reads history: a user with
 *    three days has no capability signal, so their normalization factor is
 *    whatever the first night happens to say.
 * 2. **Before any further change to `TIER_POINTS`, `CONSISTENCY_BONUS` or the
 *    shift constants.** The criterion measures *this* model against the
 *    four-stat one. A third model in between makes the delta unattributable —
 *    there is no arithmetic that separates "the three-stat switch cost 6%"
 *    from "the three-stat switch cost 2% and a later retune cost 4%".
 * 3. **Both halves must model the deployed board**, which is true only after
 *    Task 4: the rank half builds its new totals through `weightedBoardTotal`
 *    with `normalizationFactor`, and production's `squad_leaderboard()` counts
 *    MND and normalizes. Before Task 4 the two disagreed and the rank result
 *    was measuring the difference between them.
 *
 * And the prerequisite that outlives all three: **every "old" figure in this
 * script is the stored row as it exists at the moment of the pull.** Before
 * Task 7's replay that is the four-stat model, which is what makes a
 * before/after possible at all. After it, `daily_scores` holds the three-stat
 * model and every delta here is zero by construction. A run after the deploy
 * therefore needs a baseline captured before it.
 *
 * **This version of the file cannot capture that baseline at any point in Task
 * 7's window, and an earlier draft of this section wrongly said to take one at
 * step 5.** `BOARD_TOTAL_SQL` first resolves at **step 8**, when the contract
 * migration installs the seven-argument `p_mind`/`p_factor` form — and step 6's
 * replay has already rewritten `daily_scores` by then, which is the very case
 * the paragraph above says is worthless. Earlier it does not resolve at all:
 * before step 5 the project holds the pre-Phase-3 `(text, integer × 6)` form
 * and this call passes `ds.normalization_factor`, which is numeric, into an
 * integer position — an assignment cast, not an implicit one, so overload
 * resolution fails outright; between steps 5 and 8 it holds the nine-argument
 * form and the arity is wrong.
 *
 * So the baseline is a **pre-flight artefact, taken before step 1**, with the
 * version of this file that predates Task 6, whose call matches the deployed
 * four-stat signature exactly:
 *
 *   git show 310695c:scripts/replay-dry-run.mjs > /tmp/replay-4stat.mjs
 *   KAIRO_REPLAY_CACHE=~/kairo-baseline-4stat.json node /tmp/replay-4stat.mjs
 *
 * (Verified against the live project on 2026-08-20: all six queries resolve.)
 * Keep the cache outside the repo — it is real user health data. Two things
 * about it. Its `scores` rows carry `end_points`/`vit_points`/`rec_points` and
 * no `mind_points`, so it is **not loadable by this version**: `num()` turns
 * the missing column into 0 and the run reports confidently wrong numbers
 * instead of failing. And that build's rank half omits `normalizationFactor`,
 * so every `newTotal` in it is NaN and its printed rank movement is
 * meaningless — the artefact worth keeping is the pull, not the report.
 *
 * If no pre-flight capture was taken, the stored four-stat totals are gone the
 * moment step 6 runs. They are reconstructable in principle — they were
 * themselves derived from `health_buckets` and `daily_sleep`, neither of which
 * the replay touches, so the four-stat engine out of git history would
 * regenerate them — but that is strictly more work than remembering to take
 * the cache, and it is not something to discover mid-deploy.
 *
 * One finding from the unusable run is worth not repeating: **identical daily
 * totals across users are a fixture signature, not a cohort.** `classifyUsers`
 * detects that shape mechanically and the report prints the split — read it
 * before reading the median, rather than averaging a seed generator into one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { earnableStats, hasSleepCapability } from '../packages/kairo-core/src/capability.ts';
import { PROGRAM_WEIGHTS, weightedBoardTotal } from '../packages/kairo-core/src/program.ts';
import { computeDailyScore } from '../packages/kairo-core/src/scoring.ts';
import { CORE_STATS } from '../packages/kairo-core/src/types.ts';

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REMOTE_SQL = join(PROJECT, 'supabase', 'scripts', 'remote-sql.sh');

/** How far outside parity a user may land before spec §2 calls it a miss. */
const DELTA_TOLERANCE = 0.1;

/** Spec §2: no user's rank on any past board may move more than this. */
const MAX_RANK_MOVEMENT = 1;

// ---------------------------------------------------------------------------
// Pull — SELECTs only
// ---------------------------------------------------------------------------

function sql(query) {
  const out = execFileSync(REMOTE_SQL, [query], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out);
}

/**
 * Every read this script performs, in one place so the read-only claim is
 * checkable by eye.
 *
 * `old_weighted` is computed by the **deployed** `program_weighted_total`
 * rather than reimplemented here. That is the point: the board is whatever the
 * live function says it is. Reproducing it in JavaScript would be a second
 * implementation of the thing under test.
 *
 * **The call below is written by parameter name, never by position count.**
 * The retired signature and the current one both take seven arguments, so a
 * call that merely drops the retired columns still resolves — against
 * different meanings — and mis-ranks the whole cohort with no error anywhere.
 * Against `20260819150000_three_stat_contract_drop.sql`, position by position:
 * `p_program text`, `p_agi integer`, `p_str integer`, `p_mind integer`,
 * `p_consistency integer`, `p_rec integer`, `p_factor numeric`. `p_mind` sits
 * where `p_end` used to; `p_factor` sits where `p_rec` used to. `p_rec` is 0
 * because deviation #41 retired `rec_points` and its only production caller
 * passes the same literal.
 */
/**
 * The board total as the **deployed** function computes it, for every stored
 * day of every squad member.
 *
 * Exported because it is the one query in this file whose correctness cannot
 * be read off the page — see the note on `pull()` — and
 * `supabase/tests/schema.test.ts` runs this exact text against PGlite and
 * compares the answer to `weightedBoardTotal`. A positional slip resolves
 * cleanly and mis-ranks in silence; only executing it catches that.
 */
export const BOARD_TOTAL_SQL = `
      select sm.squad_id::text as squad_id, ds.user_id::text as user_id,
             ds.local_date::text as local_date,
             public.program_weighted_total(
               s.program,              -- p_program     text
               ds.agi_points,          -- p_agi         integer
               ds.str_points,          -- p_str         integer
               ds.mind_points,         -- p_mind        integer
               ds.consistency_points,  -- p_consistency integer
               0,                      -- p_rec         integer
               ds.normalization_factor -- p_factor      numeric
             ) as old_weighted
      from public.daily_scores ds
      join public.squad_members sm on sm.user_id = ds.user_id
      join public.squads s         on s.id = sm.squad_id
`;

function pull() {
  return {
    scores: sql(`
      select user_id::text as user_id, local_date::text as local_date,
             agi_points, str_points, mind_points,
             consistency_points, total, has_rec, status::text as status
      from public.daily_scores
      order by user_id, local_date
    `),
    buckets: sql(`
      select user_id::text as user_id, local_date::text as local_date, hour,
             steps,
             distance_m::float8     as distance_m,
             active_kcal::float8    as active_kcal,
             active_minutes::float8 as active_minutes,
             had_workout
      from public.health_buckets
      order by user_id, local_date, hour
    `),
    sleep: sql(`
      select user_id::text as user_id, local_date::text as local_date, minutes
      from public.daily_sleep
      order by user_id, local_date
    `),
    members: sql(`
      select sm.squad_id::text as squad_id, sm.user_id::text as user_id,
             s.program,
             -- The board's tie-break, resolved server-side into an ordinal so
             -- no character name leaves the database.
             row_number() over (
               partition by sm.squad_id order by p.character_name asc, p.id asc
             ) as name_order
      from public.squad_members sm
      join public.squads s   on s.id = sm.squad_id
      join public.profiles p on p.id = sm.user_id
    `),
    oldWeighted: sql(BOARD_TOTAL_SQL),
    bias: sql(`
      select
        (select count(*) from public.workout_sessions) as workout_sessions,
        -- Asked of the catalogue, not of the table: the expand migration is
        -- deliberately unapplied on the live project, so the origin columns do
        -- not exist there yet and selecting one is a hard error. Their absence
        -- *is* the bias this line reports.
        (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'workout_sessions'
            and column_name in
              ('source_bundle_id', 'was_user_entered', 'has_heart_rate_evidence')
        ) as workout_origin_columns,
        (select count(*) from (
           select distinct user_id, local_date
           from public.health_buckets where had_workout
         ) t) as days_with_workout_hour,
        (select count(*) from public.daily_sleep where minutes > 0) as sleep_rows,
        (select count(distinct user_id) from public.daily_sleep where minutes > 0) as sleep_users
    `),
  };
}

function loadData() {
  const cache = process.env.KAIRO_REPLAY_CACHE;
  if (cache && existsSync(cache)) {
    process.stderr.write(`[cache] reading ${cache}\n`);
    return JSON.parse(readFileSync(cache, 'utf8'));
  }
  process.stderr.write('[pull] querying the live project, read-only…\n');
  const data = pull();
  if (cache) {
    writeFileSync(cache, JSON.stringify(data));
    process.stderr.write(`[cache] wrote ${cache}\n`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

const key = (userId, localDate) => `${userId}|${localDate}`;

function num(v) {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

/**
 * Recompute one stored day under the new model, from its buckets.
 *
 * `verifiedWorkoutMinutes` is 0 for every historical day and that is a stated
 * bias, not an oversight: `workout_sessions.source_bundle_id`,
 * `was_user_entered` and `has_heart_rate_evidence` are columns the expand
 * migration adds, so no pre-existing row can satisfy `workoutVerified()`. The
 * replay therefore understates STR's threshold shift throughout, and the
 * report says so rather than tuning it away.
 *
 * It does **not** disappear on its own, which this comment used to claim. The
 * columns existing is half of it; **Task 3 is the other half** — the client
 * sends the sample's origin, `scoring-inputs` reads those three columns back
 * through `verifiedWorkoutMinutesFrom`, and only then does a non-zero figure
 * reach `planDay`. Historical rows predate all of it and always will, so this
 * bias is permanent for the replayed cohort and disappears only for days
 * scored after that deploy.
 */
function replayDay(row, ctx, { normalize = true } = {}) {
  const buckets = ctx.bucketsByDay.get(key(row.user_id, row.local_date)) ?? [];
  const sleepMinutes = ctx.sleepByDay.get(key(row.user_id, row.local_date)) ?? null;
  const capable = hasSleepCapability(
    ctx.scoringSleepDates.get(row.user_id) ?? [],
    row.local_date,
  );

  return computeDailyScore({
    buckets,
    sleepMinutes,
    featuredStat: null,
    // `normalize: false` is the sensitivity run, not an alternative model: it
    // is what ships if Phase 3 wires `rescoreDay` without filling in
    // `earnableStats`. `computeDay` defaults it to every stat, so the omission
    // is silent — a phone-only user simply scores two-thirds of a day and
    // nothing errors. Worth measuring precisely because it cannot be seen.
    earnableStats: normalize ? earnableStats(capable) : CORE_STATS.length,
    verifiedWorkoutMinutes: 0,
  });
}

function buildContext(data) {
  const bucketsByDay = new Map();
  for (const b of data.buckets) {
    const k = key(b.user_id, b.local_date);
    if (!bucketsByDay.has(k)) bucketsByDay.set(k, []);
    bucketsByDay.get(k).push({
      hour: num(b.hour),
      steps: num(b.steps),
      distanceM: num(b.distance_m),
      activeKcal: num(b.active_kcal),
      activeMinutes: num(b.active_minutes),
    });
  }

  const sleepByDay = new Map();
  const scoringSleepDates = new Map();
  for (const s of data.sleep) {
    const minutes = num(s.minutes);
    sleepByDay.set(key(s.user_id, s.local_date), minutes);
    // Historical rows predate `daily_sleep.was_user_entered`, so none is
    // `rejected` — `scoresAtAll` is true for every one of them, and a night
    // that scores must also confer capability (capability.ts).
    if (minutes > 0) {
      if (!scoringSleepDates.has(s.user_id)) scoringSleepDates.set(s.user_id, []);
      scoringSleepDates.get(s.user_id).push(s.local_date);
    }
  }

  return { bucketsByDay, sleepByDay, scoringSleepDates };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const median = (values) => quantile([...values].sort((a, b) => a - b), 0.5);

const pct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/** `seed-plan.ts`'s `PERSONA_STEPS`, and the ±15% jitter `generateDay` applies. */
const PERSONA_STEPS = [2_500, 7_000, 12_000, 18_000];
const PERSONA_JITTER = 0.15;

/** `smoke-sync.mjs` emits ten active hours of exactly 1,100 steps. */
const SMOKE_STEPS = 11_000;

/**
 * Classify a user's history as fixture or organic — **mechanically, from
 * shape, never from identity.**
 *
 * This is not tidying the data. The acceptance criterion is a statement about
 * a *cohort*, and a cohort assembled mostly from a seed generator and an
 * undeleted smoke-test account measures the generator. Two signatures are
 * unambiguous:
 *
 * - `smoke`: every scored day is exactly 11,000 steps — the ten 1,100-step
 *   hours `supabase/scripts/smoke-sync.mjs` posts. A person does not walk a
 *   round number twice.
 * - `seed`: every scored day lands within `generateDay`'s ±15% of one persona
 *   target *and* the stored total is byte-identical on every day. Real days
 *   vary in tier; a persona does not.
 *
 * Anything else is `organic`. The headline verdict is still computed over the
 * whole cohort, because that is what the criterion says — this split exists so
 * the number can be read for what it is.
 */
function classifyUsers(scores, ctx) {
  const stepsFor = (r) =>
    (ctx.bucketsByDay.get(key(r.user_id, r.local_date)) ?? []).reduce(
      (sum, b) => sum + b.steps,
      0,
    );

  const byUser = new Map();
  for (const r of scores) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id).push(r);
  }

  const verdicts = new Map();
  for (const [userId, rows] of byUser) {
    const scored = rows.filter((r) => num(r.total) > 0);
    if (scored.length === 0) {
      verdicts.set(userId, 'empty');
      continue;
    }
    const steps = scored.map(stepsFor);

    if (steps.every((s) => s === SMOKE_STEPS)) {
      verdicts.set(userId, 'smoke');
      continue;
    }

    const totals = new Set(scored.map((r) => num(r.total)));
    const persona = PERSONA_STEPS.find((target) =>
      steps.every((s) => Math.abs(s - target) <= target * PERSONA_JITTER),
    );
    verdicts.set(userId, persona !== undefined && totals.size === 1 ? 'seed' : 'organic');
  }
  return verdicts;
}

// ---------------------------------------------------------------------------
// Leaderboards
// ---------------------------------------------------------------------------

/**
 * Rank a squad's board for one date, both ways.
 *
 * Mirrors `squad_leaderboard()`: every member appears, a member with no row
 * scores 0, and ties break on the name ordinal ascending. The new side uses
 * `weightedBoardTotal` from `@kairo/core`, which is the expression Task 4
 * deployed into `program_weighted_total` — three stats, weighted, with §2's
 * normalization applied to the weighted sum and rounded once at the end.
 *
 * **Both halves have to model the same board or the rank result measures the
 * difference between them.** Until Task 4 this side counted MND and did not
 * normalize while production did neither, so a phone-only member was ranked
 * two-thirds short here and full-height there — a rank movement that belonged
 * to the script, not to the switch. `normalizationFactor` is a required field
 * on `weightedBoardTotal` and omitting it does not throw: the multiplication
 * yields NaN, every comparison against it is false, and the sort quietly
 * degenerates to input order.
 */
function rankBoard(entries, totalOf) {
  return [...entries]
    .sort((a, b) => totalOf(b) - totalOf(a) || a.nameOrder - b.nameOrder)
    .map((e, i) => [e.userId, i + 1]);
}

function rankMovement(data, newByDay) {
  const squads = new Map();
  for (const m of data.members) {
    if (!squads.has(m.squad_id)) {
      squads.set(m.squad_id, { program: m.program, members: [] });
    }
    squads.get(m.squad_id).members.push({
      userId: m.user_id,
      nameOrder: num(m.name_order),
    });
  }

  const oldWeightedByKey = new Map();
  for (const r of data.oldWeighted) {
    oldWeightedByKey.set(`${r.squad_id}|${r.user_id}|${r.local_date}`, num(r.old_weighted));
  }

  const scoredDays = new Map();
  for (const s of data.scores) {
    if (!scoredDays.has(s.user_id)) scoredDays.set(s.user_id, new Set());
    scoredDays.get(s.user_id).add(s.local_date);
  }

  const dates = [...new Set(data.scores.map((s) => s.local_date))].sort();
  const boards = [];

  for (const [squadId, squad] of squads) {
    const program = PROGRAM_WEIGHTS[squad.program] ? squad.program : 'all_around';
    for (const date of dates) {
      const anyData = squad.members.some((m) => scoredDays.get(m.userId)?.has(date));
      if (!anyData) continue;

      const entries = squad.members.map((m) => {
        const score = newByDay.get(key(m.userId, date));
        const statPoints = {};
        for (const stat of CORE_STATS) statPoints[stat] = score?.stats[stat].points ?? 0;
        return {
          userId: m.userId,
          nameOrder: m.nameOrder,
          oldTotal: oldWeightedByKey.get(`${squadId}|${m.userId}|${date}`) ?? 0,
          newTotal: score
            ? weightedBoardTotal({
                program,
                statPoints,
                consistencyBonus: score.consistencyBonus,
                // Nothing writes rec_points any more; `20260819150000` drops
                // the column and `squad_leaderboard()` passes the same
                // literal into `p_rec`.
                recBonus: 0,
                // The replayed day's own factor, not a recomputed one: the
                // board is read time and the row being ranked was scored
                // under whatever capability its owner had that day.
                normalizationFactor: score.normalizationFactor,
              })
            : 0,
        };
      });

      const before = new Map(rankBoard(entries, (e) => e.oldTotal));
      const after = new Map(rankBoard(entries, (e) => e.newTotal));

      let maxMove = 0;
      const movers = [];
      for (const e of entries) {
        const move = Math.abs(before.get(e.userId) - after.get(e.userId));
        if (move > 0) movers.push({ userId: e.userId, from: before.get(e.userId), to: after.get(e.userId) });
        if (move > maxMove) maxMove = move;
      }
      boards.push({ squadId, date, size: entries.length, maxMove, movers });
    }
  }

  return boards;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/**
 * Replay a set of stored days and reduce them to the shape spec §2 asks about.
 *
 * Returns per-user medians rather than a pooled day distribution because the
 * criterion is per-user: a ten-day fixture persona and a one-day real account
 * must weigh the same, or the loudest generator wins the measurement.
 */
function deltaReport(scores, ctx, opts) {
  const newByDay = new Map();
  const perUser = new Map();
  const dayDeltas = [];
  let zeroBaselineDays = 0;
  let zeroBaselineStillZero = 0;

  for (const row of scores) {
    const score = replayDay(row, ctx, opts);
    newByDay.set(key(row.user_id, row.local_date), score);

    const oldTotal = num(row.total);
    const newTotal = score.healthTotal;

    if (!perUser.has(row.user_id)) perUser.set(row.user_id, []);

    if (oldTotal === 0) {
      zeroBaselineDays += 1;
      if (newTotal === 0) zeroBaselineStillZero += 1;
      continue;
    }
    const delta = (newTotal - oldTotal) / oldTotal;
    perUser.get(row.user_id).push(delta);
    dayDeltas.push(delta);
  }

  const userMedians = [];
  for (const [userId, deltas] of perUser) {
    if (deltas.length === 0) continue;
    userMedians.push({ userId, delta: median(deltas), days: deltas.length });
  }
  userMedians.sort((a, b2) => a.delta - b2.delta);

  return {
    newByDay,
    userMedians,
    users: perUser.size,
    sortedUser: userMedians.map((u) => u.delta),
    sortedDay: [...dayDeltas].sort((a, b2) => a - b2),
    zeroBaselineDays,
    zeroBaselineStillZero,
  };
}

/**
 * Collapse the replayed days into distinct behaviour groups.
 *
 * A cohort this size has only a handful of genuinely different days, and the
 * aggregate percentiles hide that. Printing the groups is what makes a miss
 * *diagnosable* rather than merely reported: each row is a linear equation in
 * the tunable constants, so a human can see at a glance whether any assignment
 * could satisfy them all. Aggregate only — no ids, no raw health values beyond
 * the tier each landed in.
 */
function behaviourGroups(scores, ctx, newByDay) {
  const groups = new Map();
  for (const row of scores) {
    const score = newByDay.get(key(row.user_id, row.local_date));
    const tiers = CORE_STATS.map((s) => score.stats[s].tier).join('/');
    const oldParts = [
      num(row.agi_points), num(row.str_points), num(row.mind_points),
      num(row.consistency_points),
    ].join(',');
    const k = `${tiers}|${score.normalizationFactor}|${oldParts}`;
    if (!groups.has(k)) {
      groups.set(k, {
        tiers,
        factor: score.normalizationFactor,
        oldParts,
        oldTotal: num(row.total),
        newTotal: score.healthTotal,
        breadth: score.consistencyBonus,
        days: 0,
      });
    }
    groups.get(k).days += 1;
  }
  return [...groups.values()].sort((a, b2) => b2.days - a.days);
}

function printDistribution(label, sorted) {
  console.log(`${label}`);
  console.log(`  n                      ${sorted.length}`);
  console.log(`  median                 ${pct(median(sorted))}`);
  console.log(`  p10 / p90              ${pct(quantile(sorted, 0.1))} / ${pct(quantile(sorted, 0.9))}`);
  console.log(`  min / max              ${pct(sorted[0] ?? null)} / ${pct(sorted.at(-1) ?? null)}`);
  console.log(
    `  outside ±10%           ${sorted.filter((d) => Math.abs(d) > DELTA_TOLERANCE).length}`,
  );
}

function main() {
  const data = loadData();
  const ctx = buildContext(data);

  const report = deltaReport(data.scores, ctx, { normalize: true });
  const {
    newByDay,
    userMedians,
    sortedUser,
    sortedDay,
    zeroBaselineDays,
    zeroBaselineStillZero,
  } = report;

  // ---- cohort ------------------------------------------------------------
  const dates = [...new Set(data.scores.map((s) => s.local_date))].sort();
  const daysWithSleep = data.scores.filter(
    (s) => ctx.sleepByDay.get(key(s.user_id, s.local_date)) > 0,
  ).length;
  const b = data.bias[0];

  const provenance = classifyUsers(data.scores, ctx);
  const countOf = (kind) => [...provenance.values()].filter((v) => v === kind).length;
  const rowsOf = (kind) =>
    data.scores.filter((s) => provenance.get(s.user_id) === kind).length;

  console.log('=== Cohort ===');
  console.log(`daily_scores rows        ${data.scores.length}`);
  console.log(`distinct users           ${provenance.size}`);
  console.log(`distinct local dates     ${dates.length}  (${dates[0]} … ${dates.at(-1)})`);
  console.log(`user-days with sleep     ${daysWithSleep}  (${num(b.sleep_users)} users)`);
  console.log(`user-days scoring zero   ${zeroBaselineDays}`);
  console.log(`health_buckets rows      ${data.buckets.length}`);
  console.log(`squad boards in scope    ${new Set(data.members.map((m) => m.squad_id)).size} squads`);

  console.log('\n=== Provenance (by shape, never by identity — see classifyUsers) ===');
  for (const kind of ['seed', 'smoke', 'organic', 'empty']) {
    console.log(
      `${kind.padEnd(24)} ${countOf(kind)} user(s), ${rowsOf(kind)} day(s)`,
    );
  }

  // ---- per-user delta ----------------------------------------------------
  const outside = userMedians.filter((u) => Math.abs(u.delta) > DELTA_TOLERANCE);

  console.log('\n=== Per-user daily delta (median of that user\'s own days) ===');
  printDistribution('whole cohort', sortedUser);

  const organicUsers = userMedians.filter((u) => provenance.get(u.userId) === 'organic');
  printDistribution(
    '\norganic users only (fixtures excluded — diagnostic, not the criterion)',
    organicUsers.map((u) => u.delta).sort((a, b2) => a - b2),
  );

  console.log('\n=== Per-day delta (every user-day with a non-zero old total) ===');
  printDistribution('whole cohort', sortedDay);
  console.log(
    `  zero-baseline days     ${zeroBaselineDays} (${zeroBaselineStillZero} still zero under the new model)`,
  );

  // ---- behaviour groups --------------------------------------------------
  console.log('\n=== Distinct behaviour groups (aggregate; each is one equation) ===');
  console.log(
    'days  new tiers (AGI/STR/MND)  factor  stored parts (agi,str,mind,cons)      old -> new    delta',
  );
  for (const g of behaviourGroups(data.scores, ctx, newByDay)) {
    const delta = g.oldTotal === 0 ? 'n/a' : pct((g.newTotal - g.oldTotal) / g.oldTotal);
    console.log(
      `${String(g.days).padStart(4)}  ${g.tiers.padEnd(23)} ${g.factor.toFixed(2).padStart(5)}   ` +
        `${g.oldParts.padEnd(36)} ${String(g.oldTotal).padStart(5)} -> ${String(g.newTotal).padEnd(5)} ${delta.padStart(8)}`,
    );
  }

  // ---- sensitivity: Phase 3 forgetting to wire earnableStats -------------
  const unnormalized = deltaReport(data.scores, ctx, { normalize: false });
  console.log(
    '\n=== Sensitivity: if Phase 3 ships without wiring earnableStats ===',
  );
  printDistribution('per-user, everyone normalized as three-stat', unnormalized.sortedUser);

  // Outliers: stdout only, never a file. This is the one place a user id is
  // printed, and it exists so a miss can actually be diagnosed.
  if (outside.length > 0) {
    console.log('\n--- users outside ±10% (stdout only — do not paste into a committed file) ---');
    for (const u of [...outside].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))) {
      console.log(
        `  ${u.userId}  ${pct(u.delta)}  over ${u.days} day(s)  [${provenance.get(u.userId)}]`,
      );
    }
  }

  // ---- rank movement -----------------------------------------------------
  const boards = rankMovement(data, newByDay);
  const worst = boards.reduce((acc, x) => (x.maxMove > acc ? x.maxMove : acc), 0);
  const moved = boards.filter((x) => x.maxMove > MAX_RANK_MOVEMENT);

  console.log('\n=== Rank movement on past leaderboards ===');
  console.log(`boards evaluated         ${boards.length}`);
  console.log(`boards with any movement ${boards.filter((x) => x.maxMove > 0).length}`);
  console.log(`max places moved         ${worst}`);
  console.log(`boards over ${MAX_RANK_MOVEMENT} place(s)     ${moved.length}`);
  const sizes = boards.map((x) => x.size).sort((a, b2) => a - b2);
  console.log(`board sizes (min/med/max) ${sizes[0] ?? 0} / ${median(sizes) ?? 0} / ${sizes.at(-1) ?? 0}`);

  if (moved.length > 0) {
    console.log('\n--- boards breaching the one-place rule (stdout only) ---');
    for (const bd of moved) {
      console.log(`  squad ${bd.squadId} ${bd.date}: max ${bd.maxMove}`);
      for (const m of bd.movers) console.log(`    ${m.userId} ${m.from} -> ${m.to}`);
    }
  }

  // ---- verdict -----------------------------------------------------------
  const medianOk = Math.abs(median(sortedUser) ?? 0) <= DELTA_TOLERANCE;
  const rankOk = worst <= MAX_RANK_MOVEMENT;

  console.log('\n=== Spec §2 acceptance criterion ===');
  console.log(`median per-user daily delta within ±10%   ${medianOk ? 'PASS' : 'FAIL'}`);
  console.log(`no rank moving more than one place        ${rankOk ? 'PASS' : 'FAIL'}`);
  console.log(`overall                                   ${medianOk && rankOk ? 'PASS' : 'FAIL'}`);

  console.log('\n=== Stated biases ===');
  console.log(
    `workout_sessions rows ${num(b.workout_sessions)}; origin columns present on the live table: ${num(b.workout_origin_columns)} of 3.`,
  );
  console.log(
    `user-days with any workout hour in health_buckets: ${num(b.days_with_workout_hour)}.`,
  );
  console.log(
    'verifiedWorkoutMinutes is 0 for every replayed day, so STR\'s threshold shift is',
  );
  console.log('unexercised here and its effect is understated. Do not tune against it.');
  console.log(
    'That bias is permanent for these rows: Task 3 is what puts sample origin on new',
  );
  console.log('sessions, and no historical row can ever satisfy workoutVerified().');

  process.exitCode = medianOk && rankOk ? 0 : 1;
}

// Run only as a command, never on import: `BOARD_TOTAL_SQL` above is imported
// by the schema suite, and a bare `main()` here would fire the Management API
// pull inside a test run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

# Solo mode — Walk, Strength, Run — design

**Status:** approved 2026-08-15. Implements the founder decisions in
`docs/assessments/2026-08-14-metric-purpose-and-cadence-goals.md` Parts 2 and 3,
plus the interview decisions recorded in §2 below.

Read with:

- **`2026-08-15-points-stop-being-spoken-design.md`** — its sibling, approved the
  same day. It removes the home hero point total and the leaderboard row total.
  The two overlap at exactly one place, §4.3 below.
- `docs/assessments/2026-08-14-metric-purpose-and-cadence-goals.md` — the
  staging ground this implements. Parts 2 and 3 are founder decisions; Part 1
  is the original brainstorm and is **superseded** where they disagree.
- `docs/roadmap.md` — the approved-deviations table, which this spec adds to.
- `Kairo_Master_Summary.md` — §5, §6, §8, §12, §14. This spec does **not**
  amend any of them; see §3.3 for why that is a deliberate outcome.
- `docs/mvp-scope.md` — the IN/OUT contract, which this spec widens.

---

## 1. What this is

Kairo's solo mode becomes three areas that differ in what data backs them:

| Area | Metric | Backing signal | Mechanic |
|---|---|---|---|
| **Walk** | Steps | AGI, already stored | A flat 10,000/day baseline. Presentation only. Never scales up. |
| **Strength** | Session calories | Workout sessions, **new** | An adaptive Challenge. |
| **Run** | Pace over a distance | Workout sessions, **new** | An adaptive Challenge. |

And the numbers already on screen gain a stated reason for existing — §5's own
medical reasoning, which the spec has always contained and the app has never
shipped.

**Routines** (the squad layer, assessment Part 3) are designed here and
**not built** in this pass. §9 records their settled decisions so the next pass
starts from a design rather than re-deriving one.

---

## 2. Decisions this spec records

The assessment left decisions open at Part 1 §6 and Part 3 §17. These close
them. Each was a founder choice made in the 2026-08-15 interview.

| # | Question | Decision |
|---|---|---|
| D1 | How much of the assessment ships now | Through the Challenges engine. Routines spec'd, not built. |
| D2 | Timing vs. the TestFlight beta | **Beta waits.** Solo mode ships first. |
| D3 | `gym` vs `calisthenics` (Part 3 §16) | **`strength`** everywhere — schema value, enum, copy. |
| D4 | Routine weekly reward (Part 3 §17) | A small XP trickle per week kept. Design-only this pass. |
| D5 | What a Run challenge targets | **Pace, floored by a minimum distance.** Both numbers move with the user. |
| D6 | Does a Challenge pay XP | **Yes** — a one-way latch in `finalize-days`, the `goal_completions` pattern. |
| D7 | Where the current challenge lives | **Derived.** A pure function of the trailing window; nothing stateful stored. |
| D8 | What a Strength challenge measures | **Workout-session calories**, strength activity types only. |
| D9 | A Challenge's clock | **Standing until cleared**, no expiry. Rest days are structurally invisible. |
| D10 | Users with no logged strength session | Show the challenge **with the instruction**. Do not hide it. |
| D11 | Placement | Daily Walk on home; Challenges on a stacked `/train` route. |
| D12 | Where the metric "why" lines surface | The existing **"How progress works"** sheet (`app/progress.tsx`). |
| D13 | Are both areas always on | **Opt in per area.** Both default off. |
| D14 | Cold start | *"Log one run of 1 km or more"* — no pace bar on the first challenge. |
| D15 | Challenge XP | **40 flat.** |
| D16 | Overload aggressiveness | **~3% step, median of the last 5** qualifying sessions. |
| D17 | Does run pace touch scoring | **No.** Challenge-only. The four stats are untouched. |
| D18 | Daily Walk contents | Today's progress to 10,000, plus a streak of days cleared. |
| D19 | Where opt-in happens | On `/train`, first visit. Onboarding stays at two screens. |
| D20 | Push | **One trigger**, `challenge_cleared`. Budget-counted. |

### 2.1 A reversal worth naming

Assessment Part 1 §5 recommends shipping §2 + §3.1 now and deferring the rest
until after the beta's first read, on the argument that the beta's four risk
questions don't need any of this. **D2 overrules that**, on the counter-argument
that Parts 2 and 3 change what solo mode *is* — betaing without them measures a
product already being replaced.

Recorded rather than quietly dropped, because the two documents would otherwise
disagree and the assessment's reasoning is not wrong, merely outvoted. The cost
is real: the beta slips by the length of this pass.

---

## 3. What does not change

Stating these first, because each is a thing a reasonable implementation would
break by accident.

### 3.1 Scoring

`computeDailyScore`, `TIER_POINTS`, `THRESHOLDS`, `daily_scores` and score
replay are **untouched**. A run still earns AGI through its steps exactly as it
does today. Pace never enters `daily_scores`.

This is the same posture Strain takes (deviation #24): a signal Kairo displays
and reasons about, that the scoring engine never learns exists. It is what keeps
replay safe, keeps `§12`'s server-authoritative rule intact, and keeps every
squad's leaderboard comparing the number it has always compared.

The rejected alternative — clearing a challenge adding points to that day — would
have made a stored score depend on a per-user moving target, so replaying a day
would need to know what the user's baseline was at the time. That is the one
change that breaks the invariant everything else here rests on.

### 3.2 Privacy

`workout_sessions` is owner-readable only and appears in **no** projection.
`squad_leaderboard()` and `goal_window_scores()` are not modified. A pace is at
least as identifying as the hourly movement pattern §5 already protects — it
carries fitness, and combined with distance it carries routine.

### 3.3 The spec document

Nothing here amends `Kairo_Master_Summary.md`. Challenges are additive: a new
mechanic beside Goals, not a change to one. That is why this is a roadmap
deviation and not a spec version bump — contrast deviation #17, where sabotage's
removal contradicted §20's Non-Negotiable list and needed the spec changed.

### 3.4 Native config

No `prebuild` is required. `HKWorkoutTypeIdentifier` is **already** in
`KAIRO_READ_TYPES` (`src/features/health/read-types.ts`) and already covered by
the `NSHealthShareUsageDescription` string, because `read.ts` already queries
workouts for the anti-cheat cross-check. No new read type, no entitlement
change, no `Info.plist` change.

This was checked rather than assumed: `ios/` is committed (deviation #28), so a
native config change that skips `prebuild` and a commit of the regenerated
`ios/` silently never reaches the build.

---

## 4. Metric purpose — copy only

Assessment Part 1 §2. No schema, no `kairo-core` change.

### 4.1 `STAT_WHY`

A `Record<CoreStat, string>` beside `STAT_UNITS` in
`src/features/character/stat-detail.ts` — copy lives where the other copy lives.

One sentence per stat, each a compression of reasoning the spec already carries:

- **AGI** — steps as one of the strongest single predictors of long-term health.
- **VIT** — §5's actual argument: *moving every hour matters more than one long
  workout; sitting still the rest of the day is its own risk, independent of
  exercise.* This is the one the app most conspicuously never says.
- **STR** — what active energy is a proxy for.
- **END** — sustained effort, and honestly that it rides Apple's exercise
  minutes.

Rendered as four lines in `app/progress.tsx`, the sheet the existing
"How progress works" link on the home shelf already opens (D12). No new screen
real estate on the densest screen in the app.

### 4.2 Naming the baseline

Part 1 §2's second move — surfacing 10,000 as a *labelled* number rather than the
invisible edge of the Gold band — is delivered by the Daily Walk card (§5), not
separately.

### 4.3 Saying the day

**Superseded 2026-08-15 by
`2026-08-15-points-stop-being-spoken-design.md` §3.** This section originally
said Part 1 §2's third move "folds into the Today shelf's existing detail line
rather than becoming its own element."

It no longer folds in: that spec removes the home hero point total, so saying the
day **is** the hero treatment rather than a footnote under it. `resolveStatDetail`
still has every input, and it is still a composition change and not new data —
what changed is how much of the screen it occupies.

---

## 5. Daily Walk

Assessment Part 2 §9: flat, permanent, 10,000, **never scaled up even as the
user improves**. It is a public-health number, not a personal-progress one, and
conflating the two is the specific error to avoid. That is exactly why it is not
a Challenge.

It is also **not a `goals` row**, for the reason Part 1 §3.1 established: the
existing Goal shape cannot express "every day, forever, resets daily."
Open-ended goals are cumulative-only (`goals_consistency_needs_end`), and they
accumulate rather than reset.

### 5.1 The threshold coupling

`DAILY_STEP_BASELINE` is exported from `packages/kairo-core/src/scoring.ts`,
**derived from the `THRESHOLDS` table** rather than written as a literal — the
same arrangement `STAT_POINTS_MAX` already has with `TIER_POINTS`, and for the
same reason: a raised Gold must not leave a second number describing the old one.

### 5.2 The streak, and why it reads tiers

`daily_scores` stores points and tiers, **never raw steps**. But
`tiers->>'AGI' = 'gold'` is precisely "≥ 10,000 steps," because that *is* the AGI
Gold threshold. So the walk streak derives from data already stored, with no new
column and no new sync.

That coupling is the fragile part of this section, and it is guarded rather than
trusted: a test asserts `THRESHOLDS.AGI.gold === DAILY_STEP_BASELINE`. If someone
raises Gold, the test fails instead of the streak silently changing meaning.

The streak exists because the target cannot grow (Part 2 §9) — so the run of days
is the only thing that *can*. Today's live progress reads `useTodayBuckets`,
which already sums the day's steps client-side.

### 5.3 Module and component

- `src/features/train/daily-walk.ts` — pure. `dailyWalkState({ todaySteps, recentDays })`
  returns today's steps, the baseline, the fraction, whether it is met, and the
  streak length. Tested in Node, table-driven, no clock reads.
- `src/features/train/DailyWalkCard.tsx` — on the home shelf between
  `TodayPanel` and `GoalCard`.

Copy states the number and why it is that number: *"10,000 steps — the
public-health baseline, not a target that grows with you."* A missed day breaks
the streak and costs nothing else. No penalty, ever.

---

## 6. Workout-session ingest

The one genuinely new data need (Part 2 §10). Smaller than the assessment sized
it.

### 6.1 It is storage, not acquisition

`src/features/health/read.ts:165` **already calls** `queryWorkoutSamples` for the
anti-cheat cross-check, and already receives the full sample. Every field needed
is on it — verified against the installed
`@kingstinct/react-native-healthkit` type definitions:

| Field | Source |
|---|---|
| `uuid` | `BaseObject` — the natural idempotency key |
| `workoutActivityType` | `WorkoutSample` |
| `duration` | `WorkoutSample` |
| `totalDistance` | `WorkoutSample` (optional) |
| `totalEnergyBurned` | `WorkoutSample` (optional) |
| `startDate` / `endDate` | `BaseSample` |

Today each workout is reduced to a per-hour `hadWorkout` boolean and the rest is
discarded — the same shape of waste that deviation #24 found with heart rate.

Part 2 §9 sized this as "a real ingest change, not a copy change." It is real —
a table, a planner change, an RLS surface — but it is **not** a new HealthKit
permission, a new read type, or a new native surface. Sizing corrected here so
the plan does not budget for work that does not exist.

### 6.2 Reading a run apart from a walk

Worth restating from Part 2 §9, because it is the side benefit that justifies
the table independently: workout sessions are the **only** reliable way to tell
a run from a walk at the data layer. Both collapse into the same AGI
steps-and-distance signal today. Solving Run's data need solves that ambiguity
for free.

### 6.3 Table

```sql
create table public.workout_sessions (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  -- HealthKit's own sample UUID. The natural key: a re-synced window upserts
  -- rather than duplicating, and Apple revising a workout flows through the
  -- same way retroactive step revisions already do.
  hk_uuid       text not null,
  local_date    date not null,
  started_at    timestamptz not null,
  ended_at      timestamptz not null,
  -- Apple's HKWorkoutActivityType **raw value**, stored as the number it is.
  -- See §6.5 — this is deliberately not a translated string.
  activity_type smallint not null,
  duration_s    integer  not null check (duration_s >= 0),
  distance_m    numeric(10, 2) not null default 0 check (distance_m >= 0),
  active_kcal   numeric(10, 2) not null default 0 check (active_kcal >= 0),
  updated_at    timestamptz not null default now(),
  primary key (user_id, hk_uuid)
);
```

References `profiles`, not `auth.users`: this is character-scoped health data,
the same as `health_buckets` and `daily_heart`. (The account-scoped tables are
`app_events` and `device_tokens` — see `CLAUDE.md`.)

`local_date` is the user's own local date (§2), resolved client-side from the
workout's start instant, like every other date in the system.

**RLS:** owner-select only. Zero client write grants — `sync-health` owns every
write, like `health_buckets` and `daily_scores`. `revoke all` then re-grant
`select`, never `revoke insert, update, delete`: Supabase's default privileges
grant ALL, and ALL includes TRUNCATE, which RLS does not restrict.

### 6.4 Client and planner

- `read.ts` keeps the fields instead of discarding them, returning
  `sessions: WorkoutSessionReading[]` alongside `readings`. The existing
  `hadWorkout` per-hour path is **unchanged** — anti-cheat keeps working exactly
  as it does.
- `sync-plan.ts` gains validation for the new array and a bounded size limit,
  in the same shape as `MAX_BUCKETS_PER_SYNC`.
- `sync-health/index.ts` upserts `on conflict (user_id, hk_uuid) do update`.

Handlers stay thin: every decision is in `sync-plan.ts`, tested in plain Node.

### 6.5 Activity type is a number, and stays one

`WorkoutActivityType` in `@kingstinct/react-native-healthkit` is a **numeric**
enum carrying Apple's `HKWorkoutActivityType` raw values — `running = 37`,
`functionalStrengthTraining = 20`, `traditionalStrengthTraining = 50`,
`coreTraining = 59`. It is not a string union, and an implementation that
assumes otherwise will store `"[object Object]"` or a stringified integer and
match nothing.

The raw value is stored **untranslated**. Mapping to a Kairo-side string in
`read.ts` was rejected on two counts: `read.ts` is documented as the module where
"nothing decides anything," and a translation table would silently drop every
activity type it had not been taught, in a table whose whole purpose is to tell
activities apart.

Which numbers *mean* something is a decision, so it lives in
`packages/kairo-core/src/challenge.ts` with the rest of the rules:

```ts
/** Apple's HKWorkoutActivityType raw values. Stable ABI, documented by Apple. */
export const RUN_ACTIVITY_TYPE = 37;
export const STRENGTH_ACTIVITY_TYPES: readonly number[] = [20, 50, 59];
```

`kairo-core` is zero-dependency and cannot import the library to check itself.
Nor can a **test** check it: anything importing
`@kingstinct/react-native-healthkit` pulls in React Native's Flow syntax that
root Vitest cannot parse — the constraint that made `read-types.ts` and
`sync-state.ts` separate files in the first place. A runtime guard is therefore
not available here, and proposing one is the obvious mistake to avoid.

The guard is a **compile-time assertion** instead, in
`src/features/health/activity-types.ts`:

```ts
import type { WorkoutActivityType } from '@kingstinct/react-native-healthkit';
import { RUN_ACTIVITY_TYPE, STRENGTH_ACTIVITY_TYPES } from '@kairo/core';

// `import type` is erased, so nothing Flow-flavoured reaches a bundler or a
// test runner — but `tsc` still checks these, and `npm run typecheck` runs it.
const _run: WorkoutActivityType.running = RUN_ACTIVITY_TYPE;
const _strength: readonly [
  WorkoutActivityType.functionalStrengthTraining,
  WorkoutActivityType.traditionalStrengthTraining,
  WorkoutActivityType.coreTraining,
] = STRENGTH_ACTIVITY_TYPES;
```

This requires the constants be typed as literals (`as const`), or the assignment
widens to `number` and checks nothing. If Apple's raw values ever moved,
typecheck fails rather than the Strength challenge quietly matching nothing.

---

## 7. The Challenges engine

### 7.1 Why not a `GoalKind`

Part 1 §3.2 sketched cadence goals as a new `GoalKind`. Part 2 §10 overturns it
and this spec follows: §8's Goal invariant — *fixed at creation, because changing
a target mid-window would silently re-grade every day already counted* — is
deliberate and stays true for user-authored Goals. A Challenge's target moves
**as the user moves**, which breaks that invariant on purpose. That is a
different concept, not a variant.

So: `goal.ts` is not modified. `challenge.ts` is a sibling.

### 7.2 Derived, not stored (D7)

The challenge for local day *D* is a pure function of qualifying sessions
**strictly before** *D*.

"Strictly before" is load-bearing twice over:

1. The session being judged cannot move its own bar. Without it, a great run
   raises the median that decides whether that same run cleared anything.
2. It makes the whole thing replay-safe. Nothing stateful is stored, so a
   retroactive HealthKit revision flows through for free — the same property
   that made goal progress a read-time projection (deviation #18).

It also delivers Part 2 §11's **ease** requirement with no separate rule: a quiet
stretch lowers the trailing median, which lowers the target. There is no
one-way ratchet to guard against, because there is no ratchet.

### 7.3 `packages/kairo-core/src/challenge.ts`

Pure, zero-dependency, no clock reads, no randomness — like everything else in
that package. Both consumers import the same file (the Expo app via
`@kairo/core`, `finalize-days` via `_shared/core.ts`).

```ts
export type ChallengeArea = 'run' | 'strength';

export interface WorkoutSession {
  localDate: string;
  /** HKWorkoutActivityType raw value — see §6.5. */
  activityType: number;
  durationS: number;
  distanceM: number;
  activeKcal: number;
}

export type Challenge =
  | { area: 'run';      kind: 'establish'; minDistanceM: number }
  | { area: 'run';      kind: 'target'; minDistanceM: number; paceSecPerKm: number }
  | { area: 'strength'; kind: 'establish' }
  | { area: 'strength'; kind: 'target'; activeKcal: number };

/** Only sessions strictly before `before` are considered. */
export function resolveChallenge(
  area: ChallengeArea,
  sessions: readonly WorkoutSession[],
  before: string,
): Challenge;

export function challengeMet(challenge: Challenge, session: WorkoutSession): boolean;

/** The session on `localDate` that cleared the challenge, or null. */
export function clearingSession(
  challenge: Challenge,
  sessions: readonly WorkoutSession[],
  localDate: string,
): WorkoutSession | null;
```

Constants, all exported so the UI sizes against the same numbers the engine uses:

```ts
export const CHALLENGE_WINDOW_DAYS = 90;
export const CHALLENGE_BASELINE_SESSIONS = 5;
export const CHALLENGE_STEP = 0.03;
export const RUN_MIN_DISTANCE_M = 1_000;
export const CHALLENGE_COMPLETION_XP = 40;
```

### 7.4 The rules

**Qualifying sessions.** Run: `activityType === RUN_ACTIVITY_TYPE`,
`distanceM >= RUN_MIN_DISTANCE_M`, `durationS > 0`. Strength:
`STRENGTH_ACTIVITY_TYPES.includes(activityType)` and `activeKcal > 0` (D8).

**Median, not mean** (D16). One exceptional session must not make the app
permanently harder — the failure Part 2 §11 names explicitly. Median over the
**most recent up to `CHALLENGE_BASELINE_SESSIONS`** qualifying sessions inside a
`CHALLENGE_WINDOW_DAYS` window.

*Up to*, deliberately: with 1–4 qualifying sessions the median is taken over
however many exist, rather than waiting for five. A user who has run three times
gets a real target on their fourth run, not a fourth establish-a-baseline
prompt. The even-count median is the mean of the two middle values, the ordinary
definition — worth stating because a 2- or 4-session window is the common early
case, not an edge case.

**Run target.** Pace in seconds per kilometre, so *lower is better*. Target pace
is the median pace times `(1 - CHALLENGE_STEP)`. The distance floor derives from
the median distance of the same sessions, rounded down to the nearest 500 m and
clamped to at least `RUN_MIN_DISTANCE_M` — so the floor rises with the user
rather than becoming meaningless at 10 km (D5).

**Strength target.** Median session active calories times `(1 + CHALLENGE_STEP)`,
rounded to the nearest 5 kcal.

**Cold start** (D14). **No** qualifying sessions in the window: Run returns
`{ kind: 'establish', minDistanceM: RUN_MIN_DISTANCE_M }` — *"log one run of 1 km
or more"*, with **no pace bar at all**. Strength returns
`{ kind: 'establish' }` — log one strength session. The first challenge's job is
to *establish* a baseline, not to test the user, so it is impossible to fail on
fitness. The second challenge is the first real one.

**Clearing.** A day clears an area when any session that day satisfies the
challenge resolved from sessions before that day. Because the challenge is
derived, clearing one automatically makes the next slightly harder — the median
has moved. No stored level counter exists, and none is needed.

**Standing, no expiry** (D9). One live challenge per opted-in area. It waits
until cleared. Rest days are structurally invisible — there is nothing to miss,
which is the property Part 1 named as the entire point of the cadence idea.
Frequency remains a Routine's job (§9), never a Challenge's.

### 7.5 Completion latch

`finalize-days` is the only place a day becomes final, so it is the only place a
challenge completes.

```sql
create table public.challenge_completions (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  area        text not null check (area in ('run', 'strength')),
  local_date  date not null,
  -- The target as it stood, so history renders what was actually cleared
  -- rather than recomputing it against a baseline that has since moved.
  target      jsonb not null,
  -- No DEFAULT on purpose: CHALLENGE_COMPLETION_XP is the single source, and a
  -- default here would be a second copy of the number that could drift from it.
  xp_awarded  integer not null check (xp_awarded >= 0),
  created_at  timestamptz not null default now(),
  primary key (user_id, area, local_date)
);
```

The primary key sets the latch granularity: **one clear per area per local day**.
Two qualifying sessions on the same day clear the same challenge once. That is
correct rather than stingy — the next day's challenge is already harder, because
both sessions have moved the median.

A **one-way latch**, service-role writes only, `on conflict do nothing` — the
`goal_completions` pattern from deviation #19, adopted wholesale including its
reason: a later downward revision from Apple must never revoke something already
cleared. That is the rule §19 already applies to streak milestones.

`target` is snapshotted deliberately. It is the one piece of derived state worth
storing, because it is the answer to *"what did I clear in March"* and the
trailing median can no longer produce it.

### 7.6 XP

`CHALLENGE_COMPLETION_XP = 40` (D15) — about a fifth of a strong day
(`MAX_REALISTIC_DAILY_XP` is 200). A real nudge that cannot substitute for
showing up, which is the same posture `goalCompletionXp`'s cap already takes.

XP is **not** written to `daily_scores.xp_awarded`. A rescore replays that column
from tier points and would silently wipe it — exactly the trap deviation #19
records for goals.

`recalculate_user_xp` extends to sum a **third** source:

```sql
  select coalesce((select sum(xp_awarded) from public.daily_scores       …), 0)
       + coalesce((select sum(xp_awarded) from public.goal_completions   …), 0)
       + coalesce((select sum(xp_awarded) from public.challenge_completions …), 0)
```

Safe for the reason the second source was safe: it is a **full recompute, never
an increment**, so re-syncs, revisions and cron retries stay idempotent.

A `challenge_completions_xp_rollup` AFTER INSERT/UPDATE/DELETE trigger mirrors
`goal_completions_xp_rollup` exactly. **It needs no deletion guard**, for a
non-obvious reason worth recording: during a profile cascade delete, the
`profiles` row is already gone by the time the cascade reaches this table, so
`recalculate_user_xp`'s `where id = p_user_id` matches nothing and the update is
a harmless no-op. What *would* abort the statement is reaching a completion from
a **BEFORE DELETE** trigger — which is precisely why
`profiles_collect_orphaned_goals` must stay AFTER (`CLAUDE.md`). Do not add a
BEFORE trigger that touches this table.

### 7.7 Planner

`supabase/functions/_shared/challenge-plan.ts` — every decision, tested in plain
Node. `finalize-days/index.ts` stays thin: authenticate, read, plan, write.
This is not a style preference; Docker is unavailable on the dev machine, so
anything untestable in Node is effectively untested.

For each day being finalized, for each area the user has opted into: load that
user's sessions in the trailing window, resolve the challenge as of that day,
check for a clearing session, emit a completion row and a notification
candidate.

### 7.8 Push

One new `NotificationTrigger`: `'challenge_cleared'`.

- **Budget-counted** — not added to `BUDGET_EXEMPT`. `goal_completed` earns its
  exemption by firing at most once per user-set commitment; a challenge clears
  repeatedly by design, which is exactly the "recurring nudge would not qualify"
  case that module's comment already draws.
- **Not quiet-hours exempt**, for the reason `goal_completed` is not:
  finalization runs about two hours after local midnight, squarely inside the
  window, and a 02:00 push saying "well done" is worth waiting for morning.
- Copy in `_shared/notification-copy.ts`; deep-link payload `screen: 'train'`,
  routed through `src/features/notifications/routing.ts`. Note the existing
  landmine there: `screen: 'character'` maps to `/`, and `/character` is the
  *onboarding* body picker.

### 7.9 Opt-in

Two boolean columns on `profiles`, both `not null default false` (D13):
`trains_run`, `trains_strength`.

Off by default, so nobody sees a permanently unmet card for something they do
not do. A non-runner never has a Run challenge; the day they start, they turn it
on. It is also the hook a Routine attaches to later (§9).

**The grant is the trap.** `profiles` UPDATE is granted **per column**, and a
column-level `REVOKE` against an existing table-level `GRANT` is silently a
no-op in Postgres. The migration therefore revokes the table grant and re-grants
the full allowed column list including the two new ones. Getting this wrong
fails open, not closed.

---

## 8. `gym` → `strength` (D3)

Assessment Part 3 §16. The squad program value and label become `strength`, so
the codebase stops carrying two words for one idea.

Touches, in one self-contained migration and one commit:

- `squads.program` CHECK constraint, and an UPDATE of existing rows.
- `squad_leaderboard()`'s SQL weight mapping.
- `SquadProgram` and `BOOSTED_STAT` in `packages/kairo-core/src/program.ts`.
- `src/features/squad/program-copy.ts` and its tests.

`strength` over `calisthenics` because STR rides active calories and cannot tell
bodyweight work from weights anyway — a narrower word would promise a
distinction the data cannot make. Part 2 §9's calisthenics framing survives as
*copy* on the Strength challenge, where it belongs: push-ups, pull-ups, squats
and curl-ups need no equipment, which is the point that mattered.

The `PROGRAM_WEIGHTS` ↔ SQL differential test in the schema suite already exists
and is what proves both halves moved together.

This is the smallest piece and the one most likely to be left half-done, so it
is step 1 and lands alone.

---

## 9. Routines — designed, not built

Assessment Part 3. Recorded here so the next pass starts from a settled design.
**Nothing in this section ships in this pass.**

- A **third mechanic** beside Goals and Challenges. Not a `GoalKind` (moving
  target), not a Challenge (Challenges are the personal difficulty curve; a
  Routine turns a standing Challenge into a scheduled commitment).
- **Shared and frozen at creation:** the area (Strength or Run — Walk never gets
  one, having no rest days to schedule around) and the **weekly frequency**,
  N days a week. That is the actual promise.
- **Personal per member:** the bar — each member's own current Challenge, never
  a shared number, which is the fairness fix Part 2 §12 asked for — and the
  specific days. Frequency is proposed identically for the squad at creation, so
  the default is "we all lift Monday, Wednesday, Friday," but a member on a
  rotating shift can swap their own days without changing the commitment.
- **End date defaults to indefinite**, reusing `CreateGoalForm`'s existing preset
  + date-picker + no-end-date control (deviation #21) with the highlighted
  default flipped. A Routine is a habit, not a race.
- **Roster is open**, the opposite of a squad Goal's frozen roster — and
  correctly so: there is no finish line for a late joiner to enter partway
  through. Opting out is personal and does not end it for anyone else.
- **Independent of `squads.program`.** Suggest the squad's program area as the
  prefill; do not couple them.
- **`rosterSize = 1` is not a special case.** A personal accountability routine
  and a squad routine are the same mechanic at different roster sizes — the
  idiom `squadRequirementLine()` already uses.
- **Reward: a small XP trickle per week kept** (D4), mirroring how streaks
  reward rather than how Goal completion pays a lump sum. An indefinite Routine
  has no completion event to pay at.

**Still open for that pass**, and deliberately not decided here: how a
Routine-level shield and the Challenge-level ease coordinate on the same missed
week rather than both firing at once; where a Routine surfaces relative to
`SquadGoalPanel` and `GoalCard`; and the `required_members` default for the
squad-level weekly read.

---

## 10. UI

Per `CLAUDE.md`, this goes through the **frontend-design** skill before
implementation. Kairo's character-first visual identity (§6) flattens into
generic React Native defaults otherwise.

### 10.1 Surfaces

- **`app/train.tsx`** — a stacked route, not a fourth tab. `TabPill` stays at
  three items and Challenges are a pushed route, the precedent Phase 10 set for
  goals. Opens on the area picker when neither area is opted in (D19); otherwise
  shows the live Run and Strength challenges and recent clears.
- **Home shelf** — `DailyWalkCard` between `TodayPanel` and `GoalCard`, plus a
  compact `/train` entry showing the live target. The walk baseline stays
  ambient because the entire point of a flat 10,000 is seeing it without asking.
- **`app/progress.tsx`** — gains the four `STAT_WHY` lines.

### 10.2 Constraints that have already cost a build

- **Every new element needs an accessible name**, composed the way `StatIcon`
  and `src/features/squad/row-label.ts` establish. A challenge card is one
  element that means one thing, not six stops.
- **Grouping is explicit**: the parent keeps `accessible` +
  `accessibilityLabel` **and** every direct child is hidden with
  `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`.
  Neither half is redundant — removing one is how the leaderboard-row failure
  comes back.
- **Read what is already spoken** before adding a label. A label that repeats an
  adjacent line is noise; a label inside a control that already names itself is
  a bug.
- **`src/ui/Text.tsx` only**, never `react-native`'s. Scale chosen by what the
  type sits inside: `prose` for copy in containers that grow, `chrome` for
  buttons and meta lines, `fixed` for type locked to drawn geometry.
- **No absolute positioning** in the new cards. The character HUD was the app's
  only absolutely-positioned chrome and it overlapped itself at large Dynamic
  Type.
- Home is already the densest screen in the app at 550 lines. Adding two
  elements to it is a composition decision, not an append.

### 10.3 Home entry point

The `/train` entry shows the live target as text, so a user learns what the
mechanic is without navigating. For a cold-start user that reads as *"Log one run
of 1 km"* — an invitation, which is the correct first impression.

For Strength with no logged session (D10), the card is **visible and
instructional**: *"Start a Strength workout on your Watch or phone before your
set — that's how Kairo sees it."* Hiding it (REC's rule) was rejected because
this is a behaviour gap, not a capability gap: the user *can* do it, they just
have not learned to. REC's "no wearable, no row, zero penalty" applies to
hardware nobody can conjure.

**Accepted cost:** the Strength card will read as unclearable to a real fraction
of beta users until they change a habit. Worth watching specifically in the
beta.

---

## 11. Testing

Strict TDD on `challenge.ts` and `daily-walk.ts`. This is progression logic where
a bug corrupts real user history, which is the bar `CLAUDE.md` sets for
kairo-core.

| Suite | Covers |
|---|---|
| `packages/kairo-core/src/challenge.test.ts` | Median-not-mean; the strictly-before rule; cold start for both areas; ease on a declining window; the 90-day window edge; empty and single-session inputs; pace arithmetic; the distance floor's clamp. |
| `packages/kairo-core/src/scoring.test.ts` | `DAILY_STEP_BASELINE === THRESHOLDS.AGI.gold` — the §5.2 guard. |
| `npm run typecheck` | The §6.5 activity-type guard is a **compile-time** assertion in `src/features/health/activity-types.ts`, not a test — the library cannot be imported at runtime by any test in this repo. |
| `src/features/train/daily-walk.test.ts` | Streak arithmetic including a broken streak, today-not-yet-met, and an empty history. |
| `supabase/functions/_shared/challenge-plan.test.ts` | Completion emitted once; re-run emits nothing (the latch); opted-out areas skipped; no clearing session. |
| `supabase/functions/_shared/sync-plan.test.ts` | Workout validation, size bound, malformed payloads. |
| `supabase/tests/schema.test.ts` | Both new tables under the non-owner `authenticated` role: select own, denied others', **denied every write**. The `profiles` column grant after the revoke/re-grant. The XP rollup summing all three sources. |

### 11.1 What the harness cannot prove

`supabase/tests/harness.ts` runs migrations against PGlite. It does not prove the
migration applies to the live project, and it does not exercise the deployed
Edge Function.

So, mandatory and in this order:

1. Apply the migration via `remote-sql.sh -f`, then insert its row into
   `supabase_migrations.schema_migrations` by hand (the CLI will otherwise
   re-apply it). Wrap in `begin; … commit;`.
2. **Deploy `sync-health` in the same pass as the migration that adds
   `workout_sessions`.** A migration touching a table an Edge Function writes
   ships with that function's redeploy — applying one without the other took
   scoring down for two days in August 2026.
3. **Run `supabase/scripts/smoke-sync.mjs`** against the deployed function. This
   is the guard that catches deploy-time drift; every test passing means
   nothing, because tests check the source and not the deployed artifact.
4. Deploy `finalize-days`.

### 11.2 Hand verification

UI is verified by hand. Accessibility structure goes through Xcode's
Accessibility Inspector on the simulator **before** a TestFlight build is cut —
it answers "is this card one element or six" directly, with no VoiceOver
gestures and no build. Dynamic Type needs no GUI:

```
xcrun simctl ui booted content_size accessibility-extra-extra-extra-large
xcrun simctl io booted screenshot
```

Note the standing constraint: this machine cannot pair an iPhone over USB
(CrowdStrike Device Control), so device builds go through Xcode Cloud →
TestFlight.

---

## 12. Sequencing

Six steps. Each is independently shippable and independently verifiable.

| # | Step | Ships |
|---|---|---|
| 1 | `gym` → `strength` | Migration + `program.ts` + copy. Self-contained; lands alone so it cannot be left half-done. |
| 2 | Metric "why" | `STAT_WHY` + `app/progress.tsx`. Copy only. |
| 3 | Daily Walk | `DAILY_STEP_BASELINE`, `daily-walk.ts`, `DailyWalkCard`. No backend. |
| 4 | Workout ingest | Table + RLS, `read.ts`, `sync-plan.ts`, `sync-health` deploy, **smoke-sync**. No user-facing change. |
| 5 | Challenges engine | `challenge.ts`, `challenge_completions`, XP rollup, `challenge-plan.ts`, `finalize-days` deploy, the push trigger. |
| 6 | `/train` UI | The route, opt-in, cards, home entry. Design pass first. |

Steps 1–3 are user-visible immediately. Step 4 is invisible and must sit in the
world for a few days before step 5 means anything — a derived challenge needs a
trailing window, and there is none until sessions have been syncing. **Do not
compress 4 and 5 into one deploy**; the engine has nothing to read.

---

## 13. Documentation owed

Per `CLAUDE.md`, documentation updates are part of the change, not a follow-up.

- `docs/roadmap.md` — new deviations for the Challenges mechanic, the
  `workout_sessions` table, and the `gym` → `strength` rename; a new phase for
  solo mode; **Phase 9 (TestFlight beta) re-sequenced behind it** per D2.
- `docs/mvp-scope.md` — Challenges and Daily Walk move to IN. Routines stated
  explicitly as OUT, so the next QA pass cannot grade against them. This file
  exists precisely because the August 2026 QA pass graded Kairo against a stale
  brief.
- `docs/user-journey.md` — the daily loop gains Walk and `/train`.
- `CLAUDE.md` — the `workout_sessions` privacy posture, the strictly-before rule,
  and the `DAILY_STEP_BASELINE` ↔ Gold coupling.
- `README.md` — only if setup steps change. They do not.
- The assessment document gains a short Part 4 pointing here, so it stops
  reading as the live decision record.

-- workout_sessions — the one genuinely new data need for solo mode.
--
-- Spec: docs/superpowers/specs/2026-08-15-solo-mode-walk-strength-run-design.md
-- §6 (roadmap deviation #32).
--
-- **This is storage, not acquisition.** `src/features/health/read.ts` already
-- calls `queryWorkoutSamples` for the anti-cheat cross-check and already
-- receives every field below. Today each workout is reduced to a per-hour
-- `hadWorkout` boolean and the rest is discarded — the same shape of waste
-- deviation #24 found with heart rate. So there is no new HealthKit read type,
-- no new `NSHealthShareUsageDescription` string, and no `prebuild`.
--
-- The side benefit that justifies the table on its own: workout sessions are
-- the only reliable way to tell a run from a walk at the data layer. Both
-- collapse into the same AGI steps-and-distance signal otherwise.

begin;

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
--
-- References `profiles`, not `auth.users`: this is character-scoped health
-- data, the same as `health_buckets` and `daily_heart`. The account-scoped
-- tables are `app_events` and `device_tokens` — see CLAUDE.md. Erasure is
-- unaffected either way, since `profiles.id` already cascades from `auth.users`.

create table public.workout_sessions (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  -- HealthKit's own sample UUID, and the natural idempotency key: a re-synced
  -- window upserts rather than duplicating, and Apple revising a workout flows
  -- through exactly the way retroactive step revisions already do.
  hk_uuid       text not null,
  local_date    date not null,
  started_at    timestamptz not null,
  ended_at      timestamptz not null,
  -- Apple's HKWorkoutActivityType **raw value**, stored as the number it is
  -- and deliberately not translated to a Kairo-side string. `read.ts` is the
  -- module where nothing decides anything, and a translation table would
  -- silently drop every activity type it had not been taught — in a table
  -- whose whole purpose is telling activities apart.
  --
  -- Which numbers *mean* something is a decision, so it lives in
  -- packages/kairo-core/src/challenge.ts with the rest of the rules.
  activity_type smallint not null,
  duration_s    integer  not null check (duration_s >= 0),
  distance_m    numeric(10, 2) not null default 0 check (distance_m >= 0),
  active_kcal   numeric(10, 2) not null default 0 check (active_kcal >= 0),
  updated_at    timestamptz not null default now(),
  primary key (user_id, hk_uuid)
);

comment on table public.workout_sessions is
  'One logged workout, as HealthKit reported it. Keyed by Apple''s own sample UUID so a re-sync upserts. Owner-readable only and in no projection: a pace is at least as identifying as the hourly movement §5 protects. Service-role writes only — sync-health owns every write.';

comment on column public.workout_sessions.activity_type is
  'HKWorkoutActivityType raw value, untranslated (running = 37, functionalStrengthTraining = 20, traditionalStrengthTraining = 50, coreTraining = 59). Meaning is assigned in packages/kairo-core/src/challenge.ts.';

comment on column public.workout_sessions.local_date is
  'The user''s own local date (§2), resolved client-side from the workout''s start instant — like every other date in the system.';

-- Challenges resolve over a trailing window of one user's sessions, ordered by
-- date. The primary key leads with `user_id` but is keyed on `hk_uuid`, which
-- no window query can use.
create index workout_sessions_user_date_idx
  on public.workout_sessions (user_id, local_date);

-- ---------------------------------------------------------------------------
-- RLS — owner-select only, zero client writes
-- ---------------------------------------------------------------------------
--
-- The same posture as `health_buckets` and `daily_scores`: clients read their
-- own rows and write nothing. `sync-health` owns every write.
--
-- Privacy (§3.2 of the spec): this table appears in **no** projection.
-- `squad_leaderboard()` and `goal_window_scores()` are not modified by this
-- migration and must not learn about it — a pace carries fitness, and combined
-- with distance it carries routine, which is at least as revealing as the
-- hourly movement §5 already protects.

alter table public.workout_sessions enable row level security;

create policy workout_sessions_select_own on public.workout_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- `revoke all` then re-grant, not `revoke insert, update, delete`.
--
-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on new public tables to
-- `authenticated`, and ALL includes TRUNCATE — which RLS does not restrict.
revoke all on public.workout_sessions from anon;
revoke all on public.workout_sessions from authenticated;
grant select on public.workout_sessions to authenticated;

commit;

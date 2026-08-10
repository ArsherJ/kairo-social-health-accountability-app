-- Heart rate kept as a number, so strain can be derived from it.
--
-- Founder request 2026-08-10: show the day's real figures — steps, distance,
-- calories, strain — and light up the wearable-only ones when a wearable is
-- present.
--
-- Steps, distance, active calories and active minutes were already stored and
-- simply never displayed. Strain is the one genuinely new thing here.
--
-- **HealthKit has no strain metric.** It is derived, and Kairo already had the
-- input: `src/features/health/read.ts` queries
-- `HKQuantityTypeIdentifierHeartRate` as an hourly `discreteAverage` for the
-- §5 anti-cheat workout cross-check, and then throws the number away, keeping
-- only `elevated_heart_rate` — a boolean for "was this hour above 100 bpm".
-- Two columns' worth of data was being reduced to one bit and discarded.
--
-- **Strain never enters scoring.** It is not written to `daily_scores`, does not
-- rank anybody, and cannot appear in a goal. `computeStrain()` in
-- `packages/kairo-core/src/strain.ts` is a read-time projection over the numbers
-- stored here, computed on the owner's own screen from the owner's own rows. So
-- §12's server-authoritative rule is untouched: nothing about a standing depends
-- on it, and score replay never learns it exists.
--
-- **Privacy.** Both columns live on owner-readable tables and neither is
-- reachable through `squad_leaderboard()` or `goal_window_scores()`. That is
-- deliberate and matches §5's line: heart rate is at least as revealing as the
-- hourly movement pattern §5 already protects — it says when you slept, when you
-- were stressed, and when you were still. It stays with its owner.

begin;

-- ---------------------------------------------------------------------------
-- health_buckets.avg_heart_rate
-- ---------------------------------------------------------------------------
--
-- Nullable, and null is the common case: a phone-only user has no heart-rate
-- source at all, and even a watch wearer takes it off. Null means "not
-- measured", never "resting" — `computeStrain` skips those hours rather than
-- crediting them as rest, because an afternoon with the watch on the charger is
-- not an afternoon of rest.
--
-- Sits beside `elevated_heart_rate` rather than replacing it. The boolean is
-- what the anti-cheat cross-check reads (`20260728090000`), and rewriting that
-- predicate to derive from the number would be a scoring-path change riding
-- along with a display feature.

alter table public.health_buckets
  add column avg_heart_rate numeric(5,1)
    check (avg_heart_rate is null or avg_heart_rate between 20 and 250);

comment on column public.health_buckets.avg_heart_rate is
  'Hourly discreteAverage bpm from HealthKit. NULL means not measured, never resting — computeStrain() skips null hours rather than crediting them as rest. Owner-readable only; no projection exposes it. Display input for strain, never scored.';

-- ---------------------------------------------------------------------------
-- daily_heart — resting rate, one row per local day
-- ---------------------------------------------------------------------------
--
-- Modelled on `daily_sleep` exactly: same key shape, same RLS, same
-- service-role-writes-only posture. Resting HR is a per-day figure Apple
-- computes itself (`HKQuantityTypeIdentifierRestingHeartRate`), not something
-- that varies by hour, so it does not belong in `health_buckets`.
--
-- A separate table rather than a column on `daily_sleep`, even though both are
-- wearable-only: a user can have a resting rate with no sleep record and the
-- reverse, so sharing a row would make one of them depend on the other's
-- presence.
--
-- Not on `daily_scores`, which is *replayed* from buckets on every rescore — a
-- column there would be wiped by the next sync unless the replay learned to
-- carry it, which is exactly the coupling deviation #19 avoided for goal XP.

create table public.daily_heart (
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  resting_hr smallint not null check (resting_hr between 20 and 150),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

comment on table public.daily_heart is
  'Resting heart rate from a wearable, per local day. Absence means strain falls back to a default resting rate — never a missing or zero strain. Owner-readable only, service-role writes.';

-- ---------------------------------------------------------------------------
-- RLS — the same shape daily_sleep has
-- ---------------------------------------------------------------------------

alter table public.daily_heart enable row level security;

create policy daily_heart_select_own on public.daily_heart
  for select to authenticated
  using (user_id = (select auth.uid()));

-- `revoke all` then re-grant, not `revoke insert, update, delete`.
--
-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on new public tables to
-- `authenticated`, and ALL includes TRUNCATE — which RLS does not restrict.
-- The goals migration (20260810100000) spells this out at length; this is a new
-- table, so it inherits the same default and needs the same treatment.
revoke all on public.daily_heart from anon;
revoke all on public.daily_heart from authenticated;
grant select on public.daily_heart to authenticated;

commit;

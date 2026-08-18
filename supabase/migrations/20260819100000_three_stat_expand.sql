-- Three-stat model (roadmap deviation #41), expand phase.
--
-- Additive only. `rec_points`, `end_points` and `vit_points` all survive this
-- migration on purpose: the four-step expand/contract in spec §4 exists
-- because renaming a column out from under a deployed Edge Function is the
-- August 2026 outage in miniature — the bucket upsert commits before the score
-- upsert, so health data keeps landing while nothing scores, silently.
--
-- Phase 3 drops them, after the functions writing both shapes are deployed.

begin;

alter table public.daily_scores
  add column mind_points integer not null default 0 check (mind_points >= 0);

comment on column public.daily_scores.mind_points is
  'MND tier points (§5). Promoted from rec_points, which is retained until the contract migration so a function rollback needs no schema restore.';

-- Contributing stats is transitionally 0..5: MND joins in Task 3, END and VIT
-- leave in Task 4, and the window between them is a real state the check must
-- permit. Phase 3 tightens this to 0..3.
alter table public.daily_scores
  drop constraint if exists daily_scores_contributing_stats_check;

alter table public.daily_scores
  add constraint daily_scores_contributing_stats_check
    check (contributing_stats between 0 and 5);

alter table public.daily_scores
  drop constraint if exists daily_scores_featured_stat_check;

alter table public.daily_scores
  add constraint daily_scores_featured_stat_check
    check (featured_stat is null or featured_stat in ('AGI', 'STR', 'END', 'VIT', 'MND'));

-- Sleep origin. `source` already existed and was never populated; it now
-- carries the origin bundle identifier. The client sends the bundle id and the
-- user-entered flag and never a verdict — the allowlist lives server-side, so
-- a forged client cannot promote itself past a list it does not hold.
alter table public.daily_sleep
  add column was_user_entered boolean;

comment on column public.daily_sleep.source is
  'sourceRevision.source.bundleIdentifier of the sample the night was attributed from. Null for rows written before the three-stat model.';

comment on column public.daily_sleep.was_user_entered is
  'Apple HKWasUserEntered. True means hand-typed: the night is discarded, never scored. Null for rows predating the three-stat model.';

-- Workout origin. Three signals, because a verified workout needs its source
-- allowlisted AND heart-rate evidence present (spec §3, resolved 2026-08-18).
alter table public.workout_sessions
  add column source_bundle_id text,
  add column was_user_entered boolean,
  add column has_heart_rate_evidence boolean;

comment on column public.workout_sessions.has_heart_rate_evidence is
  'Whether the session carried heart-rate samples, from a per-workout getStatistic call. Manual entry never does. Required for STR''s threshold shift.';

commit;

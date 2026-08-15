-- Retention reporting (design 2026-08-15 §4.3).
--
-- The outside review's kill signal — "under 25% engaged by day 21" — needs no
-- new telemetry at all: daily_scores already holds a row per user per local
-- date, so activity retention is a query. Only *activation* needed events.
--
-- Nth-day retention, not "any activity up to day N": a user is retained on day
-- N if they have a scored day exactly N days after the day their profile was
-- created. That is the stricter reading and the one a kill signal should use.
--
-- Cohort day is profiles.created_at, not auth.users.created_at: a user who
-- signs in and never names a character has not started the loop, so counting
-- them as a cohort member would report the onboarding drop-off as churn.

begin;

create or replace function public.kairo_retention(p_day integer)
returns table (
  cohort_date date,
  cohort_size bigint,
  retained bigint
)
language sql
stable
set search_path = ''
as $$
  -- Every player's day runs midnight-to-midnight in *their own* timezone
  -- (§2), and daily_scores.local_date is always the per-user-local day, never
  -- UTC — the same convention as finalizable_days(), squad "today" reads, and
  -- every other timestamptz->date conversion in this schema. Anchoring the
  -- cohort day on UTC instead would make it disagree with the local_date it
  -- is compared against, silently misdating anyone who joined near midnight
  -- Manila time (the 'Asia/Manila' default).
  with cohort as (
    select p.id, (p.created_at at time zone p.timezone)::date as joined_on
    from public.profiles p
  )
  select
    c.joined_on as cohort_date,
    count(*) as cohort_size,
    count(*) filter (
      where exists (
        select 1
        from public.daily_scores d
        where d.user_id = c.id
          and d.local_date = c.joined_on + p_day
      )
    ) as retained
  from cohort c
  group by c.joined_on
  order by c.joined_on;
$$;

comment on function public.kairo_retention(integer) is
  'Nth-day activity retention by signup cohort. A user counts as retained on day N when a daily_scores row exists for their cohort date + N. Cohort day is profiles.created_at, so a user who never finished onboarding is not counted as churn. Analytics only — EXECUTE is revoked from anon and authenticated.';

-- Creating a function grants EXECUTE to PUBLIC by default. This reads every
-- user's activity, so it must never be reachable from a client session.
revoke all on function public.kairo_retention(integer) from public;
revoke all on function public.kairo_retention(integer) from anon, authenticated;

commit;

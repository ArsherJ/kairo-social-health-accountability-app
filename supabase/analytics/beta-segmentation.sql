-- Beta segmentation by squad program (roadmap Phase 8 [SP]).
--
-- Personal focus was part of this file until 2026-08-10; `profiles.focus` is
-- dropped and section 3 now reads `squads.program` instead.
--
-- Run with ./supabase/scripts/remote-sql.sh -f supabase/analytics/beta-segmentation.sql
-- (or one query at a time — the script returns the last statement's rows).
--
-- These are read-only analysis queries, not migrations. They are checked in so
-- the beta's questions are answered the same way every week rather than
-- reinvented in a psql session each time.
--
-- What they exist to answer, from §15's risk questions as the scope addition
-- revised them:
--
--   1. Does retention differ by program? A program nobody sticks with is a
--      program that should not ship.
--   2. Is the strength program viable phone-only? Compare a wearable-heavy
--      strength squad against a phone-only one — STR is estimated active energy, which
--      a phone in a pocket measures poorly during a lifting session.
--   3. Are people being scored as someone they do not train as? A Recovery squad
--      whose members land AGI-dominant is boosting a stat nobody in it earns —
--      a churn risk that shows up in the data weeks before it shows up in an
--      interview.


-- ---------------------------------------------------------------------------
-- 1. Retention by squad program (D7 / D21)
-- ---------------------------------------------------------------------------
--
-- "Active on day N" means a scored day, not an app open: the product's claim is
-- that your activity counts whether or not you open it, so opening it is the
-- wrong denominator.

with member as (
  select
    sm.user_id,
    s.program,
    min(ds.local_date) as first_scored
  from public.squad_members sm
  join public.squads s on s.id = sm.squad_id
  join public.daily_scores ds on ds.user_id = sm.user_id
  group by sm.user_id, s.program
)
select
  m.program,
  count(*)                                                    as members,
  count(*) filter (where exists (
    select 1 from public.daily_scores d
    where d.user_id = m.user_id
      and d.local_date between m.first_scored + 6 and m.first_scored + 8
      and d.total > 0
  ))                                                          as active_d7,
  count(*) filter (where exists (
    select 1 from public.daily_scores d
    where d.user_id = m.user_id
      and d.local_date between m.first_scored + 20 and m.first_scored + 22
      and d.total > 0
  ))                                                          as active_d21
from member m
group by m.program
order by m.program;


-- ---------------------------------------------------------------------------
-- 2. Gym viability: wearable-heavy vs phone-only
-- ---------------------------------------------------------------------------
--
-- has_wearable is server-observed from synced sleep data, so this is capability
-- as measured rather than as claimed. If STR points per active day are far
-- lower phone-only, "STR by estimated calories feels dead" is confirmed rather
-- than suspected.

select
  s.program,
  p.has_wearable,
  count(distinct p.id)                    as members,
  round(avg(ds.str_points))               as avg_str_points,
  round(avg(ds.total))                    as avg_total,
  round(avg(ds.contributing_stats), 2)    as avg_contributing_stats
from public.profiles p
join public.squad_members sm on sm.user_id = p.id
join public.squads s on s.id = sm.squad_id
join public.daily_scores ds on ds.user_id = p.id and ds.total > 0
group by s.program, p.has_wearable
order by s.program, p.has_wearable;


-- ---------------------------------------------------------------------------
-- 3. Squad program vs observed dominance
-- ---------------------------------------------------------------------------
--
-- This section used to compare a squad's program against each member's
-- *declared personal focus*. `profiles.focus` was dropped on 2026-08-10 — it
-- was a second answer to a question `squads.program` already answers, and only
-- the program ever meant anything. So the comparison is now program against
-- what the member actually grinds.
--
-- Mirrors dominantStat()'s 14-day window and its All-Rounder predicate (all
-- four within 20% of the top). Kept in SQL rather than pulled into the app
-- because it is an analysis question, not a product surface — if it ever
-- becomes one, it must move to @kairo/core and get a differential test, the
-- same as the program weights.
--
-- A sustained mismatch is still the signal, one level up: a Recovery squad whose
-- members land AGI-dominant for three weeks is boosting a stat nobody in it
-- earns, and "not winnable for my lifestyle" is the churn reason that follows.
-- It is also what the character screen's lane now reads, so this doubles as a
-- check that the lane is pointing somewhere real.

with window_totals as (
  select
    p.id,
    s.program,
    sum(ds.agi_points) as agi,
    sum(ds.str_points) as str,
    -- mind_points, not rec_points: sleep is a stat since deviation #41, and
    -- end_points / vit_points are retired columns nothing writes.
    sum(ds.mind_points) as mnd
  from public.profiles p
  join public.squad_members sm on sm.user_id = p.id
  join public.squads s on s.id = sm.squad_id
  join public.daily_scores ds
    on ds.user_id = p.id
   and ds.local_date > (now() at time zone p.timezone)::date - 14
  group by p.id, s.program
),
observed as (
  select
    w.*,
    greatest(w.agi, w.str, w.mnd) as top,
    case greatest(w.agi, w.str, w.mnd)
      when w.agi then 'AGI' when w.str then 'STR' else 'MND'
    end as dominant
  from window_totals w
)
select
  o.program,
  -- All-Rounder: every stat within 20% of the top one.
  case
    when o.top = 0 then 'none'
    when least(o.agi, o.str, o.mnd) >= o.top * 0.8 then 'balanced'
    else o.dominant
  end as observed_dominance,
  count(*) as users
from observed o
group by 1, 2
order by 1, 3 desc;


-- ---------------------------------------------------------------------------
-- 4. Funnel: which program squads pick
-- ---------------------------------------------------------------------------
--
-- The focus half of this funnel is gone with the question it measured. What
-- remains is the choice that still exists, and the one that matters: if almost
-- every squad takes the default, the program picker is costing a decision at
-- squad creation and buying nothing.

select
  payload ->> 'program' as program,
  count(*)              as events,
  count(distinct user_id) as users
from public.app_events
where type = 'squad_program_selected'
group by 1
order by users desc;

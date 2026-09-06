-- stat_records() ignores a flagged day.
--
-- The substantive half of the per-hour plausibility ceilings (deviation #67).
-- The ceilings themselves buy the *claim* — the server bounds what an hour can
-- contain — and almost nothing else, because nothing uncapped consumes a raw
-- daily figure: the race caps at the ridge, points cap per stat, XP is banded,
-- Mastery derives from capped points, quests are boolean. The personal best is
-- the one exception, and so the one outcome a forged sync could still buy. This
-- closes it.
--
-- **A flag removes a whole local date, not one stat.** The flag is a property
-- of the day (`daily_scores.flagged`), so Mind loses that night too even though
-- the implausible hour was steps or calories: an account that fabricated its
-- afternoon is not a source the night should be trusted from either, and a
-- record is the one figure with no cap behind it.
--
-- **`not exists` against a list of flagged dates, never a join.** An inner join
-- would drop a date with no `daily_scores` row at all — which no production
-- path produces, since `sync-health` writes a row per date in the payload, but
-- a read that narrows itself on a missing row narrows silently. Only an actual
-- `flagged = true` may remove a day. The dates are gathered once, in a CTE, and
-- each branch excludes against it: the predicate was written out three times
-- first, which is three places for one rule to be edited in two.
--
-- Everything else about the function is unchanged and the original comment
-- still governs it: derived on every read so a retroactive Apple revision moves
-- a record the way it moves a score, no argument so the only records reachable
-- are `auth.uid()`'s, Body without the strength credit so this body never names
-- `workout_sessions`, and a stat with no qualifying day returning no row rather
-- than a zero — which now includes a stat whose only qualifying day is flagged.

begin;

create or replace function public.stat_records()
returns table (stat text, value numeric, local_date date)
language sql
stable
security definer
set search_path to ''
as $function$
  with viewer as (select auth.uid() as id),
  flagged as (
    select ds.local_date
      from public.daily_scores ds, viewer v
     where ds.user_id = v.id
       and ds.flagged
  ),
  motion as (
    select 'AGI'::text as stat,
           sum(b.steps)::numeric as value,
           b.local_date
      from public.health_buckets b, viewer v
     where b.user_id = v.id
       and not exists (select 1 from flagged f where f.local_date = b.local_date)
     group by b.local_date
    having sum(b.steps) > 0
     order by sum(b.steps) desc, b.local_date desc
     limit 1
  ),
  body as (
    select 'STR'::text as stat,
           sum(b.active_kcal)::numeric as value,
           b.local_date
      from public.health_buckets b, viewer v
     where b.user_id = v.id
       and not exists (select 1 from flagged f where f.local_date = b.local_date)
     group by b.local_date
    having sum(b.active_kcal) > 0
     order by sum(b.active_kcal) desc, b.local_date desc
     limit 1
  ),
  mind as (
    select 'MND'::text as stat,
           s.minutes::numeric as value,
           s.local_date
      from public.daily_sleep s, viewer v
     where s.user_id = v.id
       and s.was_user_entered is not true
       and s.minutes > 0
       and not exists (select 1 from flagged f where f.local_date = s.local_date)
     order by s.minutes desc, s.local_date desc
     limit 1
  )
  select * from motion
  union all select * from body
  union all select * from mind;
$function$;

comment on function public.stat_records() is
  'The caller''s best day on each stat, in raw units, with the date it was set. '
  'Derived on every read so a retroactive Apple revision moves it, exactly as '
  'it moves a score. Takes no argument: the only records reachable are '
  'auth.uid()''s. A flagged day sets no record at all — the ceilings in '
  'sync-plan.ts bound what an hour may contain, and this is the only uncapped '
  'thing a forged hour could otherwise buy. A stat with no qualifying day '
  'returns no row at all rather than a zero, because "no record yet" and "a '
  'record of zero" are different things and only one of them is true.';

revoke all on function public.stat_records() from public, anon;
grant execute on function public.stat_records() to authenticated;

commit;

-- stat_records() — your best day on each stat, and when you set it.
--
-- **Derived, never stored**, exactly as a Challenge target and Event progress
-- are. Scores are replayed from stored buckets, so a retroactive Apple revision
-- must be able to move a record the same way it moves a score; a stored best
-- would go stale the moment Apple corrected a day, and nothing would notice.
-- The read is bounded by one user's own rows and indexed on
-- (user_id, local_date).
--
-- **Records are measurements, not scores.** Motion is steps, Body is active
-- calories, Mind is a scoring night's minutes — the same three raw figures the
-- Today tab already speaks. Body deliberately does NOT include the strength
-- credit that `STRENGTH_MINUTE_KCAL_CREDIT` adds to Body's *scoring* value:
-- a record is a thing you actually did and a calorimeter actually saw, not a
-- scoring adjustment. That line also keeps this function clear of
-- `workout_sessions`, which is owner-readable only and which a schema test
-- requires no `public` function body to mention — a pace carries routine, and
-- widening that is a privacy decision nobody has taken.
--
-- **Takes no argument, on purpose** — the same reasoning as `delete_account()`.
-- The only records it can return are `auth.uid()`'s. A `p_user_id` parameter
-- would put this one bug away from reading any account's history, and a
-- personal best is exactly the kind of thing that must never reach a
-- leaderboard: headroom pays the character, never the ranking.
--
-- Mind reads `was_user_entered is not true`, which is the same gate
-- `scoringSleepMinutes` applies. Without it somebody types a fourteen-hour
-- night once and holds a record they did not sleep. `is not true` rather than
-- `= false` because the column is nullable on pre-migration rows.

begin;

create or replace function public.stat_records()
returns table (stat text, value numeric, local_date date)
language sql
stable
security definer
set search_path to ''
as $function$
  with viewer as (select auth.uid() as id),
  motion as (
    select 'AGI'::text as stat,
           sum(b.steps)::numeric as value,
           b.local_date
      from public.health_buckets b, viewer v
     where b.user_id = v.id
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
  'auth.uid()''s. A stat with no qualifying day returns no row at all rather '
  'than a zero, because "no record yet" and "a record of zero" are different '
  'things and only one of them is true.';

revoke all on function public.stat_records() from public, anon;
grant execute on function public.stat_records() to authenticated;

commit;

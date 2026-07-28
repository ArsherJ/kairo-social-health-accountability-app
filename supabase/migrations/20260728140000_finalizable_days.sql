-- Candidate selection for the finalize-days cron.
--
-- Kept in SQL so the timezone arithmetic sits next to the data and the cron
-- fetches only the rows it can act on. A full table scan filtered in TypeScript
-- would grow linearly with total user-days; this touches only provisional ones.

create or replace function public.finalizable_days(p_limit integer default 500)
returns table (
  user_id uuid,
  local_date date,
  timezone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select ds.user_id, ds.local_date, p.timezone
  from public.daily_scores ds
  join public.profiles p on p.id = ds.user_id
  where ds.status = 'provisional'
    -- `(local_date + 1)::timestamp at time zone tz` is the UTC instant of the
    -- user's NEXT local midnight — the same value dayEndUtc() computes in
    -- kairo-core. Adding two hours gives the §12 grace window, which lets late
    -- background-delivery syncs land before the result is locked.
    and now() >= ((ds.local_date + 1)::timestamp at time zone p.timezone)
                 + interval '2 hours'
  -- Oldest first, so a backlog drains in the order days actually happened.
  order by ds.local_date, ds.user_id
  limit greatest(p_limit, 0);
$$;

comment on function public.finalizable_days(integer) is
  'Provisional days whose per-user local midnight passed more than two hours ago.';

-- Cron only. No client has any reason to ask which days are ready to close.
revoke execute on function public.finalizable_days(integer) from public, anon, authenticated;

-- goal_window_scores must return every participant, scored or not.
--
-- The first version inner-joined `daily_scores`, so a member with no scored day
-- inside the window did not appear in the result at all. On a squad goal that is
-- actively misleading: §8's shared goals are "everyone must hit it", and a
-- roster that silently omits the people who have not started yet hides exactly
-- the information the mechanic exists to show. Observed on device — a 3-member
-- squad goal rendered one standing and dropped the member list entirely.
--
-- `squad_leaderboard` already made this mistake impossible for the board, and
-- 20260807100200's own comment spells out why: every version of it reaches
-- `daily_scores` by LEFT JOIN, so a member who has not moved appears with
-- `total = 0` rather than being absent. Same rule, same reason.
--
-- A scoreless participant now comes back as one row with `local_date`, `total`
-- and `status` all NULL. The caller drops those rows when summing days and keeps
-- the participant — which is why the name has to come from here rather than from
-- the client reading `goal_participants`: `profiles` is owner-readable only, so
-- a squadmate cannot look up another member's character name for itself.

begin;

drop function if exists public.goal_window_scores(uuid, uuid);

create function public.goal_window_scores(
  p_goal_id uuid,
  p_as_user uuid default null
)
returns table (
  user_id uuid,
  character_name text,
  -- Null for a participant with no scored day inside the window. The caller
  -- treats such a row as "this person is on the goal and has nothing yet".
  local_date date,
  total integer,
  status public.day_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- auth.uid() wins whenever it exists; the reverse order would be an
  -- impersonation grant. See 20260810110000.
  v_user uuid := coalesce((select auth.uid()), p_as_user);
  v_goal public.goals;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_goal from public.goals where id = p_goal_id;
  if not found then
    raise exception 'no such goal' using errcode = '42501';
  end if;

  -- The same predicate the RLS policies use, not a restatement of it.
  if not public.can_see_goal(p_goal_id, v_user) then
    raise exception 'not a participant in this goal' using errcode = '42501';
  end if;

  return query
  select
    gp.user_id,
    p.character_name,
    ds.local_date,
    ds.total,
    ds.status
  from public.goal_participants gp
  join public.profiles p on p.id = gp.user_id
  -- LEFT JOIN, and the date bound belongs in the ON clause rather than a WHERE:
  -- moved to WHERE it would filter out the null-extended rows this exists to
  -- produce, quietly restoring the inner-join behaviour.
  left join public.daily_scores ds
    on ds.user_id = gp.user_id
   and ds.local_date between v_goal.starts_on and v_goal.ends_on
  where gp.goal_id = p_goal_id
  order by gp.user_id, ds.local_date nulls first;
end;
$$;

comment on function public.goal_window_scores(uuid, uuid) is
  'Per-participant, per-day score totals inside a goal window. Every participant appears, scored or not — a scoreless one returns a single row with null local_date/total/status. Rows only; all goal arithmetic lives in kairo-core (deviation #18). p_as_user names the viewer for JWT-less callers and is ignored when auth.uid() is set. No argument exposes raw steps, hourly movement or per-stat points.';

revoke execute on function public.goal_window_scores(uuid, uuid) from public, anon;
grant execute on function public.goal_window_scores(uuid, uuid) to authenticated;

commit;

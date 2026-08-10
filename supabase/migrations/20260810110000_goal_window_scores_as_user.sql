-- goal_window_scores gains a viewer the cron can name.
--
-- `finalize-days` is where goals latch, and it runs as the service role with no
-- JWT — so `auth.uid()` is null and the guard added in 20260810100000 refuses it.
-- The symptom was silent by design: the goal pass is wrapped so a goal failure
-- cannot stop a day from closing, so the day finalized, `goalsCompleted` came
-- back empty, and the only trace was a `goal_settle_failed` app_event reading
-- "authentication required".
--
-- This is the same problem `squad_leaderboard` already solved in
-- 20260807110400, and the same fix. It should have been written this way the
-- first time; that migration's header describes the identical failure for
-- `dispatch-notifications`.
--
-- **p_as_user is honoured only when the caller has no JWT.** Written as
-- `coalesce((select auth.uid()), p_as_user)` and deliberately not the other way
-- round: `coalesce(p_as_user, auth.uid())` would let any authenticated client
-- read a goal as somebody else. The visibility check still applies to whoever
-- ends up being the viewer, so this is a cron affordance, not an impersonation
-- grant.
--
-- Dropped and recreated because a defaulted parameter creates a SECOND overload
-- rather than replacing the first, and two projections with the same privacy
-- surface is how one of them drifts. Dropping resets EXECUTE to PUBLIC, so the
-- revoke/grant at the bottom is load-bearing.

begin;

-- can_see_goal takes the same treatment, for the same reason: it is the single
-- visibility predicate, and the RPC below has to be able to ask it about a
-- viewer that auth.uid() cannot supply.
--
-- The three policies are dropped FIRST. A policy that names a function is a
-- dependency on it, so dropping the function while they exist fails with
-- "cannot drop function can_see_goal(uuid) because other objects depend on it" —
-- and `drop ... cascade` would silently take the policies with it, leaving three
-- RLS-enabled tables with no SELECT policy at all. That reads as "the goals
-- feature returns nothing" rather than as an error.
drop policy if exists goals_select_visible             on public.goals;
drop policy if exists goal_participants_select_visible on public.goal_participants;
drop policy if exists goal_completions_select_visible  on public.goal_completions;

drop function if exists public.can_see_goal(uuid);

create function public.can_see_goal(p_goal_id uuid, p_as_user uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- A participant always sees their own goal. A squad goal is additionally
  -- visible to the whole squad, including members not on the frozen roster:
  -- they can see what their squad committed to.
  with viewer as (select coalesce((select auth.uid()), p_as_user) as id)
  select exists (
    select 1 from public.goal_participants gp, viewer v
    where gp.goal_id = p_goal_id and gp.user_id = v.id
  ) or exists (
    select 1 from public.goals g
    join public.squad_members sm on sm.squad_id = g.squad_id
    cross join viewer v
    where g.id = p_goal_id and sm.user_id = v.id
  );
$$;

comment on function public.can_see_goal(uuid, uuid) is
  'The one goal-visibility rule. SECURITY DEFINER to break the goals/goal_participants policy recursion; called by both policies and by goal_window_scores(). p_as_user names the viewer for JWT-less callers (finalize-days) and is ignored when auth.uid() is set.';

revoke execute on function public.can_see_goal(uuid, uuid) from public, anon;
grant execute on function public.can_see_goal(uuid, uuid) to authenticated;

-- Recreated against the new signature. The one-argument call still resolves:
-- p_as_user defaults to null, which is exactly what a client caller passes.
create policy goals_select_visible on public.goals
for select to authenticated
using (public.can_see_goal(id));

create policy goal_participants_select_visible on public.goal_participants
for select to authenticated
using (user_id = (select auth.uid()) or public.can_see_goal(goal_id));

create policy goal_completions_select_visible on public.goal_completions
for select to authenticated
using (user_id = (select auth.uid()) or public.can_see_goal(goal_id));

-- ---------------------------------------------------------------------------
-- goal_window_scores
-- ---------------------------------------------------------------------------

drop function if exists public.goal_window_scores(uuid);

create function public.goal_window_scores(
  p_goal_id uuid,
  p_as_user uuid default null
)
returns table (
  user_id uuid,
  character_name text,
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
  -- auth.uid() wins whenever it exists. See the header: the reverse order would
  -- be an impersonation grant.
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

  -- The same predicate the RLS policies use, not a restatement of it. This
  -- function is SECURITY DEFINER so RLS is bypassed and the check has to be
  -- explicit — but it must never be a *second* copy of the rule.
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
  join public.daily_scores ds
    on ds.user_id = gp.user_id
   and ds.local_date between v_goal.starts_on and v_goal.ends_on
  where gp.goal_id = p_goal_id
  order by gp.user_id, ds.local_date;
end;
$$;

comment on function public.goal_window_scores(uuid, uuid) is
  'Per-participant, per-day score totals inside a goal window. Rows only — all goal arithmetic lives in kairo-core (deviation #18). p_as_user names the viewer for JWT-less callers (finalize-days) and is ignored when auth.uid() is set. No argument exposes raw steps, hourly movement or per-stat points.';

revoke execute on function public.goal_window_scores(uuid, uuid) from public, anon;
grant execute on function public.goal_window_scores(uuid, uuid) to authenticated;

commit;

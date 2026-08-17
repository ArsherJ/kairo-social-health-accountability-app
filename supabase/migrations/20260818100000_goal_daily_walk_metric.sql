-- Goals can be measured in Daily Walks (design 2026-08-15 §10).
--
-- `goals.metric` already existed with `check (metric = 'daily_score')` — pinned
-- to one value "widenable at V1 without a type change", which is exactly what
-- this is. A check rather than an enum for that reason, so this is an ordinary
-- transactional migration.
--
-- The new value reaches no raw data. `walk_cleared` below is derived from
-- `daily_scores.tiers`, which `squad_leaderboard()` already returns to
-- squadmates — so a squad goal's projection carries nothing it did not carry
-- before. Reading `health_buckets` here would produce an identical screen and
-- breach §5; do not.

begin;

alter table public.goals drop constraint goals_metric_check;

alter table public.goals
  add constraint goals_metric_check
  check (metric in ('daily_score', 'daily_walk'));

comment on column public.goals.metric is
  'What the goal is measured in. daily_score sums daily_scores.total; daily_walk counts days that cleared the Daily Walk (tiers->>''AGI'' = ''gold''). A daily_walk consistency goal stores target = 1 as a sentinel, because the column requires a positive value and the bar is a boolean. Mirrored as GoalMetric in packages/kairo-core/src/goal.ts.';

-- goal_window_scores gains walk_cleared.
--
-- Fourth recreate of this function (20260810110000, 20260810120000,
-- 20260810130000). DROP then CREATE, not CREATE OR REPLACE: Postgres refuses to
-- replace a function whose `returns table` shape changed. The grants go with it
-- and have to be re-issued below, which is why they are repeated rather than
-- assumed.
--
-- **The date bound stays in the ON clause.** Deviation #20 is the whole reason:
-- moving it to WHERE filters out the null-extended rows a LEFT JOIN produces and
-- silently restores an inner join, which drops a participant who has not scored
-- from a roster whose entire point is who has and has not hit it.
drop function public.goal_window_scores(uuid, uuid);

create function public.goal_window_scores(p_goal_id uuid, p_as_user uuid default null)
returns table (
  user_id uuid,
  character_name text,
  local_date date,
  total integer,
  status public.day_status,
  walk_cleared boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- `auth.uid()` first, `p_as_user` only as the fallback. The order is
  -- load-bearing: a signed-in caller must never be able to name somebody else.
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

  if not public.can_see_goal(p_goal_id, v_user) then
    raise exception 'not a participant in this goal' using errcode = '42501';
  end if;

  return query
  select
    gp.user_id,
    p.character_name,
    ds.local_date,
    ds.total,
    ds.status,
    -- coalesce, not a bare comparison: the LEFT JOIN below null-extends a
    -- participant with no scored day, and `null` there would arrive at
    -- kairo-core as a missing boolean rather than as "did not clear".
    coalesce(ds.tiers->>'AGI' = 'gold', false) as walk_cleared
  from public.goal_participants gp
  join public.profiles p on p.id = gp.user_id
  left join public.daily_scores ds
    on ds.user_id = gp.user_id
   and ds.local_date >= v_goal.starts_on
   -- An open-ended goal has no upper bound; every day from the start counts.
   and (v_goal.ends_on is null or ds.local_date <= v_goal.ends_on)
  where gp.goal_id = p_goal_id
  order by gp.user_id, ds.local_date;
end;
$$;

comment on function public.goal_window_scores(uuid, uuid) is
  'Per-participant, per-day score totals inside a goal window, plus whether each day cleared the Daily Walk. Rows only — all goal arithmetic lives in kairo-core (deviation #18). LEFT JOIN so a scoreless participant still appears (deviation #20). walk_cleared is derived from the stored tier, the same figure squad_leaderboard() already projects; no argument exposes raw steps, hourly movement or per-stat points.';

revoke execute on function public.goal_window_scores(uuid, uuid) from public, anon;
grant execute on function public.goal_window_scores(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_goal learns the metric
-- ---------------------------------------------------------------------------
--
-- Without this the widened CHECK above is unreachable: `authenticated` holds
-- only SELECT and UPDATE(title, description) on `goals`, so `create_goal` is
-- the only way a row is ever written and it would keep taking the column
-- default. A widened constraint with no way to write the new value is the same
-- class of half-shipped change as a migration without its function redeploy.
--
-- Dropped and recreated, not replaced: adding a parameter with a DEFAULT to a
-- function that already has defaults creates an *ambiguous overload* rather
-- than a replacement, and PostgREST would then fail to resolve the call. Same
-- reason `create_squad(text)` was dropped when `p_program` arrived, and the
-- same reason this function was already dropped once for `p_description`.
--
-- `p_metric` goes **last**, after the existing defaulted parameters, so every
-- current positional argument keeps its place and an un-migrated caller gets
-- `daily_score` — the value it was already getting from the column default.

drop function public.create_goal(text, text, text, integer, date, date, smallint, uuid, smallint);

create function public.create_goal(
  p_title text,
  p_description text,
  p_kind text,
  p_target integer,
  p_starts_on date,
  p_ends_on date,
  p_required_days smallint default null,
  p_squad_id uuid default null,
  p_required_members smallint default null,
  p_metric text default 'daily_score'
)
returns public.goals
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_goal public.goals;
  v_members integer;
  v_required smallint;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'complete onboarding before creating a goal'
      using errcode = '42501';
  end if;

  if p_squad_id is not null then
    if not exists (
      select 1 from public.squad_members
      where squad_id = p_squad_id and user_id = v_user
    ) then
      raise exception 'not a member of this squad' using errcode = '42501';
    end if;

    select count(*) into v_members
    from public.squad_members where squad_id = p_squad_id;

    -- Default to "everyone", which is what §8 means by the phrase. Clamped so a
    -- caller cannot create a goal that is unwinnable from the first second.
    v_required := least(greatest(coalesce(p_required_members, v_members), 1), v_members);
  end if;

  insert into public.goals (
    squad_id, created_by, title, description, kind, metric, target,
    required_days, required_members, starts_on, ends_on
  )
  values (
    p_squad_id, v_user, btrim(p_title),
    -- Normalised here as well as validated by the CHECK: a client sending a
    -- string of spaces should store NULL, not be rejected.
    nullif(btrim(coalesce(p_description, '')), ''),
    p_kind,
    -- coalesce, not a bare pass-through: an explicit NULL from a client would
    -- violate the NOT NULL rather than falling back to the column default,
    -- which a defaulted parameter otherwise implies it would.
    coalesce(p_metric, 'daily_score'),
    p_target,
    case when p_kind = 'consistency' then p_required_days end,
    v_required,
    p_starts_on, p_ends_on
  )
  returning * into v_goal;

  -- Freeze the roster in the same transaction that creates the goal, so there
  -- is no instant where a squad goal exists with nobody on it.
  if p_squad_id is null then
    insert into public.goal_participants (goal_id, user_id)
    values (v_goal.id, v_user);
  else
    insert into public.goal_participants (goal_id, user_id)
    select v_goal.id, sm.user_id
    from public.squad_members sm
    where sm.squad_id = p_squad_id;
  end if;

  return v_goal;
end;
$$;

comment on function public.create_goal(text, text, text, integer, date, date, smallint, uuid, smallint, text) is
  'The only way a goal is created. Validates squad membership and freezes the participant roster in one transaction. p_ends_on may be NULL for an open-ended cumulative goal. p_metric defaults to daily_score; a daily_walk consistency goal passes target = 1 as a sentinel, since the column requires a positive value and the bar is a boolean.';

revoke execute on function public.create_goal(text, text, text, integer, date, date, smallint, uuid, smallint, text)
  from public, anon;
grant execute on function public.create_goal(text, text, text, integer, date, date, smallint, uuid, smallint, text)
  to authenticated;

commit;

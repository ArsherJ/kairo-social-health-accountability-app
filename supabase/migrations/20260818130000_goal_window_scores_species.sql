-- The goal roster shows each participant's animal (deviation #40).
--
-- `squad_leaderboard()` already projects `profiles.species` to squadmates, and
-- the argument that made that safe is unchanged here: the value is cosmetic,
-- it is chosen rather than measured, and it cannot be inverted into steps, a
-- pace or an hour of the day. It reaches nobody new either — `can_see_goal()`
-- still gates the whole function, so the audience is exactly the participants
-- who already receive each other's `character_name` from it.
--
-- Without this the roster cannot render the choice at all: `profiles` is
-- owner-readable (the row carries height, weight and birth year), so a
-- participant's species is reachable only through a projection, and this is
-- the goal screen's only one.

begin;

-- Fifth recreate of this function (20260810110000, 20260810120000,
-- 20260810130000, 20260818100000). DROP then CREATE, not CREATE OR REPLACE:
-- Postgres refuses to replace a function whose `returns table` shape changed.
-- The grants go with it and are re-issued below rather than assumed.
--
-- `species` is added **last**, the same rule `squad_leaderboard()` followed, so
-- every existing positional consumer keeps its column.
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
  walk_cleared boolean,
  species text
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
    coalesce(ds.tiers->>'AGI' = 'gold', false) as walk_cleared,
    -- No coalesce here, and that is the opposite decision to `walk_cleared`
    -- one line up, deliberately: null means "never chose one" and the roster
    -- draws the initial disc for it. A default species would put an animal
    -- nobody picked beside their name.
    p.species
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
  'Per-participant, per-day score totals inside a goal window, plus whether each day cleared the Daily Walk and which species the participant plays as. Rows only — all goal arithmetic lives in kairo-core (deviation #18). LEFT JOIN so a scoreless participant still appears (deviation #20). walk_cleared is derived from the stored tier and species is the cosmetic character choice (deviation #40), both already projected to squadmates by squad_leaderboard(); no argument exposes raw steps, hourly movement or per-stat points.';

revoke execute on function public.goal_window_scores(uuid, uuid) from public, anon;
grant execute on function public.goal_window_scores(uuid, uuid) to authenticated;

commit;

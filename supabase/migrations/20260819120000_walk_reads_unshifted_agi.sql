-- The Daily Walk reads the UNSHIFTED AGI ladder.
--
-- The three-stat switch made AGI's thresholds movable: `spreadShift` lowers
-- them by 5% per active hour beyond three, capped at 25%, so AGI Gold can
-- arrive at 7,500 steps instead of 10,000. `daily_scores.tiers->>'AGI'` stores
-- that SHIFTED tier, because it is what scored the day.
--
-- `walk_cleared` was reading it, which silently made the Daily Walk baseline
-- scale with the user — the one thing CLAUDE.md says it must never do, and the
-- reason `DAILY_STEP_BASELINE` is derived from `THRESHOLDS.AGI.gold` rather
-- than written as a literal. A `daily_walk` consistency goal LATCHES, so this
-- was permanent once it fired.
--
-- `sync-plan.ts` now also writes `tiers->>'AGI_base'`, the same ladder with the
-- shift removed. This function reads that, falling back to `AGI` for rows
-- written before the switch (no shift existed then, so the two agree).
--
-- Nothing else about the function changes: same signature, same row shape, same
-- grants. Only the `walk_cleared` expression moves.

begin;

CREATE OR REPLACE FUNCTION public.goal_window_scores(p_goal_id uuid, p_as_user uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, character_name text, local_date date, total integer, status day_status, walk_cleared boolean, species text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- `AGI_base`, the UNSHIFTED ladder — never `AGI`, which is the scoring
    -- tier. The spread shift can bring AGI to gold at 7,500 steps, and the
    -- Daily Walk baseline is a public-health number that must never scale
    -- with the user. This feeds a consistency goal that LATCHES: a wrong
    -- card re-renders, a latch is permanent.
    --
    -- Rows scored before the three-stat switch carry no `AGI_base` key, and
    -- need none — no shift existed then, so their `AGI` *is* the unshifted
    -- ladder. Falling back to it is correct for that era, not lenient.
    --
    -- The outer coalesce is a separate concern and still required: the LEFT
    -- JOIN below null-extends a participant with no scored day, and `null`
    -- there would arrive at kairo-core as a missing boolean rather than as
    -- "did not clear".
    coalesce(
      coalesce(ds.tiers->>'AGI_base', ds.tiers->>'AGI') = 'gold',
      false
    ) as walk_cleared,
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
$function$;

comment on function public.goal_window_scores(uuid, uuid) is
  'Per-participant, per-day score totals inside a goal window, plus whether each day cleared the Daily Walk. Rows only — all goal arithmetic lives in kairo-core (deviation #18). LEFT JOIN so a scoreless participant still appears (deviation #20). walk_cleared is derived from the stored UNSHIFTED tier (tiers->>''AGI_base'', falling back to ''AGI'' for pre-three-stat rows), never the shifted scoring tier — the Daily Walk baseline must not move with the user. No argument exposes raw steps, hourly movement or per-stat points.';

revoke execute on function public.goal_window_scores(uuid, uuid) from public, anon;
grant execute on function public.goal_window_scores(uuid, uuid) to authenticated;

commit;

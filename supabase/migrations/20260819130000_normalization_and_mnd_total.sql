-- Normalization becomes readable, and Mind gets its lifetime rollup.
--
-- `normalization_factor` is stored rather than derived because
-- squad_leaderboard() re-sums the per-stat columns to weight them and has no
-- other route to the figure — and because DailyScore already reports it for
-- exactly this reason: it is the one number that explains why two users with
-- identical steps and kcal scored differently.
--
-- Default 1.000 is the honest reading for every row written before deviation
-- #41: nothing was normalized then, and the replay in Task 7 rewrites them all
-- anyway. numeric(4,3) holds 1.000 and 1.500 exactly; a float would make the
-- SQL/TS differential test depend on platform rounding.
--
-- `mnd_total` matches agi_total/str_total and the CoreStat id. The score column
-- stays `mind_points` and is NOT renamed: renaming a column an Edge Function
-- writes is a deploy-ordering hazard, and the mnd/mind split has already cost
-- one silent bug (useDominantStat building `mnd_points` by string).

begin;

alter table public.daily_scores
  add column if not exists normalization_factor numeric(4,3) not null default 1.000;

comment on column public.daily_scores.normalization_factor is
  'What stat points were multiplied by (§2): 3.0 / earnable stats. 1.000 for a wearable user, 1.500 phone-only. Stored because squad_leaderboard() re-sums the per-stat columns and cannot otherwise reach it. Rows predating deviation #41 carry the 1.000 default, which is what they were actually scored at.';

alter table public.profiles
  add column if not exists mnd_total integer not null default 0;

comment on column public.profiles.mnd_total is
  'Lifetime sum of daily_scores.mind_points, maintained by recalculate_user_xp(). Spelled mnd_ to match agi_total/str_total and the CoreStat id; the score column is mind_points and is deliberately not renamed.';

-- ---------------------------------------------------------------------------
-- recalculate_user_xp gains one more sum
-- ---------------------------------------------------------------------------
--
-- Same shape as the agi_total/str_total/end_total/vit_total rollup added in
-- 20260810150000_stat_rollups.sql: one pass over daily_scores, a full
-- recompute rather than an increment, and the IS DISTINCT FROM guard extended
-- by exactly the one new column. end_total and vit_total are left untouched
-- here on purpose — Task 5 owns their removal, and dropping them in this task
-- would break the tasks in between.

create or replace function public.recalculate_user_xp(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_xp     integer;
  v_agi    integer;
  v_str    integer;
  v_end    integer;
  v_vit    integer;
  v_mnd    integer;
  v_level  integer;
begin
  select
    coalesce(sum(xp_awarded), 0),
    coalesce(sum(agi_points), 0),
    coalesce(sum(str_points), 0),
    coalesce(sum(end_points), 0),
    coalesce(sum(vit_points), 0),
    coalesce(sum(mind_points), 0)
  into v_xp, v_agi, v_str, v_end, v_vit, v_mnd
  from public.daily_scores
  where user_id = p_user_id;

  v_xp := v_xp + coalesce(
    (select sum(xp_awarded) from public.goal_completions where user_id = p_user_id),
    0
  );

  -- Contributes to total_xp only, like goal XP and for the same reason: a
  -- cleared challenge is not activity in a stat, and folding it into one would
  -- let it inflate an ability the user never trained.
  v_xp := v_xp + coalesce(
    (select sum(xp_awarded) from public.challenge_completions where user_id = p_user_id),
    0
  );

  v_level := floor(sqrt(v_xp::numeric / 25)) + 1;

  -- Still guarded by IS DISTINCT FROM across every column, so a sync that moved
  -- nothing writes nothing and the profiles realtime channel stays quiet.
  update public.profiles
  set total_xp  = v_xp,
      level     = v_level,
      agi_total = v_agi,
      str_total = v_str,
      end_total = v_end,
      vit_total = v_vit,
      mnd_total = v_mnd
  where id = p_user_id
    and (total_xp  is distinct from v_xp
      or level     is distinct from v_level
      or agi_total is distinct from v_agi
      or str_total is distinct from v_str
      or end_total is distinct from v_end
      or vit_total is distinct from v_vit
      or mnd_total is distinct from v_mnd);
end;
$function$;

revoke execute on function public.recalculate_user_xp(uuid) from public, anon, authenticated;

commit;

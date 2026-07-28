-- Anti-cheat corroboration columns, and XP/level as a derived rollup.

-- ---------------------------------------------------------------------------
-- Corroborating signals on the hourly bucket
-- ---------------------------------------------------------------------------

-- The velocity flag (§5) must be recomputable from stored data alone. Without
-- these, suppression would depend on transient fields in a sync request, and a
-- re-evaluation months later could not reproduce the original verdict.
--
-- The flag is social, never punitive: it is shown to the squad and never bans
-- anyone or changes a score. That asymmetry is why suppression is generous —
-- accusing a real runner in front of their barkada is worse than missing a
-- cheater.
alter table public.health_buckets
  add column had_workout boolean not null default false,
  add column elevated_heart_rate boolean not null default false;

comment on column public.health_buckets.had_workout is
  'HealthKit logged a workout overlapping this hour. Suppresses the velocity flag — an indoor treadmill run has no GPS distance to corroborate it.';

-- ---------------------------------------------------------------------------
-- XP and level as a rollup of daily scores
-- ---------------------------------------------------------------------------

-- profiles.total_xp is never incremented. It is recomputed as the sum of
-- daily_scores.xp_awarded, which makes the whole pipeline idempotent: a
-- re-sync, an Apple step revision, or a cron retry recomputes one day's
-- xp_awarded and the total simply follows. An increment-based design would
-- double-count on every retry.
--
-- Level is derived, mirroring levelForXp() in @kairo/core:
--   level = floor(sqrt(total_xp / 25)) + 1
-- Duplicated here only so the column is always consistent even if a row is
-- touched outside the Edge Functions; kairo-core remains the source of truth.
create or replace function public.recalculate_user_xp(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  select coalesce(sum(xp_awarded), 0) into v_total
  from public.daily_scores
  where user_id = p_user_id;

  update public.profiles
  set total_xp = v_total,
      level = floor(sqrt(v_total::numeric / 25)) + 1
  where id = p_user_id
    and (total_xp is distinct from v_total
         or level is distinct from floor(sqrt(v_total::numeric / 25)) + 1);
end;
$$;

create or replace function public.daily_scores_xp_rollup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_user_xp(old.user_id);
    return old;
  end if;

  -- Only the XP column can move the total, so skip the recompute when a score
  -- update leaves it unchanged. Score rows are rewritten on every sync.
  if tg_op = 'UPDATE' and new.xp_awarded = old.xp_awarded then
    return new;
  end if;

  perform public.recalculate_user_xp(new.user_id);
  return new;
end;
$$;

create trigger daily_scores_xp_rollup_trigger
after insert or update or delete on public.daily_scores
for each row execute function public.daily_scores_xp_rollup();

revoke execute on function public.recalculate_user_xp(uuid) from public, anon, authenticated;

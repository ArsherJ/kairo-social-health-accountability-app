-- Challenges — the personal difficulty curve (roadmap deviation #33).
--
-- Spec: docs/superpowers/specs/2026-08-15-solo-mode-walk-strength-run-design.md
-- §7.
--
-- A Challenge's target moves **as the user moves** — the median of their own
-- recent qualifying sessions, nudged ~3%. That is deliberately the opposite of
-- a Goal, whose target is fixed at creation because changing it mid-window
-- would silently re-grade every day already counted (§8). A different concept,
-- not a GoalKind variant: `goal.ts` is untouched and `challenge.ts` is a
-- sibling.
--
-- **The challenge itself is derived and stored nowhere.** It is a pure function
-- of qualifying sessions strictly before the day being judged. Only the
-- *completion* is stored, below. That is what makes a retroactive HealthKit
-- revision flow through for free, the same property that made goal progress a
-- read-time projection (deviation #18).
--
-- Scoring is untouched: `computeDailyScore`, `TIER_POINTS`, `THRESHOLDS`,
-- `daily_scores` and score replay never learn this exists. A run still earns
-- AGI through its steps; pace never enters `daily_scores`. Clearing a challenge
-- adding points to that day was the rejected alternative — it would make a
-- stored score depend on a per-user moving target, so replaying a day would
-- need to know what the user's baseline was at the time.

begin;

-- ---------------------------------------------------------------------------
-- 1. Opt-in, per area
-- ---------------------------------------------------------------------------
--
-- Off by default, so nobody meets a permanently unmet card for something they
-- do not do. A non-runner never has a Run challenge; the day they start, they
-- turn it on.

alter table public.profiles
  add column trains_run      boolean not null default false,
  add column trains_strength boolean not null default false;

comment on column public.profiles.trains_run is
  'Opted into the Run challenge. Off by default — see the solo-mode design §7.9. The hook a Routine attaches to later.';
comment on column public.profiles.trains_strength is
  'Opted into the Strength challenge. See trains_run.';

-- **The grant is the trap.** `profiles` UPDATE is granted per column, and a
-- column-level REVOKE against an existing table-level GRANT is silently a
-- no-op in Postgres. So the table grant is revoked and the full allowed column
-- list is re-granted, including the two new ones. Getting this wrong fails
-- open, not closed.
--
-- The list is 20260811120000's, verbatim, plus the two new columns. Copying it
-- forward is the cost of the revoke/re-grant dance, and the reason to diff it
-- against that migration rather than retyping it from memory.
--
-- Deliberately still absent, and each for its own reason: `total_xp`, `level`
-- and the four `*_total` rollups are derived, so a client that could write them
-- could mint an ability rating it never earned; `is_legendary` decides squad
-- capacity; and **`has_wearable` is server-observed** — `sync-health` sets it
-- from the data it receives, and a client that could set it would be claiming a
-- capability rather than demonstrating one.
revoke update on public.profiles from anon, authenticated;
grant update (
  character_name,
  character_body,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  exclude_from_recap,
  trains_run,
  trains_strength
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The completion latch
-- ---------------------------------------------------------------------------
--
-- The primary key sets the granularity: **one clear per area per local day**.
-- Two qualifying sessions on the same day clear the same challenge once. That
-- is correct rather than stingy — the next day's challenge is already harder,
-- because both sessions have moved the median.

create table public.challenge_completions (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  area        text not null check (area in ('run', 'strength')),
  local_date  date not null,
  -- The target as it stood, so history renders what was actually cleared
  -- rather than recomputing it against a baseline that has since moved. The
  -- one piece of derived state worth storing: it is the answer to "what did I
  -- clear in March", and the trailing median can no longer produce it.
  target      jsonb not null,
  -- No DEFAULT on purpose: CHALLENGE_COMPLETION_XP in @kairo/core is the single
  -- source, and a default here would be a second copy of the number that could
  -- drift from it.
  xp_awarded  integer not null check (xp_awarded >= 0),
  created_at  timestamptz not null default now(),
  primary key (user_id, area, local_date)
);

comment on table public.challenge_completions is
  'One-way latch, service-role writes only, on conflict do nothing. A later downward revision from Apple never revokes something already cleared — the §19 rule goal_completions already follows.';

create index challenge_completions_user_idx
  on public.challenge_completions (user_id, local_date desc);

-- ---------------------------------------------------------------------------
-- 3. total_xp gains a THIRD source
-- ---------------------------------------------------------------------------
--
-- Challenge XP is deliberately NOT written into `daily_scores.xp_awarded`: a
-- rescore replays that column from tier points and would silently wipe it —
-- exactly the trap deviation #19 records for goals.
--
-- Safe for the reason the second source was safe: this is a **full recompute,
-- never an increment**, so re-syncs, revisions and cron retries stay
-- idempotent. Recreated in full because a plpgsql body cannot be patched in
-- place; only the one added `v_xp :=` block below is new.

create or replace function public.recalculate_user_xp(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_xp     integer;
  v_agi    integer;
  v_str    integer;
  v_end    integer;
  v_vit    integer;
  v_level  integer;
begin
  select
    coalesce(sum(xp_awarded), 0),
    coalesce(sum(agi_points), 0),
    coalesce(sum(str_points), 0),
    coalesce(sum(end_points), 0),
    coalesce(sum(vit_points), 0)
  into v_xp, v_agi, v_str, v_end, v_vit
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
      vit_total = v_vit
  where id = p_user_id
    and (total_xp  is distinct from v_xp
      or level     is distinct from v_level
      or agi_total is distinct from v_agi
      or str_total is distinct from v_str
      or end_total is distinct from v_end
      or vit_total is distinct from v_vit);
end;
$$;

revoke execute on function public.recalculate_user_xp(uuid) from public, anon, authenticated;

-- Mirrors `goal_completions_xp_rollup` exactly.
--
-- **It needs no deletion guard**, for a non-obvious reason worth recording:
-- during a profile cascade delete the `profiles` row is already gone by the
-- time the cascade reaches this table, so `recalculate_user_xp`'s
-- `where id = p_user_id` matches nothing and the update is a harmless no-op.
--
-- What *would* abort the statement is reaching a completion from a BEFORE
-- DELETE trigger — which is precisely why `profiles_collect_orphaned_goals`
-- must stay AFTER. Do not add a BEFORE trigger that touches this table.
create or replace function public.challenge_completions_xp_rollup()
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
  perform public.recalculate_user_xp(new.user_id);
  return new;
end;
$$;

create trigger challenge_completions_xp_rollup_trigger
after insert or update or delete on public.challenge_completions
for each row execute function public.challenge_completions_xp_rollup();

-- ---------------------------------------------------------------------------
-- 4. RLS — owner-select only, zero client writes
-- ---------------------------------------------------------------------------
--
-- `finalize-days` owns every write, as the only place a day becomes final and
-- therefore the only place a challenge completes.

alter table public.challenge_completions enable row level security;

create policy challenge_completions_select_own on public.challenge_completions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- `revoke all` then re-grant: Supabase's default privileges grant ALL on new
-- public tables, and ALL includes TRUNCATE, which RLS does not restrict.
revoke all on public.challenge_completions from anon;
revoke all on public.challenge_completions from authenticated;
grant select on public.challenge_completions to authenticated;

commit;

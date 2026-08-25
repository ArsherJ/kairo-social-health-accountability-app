-- Quests (roadmap deviation #50).
--
-- Three small things a day, on the Today tab. The quests themselves are
-- **derived, never stored** — `pickQuests()` in @kairo/core is a pure function
-- of (user id, local date, tier), so the local-midnight reset needs no job, no
-- row and no cron. Only the completion is recorded here, because it pays XP and
-- must fire exactly once.
--
-- Progress against a quest is a read-time projection over health_buckets and
-- daily_sleep, storing no number of its own — the same property event progress
-- and challenge targets already have, and for the same reason: a retroactive
-- Apple revision flows through by replay rather than by correction.
--
-- `quest_id` is opaque text on purpose. The catalogue lives in TypeScript, so a
-- new quest costs no migration; the price is that a *renamed* id orphans the
-- completions banked against it, which is why QuestDef's comment forbids reuse.
--
-- **Numbered after 20260828090000_events.sql, not before it.** Section 4 below
-- rewrites `recalculate_user_xp`, which that migration also rewrites, and both
-- the PGlite harness and the CLI apply migrations in filename order. A quests
-- migration sorting first would have its whole XP change silently overwritten
-- by Events on every fresh apply, and pass every test in this repo while doing
-- it, because the deployed database would have been correct.

begin;

-- ---------------------------------------------------------------------------
-- 1. quest_completions — the one-way latch
-- ---------------------------------------------------------------------------

create table public.quest_completions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The player's own local date. A quest belongs to a day, and days are
  -- per-user (§2) — this is not a UTC date and must never be compared to one.
  local_date date not null,
  quest_id text not null check (length(btrim(quest_id)) between 1 and 64),
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, local_date, quest_id)
);

comment on table public.quest_completions is
  'One-way latch, service-role writes only. Written by finalize-days from FINAL days, with on conflict do nothing so overlapping cron runs cannot double-pay. A later downward revision from Apple never revokes a completion (§19 rule), which is the same posture event_completions and challenge_completions take.';

comment on column public.quest_completions.quest_id is
  'An id from QUEST_CATALOGUE in packages/kairo-core/src/quest.ts. Opaque here on purpose: adding a quest costs no migration. Never reuse an id for a different bar — completions already banked against it would silently describe the wrong target.';

create index quest_completions_user_idx on public.quest_completions (user_id, local_date desc);

-- ---------------------------------------------------------------------------
-- 2. The manual tier override
-- ---------------------------------------------------------------------------
--
-- questTier()'s automatic rule keys off trailing scored days, which measures
-- engagement rather than capability — so it is wrong by construction for a
-- long-standing gentle user, and this is the correction rather than a nicety.
-- NULL means "use the automatic rule", which is what every account starts on.

alter table public.profiles
  add column quest_tier_override text
    check (quest_tier_override in ('starter', 'steady', 'strong'));

comment on column public.profiles.quest_tier_override is
  'Player-chosen quest difficulty, from Profile. NULL means questTier() decides from trailing scored days. The override wins outright — a rule that could veto it would make it a hint. finalize-days reads this column and grades against the same tier the client showed; a disagreement pays XP for a quest that was never on screen.';

-- A column-level REVOKE against a table-level GRANT is silently a no-op in
-- Postgres, so the table grant goes and the allowed columns are re-granted in
-- full. This list is 20260826090000_race_projection.sql's plus one.
revoke update on public.profiles from anon, authenticated;

grant update (
  character_name,
  character_body,
  species,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  exclude_from_recap,
  trains_run,
  trains_strength,
  squad_data_consent_at,
  quest_tier_override
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table public.quest_completions enable row level security;

create policy quest_completions_select_own on public.quest_completions
for select to authenticated
using (user_id = (select auth.uid()));

-- `revoke all` then re-grant SELECT, rather than revoking the four DML verbs.
-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on new public tables to
-- `authenticated`, and ALL includes TRUNCATE — which RLS does not restrict.
revoke all on public.quest_completions from anon;
revoke all on public.quest_completions from authenticated;
grant select on public.quest_completions to authenticated;

-- ---------------------------------------------------------------------------
-- 4. total_xp gains a fourth source
-- ---------------------------------------------------------------------------
--
-- **This body was read off the deployed database before being edited**, not
-- copied from the plan. It is a full recompute written out whole, not an
-- increment, so a source omitted here is a source dropped, and every affected
-- account's level falls on the next write. The check is one query:
--
--   ./supabase/scripts/remote-sql.sh \
--     "select prosrc from pg_proc where proname = 'recalculate_user_xp'"
--
-- Plan 4 (Events) landed first and renamed goal_completions to
-- event_completions here; challenge_completions and the three stat rollups were
-- already present. All of that is carried forward verbatim below and only
-- quest_completions is new.
--
-- Quest XP is deliberately NOT written into daily_scores.xp_awarded: a rescore
-- replays that column from tier points and would silently wipe it. That is the
-- same reason event and challenge XP each sit in their own table.
--
-- And quest XP contributes to total_xp ONLY, never to agi_total/str_total/
-- mnd_total: a cleared quest is not activity in a stat, and folding it into one
-- would inflate an ability the user never trained.

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
  v_mnd    integer;
  v_level  integer;
begin
  select
    coalesce(sum(xp_awarded), 0),
    coalesce(sum(agi_points), 0),
    coalesce(sum(str_points), 0),
    coalesce(sum(mind_points), 0)
  into v_xp, v_agi, v_str, v_mnd
  from public.daily_scores
  where user_id = p_user_id;

  -- Renamed from goal_completions and otherwise untouched. Event XP is
  -- deliberately NOT written into daily_scores.xp_awarded: a rescore replays
  -- that column from tier points and would silently wipe it.
  v_xp := v_xp + coalesce(
    (select sum(xp_awarded) from public.event_completions where user_id = p_user_id),
    0
  );

  -- Contributes to total_xp only, like event XP and for the same reason: a
  -- cleared challenge is not activity in a stat, and folding it into one would
  -- let it inflate an ability the user never trained.
  v_xp := v_xp + coalesce(
    (select sum(xp_awarded) from public.challenge_completions where user_id = p_user_id),
    0
  );

  -- The fourth source (deviation #50), on the same terms as the other two.
  v_xp := v_xp + coalesce(
    (select sum(xp_awarded) from public.quest_completions where user_id = p_user_id),
    0
  );

  v_level := floor(sqrt(v_xp::numeric / 25)) + 1;

  -- Still guarded by IS DISTINCT FROM across every column written, so a sync
  -- that moved nothing writes nothing and the profiles realtime channel stays
  -- quiet.
  update public.profiles
  set total_xp  = v_xp,
      level     = v_level,
      agi_total = v_agi,
      str_total = v_str,
      mnd_total = v_mnd
  where id = p_user_id
    and (total_xp  is distinct from v_xp
      or level     is distinct from v_level
      or agi_total is distinct from v_agi
      or str_total is distinct from v_str
      or mnd_total is distinct from v_mnd);
end;
$$;

revoke execute on function public.recalculate_user_xp(uuid) from public, anon, authenticated;

create function public.quest_completions_xp_rollup()
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

create trigger quest_completions_xp_rollup_trigger
after insert or update or delete on public.quest_completions
for each row execute function public.quest_completions_xp_rollup();

commit;

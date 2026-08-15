-- `gym` becomes `strength` (roadmap deviation #31).
--
-- Spec: docs/superpowers/specs/2026-08-15-solo-mode-walk-strength-run-design.md
-- §8, decision D3. The codebase stops carrying two words for one idea: the
-- Strength challenge landing in that spec measures workout-session calories,
-- and a squad program called `gym` beside it would name the same stat twice.
--
-- `strength` over `calisthenics` because STR rides active calories and cannot
-- tell bodyweight work from weights anyway — a narrower word would promise a
-- distinction the data cannot make.
--
-- Three surfaces move together, and the differential test in
-- supabase/tests/schema.test.ts is what proves the SQL half matches the
-- TypeScript half (PROGRAM_WEIGHTS in packages/kairo-core/src/program.ts).

begin;

-- ---------------------------------------------------------------------------
-- 1. The column: existing rows, then the constraint
-- ---------------------------------------------------------------------------
--
-- Order matters. The CHECK has to be dropped before the UPDATE, because the old
-- constraint does not admit 'strength' and the new one does not admit 'gym' —
-- so there is no ordering in which a single constraint is true throughout.

alter table public.squads
  drop constraint if exists squads_program_check;

update public.squads
   set program = 'strength'
 where program = 'gym';

alter table public.squads
  add constraint squads_program_check
    check (program in ('all_around', 'running', 'strength', 'walking'));

comment on column public.squads.program is
  'The squad''s shared game. Boosts one stat at read time in squad_leaderboard(); stored scores are program-independent (deviation #11). Fixed at creation — no UPDATE grant. Mirrored as SquadProgram in packages/kairo-core/src/program.ts.';

-- ---------------------------------------------------------------------------
-- 2. The read-time weighting
-- ---------------------------------------------------------------------------
--
-- `create or replace` with an unchanged signature, so EXECUTE grants survive
-- and no revoke/grant is needed here — contrast create_squad in
-- 20260807100100, which had to be dropped because its signature changed.
--
-- Recreated in full rather than patched: a SQL function body cannot be edited
-- in place. Every line below is the 20260809120000 version with one word
-- changed, deliberately kept verbatim otherwise so a diff shows the one change.

create or replace function public.program_weighted_total(
  p_program     text,
  p_agi         integer,
  p_str         integer,
  p_end         integer,
  p_vit         integer,
  p_consistency integer,
  p_rec         integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(
    0,
    -- Only the four stats are weighted. The consistency bonus and REC stay
    -- universal (§5): a program tilts what activity is worth, never the reward
    -- for showing up on all four stats or for sleeping.
    --
    -- The zero floor is unreachable now that every term is non-negative. It
    -- stays because weightedBoardTotal in kairo-core keeps its Math.max(0, …)
    -- and the differential test compares the two expressions — dropping it on
    -- one side only would be a divergence the test cannot see.
    --
    -- round() on numeric breaks ties away from zero, which matches JS
    -- Math.round for the non-negative values these columns hold. The literal
    -- 1.5 forces numeric arithmetic; do not "simplify" it to a float, whose
    -- tie-breaking is platform-dependent.
    round(
        p_agi * (case when p_program = 'running'  then 1.5 else 1 end)
      + p_str * (case when p_program = 'strength' then 1.5 else 1 end)
      -- END is deliberately never boosted, on any program: it rides
      -- AppleExerciseTime, which may be Watch-only in the wild (roadmap
      -- Phase 3). A program built on a stat most users cannot earn is a
      -- program nobody can win.
      + p_end * 1
      + p_vit * (case when p_program = 'walking'  then 1.5 else 1 end)
    )::integer
    + p_consistency
    + p_rec
  );
$$;

comment on function public.program_weighted_total(text, integer, integer, integer, integer, integer, integer) is
  'Read-time squad-program weighting. Mirrors PROGRAM_WEIGHTS / weightedBoardTotal in packages/kairo-core/src/program.ts — change both, and the differential test in supabase/tests/schema.test.ts will tell you if you did not.';

-- ---------------------------------------------------------------------------
-- 3. create_squad's validation list
-- ---------------------------------------------------------------------------
--
-- `create or replace` is correct here, unlike 20260807100100: the signature is
-- unchanged, so this replaces the one overload rather than adding a second.
-- Grants survive, which is why there is no revoke/grant below.

create or replace function public.create_squad(
  p_name text,
  p_program text default 'all_around'
)
returns public.squads
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_is_legendary boolean;
  v_squad public.squads;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Raise rather than fall back to 'all_around': a typo must not silently
  -- create a squad playing a different game than the founder chose.
  if p_program not in ('all_around', 'running', 'strength', 'walking') then
    raise exception 'unknown squad program: %', p_program using errcode = '22023';
  end if;

  select is_legendary into v_is_legendary
  from public.profiles where id = v_user;

  if not found then
    raise exception 'complete onboarding before creating a squad'
      using errcode = '42501';
  end if;

  insert into public.squads (name, invite_code, leader_id, max_members, program)
  values (
    btrim(p_name),
    public.generate_invite_code(),
    v_user,
    -- §7's capacity table. Mirrored in packages/kairo-core/src/squad.ts as
    -- FREE_SQUAD_MAX_MEMBERS / LEGENDARY_SQUAD_MAX_MEMBERS; change both.
    case when v_is_legendary then 15 else 6 end,
    p_program
  )
  returning * into v_squad;

  -- The squad_members trigger enforces the per-user squad cap here, so a free
  -- user who already belongs to a squad fails and the whole call rolls back.
  insert into public.squad_members (squad_id, user_id)
  values (v_squad.id, v_user);

  return v_squad;
end;
$$;

commit;

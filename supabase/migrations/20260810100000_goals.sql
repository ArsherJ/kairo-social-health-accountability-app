-- Goals (spec v1.4 §8) — the long-horizon commitment that replaced sabotage.
--
-- A goal is a target over a window of days: a running total to reach
-- (`cumulative`) or a per-day bar to clear on N of M days (`consistency`). It is
-- scored off `daily_scores.total`, the same canonical number the leaderboard
-- ranks on, which is what keeps it inside §5's privacy projection — there is
-- deliberately no goal metric that would reach raw steps, because a
-- "500,000 steps by March" goal leaks a step count through its own progress bar.
--
-- **Progress is stored nowhere.** It is projected from `daily_scores` at read
-- time (deviation #18), the same property that makes score replay safe: a day
-- Apple revises after the fact flows through for free, and no stored number can
-- drift from the scores it summarises. Only *completion* is recorded, because it
-- pays XP and must fire exactly once.
--
-- All arithmetic lives in `packages/kairo-core/src/goal.ts`. The RPC at the
-- bottom returns rows, never an aggregate — that is what keeps goal maths from
-- becoming a second implementation needing a differential test.

begin;

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),

  -- NULL means a personal goal. One table, one set of RLS rules, one
  -- projection: a squad goal differs only in who is on it.
  squad_id uuid references public.squads (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,

  title text not null check (length(btrim(title)) between 1 and 60),

  kind text not null check (kind in ('cumulative', 'consistency')),

  -- Pinned to one metric now, widenable at V1 without a type change. A check
  -- rather than an enum for exactly that reason: adding a value to an enum is a
  -- migration that cannot run inside a transaction on older Postgres.
  metric text not null default 'daily_score' check (metric = 'daily_score'),

  -- Cumulative: the total to reach. Consistency: the per-day bar.
  target integer not null check (target > 0),

  -- Consistency only, and mandatory there. The biconditional is the point: a
  -- cumulative goal carrying a required_days would be silently ambiguous about
  -- which rule applies.
  required_days smallint check (required_days > 0),
  constraint goals_required_days_iff_consistency
    check ((kind = 'consistency') = (required_days is not null)),

  -- Squad goals only, and mandatory there: N-of-M, "everyone must hit it" (§8).
  required_members smallint check (required_members > 0),
  constraint goals_required_members_iff_squad
    check ((squad_id is null) = (required_members is null)),

  starts_on date not null,
  ends_on date not null,
  constraint goals_window_ordered check (ends_on >= starts_on),

  created_at timestamptz not null default now()
);

comment on table public.goals is
  'A target over a window of local dates. Progress is never stored — it is projected from daily_scores by goal_window_scores(). Fixed after creation except for the title.';

comment on column public.goals.squad_id is
  'NULL for a personal goal. A squad goal additionally carries required_members (N-of-M).';

-- required_days must not exceed the window it lives in, or the goal is born
-- unwinnable. Expressed as a trigger rather than a CHECK because a check
-- constraint cannot span the date arithmetic and the column in a way Postgres
-- will accept as immutable.
create or replace function public.goals_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'consistency'
     and new.required_days > (new.ends_on - new.starts_on) + 1 then
    raise exception
      'required_days (%) exceeds the % day window',
      new.required_days, (new.ends_on - new.starts_on) + 1
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger goals_validate_trigger
before insert or update on public.goals
for each row execute function public.goals_validate();

create index goals_squad_idx on public.goals (squad_id) where squad_id is not null;
create index goals_window_idx on public.goals (ends_on, starts_on);

-- ---------------------------------------------------------------------------
-- goal_participants — the roster, frozen at creation
-- ---------------------------------------------------------------------------
--
-- Deliberately NOT derived from squad_members. "Everyone must hit it" is
-- meaningless if the denominator moves when somebody joins or leaves halfway
-- through the window, so the roster is captured once and never re-read from
-- membership. A personal goal has exactly one row.

create table public.goal_participants (
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (goal_id, user_id)
);

comment on table public.goal_participants is
  'Frozen at creation. Squad membership changing later does not change what the group committed to.';

create index goal_participants_user_idx on public.goal_participants (user_id);

-- ---------------------------------------------------------------------------
-- goal_completions — the one-way latch
-- ---------------------------------------------------------------------------
--
-- Progress is projected; completion is stored, because it pays XP and must fire
-- exactly once. Written only by finalize-days, from final days only, with
-- `on conflict do nothing` — that is what makes it idempotent under cron
-- overlap, the same guard the streak fold relies on.
--
-- Latching means a later downward revision from Apple never revokes a goal
-- already met. That is the rule §19 applies to streak milestones, for the same
-- reason: taking back an achievement the app already celebrated is worse than
-- the small inconsistency of keeping it.

create table public.goal_completions (
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The local date whose finalization completed the goal.
  completed_on date not null,
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  created_at timestamptz not null default now(),
  primary key (goal_id, user_id)
);

comment on table public.goal_completions is
  'One-way latch, service-role writes only. A later downward revision never revokes a completion (§19 rule).';

create index goal_completions_user_idx on public.goal_completions (user_id);

-- ---------------------------------------------------------------------------
-- total_xp rollup gains a second source
-- ---------------------------------------------------------------------------
--
-- Goal XP is deliberately NOT written into daily_scores.xp_awarded: a rescore
-- replays that column from tier points and would silently wipe it.
--
-- Extending the rollup is safe precisely because it is a full recompute and
-- never an increment — adding a second source keeps the self-correcting
-- property that makes re-syncs, revisions and cron retries all idempotent.

create or replace function public.recalculate_user_xp(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  select coalesce((select sum(xp_awarded) from public.daily_scores
                   where user_id = p_user_id), 0)
       + coalesce((select sum(xp_awarded) from public.goal_completions
                   where user_id = p_user_id), 0)
    into v_total;

  update public.profiles
  set total_xp = v_total,
      level = floor(sqrt(v_total::numeric / 25)) + 1
  where id = p_user_id
    and (total_xp is distinct from v_total
         or level is distinct from floor(sqrt(v_total::numeric / 25)) + 1);
end;
$$;

revoke execute on function public.recalculate_user_xp(uuid) from public, anon, authenticated;

create or replace function public.goal_completions_xp_rollup()
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

create trigger goal_completions_xp_rollup_trigger
after insert or update or delete on public.goal_completions
for each row execute function public.goal_completions_xp_rollup();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.goals             enable row level security;
alter table public.goal_participants enable row level security;
alter table public.goal_completions  enable row level security;

-- can_see_goal — the single visibility predicate
--
-- `SECURITY DEFINER` for a specific reason, not convenience. Written inline, the
-- `goals` policy has to read `goal_participants` and the `goal_participants`
-- policy has to read `goals` — mutual recursion, which Postgres rejects at query
-- time with "infinite recursion detected in policy". A definer function bypasses
-- RLS on both reads, so the cycle cannot form.
--
-- It also means the rule exists once. `goal_window_scores()` below calls the same
-- predicate rather than restating it, so a change to who may see a goal cannot
-- update the policy and miss the projection.
create function public.can_see_goal(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- A participant always sees their own goal. A squad goal is additionally
  -- visible to the whole squad, including members not on the frozen roster:
  -- they can see what their squad committed to.
  select exists (
    select 1 from public.goal_participants gp
    where gp.goal_id = p_goal_id and gp.user_id = (select auth.uid())
  ) or exists (
    select 1 from public.goals g
    join public.squad_members sm on sm.squad_id = g.squad_id
    where g.id = p_goal_id and sm.user_id = (select auth.uid())
  );
$$;

comment on function public.can_see_goal(uuid) is
  'The one goal-visibility rule. SECURITY DEFINER to break the goals/goal_participants policy recursion; called by both policies and by goal_window_scores().';

revoke execute on function public.can_see_goal(uuid) from public, anon;
grant execute on function public.can_see_goal(uuid) to authenticated;

create policy goals_select_visible on public.goals
for select to authenticated
using (public.can_see_goal(id));

-- Creation goes through create_goal(), which validates the window, resolves the
-- roster and freezes it in one transaction. A client INSERT could do none of
-- those things atomically.
-- Title only, and only by the creator — the grant itself is at the foot of this
-- section, after the `revoke all` that would otherwise undo it. Everything else
-- is fixed at creation: changing a target mid-window would silently re-grade
-- days already counted, the same reasoning that fixes squads.program.

create policy goals_update_own on public.goals
for update to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

create policy goal_participants_select_visible on public.goal_participants
for select to authenticated
using (user_id = (select auth.uid()) or public.can_see_goal(goal_id));

-- Co-participants see each other's completions: that is the whole point of a
-- shared goal, and it is score-derived so §5 already permits it.
create policy goal_completions_select_visible on public.goal_completions
for select to authenticated
using (user_id = (select auth.uid()) or public.can_see_goal(goal_id));

revoke all on public.goals             from anon;
revoke all on public.goal_participants from anon;
revoke all on public.goal_completions  from anon;

-- `revoke all` then re-grant, rather than revoking the four DML verbs.
--
-- Supabase's ALTER DEFAULT PRIVILEGES grants **ALL** on new public tables to
-- `authenticated`, and ALL includes TRUNCATE — which **RLS does not restrict**.
-- Revoking only insert/update/delete leaves a signed-in client holding TRUNCATE
-- on every goal in the system. It is not reachable through PostgREST, which only
-- ever issues SELECT/INSERT/UPDATE/DELETE, so this is defence in depth rather
-- than a patched hole; but the grant has no business existing.
--
-- REFERENCES and TRIGGER go the same way: neither is needed to read a goal, and
-- both let a client attach things to these tables.
--
-- NOTE: the pre-existing tables (daily_scores, health_buckets, streaks, squads)
-- still carry TRUNCATE for `authenticated` for exactly this reason. Hardening
-- them is a separate change — it touches the erasure-critical path.
revoke all on public.goals             from authenticated;
revoke all on public.goal_participants from authenticated;
revoke all on public.goal_completions  from authenticated;

grant select on public.goals             to authenticated;
grant select on public.goal_participants to authenticated;
grant select on public.goal_completions  to authenticated;
-- Re-granted after the revoke above, which took it away. The table-level revoke
-- must precede the column grant: a column-level REVOKE against a table-level
-- GRANT is silently a no-op in Postgres.
grant update (title) on public.goals to authenticated;

-- ---------------------------------------------------------------------------
-- create_goal — the only constructor
-- ---------------------------------------------------------------------------

create function public.create_goal(
  p_title text,
  p_kind text,
  p_target integer,
  p_starts_on date,
  p_ends_on date,
  p_required_days smallint default null,
  p_squad_id uuid default null,
  p_required_members smallint default null
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
    squad_id, created_by, title, kind, target,
    required_days, required_members, starts_on, ends_on
  )
  values (
    p_squad_id, v_user, btrim(p_title), p_kind, p_target,
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

comment on function public.create_goal(text, text, integer, date, date, smallint, uuid, smallint) is
  'The only way a goal is created. Validates squad membership and freezes the participant roster in one transaction.';

revoke execute on function public.create_goal(text, text, integer, date, date, smallint, uuid, smallint)
  from public, anon;
grant execute on function public.create_goal(text, text, integer, date, date, smallint, uuid, smallint)
  to authenticated;

-- ---------------------------------------------------------------------------
-- abandon_goal
-- ---------------------------------------------------------------------------
--
-- Abandoning is deliberately a different, visible act from quietly lowering the
-- bar — which is why the target is not editable and this is.

create function public.abandon_goal(p_goal_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_left integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.goal_participants
  where goal_id = p_goal_id and user_id = v_user;

  if not found then
    raise exception 'not a participant in this goal' using errcode = '42501';
  end if;

  select count(*) into v_left
  from public.goal_participants where goal_id = p_goal_id;

  -- A goal nobody is on is not a goal. Cascades into completions, which is
  -- correct: the XP rollup trigger fires per row and self-corrects.
  if v_left = 0 then
    delete from public.goals where id = p_goal_id;
  end if;
end;
$$;

revoke execute on function public.abandon_goal(uuid) from public, anon;
grant execute on function public.abandon_goal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- goal_window_scores — the projection all goal maths reads from
-- ---------------------------------------------------------------------------
--
-- Returns one row per participant per scored day inside the window. Rows, not
-- an aggregate: `evaluateGoal()` in kairo-core is the only implementation of the
-- arithmetic, and both the client and finalize-days call it (deviation #18).
--
-- **Privacy.** Modelled on squad_leaderboard: there is no argument that widens
-- this to raw steps, hourly movement, timestamps, per-stat points or anything
-- from health_buckets. It returns the same class of number the board already
-- shows — a daily score total — for people the caller already shares a goal
-- with. The recorded widening is that it returns a *series* of those totals
-- where the board returns one day; §5 protects raw steps and hourly movement,
-- not score totals, so this stays inside the rule.

create function public.goal_window_scores(p_goal_id uuid)
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
  v_user uuid := (select auth.uid());
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
  if not public.can_see_goal(p_goal_id) then
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

comment on function public.goal_window_scores(uuid) is
  'Per-participant, per-day score totals inside a goal window. Rows only — all goal arithmetic lives in kairo-core (deviation #18). No argument exposes raw steps, hourly movement or per-stat points.';

revoke execute on function public.goal_window_scores(uuid) from public, anon;
grant execute on function public.goal_window_scores(uuid) to authenticated;

commit;

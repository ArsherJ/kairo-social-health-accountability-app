-- Goals become Events (roadmap deviations #45, #48, #49).
--
-- **Reshape, do not drop.** The table already carries squad_id, created_by,
-- title, description, a widenable metric check, a starts_on/ends_on window and
-- window-ordering validation. Its RLS, its column-level grants, its XP rollup
-- and — the expensive one — its erasure triggers all work, and rebuilding those
-- on a new table would be rewriting the erasure-critical path for nothing.
--
-- Three things change in substance:
--
-- 1. **Pooled, not per-member.** required_days and required_members go, along
--    with their biconditional constraints. A squad goal was N-of-M: everyone
--    had to hit it, so a weak member was a liability. An Event sums everyone
--    into one bar, which is what makes inviting somebody a good idea.
-- 2. **Raw units, not points.** metric becomes active_kcal or distance_m, and
--    event_progress() pools health_buckets instead of projecting daily_scores.
-- 3. **The target is snapshotted at creation.** bossHp() in @kairo/core derives
--    it once; thereafter the column is a constant. A Challenge derives its
--    target on every read and that is right *there*; a target that moved
--    mid-window here would silently re-grade every day already counted.
--
-- **Legacy rows are closed out, not deleted and not grandfathered.** Spec §9
-- keeps banked goal XP, and a completion's FK holds its goal row alive — but
-- that row's kind is `cumulative`, which the new check rejects. So the table
-- gains `closed_at`, every surviving legacy row gets a timestamp, and the new
-- checks read `closed_at is not null or kind in (...)`. That is a validated
-- constraint stating the true thing: a LIVE event is a Battle or an Adventure;
-- a closed row is whatever it used to be. Every read filters closed_at is null.
--
-- SHIPS WITH: `supabase functions deploy finalize-days`. That function reads
-- and writes all three of these tables under their old names.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rename
-- ---------------------------------------------------------------------------
--
-- `alter table ... rename` carries indexes, constraints, policies, triggers and
-- grants with it. The constraint and index NAMES keep their old spelling, which
-- is why every one of them is renamed explicitly below rather than left to read
-- `goals_*` on a table called challenge_events. A half-renamed schema is how the
-- next reader concludes the rename never finished.

alter table public.goals             rename to challenge_events;
alter table public.goal_participants rename to event_participants;
alter table public.goal_completions  rename to event_completions;

alter table public.event_participants rename column goal_id to event_id;
alter table public.event_completions  rename column goal_id to event_id;

alter index goals_pkey                     rename to challenge_events_pkey;
alter index goals_squad_idx                rename to challenge_events_squad_idx;
alter index goals_window_idx               rename to challenge_events_window_idx;
alter index goal_participants_pkey         rename to event_participants_pkey;
alter index goal_participants_user_idx     rename to event_participants_user_idx;
alter index goal_completions_pkey          rename to event_completions_pkey;
alter index goal_completions_user_idx      rename to event_completions_user_idx;

alter table public.challenge_events
  rename constraint goals_created_by_fkey to challenge_events_created_by_fkey;
alter table public.challenge_events
  rename constraint goals_squad_id_fkey to challenge_events_squad_id_fkey;
alter table public.challenge_events
  rename constraint goals_title_check to challenge_events_title_check;
alter table public.challenge_events
  rename constraint goals_description_check to challenge_events_description_check;
alter table public.challenge_events
  rename constraint goals_target_check to challenge_events_target_check;

alter table public.event_participants
  rename constraint goal_participants_goal_id_fkey to event_participants_event_id_fkey;
alter table public.event_participants
  rename constraint goal_participants_user_id_fkey to event_participants_user_id_fkey;

alter table public.event_completions
  rename constraint goal_completions_goal_id_fkey to event_completions_event_id_fkey;
alter table public.event_completions
  rename constraint goal_completions_user_id_fkey to event_completions_user_id_fkey;
alter table public.event_completions
  rename constraint goal_completions_xp_awarded_check to event_completions_xp_awarded_check;

alter policy goals_select_visible              on public.challenge_events   rename to events_select_visible;
alter policy goals_update_own                  on public.challenge_events   rename to events_update_own;
alter policy goal_participants_select_visible  on public.event_participants rename to event_participants_select_visible;
alter policy goal_completions_select_visible   on public.event_completions  rename to event_completions_select_visible;

-- ---------------------------------------------------------------------------
-- 2. Close out what exists
-- ---------------------------------------------------------------------------

alter table public.challenge_events
  add column closed_at timestamptz;

comment on column public.challenge_events.closed_at is
  'When this row stopped being a live Event. NULL for a live Battle or Adventure; set for every pre-pivot Goal row, which survives only so its banked completion XP does not vanish. Every read filters `closed_at is null`; the kind and metric checks are conditional on it, so a closed row keeps whatever it used to be without needing an unvalidated constraint.';

-- Every pre-existing row is a Goal and none of them convert: per-member N-of-M
-- does not cleanly become a pooled Event, and inventing a conversion is worse
-- than a clean end (spec §9). Rows with no completion could be deleted outright
-- and are left instead, because one rule is easier to reason about than two and
-- nothing reads them either way.
update public.challenge_events set closed_at = now() where closed_at is null;

-- ---------------------------------------------------------------------------
-- 3. Reshape the columns
-- ---------------------------------------------------------------------------

alter table public.challenge_events drop constraint goals_required_days_iff_consistency;
alter table public.challenge_events drop constraint goals_required_members_iff_squad;
alter table public.challenge_events drop constraint goals_metric_check;
alter table public.challenge_events drop constraint goals_kind_check;
alter table public.challenge_events drop constraint goals_consistency_needs_end;
alter table public.challenge_events rename constraint goals_window_ordered to events_window_ordered;

-- Their column-level CHECKs (goals_required_days_check, goals_required_members_check)
-- go with the columns; nothing else references either.
alter table public.challenge_events drop column required_days;
alter table public.challenge_events drop column required_members;

-- Both kinds and both metrics ship now even though Phase 1 builds only Battle
-- (spec §11), so the migration happens ONCE rather than twice.
alter table public.challenge_events
  add constraint events_kind_check
  check (closed_at is not null or kind in ('battle', 'adventure'));

alter table public.challenge_events
  add constraint events_metric_check
  check (closed_at is not null or metric in ('active_kcal', 'distance_m'));

-- An Event always has a deadline. A Goal could be open-ended, because "reach
-- 500,000 points however long it takes" is a coherent commitment; a boss with
-- no deadline is a slowly filling bar that can never be lost, so there is
-- nothing at stake and no reason to push this week rather than next.
alter table public.challenge_events
  add constraint events_need_end
  check (closed_at is not null or ends_on is not null);

-- An Event belongs to a squad. A personal Battle is a Challenge, which already
-- exists and is a better fit; two mechanics for one thing is how a surface ends
-- up half-built.
alter table public.challenge_events
  add constraint events_need_squad
  check (closed_at is not null or squad_id is not null);

-- At most one live Battle and one live Adventure per squad (spec §5.2). A
-- partial unique index rather than a trigger: it is the cheaper statement of
-- the rule and it cannot be raced.
create unique index challenge_events_one_live_per_kind
  on public.challenge_events (squad_id, kind)
  where closed_at is null;

comment on table public.challenge_events is
  'A POOLED target over a window of local dates, for one squad (deviation #48). Progress is never stored — event_progress() pools health_buckets at read time, so a retroactive Apple revision flows through by replay. The TARGET is snapshotted at creation and is a constant thereafter (deviation #49), unlike a Challenge target, which is derived on every read. Fixed after creation except for the title.';

comment on column public.challenge_events.squad_id is
  'The squad fighting this. NOT NULL for a live Event (events_need_squad) — a personal Battle is a Challenge, which already exists on /train. NULL survives only on closed pre-pivot personal goal rows.';

comment on column public.challenge_events.created_by is
  'Who started it. NULL once that account is erased — the Event and every participant''s progress survive. Confers only the events_update_own title edit, so a NULL creator simply means nobody may rename it.';

comment on column public.challenge_events.metric is
  'What the Event counts, in raw units: active_kcal for a Battle, distance_m for an Adventure. Mirrored as EventMetric in packages/kairo-core/src/event.ts. Conditional on closed_at, so a closed row keeps its pre-pivot daily_score or daily_walk value.';

comment on column public.challenge_events.target is
  'The boss''s HP, computed by bossHp() in @kairo/core and stored VERBATIM. Snapshotted at creation and never recomputed (deviation #49) — the one place a client decides a number the server stores. Progress against it stays a read-time projection, so revisions still replay: the target is fixed, the progress is replayed.';

comment on table public.event_participants is
  'Frozen at creation. Squad membership changing later does not change what the group committed to. Every member on this roster is paid when the POOLED bar is met, contributor or not (deviation #48).';

comment on table public.event_completions is
  'One-way latch, service-role writes only. A later downward revision never revokes a completion (§19 rule). One row per participant per Event: an Event completes for the SQUAD, so the whole frozen roster is written at once.';

-- The window/required_days validation trigger has nothing left to validate:
-- required_days is gone and events_window_ordered is a plain CHECK.
drop trigger if exists goals_validate_trigger on public.challenge_events;
drop function if exists public.goals_validate();

-- ---------------------------------------------------------------------------
-- 4. Rename the machinery
-- ---------------------------------------------------------------------------

alter function public.goal_completions_xp_rollup() rename to event_completions_xp_rollup;
alter trigger goal_completions_xp_rollup_trigger on public.event_completions
  rename to event_completions_xp_rollup_trigger;

-- **The deployed body was read before this was written**, and it names more
-- than the two obvious sources: it is a full recompute of total_xp AND of the
-- three per-stat lifetime rollups, with challenge_completions as a third XP
-- term. A source omitted here is a source dropped — every affected account's
-- level and every ability rating falls on the very next write. Only the goal
-- table's NAME changes below; nothing else about this function moves.
--
--   ./supabase/scripts/remote-sql.sh \
--     "select prosrc from pg_proc where proname = 'recalculate_user_xp'"
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

-- The erasure sweep on `profiles` names the goal tables **in its body**, which
-- `alter table ... rename` does not rewrite — a plpgsql body is text, resolved
-- at execution, so a rename alone leaves this raising `relation
-- "public.goals" does not exist` the first time somebody deletes an account.
-- So it is recreated rather than renamed. (Note the function was
-- `collect_orphaned_goals`; only the TRIGGER carried the `profiles_` prefix.)
--
-- It MUST stay AFTER DELETE. Moving it BEFORE reaches a completion, which
-- updates `profiles`, which modifies the row being deleted, and Postgres aborts
-- the statement. And `created_by` stays SET NULL rather than CASCADE, so a
-- shared Event survives its author — it confers only the title-edit grant, so
-- nulling it means nobody inherits the rename right.
drop trigger if exists profiles_collect_orphaned_goals on public.profiles;
drop function if exists public.collect_orphaned_goals();

create function public.collect_orphaned_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.challenge_events e
  where e.created_by is null
    and not exists (
      select 1 from public.event_participants ep where ep.event_id = e.id
    );
  return null;
end;
$$;

comment on function public.collect_orphaned_events() is
  'Deletes Events left with neither a creator nor a participant — unreachable by can_see_event() and therefore litter. AFTER DELETE on profiles specifically: event_completions_xp_rollup updates profiles, so reaching a completion from a BEFORE trigger would modify the row being deleted and abort the statement.';

create trigger profiles_collect_orphaned_events
after delete on public.profiles
for each row execute function public.collect_orphaned_events();

-- Its body's cascade note names the old tables. A comment, but this one is the
-- map somebody reads before touching the erasure path.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Cascades: auth.users -> profiles -> daily_scores, health_buckets,
  -- daily_sleep, daily_heart, streaks, squad_members, event_participants,
  -- event_completions, notification_log; and auth.users -> device_tokens.
  -- app_events.user_id and challenge_events.created_by are SET NULL, so
  -- behavioural telemetry and other people's Events survive without naming
  -- anyone.
  delete from auth.users where id = v_user;
end;
$$;

comment on function public.delete_account() is
  'Erase the calling account. Deletes the caller''s auth.users row, which cascades to profiles and every character-scoped table; app_events and challenge_events.created_by are nulled rather than deleted. Squad leadership is reassigned first by the profiles_handle_deletion trigger. Takes no argument by design — it can only ever delete auth.uid().';

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
--
-- Unchanged in substance and restated in full because the table renames carried
-- the old grants across and a reader must be able to see what `authenticated`
-- actually holds without chasing three migrations.
--
-- The table-level revoke MUST precede the column grant: a column-level REVOKE
-- against a table-level GRANT is silently a no-op in Postgres.

revoke all on public.challenge_events   from anon, authenticated;
revoke all on public.event_participants from anon, authenticated;
revoke all on public.event_completions  from anon, authenticated;

grant select on public.challenge_events   to authenticated;
grant select on public.event_participants to authenticated;
grant select on public.event_completions  to authenticated;
grant update (title, description) on public.challenge_events to authenticated;

-- ---------------------------------------------------------------------------
-- 6. can_see_event
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER for a specific reason, not convenience. Written inline, the
-- challenge_events policy has to read event_participants and the
-- event_participants policy has to read challenge_events — mutual recursion,
-- which Postgres rejects at query time. A definer function bypasses RLS on both
-- reads, so the cycle cannot form.
--
-- Dropped and recreated under the new name rather than renamed, because the
-- policies referencing it must be recreated anyway to point at the new name.

drop policy events_select_visible             on public.challenge_events;
-- Recreated below rather than left renamed: this section restates the whole
-- visibility surface, and a policy surviving from before it is one a reader
-- has to go and look up elsewhere.
drop policy events_update_own                 on public.challenge_events;
drop policy event_participants_select_visible on public.event_participants;
drop policy event_completions_select_visible  on public.event_completions;
drop function public.can_see_goal(uuid, uuid);

create function public.can_see_event(p_event_id uuid, p_as_user uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- auth.uid() first, p_as_user only as the fallback. The order is
  -- load-bearing: a signed-in caller must never be able to name somebody else.
  with viewer as (select coalesce((select auth.uid()), p_as_user) as id)
  select exists (
    select 1 from public.event_participants ep, viewer v
    where ep.event_id = p_event_id and ep.user_id = v.id
  ) or exists (
    select 1 from public.challenge_events e
    join public.squad_members sm on sm.squad_id = e.squad_id
    cross join viewer v
    where e.id = p_event_id and sm.user_id = v.id
  );
$$;

comment on function public.can_see_event(uuid, uuid) is
  'The one event-visibility rule. SECURITY DEFINER to break the challenge_events/event_participants policy recursion; called by both policies and by event_progress(). p_as_user names the viewer for JWT-less callers (finalize-days) and is ignored when auth.uid() is set.';

revoke execute on function public.can_see_event(uuid, uuid) from public, anon;
grant execute on function public.can_see_event(uuid, uuid) to authenticated;

create policy events_select_visible on public.challenge_events
for select to authenticated
using (public.can_see_event(id));

create policy events_update_own on public.challenge_events
for update to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

create policy event_participants_select_visible on public.event_participants
for select to authenticated
using (user_id = (select auth.uid()) or public.can_see_event(event_id));

create policy event_completions_select_visible on public.event_completions
for select to authenticated
using (user_id = (select auth.uid()) or public.can_see_event(event_id));

-- ---------------------------------------------------------------------------
-- 7. create_event — the only constructor
-- ---------------------------------------------------------------------------
--
-- Dropped by EXACT ARGUMENT LIST, never `create or replace`. A surviving
-- overload fails nothing until a call site resolves to it, and PostgREST cannot
-- disambiguate two functions that differ only by defaulted parameters. This is
-- the p_metric trap, which has already cost this codebase twice.
--
-- The target arrives from the client, computed by bossHp() in @kairo/core, and
-- is written verbatim. That is deliberate and it is the one place a client
-- decides a number the server stores: reimplementing the median here would be a
-- second implementation of the arithmetic needing a differential test, which is
-- exactly what deviation #18 declined to pay for goals. The exposure is bounded
-- — a client can set an easy boss for its own squad, which costs the squad its
-- own XP and nothing else — and challenge_events_target_check bounds it further.

drop function public.create_goal(text, text, text, integer, date, date, smallint, uuid, smallint, text);
drop function public.abandon_goal(uuid);
drop function public.goal_window_scores(uuid, uuid);

create function public.create_event(
  p_title text,
  p_description text,
  p_kind text,
  p_metric text,
  p_target integer,
  p_starts_on date,
  p_ends_on date,
  p_squad_id uuid
)
returns public.challenge_events
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_event public.challenge_events;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_squad_id is null then
    raise exception 'an event belongs to a squad' using errcode = '22023';
  end if;

  if p_ends_on is null then
    raise exception 'an event needs an end date' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and user_id = v_user
  ) then
    raise exception 'not a member of this squad' using errcode = '42501';
  end if;

  -- No parameters are defaulted, on purpose. Every one of them is a decision
  -- the creation screen makes explicitly, and a defaulted parameter here is the
  -- next ambiguous overload waiting to happen.
  insert into public.challenge_events (
    squad_id, created_by, title, description, kind, metric, target, starts_on, ends_on
  )
  values (
    p_squad_id, v_user, btrim(p_title),
    -- Empty and absent are one state to the column, whose CHECK rejects a blank
    -- string — so a description started and cleared must arrive as NULL.
    nullif(btrim(coalesce(p_description, '')), ''),
    p_kind, p_metric, p_target,
    p_starts_on, p_ends_on
  )
  returning * into v_event;

  -- Freeze the roster in the same transaction that creates the event, so there
  -- is no instant where an event exists with nobody on it. Membership changing
  -- later does not change what the group committed to.
  insert into public.event_participants (event_id, user_id)
  select v_event.id, sm.user_id
  from public.squad_members sm
  where sm.squad_id = p_squad_id;

  return v_event;
end;
$$;

comment on function public.create_event(text, text, text, text, integer, date, date, uuid) is
  'The only way an Event is created. Validates squad membership and freezes the participant roster in one transaction. p_target is the boss HP computed by bossHp() in @kairo/core and is stored verbatim — snapshotted at creation (deviation #49), never recomputed. At most one live event of each kind per squad, enforced by challenge_events_one_live_per_kind. No parameter is defaulted: adding a defaulted parameter to a function that already has them is an ambiguous overload PostgREST cannot resolve.';

revoke execute on function public.create_event(text, text, text, text, integer, date, date, uuid)
  from public, anon;
grant execute on function public.create_event(text, text, text, text, integer, date, date, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 8. abandon_event
-- ---------------------------------------------------------------------------
--
-- Abandoning is deliberately a different, visible act from quietly lowering the
-- bar — which is why the target is not editable and this is.

create function public.abandon_event(p_event_id uuid)
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

  delete from public.event_participants
  where event_id = p_event_id and user_id = v_user;

  if not found then
    raise exception 'not a participant in this event' using errcode = '42501';
  end if;

  select count(*) into v_left
  from public.event_participants where event_id = p_event_id;

  -- Closed rather than deleted, so a completion already paid keeps its row and
  -- its XP. `closed_at` is what the checks and the one-live-per-kind index both
  -- key off, so closing an event frees the slot for the next one.
  if v_left = 0 then
    update public.challenge_events set closed_at = now() where id = p_event_id;
  end if;
end;
$$;

revoke execute on function public.abandon_event(uuid) from public, anon;
grant execute on function public.abandon_event(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. event_progress — the projection all event maths reads from
-- ---------------------------------------------------------------------------
--
-- Returns one row per participant per day inside the window, carrying that
-- day's RAW metric. Rows, not an aggregate: evaluateEvent() in kairo-core is
-- the only implementation of the arithmetic, and both the client and
-- finalize-days call it (deviation #18).
--
-- **Privacy.** Daily SUMS only — the hour column is never selected and never
-- grouped by, which is the difference between a total and a movement pattern.
-- No argument reaches heart rate, workout sessions, pace or timestamps.
--
-- `value` is gated the same reciprocal way squad_leaderboard()'s raw totals are
-- (deviation #47): a member's contribution is visible only when that member has
-- consented AND the viewer has. The POOLED total is not gated — you cannot
-- fight together without knowing how the fight is going, and joining an Event
-- is itself an act of participation. Known limit, recorded rather than
-- pretended away: in a two-person squad the pooled total is invertible.
--
-- **`pooled_value` is what grades an Event, precisely because it is ungated.**
-- finalize-days runs as the service role with no JWT, and the gate above keys
-- off the viewer's PROFILE rather than off the role — so a candidate who never
-- consented sees `value` NULL on every row, and grading from that column would
-- pool a squad's whole fight to zero and quietly never complete anything.

create function public.event_progress(p_event_id uuid, p_as_user uuid default null)
returns table (
  user_id uuid,
  character_name text,
  species text,
  local_date date,
  value numeric,
  pooled_value numeric,
  status public.day_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce((select auth.uid()), p_as_user);
  v_event public.challenge_events;
  v_viewer_consent boolean;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_event from public.challenge_events where id = p_event_id;
  if not found then
    raise exception 'no such event' using errcode = '42501';
  end if;

  -- The same predicate the RLS policies use, not a restatement of it. This
  -- function is SECURITY DEFINER so RLS is bypassed and the check has to be
  -- explicit — but it must never be a *second* copy of the rule.
  if not public.can_see_event(p_event_id, v_user) then
    raise exception 'not a participant in this event' using errcode = '42501';
  end if;

  -- Read once, outside the query: the viewer's half of the reciprocal gate is
  -- the same answer for every row, exactly as in squad_leaderboard().
  select p.squad_data_consent_at is not null
    into v_viewer_consent
    from public.profiles p
   where p.id = v_user;

  return query
  with contributions as (
    select
      ep.user_id                                   as uid,
      p.character_name                             as cname,
      p.species                                    as pspecies,
      p.squad_data_consent_at is not null          as pconsent,
      ds.local_date                                as ldate,
      ds.status                                    as dstatus,
      coalesce(hb.raw, 0)::numeric                 as raw
    from public.event_participants ep
    join public.profiles p on p.id = ep.user_id
    -- The date bound stays in the ON clause. Deviation #20: moving it to WHERE
    -- filters out the null-extended rows a LEFT JOIN produces and silently
    -- restores an inner join, dropping a participant who has not scored from a
    -- roster whose entire point is who has and has not contributed.
    left join public.daily_scores ds
      on ds.user_id = ep.user_id
     and ds.local_date between v_event.starts_on and v_event.ends_on
    left join lateral (
      select
        case v_event.metric
          when 'active_kcal' then coalesce(sum(b.active_kcal), 0)
          when 'distance_m'  then coalesce(sum(b.distance_m), 0)
          else 0
        end as raw
      from public.health_buckets b
      where b.user_id = ep.user_id and b.local_date = ds.local_date
    ) hb on true
    where ep.event_id = p_event_id
  )
  select
    c.uid,
    c.cname,
    c.pspecies,
    c.ldate,
    case when v_viewer_consent and c.pconsent then c.raw end,
    -- The pooled figure, repeated on every row. Ungated: it is what the bar
    -- draws and what the event IS.
    sum(c.raw) over (partition by c.ldate),
    c.dstatus
  from contributions c
  where c.ldate is not null
  order by c.ldate, c.uid;
end;
$$;

comment on function public.event_progress(uuid, uuid) is
  'Per-participant, per-day RAW metric totals inside an Event window, plus the pooled figure for each day. Rows only — all event arithmetic lives in kairo-core (deviation #18). Daily sums only: no argument exposes hourly movement, heart rate, workout sessions, pace or timestamps. `value` is behind the same reciprocal consent gate as squad_leaderboard()''s raw totals (deviation #47); `pooled_value` is not, because joining an Event is itself participation — and because grading reads the pooled column, which must not depend on the finalizing member''s own consent. p_as_user names the viewer for JWT-less callers (finalize-days) and is ignored when auth.uid() is set.';

revoke execute on function public.event_progress(uuid, uuid) from public, anon;
grant execute on function public.event_progress(uuid, uuid) to authenticated;

commit;

-- In-app account deletion.
--
-- CLAUDE.md's correction of 2026-08-11 recorded the true state: there was no
-- `delete_account()` and no deletion UI. Erasure meant deleting the `auth.users`
-- row out of band. Apple requires an in-app path for any app that creates an
-- account, so this is a submission blocker as well as a user-control one.
--
-- Almost all of the work was already done. `profiles.id` cascades from
-- `auth.users`, every character-scoped table cascades from `profiles`, and the
-- `profiles_handle_deletion` BEFORE DELETE trigger reassigns squad leadership
-- through `succeed_squad_leadership()` *before* the FK cascade fires — so
-- deleting a leader hands the squad on rather than destroying it for everyone
-- else, and a last-member squad is deleted, which is correct. What was missing
-- is a way to ask for it.

begin;

-- ---------------------------------------------------------------------------
-- A deleted author must not take everyone's goal with them
-- ---------------------------------------------------------------------------
--
-- `goals.created_by` cascaded, so erasing an account destroyed every goal that
-- account created — including a squad goal other members were part-way through.
-- Squads were protected from exactly this and goals were not; the audit for
-- this migration is what surfaced it.
--
-- SET NULL rather than a succession trigger like the squad one, because the two
-- roles are not comparable. A squad leader has powers worth inheriting: rename,
-- remove members, transfer. `created_by` confers exactly one thing — the
-- `goals_update_own` policy, which permits editing the *title* — and everything
-- else about a goal is frozen at creation by design. Succeeding it would hand
-- someone editorial control they never had, inventing an authority the original
-- design deliberately kept narrow.
--
-- Nothing else reads the column: visibility is `can_see_goal()`, progress is
-- `goal_window_scores()` over `daily_scores`, and the roster is frozen in
-- `goal_participants` at creation. So a null creator costs the goal nothing,
-- and `created_by = auth.uid()` becomes NULL — never true — which means nobody
-- inherits the rename right. That is the intended reading, not a side effect.
--
-- `app_events.user_id` already made SET NULL this schema's erasure idiom: keep
-- the row, drop the link to a person.

alter table public.goals
  alter column created_by drop not null;

alter table public.goals
  drop constraint goals_created_by_fkey;

alter table public.goals
  add constraint goals_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

comment on column public.goals.created_by is
  'Who set the goal. NULL once that account is erased — the goal and every participant''s progress survive. Confers only the goals_update_own title edit, so a NULL creator simply means nobody may rename it.';

-- ---------------------------------------------------------------------------
-- ...but a goal with nobody left on it is litter, not a survivor
-- ---------------------------------------------------------------------------
--
-- SET NULL alone would leave a *personal* goal — squad_id null, one participant,
-- the person now erased — sitting in the table forever with no creator and no
-- roster. Invisible, because `can_see_goal()` is false for everyone, but it is
-- still that user's content outliving their erasure request, which is the one
-- thing deletion has to actually mean.
--
-- This is the same rule `succeed_squad_leadership` already applies one table
-- over: hand it on if anyone remains, delete it if nobody does.
--
-- **It has to run AFTER the delete, not before**, and that is not a style
-- choice. `goal_completions_xp_rollup_trigger` fires `recalculate_user_xp()` on
-- every completion delete, which UPDATEs `profiles` — so any cleanup that
-- reaches a completion from inside the BEFORE trigger updates the very row
-- being deleted, and Postgres rejects the whole statement with "tuple to be
-- deleted was already modified by an operation triggered by the current
-- command". After the cascade, the profile is gone, the rollup updates nothing,
-- and there is nothing left to collide with.
--
-- Scoped by `created_by is null` rather than by a captured list of goal ids,
-- which the BEFORE trigger would have had to hand over somehow. It says the
-- same thing more directly: a goal with no creator *and* no participants is
-- unreachable by construction — `can_see_goal()` can never be true for it — so
-- it is litter whoever left it behind. That also makes the cleanup self-healing
-- for the out-of-band path, since `delete from auth.users` in the SQL editor
-- fires this trigger too.

create or replace function public.collect_orphaned_goals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.goals g
  where g.created_by is null
    and not exists (
      select 1 from public.goal_participants gp where gp.goal_id = g.id
    );
  return null;
end;
$$;

comment on function public.collect_orphaned_goals() is
  'Deletes goals left with neither a creator nor a participant — unreachable by can_see_goal() and therefore litter. AFTER DELETE on profiles specifically: goal_completions_xp_rollup updates profiles, so reaching a completion from a BEFORE trigger would modify the row being deleted.';

drop trigger if exists profiles_collect_orphaned_goals on public.profiles;

create trigger profiles_collect_orphaned_goals
after delete on public.profiles
for each row execute function public.collect_orphaned_goals();

-- ---------------------------------------------------------------------------
-- delete_account()
-- ---------------------------------------------------------------------------
--
-- Deletes the caller's `auth.users` row, which cascades to `profiles` and from
-- there to everything else. The trigger work above and in
-- `handle_profile_deletion` all runs inside this one statement.
--
-- SECURITY DEFINER because `auth.users` is not writable by `authenticated`, and
-- it takes no argument on purpose: the only account it can ever delete is
-- `auth.uid()`. A `p_user_id` parameter would make this the single most
-- dangerous function in the schema, one bug away from letting any signed-in
-- user erase anybody.
--
-- `set search_path = ''` for the usual reason — a SECURITY DEFINER function
-- with a mutable search_path can be redirected by a caller-controlled schema.

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
  -- daily_sleep, daily_heart, streaks, squad_members, goal_participants,
  -- goal_completions, notification_log; and auth.users -> device_tokens.
  -- app_events.user_id and goals.created_by are SET NULL, so behavioural
  -- telemetry and other people's goals survive without naming anyone.
  delete from auth.users where id = v_user;
end;
$$;

comment on function public.delete_account() is
  'Erase the calling account. Deletes the caller''s auth.users row, which cascades to profiles and every character-scoped table; app_events and goals.created_by are nulled rather than deleted. Squad leadership is reassigned first by the profiles_handle_deletion trigger. Takes no argument by design — it can only ever delete auth.uid().';

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

commit;

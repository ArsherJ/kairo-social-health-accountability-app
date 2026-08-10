-- Goals gain a description, and a window that may have no end.
--
-- Both come from hand-testing on 2026-08-10, the day after goals shipped. They
-- land in one migration because both edit `goals` and both force `create_goal`
-- to be dropped and recreated — splitting them would mean two drop/recreate
-- passes over the same function for no benefit.
--
-- **The date picker this enables overturns a recorded decision.**
-- `CreateGoalForm.tsx` argued against one: "nobody commits to *17* days, and an
-- arbitrary end date is the single most common way to create a goal whose
-- required_days cannot fit its window." The first half was a taste call and is
-- overruled; the second was a real risk, and it is still caught — by
-- `goals_validate()` below, unchanged, and by the client mirroring it. What the
-- fixed windows bought was making that error *unreachable* rather than
-- *validated*, which is a smaller thing than being unable to say "by my
-- birthday".
--
-- **Open-ended is cumulative-only, and that is the interesting constraint.**
-- "Reach 500,000 points, however long it takes" is a coherent commitment. "Clear
-- 2,500 on 25 days, however long it takes" is not a commitment at all — it can
-- never become unreachable, so `stillPossible` would be a constant, there would
-- be no elapsed fraction for the pace marker to sit at, and the goal would have
-- no failure state to make succeeding mean anything. So the CHECK forbids it
-- rather than the UI merely discouraging it.

begin;

-- ---------------------------------------------------------------------------
-- description
-- ---------------------------------------------------------------------------
--
-- The "why", where `title` is the "what". 280 rather than 60: a title has to fit
-- a card, and this never does — it appears only on the detail screen.
--
-- `is null or length(...) between 1 and 280` rather than a plain length check:
-- absent and blank must not be two different ways of saying nothing, or the
-- detail screen has to handle both. The client sends `null` for an emptied
-- field, and this is what stops a `''` slipping past it.

alter table public.goals
  add column description text
    check (description is null or length(btrim(description)) between 1 and 280);

comment on column public.goals.description is
  'Optional free text, shown only on the goal detail screen. Blank is rejected — an emptied field must arrive as NULL so absent and empty are one state.';

-- ---------------------------------------------------------------------------
-- ends_on becomes nullable
-- ---------------------------------------------------------------------------

alter table public.goals alter column ends_on drop not null;

comment on column public.goals.ends_on is
  'Inclusive end of the window, or NULL for an open-ended goal. NULL is permitted for kind = cumulative only (goals_consistency_needs_end).';

alter table public.goals drop constraint goals_window_ordered;

alter table public.goals
  add constraint goals_window_ordered
    check (ends_on is null or ends_on >= starts_on);

alter table public.goals
  add constraint goals_consistency_needs_end
    check (kind = 'cumulative' or ends_on is not null);

-- The window validation skips an open-ended goal rather than being deleted:
-- `required_days` still cannot exceed a *finite* window, and that is the check
-- the client mirrors. The early return is what makes the new NULL safe here —
-- `new.ends_on - new.starts_on` on a null end date yields null, and
-- `new.required_days > null` is null, so the IF would silently never fire and
-- the constraint would look present while enforcing nothing.
create or replace function public.goals_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ends_on is null then
    return new;
  end if;

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

-- ---------------------------------------------------------------------------
-- create_goal gains p_description
-- ---------------------------------------------------------------------------
--
-- Dropped and recreated, not replaced: adding a parameter with a DEFAULT to a
-- function that already has defaults creates an *ambiguous overload* rather than
-- a replacement, and PostgREST would then fail to resolve the call. Same reason
-- `create_squad(text)` was dropped when `p_program` arrived.

drop function public.create_goal(text, text, integer, date, date, smallint, uuid, smallint);

create function public.create_goal(
  p_title text,
  p_description text,
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
    squad_id, created_by, title, description, kind, target,
    required_days, required_members, starts_on, ends_on
  )
  values (
    p_squad_id, v_user, btrim(p_title),
    -- Normalised here as well as validated by the CHECK: a client sending a
    -- string of spaces should store NULL, not be rejected.
    nullif(btrim(coalesce(p_description, '')), ''),
    p_kind, p_target,
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

comment on function public.create_goal(text, text, text, integer, date, date, smallint, uuid, smallint) is
  'The only way a goal is created. Validates squad membership and freezes the participant roster in one transaction. p_ends_on may be NULL for an open-ended cumulative goal.';

revoke execute on function public.create_goal(text, text, text, integer, date, date, smallint, uuid, smallint)
  from public, anon;
grant execute on function public.create_goal(text, text, text, integer, date, date, smallint, uuid, smallint)
  to authenticated;

-- ---------------------------------------------------------------------------
-- goal_window_scores loses its upper bound when there is none
-- ---------------------------------------------------------------------------
--
-- Third recreate of this function (see 20260810110000 and 20260810120000), so
-- the drop is explicit.
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
  status public.day_status
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
    ds.status
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
  'Per-participant, per-day score totals inside a goal window. Rows only — all goal arithmetic lives in kairo-core (deviation #18). LEFT JOIN so a scoreless participant still appears (deviation #20). No argument exposes raw steps, hourly movement or per-stat points.';

revoke execute on function public.goal_window_scores(uuid, uuid) from public, anon;
grant execute on function public.goal_window_scores(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The description joins the title as client-editable
-- ---------------------------------------------------------------------------
--
-- Everything else on a goal stays fixed after creation: changing a target
-- mid-window would silently re-grade days already counted. A description
-- re-grades nothing.
--
-- The usual Postgres caveat, for the fourth time in this repo: a column-level
-- REVOKE against a table-level GRANT is silently a no-op. There is no table
-- grant to revoke here — 20260810100000 already left `authenticated` with
-- `select` plus `update (title)` — so this is a widening of the existing column
-- grant, and re-granting the pair is how a column grant is extended.

grant update (title, description) on public.goals to authenticated;

commit;

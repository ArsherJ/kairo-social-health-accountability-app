-- Retire the Battle (roadmap deviation #66).
--
-- Design: `docs/superpowers/specs/2026-09-06-road-to-high-rating-design.md`,
-- Part B. The Battle was the only squad mechanic with an open defect (nothing
-- closed an expired fight, so `challenge_events_one_live_per_kind` held the
-- slot forever and a member who started one and left blocked the squad
-- permanently), the only uncapped XP-paying path, and the only mechanic that
-- needed a squad to test.
--
-- **Follow the Goals precedent exactly** (deviation #45). Nothing that banked
-- XP is destroyed:
--
--   * The three tables STAY. `recalculate_user_xp` sums
--     `event_completions.xp_awarded`; dropping the table would silently drop
--     every account's banked Battle XP on the next write to any of its other
--     sources. `pooledDays()` and `eventCompletionXp()` stay in @kairo/core,
--     marked deprecated, because a future reader of a banked completion needs
--     the arithmetic that produced it.
--   * Every LIVE row is closed here, so no read anywhere can render one. The
--     existing reads all filter `closed_at is null` — closing the rows is what
--     makes "no surface can render a Battle" true of the DATABASE rather than
--     only of the client that happens to be installed.
--   * `event_completed` stays a `NotificationTrigger` and keeps routing
--     somewhere real (`/flock`): a push sent before this deploy can be tapped
--     after it.
--   * `EVENT_KINDS` / `EVENT_METRICS` stay — the column CHECKs reference them.
--
-- **The three RPCs are dropped BY EXACT ARGUMENT LIST**, never
-- `drop function if exists public.f(...)` guessed at: this is the
-- `create_goal` / `p_metric` trap, where a surviving overload fails nothing
-- until some call site resolves to it.
--
-- `event_progress()` stays, read-only, for the same reason `event.ts` stays.
-- That is what makes dropping `can_see_event()` a real change rather than a
-- deletion: three RLS policies and this function all read that rule, so the
-- policies are recreated without it and the function carries the rule itself.
-- After this migration `event_progress()` is the rule's ONLY consumer, so the
-- inline predicate is the single copy rather than a second one — which is what
-- the old comment there was guarding against.
--
-- What the recreated policies give up, deliberately: a squad member who was
-- never a participant could previously read the squad's event rows. Nothing
-- renders them any more, and the mutual recursion `can_see_event()` existed to
-- break (challenge_events' policy reads event_participants, whose policy read
-- challenge_events) cannot be written inline. Owner-scoped participation is
-- the honest surface for a retired mechanic's history.
--
-- `events_update_own` and the column-level `update (title, description)` grant
-- are LEFT ALONE. The design's sequencing says "revoke nothing else", and a
-- title edit on a closed row is inert.
--
-- SHIPS WITH: a redeploy of ALL five Edge Functions. `finalize-days` loses its
-- event grading block and `dispatch-notifications` loses its Battle branch;
-- the other three share the planner and must not split-brain (the August 2026
-- outage class).

begin;

-- ---------------------------------------------------------------------------
-- 1. Close every live event
-- ---------------------------------------------------------------------------
--
-- `closed_at`, not `delete`: a completion's FK holds its event row alive, and
-- the whole point of the Goals precedent is that banked XP survives. This is
-- also what frees `challenge_events_one_live_per_kind` for every squad that
-- was locked out by an expired fight — the defect closes on the way past.

update public.challenge_events
   set closed_at = now()
 where closed_at is null;

-- ---------------------------------------------------------------------------
-- 2. Drop the write path, by exact argument list
-- ---------------------------------------------------------------------------

drop function public.create_event(text, text, text, text, integer, date, date, uuid);
drop function public.abandon_event(uuid);

-- ---------------------------------------------------------------------------
-- 3. event_progress carries the visibility rule itself
-- ---------------------------------------------------------------------------
--
-- Replaced before `can_see_event` is dropped. A plpgsql body is text resolved
-- at execution, so the drop would not have complained — it would have raised
-- `function public.can_see_event(uuid, uuid) does not exist` on the first call
-- and nowhere else, which is the `collect_orphaned_goals()` failure in a new
-- place.
--
-- Everything else about this function is unchanged: daily SUMS only, no hour
-- column, `value` behind deviation #47's reciprocal gate and `pooled_value`
-- ungated.

create or replace function public.event_progress(p_event_id uuid, p_as_user uuid default null)
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
  v_visible boolean;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_event from public.challenge_events where id = p_event_id;
  if not found then
    raise exception 'no such event' using errcode = '42501';
  end if;

  -- The visibility rule, in the one place that still holds it. This function is
  -- SECURITY DEFINER so RLS is bypassed and the check has to be explicit; it is
  -- written here rather than behind `can_see_event()` because that function was
  -- dropped with the Battle and this is now its only reader.
  select exists (
    select 1 from public.event_participants ep
     where ep.event_id = p_event_id and ep.user_id = v_user
  ) or exists (
    select 1 from public.challenge_events e
     join public.squad_members sm on sm.squad_id = e.squad_id
    where e.id = p_event_id and sm.user_id = v_user
  ) into v_visible;

  if not v_visible then
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
    -- drew and what the event WAS.
    sum(c.raw) over (partition by c.ldate),
    c.dstatus
  from contributions c
  where c.ldate is not null
  order by c.ldate, c.uid;
end;
$$;

comment on function public.event_progress(uuid, uuid) is
  'Historical, read-only since the Battle was retired (deviation #66). Per-participant, per-day RAW metric totals inside a closed Event window, plus the pooled figure for each day. Rows only — the arithmetic lives in kairo-core (deviation #18), where it is kept deprecated so a banked completion can still be explained. Daily sums only: no argument exposes hourly movement, heart rate, workout sessions, pace or timestamps. `value` is behind the same reciprocal consent gate as squad_leaderboard()''s raw totals (deviation #47); `pooled_value` is not. Holds the participant-or-squad visibility rule inline: it is the only reader left of it.';

-- ---------------------------------------------------------------------------
-- 4. Drop can_see_event, by exact argument list, with its policies
-- ---------------------------------------------------------------------------
--
-- The policies must go first — a policy expression registers a dependency on
-- the function it calls, so the drop would be refused otherwise.
--
-- Recreated owner-scoped. `challenge_events` reading `event_participants` is
-- safe now precisely because the participants policy no longer reads back:
-- the cycle the definer function existed to break cannot form.

drop policy events_select_visible             on public.challenge_events;
drop policy event_participants_select_visible on public.event_participants;
drop policy event_completions_select_visible  on public.event_completions;

drop function public.can_see_event(uuid, uuid);

create policy events_select_visible on public.challenge_events
for select to authenticated
using (
  exists (
    select 1 from public.event_participants ep
     where ep.event_id = id and ep.user_id = (select auth.uid())
  )
);

create policy event_participants_select_visible on public.event_participants
for select to authenticated
using (user_id = (select auth.uid()));

create policy event_completions_select_visible on public.event_completions
for select to authenticated
using (user_id = (select auth.uid()));

commit;

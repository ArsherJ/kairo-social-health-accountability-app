-- The race, snapshotted (spec §7.3, deviation #46).
--
-- Written ONCE by finalize-days, when the LAST member of a squad finalizes that
-- local date. Because days are per-user local (§2), a squad spans several
-- calendar dates at any instant, so a squad's race for date D is not final
-- until every member's D is — and a result written before that would crown
-- whoever's timezone happens to be furthest west.
--
-- After it is written the row never changes: a later Apple revision does not
-- retract anyone's win. That is the same §19 rule event completions and
-- challenge completions already follow, and it is why the standings are
-- snapshotted at all — the underlying projection can no longer answer "who won
-- on 14 March" once the buckets behind it have been revised.
--
-- **No client role holds any grant on this table.** A stored row is read by
-- every member of the squad, so it cannot carry a per-viewer consent gate
-- inside itself; race_result() below applies exactly the gate
-- squad_leaderboard() applies. The absent grant is the invariant, and a schema
-- test pins it.

begin;

create table public.race_results (
  squad_id uuid not null references public.squads (id) on delete cascade,
  -- The date every member of the squad has now finished. Per-user local dates
  -- agree on the *label* even when they end at different instants, which is
  -- what makes one row per squad per date coherent at all.
  local_date date not null,
  -- [{ user_id, rank, capped_steps, species }] — snapshotted, not projected.
  standings jsonb not null,
  finalized_at timestamptz not null default now(),
  primary key (squad_id, local_date)
);

comment on table public.race_results is
  'One squad-day of the race, snapshotted when the LAST member finalizes that date. Write-once: a later Apple revision never retracts a win (§19 rule). Service-role writes only, and NO client grant at all — read it through race_result(), which applies the reciprocal consent gate from deviation #47.';

comment on column public.race_results.standings is
  'Array of { user_id, rank, capped_steps, species }. capped_steps is min(steps, DAILY_STEP_BASELINE) as rankRacers() computed it — the race cap, not the raw figure. Stored ungated because one row serves every viewer; race_result() withholds it per viewer.';

create index race_results_squad_idx on public.race_results (squad_id, local_date desc);

alter table public.race_results enable row level security;

-- No policy and no grant. Supabase's ALTER DEFAULT PRIVILEGES grants ALL on new
-- public tables to `authenticated`, and ALL includes TRUNCATE, which RLS does
-- not restrict — so the revoke is not decorative.
revoke all on public.race_results from anon, authenticated;

-- ---------------------------------------------------------------------------
-- race_result — the gated read
-- ---------------------------------------------------------------------------

create function public.race_result(p_squad_id uuid, p_local_date date)
returns table (
  user_id uuid,
  character_name text,
  species text,
  rank integer,
  capped_steps integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- auth.uid() and nothing else. There is no p_as_user here on purpose: the
  -- digest reads the table directly with the service role, so no JWT-less
  -- caller needs one, and a parameter naming the viewer is one bug away from
  -- reading as somebody else.
  v_user uuid := (select auth.uid());
  v_viewer_consent boolean;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.squad_members m
    where m.squad_id = p_squad_id and m.user_id = v_user
  ) then
    raise exception 'not a member of this squad' using errcode = '42501';
  end if;

  select p.squad_data_consent_at is not null
    into v_viewer_consent
    from public.profiles p
   where p.id = v_user;

  return query
  select
    (s->>'user_id')::uuid,
    p.character_name,
    s->>'species',
    (s->>'rank')::integer,
    -- Rank and species are returned unconditionally: a rank is not a health
    -- figure, and species is already in two projections (deviation #40).
    -- Capped steps are the disclosure, and they carry the same reciprocal gate
    -- squad_leaderboard()'s raw totals do.
    case
      when coalesce(v_viewer_consent, false) and p.squad_data_consent_at is not null
      then (s->>'capped_steps')::integer
    end
  from public.race_results r
  cross join lateral jsonb_array_elements(r.standings) s
  left join public.profiles p on p.id = (s->>'user_id')::uuid
  where r.squad_id = p_squad_id and r.local_date = p_local_date
  order by (s->>'rank')::integer;
end;
$$;

comment on function public.race_result(uuid, date) is
  'One finalized squad-day of the race. Rank and species unconditionally; capped steps only when the viewer AND the member have both consented (deviation #47). Returns no rows for a date with no result yet, which is the normal case for today and for any date a member is still living in — the caller reads an empty set as "no result", never as an error.';

revoke all on function public.race_result(uuid, date) from public, anon;
grant execute on function public.race_result(uuid, date) to authenticated;

commit;

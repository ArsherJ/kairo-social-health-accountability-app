-- Row Level Security.
--
-- Two rules govern everything here:
--
--   1. Health data is private to its owner. Squadmates see tiers and scores
--      through squad_leaderboard() and nothing else. VIT's hour-by-hour data
--      reveals when someone sleeps, works, or is sedentary (§5) — that never
--      leaves the owner's row.
--
--   2. Scores are server-authoritative (§12). Clients have zero write access
--      to health_buckets, daily_scores and sabotage_events. Those tables are
--      written only by Edge Functions holding the service role. Cheating
--      therefore requires forging raw health data, not posting a number.
--
-- Grants are revoked in addition to RLS being enabled, so a future missing
-- policy still cannot open a write path.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER breaks what would otherwise be infinite RLS recursion: a
-- policy on squad_members cannot itself query squad_members.
create or replace function public.is_squad_member(p_squad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.squad_members
    where squad_id = p_squad_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.shares_squad_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.squad_members mine
    join public.squad_members theirs on theirs.squad_id = mine.squad_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.squads              enable row level security;
alter table public.squad_members       enable row level security;
alter table public.health_buckets      enable row level security;
alter table public.daily_sleep         enable row level security;
alter table public.daily_scores        enable row level security;
alter table public.sabotage_events     enable row level security;
alter table public.daily_item_ledger   enable row level security;
alter table public.streaks             enable row level security;
alter table public.device_tokens       enable row level security;
alter table public.app_events          enable row level security;
alter table public.notification_log    enable row level security;

-- ---------------------------------------------------------------------------
-- profiles — owner only
-- ---------------------------------------------------------------------------

-- Deliberately NOT readable by squadmates. The row carries height, weight and
-- birth year; RLS is row-level, not column-level, so exposing the row to a
-- squad would expose body metrics. Squad-facing name/level/class reach the
-- client through squad_leaderboard() instead.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Level, XP and Legendary status are awarded by the server, never claimed by
-- the client.
--
-- This must be done by revoking the table-level grant and re-granting the
-- allowed columns. A column-level REVOKE against an existing table-level GRANT
-- is silently a no-op in Postgres — the table grant already covers every
-- column, and you cannot subtract from it. Getting this backwards would leave
-- `update profiles set total_xp = 999999` wide open.
revoke update on public.profiles from anon, authenticated;

grant update (
  character_name,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  has_wearable,
  exclude_from_recap
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- squads / squad_members
-- ---------------------------------------------------------------------------

create policy squads_select_member on public.squads
  for select to authenticated
  using (public.is_squad_member(id));

create policy squads_update_leader on public.squads
  for update to authenticated
  using (leader_id = (select auth.uid()))
  with check (leader_id = (select auth.uid()));

create policy squads_delete_leader on public.squads
  for delete to authenticated
  using (leader_id = (select auth.uid()));

-- Creation goes through create_squad(), which allocates a unique invite code
-- and adds the leader as the first member atomically.
revoke insert on public.squads from anon, authenticated;

create policy squad_members_select_visible on public.squad_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_squad_member(squad_id)
  );

-- Leaving is allowed; joining is not, because join_squad() must check squad
-- capacity and the per-user squad cap first.
create policy squad_members_delete_self on public.squad_members
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update on public.squad_members from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Health data — read own, write never
-- ---------------------------------------------------------------------------

create policy health_buckets_select_own on public.health_buckets
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy daily_sleep_select_own on public.daily_sleep
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy daily_scores_select_own on public.daily_scores
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.health_buckets from anon, authenticated;
revoke insert, update, delete on public.daily_sleep    from anon, authenticated;
revoke insert, update, delete on public.daily_scores   from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sabotage — visible to the people involved and the squad feed
-- ---------------------------------------------------------------------------

-- Getting hit is the emotional core (§14), so the target must see it. The
-- squad feed makes the drama shared, which is the entire point of the mechanic.
create policy sabotage_events_select_involved on public.sabotage_events
  for select to authenticated
  using (
    actor_id = (select auth.uid())
    or target_id = (select auth.uid())
    or public.is_squad_member(squad_id)
  );

-- Deploys go through deploy-sabotage, which enforces caps, cooldowns and the
-- target's day-not-finalized rule in one place.
revoke insert, update, delete on public.sabotage_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Progression — read own, write never
-- ---------------------------------------------------------------------------

create policy daily_item_ledger_select_own on public.daily_item_ledger
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy streaks_select_own on public.streaks
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notification_log_select_own on public.notification_log
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.daily_item_ledger from anon, authenticated;
revoke insert, update, delete on public.streaks           from anon, authenticated;
revoke insert, update, delete on public.notification_log  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- device_tokens — the client owns its own push registration
-- ---------------------------------------------------------------------------

create policy device_tokens_select_own on public.device_tokens
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy device_tokens_insert_own on public.device_tokens
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy device_tokens_update_own on public.device_tokens
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy device_tokens_delete_own on public.device_tokens
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- app_events — append-only telemetry from the client
-- ---------------------------------------------------------------------------

create policy app_events_insert_own on public.app_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy app_events_select_own on public.app_events
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke update, delete on public.app_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- anon gets nothing
-- ---------------------------------------------------------------------------

-- There is no unauthenticated surface in Kairo. Every read is scoped to a user.
revoke all on public.profiles          from anon;
revoke all on public.squads            from anon;
revoke all on public.squad_members     from anon;
revoke all on public.health_buckets    from anon;
revoke all on public.daily_sleep       from anon;
revoke all on public.daily_scores      from anon;
revoke all on public.sabotage_events   from anon;
revoke all on public.daily_item_ledger from anon;
revoke all on public.streaks           from anon;
revoke all on public.device_tokens     from anon;
revoke all on public.app_events        from anon;
revoke all on public.notification_log  from anon;

-- A daily budget for invite-code guesses (issue #34).
--
-- An invite code is six characters from `[A-Z0-9]`, so a guess is a 1-in-2.18e9
-- shot and nothing bounded how many of them one account could take except the
-- platform's own limits. The payoff is real: join a stranger's flock, consent,
-- and their four daily totals are on your board. That was accepted while the
-- project held four founder accounts. The first outside cohort arrives at the
-- end of this phase, so it stops being acceptable then.
--
-- Eight things here are easy to get wrong.
--
-- **A raise cannot coexist with a counter.** `join_squad` used to raise 22023
-- for an unknown code. An exception aborts the transaction, so the increment
-- that recorded the guess is rolled back with it and the counter never advances
-- past whatever the successful calls happened to write — the limit would never
-- trip, silently, with every test about *refusing* a bad code still green. So
-- the miss path **returns null** now instead of raising, and the client turns
-- that into the sentence 22023 used to produce. This is the reason for the
-- contract change, not a preference.
--
-- **Which makes the two answers identical by construction.** Over the limit and
-- wrong code both return null from `join_squad` and both return no rows from
-- `preview_squad`. There is no code, no message and no timing difference for a
-- caller to separate them with, which is the acceptance criterion met by having
-- nothing to distinguish rather than by two branches that agree today.
--
-- **`preview_squad` shares the budget, and leaving it out would have been
-- theatre.** It answers the same question — *does this code exist?* — for any
-- authenticated caller, and it also hands back the squad's name. A limit on
-- `join_squad` alone leaves the enumeration door open and closes the one you
-- walk through afterwards holding the answer. One action key, `invite_code`,
-- because a budget per door is a budget an attacker picks the larger of. This
-- goes slightly beyond the ticket, which named the join RPC; the threat the
-- ticket describes is guessing, and guessing happens on both.
--
-- **The window is the UTC date, not the caller's local date.** Everything else
-- in Kairo is keyed by the player's own local day (§2), and this deliberately is
-- not: `profiles.timezone` is in the client's column-level UPDATE grant, so a
-- local-day window would hand the attacker a reset button. A rate limit is the
-- one place where the account's own claim about when its day ends cannot be the
-- authority.
--
-- **It counts attempts, not failures, and it is charged before the lookup.**
-- Charging afterwards would let an account that has exhausted its budget still
-- join on a lucky guess, which is the outcome the budget exists to prevent. A
-- clean join costs two units — one preview, one join — and that is the best
-- case rather than the bound: `useSquadPreview` fires on every distinct
-- six-character code the field reaches, and its `retry: 2` can charge up to
-- three for one preview if the request fails after the RPC has already run.
-- Thirty rather than the ten a bound of "two" would justify, because the two
-- failures are not symmetrical — thirty guesses a day against 2.18e9 is the
-- same nothing that ten is, while a false refusal tells an honest person their
-- correct code is wrong, in the sentence deliberately designed to give them no
-- way to find out otherwise.
--
-- **What it does not buy, stated rather than implied.** The counter is per
-- account and accounts are cheap: anonymous sign-in is enabled on the project,
-- and `preview_squad` needs only a session where `join_squad` also needs a
-- profile. This does not make enumeration impossible. It makes it cost one
-- account per thirty tries instead of nothing, and it closes the door that
-- answered the existence question in unlimited volume for free. A floor on the
-- identity itself (App Attest) is the part still owed.
--
-- **The OTA ships first, and this migration second.** The order is not
-- symmetric: an old client against this schema reads `data: null` with no
-- error, hands it to `onSuccess` and dereferences `squad.program` — a crash on
-- an ordinary mistyped code. The new client against the *old* schema is fine,
-- because the old one still raises 22023 and the mapping for it is still there.
-- So: publish the update, then apply this.
--
-- **`consume_rate_limit` is built for a second caller.** `send_whack` gets the
-- same shape in Phase 3: a per-user counter with a daily window, charged inside
-- the RPC. It takes the action and the limit and answers one question, so the
-- next caller adds a string rather than a mechanism. It resolves the account
-- from `auth.uid()` rather than taking a `p_user_id`, for `delete_account()`'s
-- reason — an identity argument is one accidental grant away from letting a
-- caller spend, or clear, somebody else's budget.

begin;

-- ---------------------------------------------------------------------------
-- rate_limits — the counter
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  -- Account-scoped, so it references auth.users: the budget belongs to whoever
  -- is signed in, including before onboarding writes a profile. The cascade is
  -- also what makes `delete_account()` reach it, since that function deletes
  -- the auth.users row.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- What is being counted. Free text on purpose: a new caller is a new string,
  -- not a migration, exactly as `notification_log.kind` is.
  action text not null,
  -- The UTC date the attempts fall in. See the header for why this is not the
  -- caller's local date.
  window_date date not null,
  attempts integer not null default 0,
  primary key (user_id, action, window_date)
);

comment on table public.rate_limits is
  'Per-account attempt counters with a daily (UTC) window, charged inside SECURITY DEFINER RPCs through consume_rate_limit(). No client role holds any grant: a client that could read it would learn how many guesses it has left, and one that could write it would have no limit at all. The window is the UTC date rather than the caller''s local date because profiles.timezone is client-writable and would otherwise be a reset button.';

comment on column public.rate_limits.action is
  'What is being counted. ''invite_code'' covers both join_squad and preview_squad, which answer the same question and therefore share one budget.';

alter table public.rate_limits enable row level security;

-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on a new public table to
-- `authenticated`, and ALL includes TRUNCATE, which RLS does not restrict — so
-- this is not decorative. A schema test pins the empty grant listing.
revoke all on public.rate_limits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- consume_rate_limit — charge one attempt, and say whether it was affordable
-- ---------------------------------------------------------------------------

create function public.consume_rate_limit(p_action text, p_limit integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_attempts integer;
begin
  -- Fail closed. No caller can reach this without a session today, and a future
  -- one that can must not be handed an unmetered path.
  if v_user is null then
    return false;
  end if;

  insert into public.rate_limits (user_id, action, window_date, attempts)
  values (v_user, p_action, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, action, window_date)
    do update set attempts = public.rate_limits.attempts + 1
  returning public.rate_limits.attempts into v_attempts;

  -- The charge stands either way: an attempt over the budget still counts, so a
  -- refused caller cannot hover at exactly the limit for free.
  return v_attempts <= p_limit;
end;
$$;

comment on function public.consume_rate_limit(text, integer) is
  'Charges one attempt against the caller''s daily (UTC) budget for p_action and returns whether it was within p_limit. Always charges, including the attempt that goes over. Call it BEFORE the work being limited, so an exhausted caller cannot succeed on a lucky one. No client grant — it is called from inside SECURITY DEFINER RPCs, which is also why it takes no user id.';

revoke execute on function public.consume_rate_limit(text, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- join_squad — charged, and no longer raising for an unknown code
-- ---------------------------------------------------------------------------

create or replace function public.join_squad(p_invite_code text)
returns public.squads
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_squad public.squads;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'complete onboarding before joining a squad'
      using errcode = '42501';
  end if;

  -- Thirty a day, shared with preview_squad. A literal with a comment rather
  -- than a constant mirrored from @kairo/core: SQL cannot import from the
  -- keystone, and no client may know this number — the whole point is that a
  -- refusal is indistinguishable from a wrong code, which a client counting
  -- down to a published bar would undo. (`users_needing_digest()`'s seven-day
  -- window is the same decision for the same reason.) See the header for why
  -- thirty rather than a number closer to what an honest entry actually costs.
  if not public.consume_rate_limit('invite_code', 30) then
    return null;
  end if;

  select * into v_squad
  from public.squads
  where invite_code = upper(btrim(p_invite_code));

  -- Null, never a raise. See the migration header: an exception would roll back
  -- the charge above and the limit would never trip.
  if not found then
    return null;
  end if;

  -- Idempotent: tapping an invite link twice is a normal thing to do and must
  -- not read as an error.
  if exists (
    select 1 from public.squad_members
    where squad_id = v_squad.id and user_id = v_user
  ) then
    return v_squad;
  end if;

  insert into public.squad_members (squad_id, user_id)
  values (v_squad.id, v_user);

  return v_squad;
end;
$$;

comment on function public.join_squad(text) is
  'Joins the caller to the squad holding p_invite_code, idempotently. Returns NULL for a code that matches nothing AND for a caller who has spent the day''s invite-code budget — deliberately the same answer, so a guesser cannot tell a miss from a refusal. It no longer raises 22023: an exception would roll back the attempt counter it is charged against.';

-- ---------------------------------------------------------------------------
-- preview_squad — the same budget, and volatile now that it writes
-- ---------------------------------------------------------------------------
--
-- `volatile` is load-bearing rather than pedantic: PostgREST runs a STABLE
-- function in a read-only transaction on the GET path, where the charge would
-- fail outright.

create or replace function public.preview_squad(p_invite_code text)
returns table (
  name text,
  program text,
  member_count integer,
  max_members smallint,
  is_full boolean,
  already_member boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Charged before the lookup, and no rows when it is refused — which is
  -- exactly what an unknown code already returns.
  if not public.consume_rate_limit('invite_code', 30) then
    return;
  end if;

  return query
  select
    s.name,
    s.program,
    (select count(*)::integer from public.squad_members m where m.squad_id = s.id),
    s.max_members,
    (select count(*) from public.squad_members m where m.squad_id = s.id)
      >= s.max_members,
    exists (
      select 1 from public.squad_members m
      where m.squad_id = s.id and m.user_id = v_user
    )
  from public.squads s
  where s.invite_code = upper(btrim(p_invite_code));
end;
$$;

comment on function public.preview_squad(text) is
  'What a valid invite code points at: squad name, program and capacity. No member identities, no scores, no invite code echoed back. Holding the code is the authorisation. Charged against the same daily invite-code budget as join_squad, because it answers the same question — and returns no rows once that budget is spent, which is what an unknown code returns anyway.';

commit;

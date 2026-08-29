-- profiles.has_sleep_source — one stored answer to "can this account earn Mind?"
--
-- Mind is the only stat that can be unreachable: an iPhone with no sleep source
-- produces no scoring night, so `hasSleepCapability()` is false and
-- `earnableStats` is 2. The scorer has always known this — `normalizationFactor`
-- is built on it. **No surface did**, and the cost was a real bug: `pickQuests`
-- filtered on tier alone, so a phone-only account could be dealt
-- `starter-sleep-360` on day one with no route to clearing it, ever.
--
-- Why a stored column rather than deriving it on both sides. The client draws
-- the quests and `finalize-days` re-derives them to pay XP. If those two
-- disagree about capability they deal different quests, and a completion
-- latches against a quest that was never on screen — the identical failure that
-- `quest_tier_override` is shared to prevent. Two independent derivations over
-- the same rows is exactly how they would come to disagree: different windows,
-- different rounding, one side updated and the other not. One column, written
-- once per sync by the service role, read by both.
--
-- **Deliberately absent from the column-level UPDATE grant.** `profiles` UPDATE
-- is granted per column to `authenticated`; not naming this one is what makes it
-- server-written. A client that could set it could hand itself sleep quests it
-- cannot clear, or hide the ones it can — and note that a column-level REVOKE
-- against a table-level GRANT is silently a no-op in Postgres, which is why this
-- relies on the existing per-column grant rather than adding a revoke.
--
-- `false` is the safe default for existing rows: it withholds sleep quests until
-- a sync proves the source exists, where `true` would deal an unclearable quest
-- to precisely the accounts this column exists to protect.

begin;

alter table public.profiles
  add column if not exists has_sleep_source boolean not null default false;

comment on column public.profiles.has_sleep_source is
  'Whether this account had a scoring (non-user-entered) sleep night in the '
  'trailing SLEEP_CAPABILITY_WINDOW_DAYS at its last sync. Written by '
  'sync-health under the service role; deliberately not in the column-level '
  'UPDATE grant. Read by BOTH the client''s quest draw and finalize-days'' '
  'quest grading, which must agree — see pickQuests(hasSleep).';

commit;

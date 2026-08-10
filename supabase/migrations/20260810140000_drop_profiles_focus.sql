-- profiles.focus is removed. squads.program is the only focus concept.
--
-- Founder decision 2026-08-10, from hand-testing: "I think we can only use the
-- focus choices in the squad level."
--
-- The column was added in 20260807100000 as "what the user says they are here to
-- do", asked once in onboarding and explicitly presentation-only — it never
-- touched scoring and never gated membership. Its whole output was choosing
-- which stat the character screen's guidance line preferred.
--
-- Two answers to one question, and only one of them meant anything. A squad's
-- `program` is the same four choices (`all_around` / `running` / `gym` /
-- `walking`), fixed at creation, and it actually weights the leaderboard at read
-- time. Having a personal echo of it that changed nothing invited exactly the
-- confusion the founder hit: two places to declare a focus, one of them inert.
--
-- **What replaces the lane it fed:** dominance. `useDominantStat` already
-- computes which stat the user has actually been grinding over the last
-- fortnight, for the build label that sits directly above the guidance line. The
-- lane now reads that. It is a better input than the one it replaces — it cannot
-- go stale, it needs no question, and it describes what someone does rather than
-- what they once said they would do. That is also what lets the onboarding focus
-- step be deleted outright rather than replaced.
--
-- Dropped, not left inert. `reject_mutation()` and `kairo.allow_purge` were kept
-- as no-ops in 20260809120000 because they sit on the account-deletion path and
-- reopening that was not worth it. This column sits on nothing.

begin;

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------
--
-- The CHECK constraint goes with it automatically. No view or function reads
-- it: the only SQL consumer was supabase/analytics/beta-segmentation.sql, which
-- is a hand-run query file rather than a database object, and is updated in the
-- same change.

alter table public.profiles drop column focus;

-- ---------------------------------------------------------------------------
-- Rebuild the column-scoped client grants without it
-- ---------------------------------------------------------------------------
--
-- Dropping a column removes it from the grant lists on its own, so this is
-- belt-and-braces — but the lists are the written-down statement of what a
-- client may write to `profiles`, and leaving them un-restated would mean the
-- next reader has to diff two migrations to know what they are.
--
-- The usual Postgres caveat, for the fifth time in this repo: a column-level
-- REVOKE against a table-level GRANT is silently a no-op. Revoke the table
-- grant, then re-grant exactly the allowed columns.
--
-- `has_wearable` stays out of both lists, as 20260807100000 established:
-- capability is observed by `sync-health` from the presence of sleep data,
-- never asserted by a client.

revoke insert on public.profiles from anon, authenticated;

grant insert (
  id,
  character_name,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  exclude_from_recap
) on public.profiles to authenticated;

revoke update on public.profiles from anon, authenticated;

grant update (
  character_name,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  exclude_from_recap
) on public.profiles to authenticated;

commit;

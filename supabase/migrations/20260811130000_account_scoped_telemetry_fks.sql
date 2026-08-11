-- app_events and device_tokens hang off the account, not the character.
--
-- Found on device 2026-08-11, during the hand-verification of the character
-- body choice. A user who has signed in but not yet finished onboarding
-- produced these on every launch:
--
--   [telemetry] app_open 23503 ... violates "app_events_user_id_fkey"
--   [notifications] token registration failed 23503 ... "device_tokens_user_id_fkey"
--
-- Both columns referenced `public.profiles (id)`, and a profile row does not
-- exist until the name screen commits it (§5's character-first onboarding, and
-- deviation #27's two screens). So every write in that window failed.
--
-- **The dropped row was never the real cost.** It is that the sign-in ->
-- abandon funnel was structurally unmeasurable: a user who signs in and never
-- names a character produced no events *by construction*, so the single
-- drop-off §15's beta most wants to count could not be counted. That is a
-- measurement hole, not a warning to silence.
--
-- The modelling was simply wrong. A push token belongs to a device and an
-- account. A telemetry event belongs to an account. Neither is a property of
-- the character, and `profiles` is the character. `auth.users` is the account,
-- and it exists from the moment someone signs in — which is exactly when both
-- of these first have something to say.
--
-- **Erasure is unchanged.** The cascade `profiles` provided was always
-- transitive: `profiles.id` references `auth.users (id) on delete cascade`, so
-- deleting an account already reached these tables through it. Pointing
-- straight at `auth.users` keeps the same guarantee and removes the middleman.
-- Each column keeps the delete action it already had — `device_tokens` cascades
-- (a token for a deleted account must not survive), `app_events` nulls (the
-- event is aggregate telemetry and is kept de-identified).
--
-- Note for whoever reads `20260809120000_remove_sabotage.sql`'s closing
-- comment: it discusses `delete_account()` as though it exists. **It does not**
-- — `leave_squad` is the only such routine in the schema. That comment is
-- stale; erasure today is deleting the `auth.users` row, which is what these
-- constraints now hang off directly.
--
-- Safe to apply in place: every existing `user_id` in both tables is already a
-- `profiles.id`, and every `profiles.id` is an `auth.users.id`, so there are no
-- rows the new constraints can reject. Verified against the live project before
-- writing this (0 orphans across 329 app_events and 1 device_token).

begin;

alter table public.app_events
  drop constraint app_events_user_id_fkey,
  add constraint app_events_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete set null;

alter table public.device_tokens
  drop constraint device_tokens_user_id_fkey,
  add constraint device_tokens_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

comment on column public.app_events.user_id is
  'The account, not the character — telemetry starts at sign-in, before a profile exists. NULL once the account is erased.';

comment on column public.device_tokens.user_id is
  'The account, not the character. A push token is a property of a device and an account; it can be registered before onboarding finishes.';

commit;

# 05: Offer notifications to solo players

**What to build:** Kairo is solo-first, and a solo player can never be asked for
notification permission at all. The ask waits for the player to have a squad or
a running Battle, on the reasoning that every ask needs a visible why. That was
right when the pushes it enabled were social. It is wrong now: the 08:00 daily
digest is the solo loop's only re-engagement, and the entire solo cohort is
structurally excluded from being offered it.

Widen the why to include **a first scored day** — the moment there is genuinely
something to say at 8am tomorrow. A player with no squad and no scored day is
still not asked; a player with a first scored day is.

Nothing else about the ask moves. It is not rebuilt as an onboarding beat: the
primer sheet, the single modal host, the Health-first ordering and the refusal
to chain a second ask onto the one just answered all already exist and all keep
working. The widening must not reopen the defect that ordering function exists
to prevent, where two sheets presented on one root view controller left the app
wedged.

The ask's answer is recorded — granted, declined, or deferred — per answer
rather than once ever, since the sheet is dismissible per session and a deferral
can genuinely recur.

**Blocked by:** 02 (Correct two false claims) — the sheet's copy must be true
before more players are shown it.

**Status:** done (2026-09-04)

- [x] A solo player with a first scored day is offered notifications
- [x] A solo player with no scored day is still not asked
- [x] A player with a squad or a running Battle is asked exactly as before
- [x] Health still wins the slot when both asks are eligible
- [x] A second ask still does not chain onto the one just answered in the same
      session
- [x] An already-answered permission still produces no ask
- [x] "Not now" still fires no system dialog, so the player can be asked again
      later
- [x] The answer is recorded as granted, declined or deferred, with no other
      payload

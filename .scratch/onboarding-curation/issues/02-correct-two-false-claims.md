# 02: Correct two false claims the app makes today

**What to build:** Two pieces of copy in the app assert things that are not
true. Both mislead the reader at the moment they are deciding something.

**The body metrics card claims height and weight sharpen Body.** They do not, in
Kairo. Body scores active calories that arrive from HealthKit already computed
by Apple against the body profile held in the Health app; Kairo's stored height
and weight are a second, disconnected copy that Apple never sees and no scoring
path ever reads. Editing them changes no score. Rewrite the card to say what
they are actually for — the player's own reference, and the age-derived maximum
heart rate that display-only Strain uses.

**The notification sheet promises pushes the app cannot send.** It offers to
tell the player when a day starts and when it is about to close, and states a
cap of three a day with two exceptions arriving at 11 PM and midnight. All of
that was retired when the app moved to a single daily digest. Rewrite it to the
truth, which is the stronger prime anyway: one message a day, at 8am, saying how
yesterday went and what today needs — no streak nagging, nothing at 11pm.

Do **not** touch the difficulty help text in Settings in this ticket. It is
currently accurate; it only goes stale once calibration ships, and it is
corrected there.

This ticket also records the deviation that body metrics are never asked for
during onboarding and are documented as inert.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The body metrics card no longer claims height or weight affect scoring,
      and says what they are actually used for
- [ ] The notification sheet states the real cap of one message a day and the
      8am timing, and mentions no retired trigger
- [ ] The notification sheet's "Not now" still fires no system dialog
- [ ] Settings' difficulty help text is left untouched
- [ ] The deviations table records that body metrics are never asked in
      onboarding, with the reason
- [ ] Verified by hand on the simulator at the largest accessibility content
      size — the notification sheet's decline control must stay reachable

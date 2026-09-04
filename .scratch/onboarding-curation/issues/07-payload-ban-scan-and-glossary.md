# 07: Extend the payload ban scan, and settle the vocabulary

**What to build:** The guard and the documentation that only become possible
once the new beats exist.

**Extend the existing payload ban scan over the onboarding beats.** A scan
already walks the Today tab asserting that no telemetry payload carries a health
figure, an occurrence identifier, a quest identifier or the Motion location.
Onboarding now emits four kinds of event, and one of them sits next to a step
median. Widen that scan's file list rather than writing a second guard — two
guards enforcing one rule is how they drift apart. Add the step median to what
may not appear.

**Settle three words in the glossary**, all now load-bearing and none of them
currently in it:

- **beat** — one screen of the onboarding run, as distinct from a phase, which
  is what the progress rail measures
- **calibration** — the local, one-time reading of the player's recent step
  history that proposes a starting quest tier
- **seed** — a value written once at the start and never re-derived, as against
  a standing rule that recomputes. This is the word that keeps calibration
  distinct from the trailing-median rule the keystone records as rejected, and
  it is the most important of the three.

**And bring the repository guide's onboarding block up to date.** It currently
describes a six-beat run; it is seven, with the mirror beat third, calibration
merged into the difficulty beat, and Automatic now a fallback rather than the
default. The user journey walkthrough should reflect the same run end to end.

No architecture decision record. The calibration decision is reversible by
clearing an override, and its reasoning belongs where a reader will actually hit
it — in the keystone's own comment beside the rule it amends. A separate record
would be a second home for one argument.

**Blocked by:** 03 (The `/mirror` beat), 04 (Calibration), 06 (Flock welcome
card).

**Status:** ready-for-agent

- [ ] The existing payload ban scan covers the onboarding beats, with no second
      guard introduced
- [ ] The scan rejects a step median in a payload, and this is proven by making
      it fail against a deliberate violation before fixing it
- [ ] The glossary defines beat, calibration and seed, with no implementation
      detail
- [ ] The repository guide describes the seven-beat run accurately, including
      that Automatic is now the fallback
- [ ] The user journey walkthrough matches the shipped run
- [ ] No architecture decision record is added

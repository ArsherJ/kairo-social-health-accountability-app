# 03: The `/mirror` beat

**What to build:** A new third beat in the onboarding run, sitting directly
above the Health ask, whose only job is to move blame off the player before the
one dialog whose refusal cannot be undone from inside the app.

The beat says, in substance: you're not lazy, you're just not being counted.
Most days disappear the moment they end — nothing saw the walk to the jeepney
stop, the stairs, the long way home. Kairo counts them, and that turns out to be
enough. Its button is soft: "Show me".

The run becomes seven beats. Kairo appears here as a **pose**, drawn the same
way the welcome beat already draws its three birds. This beat must **not** wire
a producer for the `tired` reaction — that reaction is deliberately declared
without one, because sleepiness is a daily Mind state rather than an event, and
this screen has no account state to key an occurrence against.

**Both skip affordances now land on this beat**, not past it. Skip's purpose is
getting the player past the pitch, not past the reason for the ask — routing
around this beat would send the players most likely to decline around the one
argument aimed at them. The mirror beat itself carries no skip; there is nothing
left to skip.

The paged dots on the opening value cards currently promise three cards while
two exist. This beat becomes the third, so their count becomes honest without
being edited. Do not retire the dots: they answer which value card, where the
rail answers how far through the run, and they are already hidden from assistive
technology so only one thing announces position.

Beat impressions start recording here — one event per beat as it is shown,
carrying the route name and nothing else. Onboarding runs once per account, so
no marker store is needed; a duplicate from backing up and forward is absorbed
by counting distinct beats.

**Blocked by:** 01 (Beat registry and CTA labels).

**Status:** ready-for-agent

- [ ] The run is seven beats, with the mirror beat third, between the one-sky
      beat and the connect beat
- [ ] The beat renders Kairo as a pose and touches nothing in the reaction
      system; the `tired` reaction still has no producer
- [ ] Both skip affordances land on the mirror beat; the mirror beat has no
      skip of its own
- [ ] The paged dots read three of three across the opening value cards, and
      are not retired
- [ ] The rail still measures four phases; only the fill and partial values
      move, and they come from the registry
- [ ] Each beat records one impression event carrying the route name only — no
      health figure, no tier, no location
- [ ] The profile row still commits exactly once, on the name beat, and nothing
      is asked after it
- [ ] Accessibility structure checked in the Accessibility Inspector: the beat
      reads as coherent grouped elements, with decorative artwork hidden
- [ ] Verified at the largest accessibility content size with the app relaunched
      after changing it; text is bounded, scrolls, and is not clipped
- [ ] The user journey walkthrough covers the new beat

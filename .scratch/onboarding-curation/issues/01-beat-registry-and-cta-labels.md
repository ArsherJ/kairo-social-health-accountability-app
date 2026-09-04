# 01: Beat registry and CTA labels

**What to build:** Each beat of the onboarding run gets its own button copy
instead of three identical "Next" taps — "Let's fly" on the welcome beat, "I'm
in" on the one-sky beat, "Lock it in" on the difficulty beat, "Good to know" on
the privacy beat. The connect and name beats keep the copy they have.

Underneath, this is the prefactor that makes the rest of the run cheap to
change. The progress rail's position values are currently hand-written on every
beat, so adding or removing one means editing all of them and hoping the
arithmetic still lands. Replace that with a single ordered registry of the run's
beats — position in the rail, button label, and the route name that beat
telemetry will later report — and have each beat read its own entry.

**Rail behaviour must not change.** The rail still measures four phases, not
screens, and each beat must draw exactly what it draws today. This ticket is
labels plus a source-of-truth move; anything that alters what the rail looks
like belongs to the ticket that adds a beat.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Each of the six current beats renders its own button label; no two beats
      in the run say the same thing
- [ ] One module is the single source for the run's beat order, rail position
      and button label, and every beat reads from it
- [ ] The rail renders identically to before on all six beats — same filled
      segments, same partial fills
- [ ] The rail's accessible label still reports the correct step of four on
      every beat
- [ ] Adding a beat to the registry is a single entry, with no arithmetic to
      restate on other screens
- [ ] Verified by hand on the simulator, including at the largest accessibility
      content size with the app relaunched after changing it

# Body, Motion and Mind — the scoring pass

**2026-08-29.** Eleven decisions from a design review, plus six taken on
delegation. Licensed by `docs/adr/0001-replay-compatibility-expires-at-launch.md`,
which is what makes a scoring change affordable at all. Vocabulary is
`CONTEXT.md`.

## What was wrong

The review found six things, each independently checkable:

1. **Body and Motion were one axis.** `AGI` read steps, `STR` read active
   calories, and those correlate strongly. The only genuine strength signal in
   the app — allowlisted workout sessions carrying heart-rate evidence — was
   spent lowering Body's *bands* instead of raising Body's *points*. Lifting was
   rewarded by asking less of you.
2. **The threshold shift was invisible.** Up to 25%, moving Gold to 7,500 steps
   on a well-spread day, with no surface saying so. The code's own comment noted
   this "reads as a bug in the score rather than as a gift."
3. **The guidance layer was dead code.** `stat-detail.ts` — sole consumer of
   `nextTierFor`, sole explainer of the shift — was unmounted by the
   Today/Character merge. Only its `STAT_WHY` constant survived.
4. **The one help screen described a retired engine.** `app/progress.tsx` said
   active minutes and active hours "earn points". They stopped earning points at
   deviation #41 and became shifts. Mind was not mentioned at all.
5. **Tier steps left dead zones.** 5,000 steps and 9,999 steps scored
   identically. Meanwhile the race, over the same day, moved continuously — two
   systems disagreeing about what a day was worth.
6. **Mind was unreachable for most of the intended cohort, and the surfaces did
   not know.** Quests are picked by tier alone, so a phone-only account can be
   dealt a sleep quest it cannot clear, by construction. The sleep card said
   "No reading yet" daily and forever.

Also: **Mastery** (then "ability rating") is `sqrt(lifetime/100)` — monotone,
measuring tenure while claiming to measure ability. And **strain** is computed on
every render and rendered nowhere.

## What changes

### Phase 1 — the keystone. Pure, test-first, no migration.

**Body reads work, not just burn.** Verified strength-session minutes become an
earning route into `STR` at a higher per-minute rate than ambient calories.
`workoutShift` is **retired** in the same change: a signal must not both lower a
stat's bands and raise its points, which would be a direct double-count on one
stat. `spreadShift` is untouched — different signal, different stat.

**Points interpolate between tier anchors.** 0 / 250 / 650 / 1,200 stay exact, so
the ceiling stays 4,400, `tierFor` is untouched, and the Daily Walk streak and
`AGI_base` still read the ladder they read today. Everything between the anchors
becomes continuous, so every step moves something and the score finally has the
same shape as the race.

**Mind tapers instead of falling off a cliff.** Gold holds through nine hours,
then decays toward Silver by about ten and a half, and floors there. Sleep data
from HealthKit is noisy — a watch on the nightstand, `inBed` versus `asleep`, a
merged nap — and a cliff on noisy data punishes measurement error as though it
were behaviour. The floor is Silver rather than Bronze because eleven hours must
never score below five.

> **This changes `computeDailyScore`'s output.** `sync-health` and
> `finalize-days` redeploy in the same pass. That is the rule that cost two days
> of scoring in August 2026, and it is not negotiable.

### Phase 2 — migrations, paired with their Edge redeploys.

**Personal records.** Best day per stat, kept permanently. Pays the character,
never the ranking — raising the cap would reopen the raw-step arms race the cap
exists to close.

**Capability-aware quests.** A stat that cannot be earned is never asked for. The
sleep card explains once instead of accusing daily.

### Phase 3 — surfaces. OTA.

- The **spread** is spoken as a consequence in real units, in the character's
  voice: *"You've moved in seven hours — today's ridge is 7,500."* Not a badge,
  not a percentage.
- **`stat-detail.ts` is re-mounted** under the You tab's expanded stat block. It
  is tested and correct; it was orphaned, not wrong.
- **`/progress` is rewritten** against the real three-stat model — five entries,
  Mind included, the "active minutes earn points" falsehood removed, and the
  spread explained.
- **"Ability rating" becomes "Mastery".** The mechanic is right and stays
  monotone: a falling number punishes the quiet week, and the quiet week is who
  this product is for — the same argument `useScoredDayCount` already makes for
  gating on lifetime rather than a recent window. Only the label was lying.
- **The crest** — the character's visible state on a day that went past the
  ceiling, that day only.

## What deliberately does not change

- **The cap stays.** It is the anti-cheat. Headroom pays character, never rank.
- **Normalization stays.** `3 / earnable stats` is correct and well tested. The
  bug was that no surface knew about it, not the arithmetic.
- **Mastery stays monotone.** See above.
- **No fifth evolution stage.** Stage 4 remains terminal at level 21; records and
  the crest carry post-cap progression. Per-stage art is out of scope and was
  never in it — one artwork per species is what makes the roster affordable.
- **No new HealthKit types, no native build.** `HKWorkoutTypeIdentifier` is
  already requested, already disclosed and already stored; the Body fix needs no
  new permission. Any read of `workout_sessions` for scoring goes the
  service-role route, because a schema test asserts no `public` function names
  that table and a pace carries routine.
- **No score total is ever spoken.** The ban is right. What changes is that the
  *causal story* becomes legible in real units.
- **Strain stays dormant**, and gets a comment saying so. Building it a surface
  in a pass that is already changing the curve is scope creep; leaving it
  silently dead is how it rots.

## Known stale documents this pass must fix

`docs/mvp-scope.md` still describes a species picker at onboarding, four tabs
including a Character tab, and the six-lane race — all superseded by deviations
#55, #56 and #57. It is the IN/OUT contract, so its being stale is the exact
failure it was written to prevent.

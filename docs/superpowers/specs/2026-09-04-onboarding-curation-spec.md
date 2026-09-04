# Onboarding curation — spec

**Date:** 2026-09-04
**Status:** Ready to build.
**Supersedes:** the proposal in `2026-09-03-onboarding-curation-design.md`, which
stays on disk as the record of what was considered. Where the two disagree, this
document wins — several of that document's claims did not survive checking
against the code, and each correction is called out below.
**Proposed deviations:** #60, #61, #62.

---

## Problem Statement

A new account meets Kairo through a six-beat run — `/welcome`, `/one-sky`,
`/connect`, `/difficulty`, `/privacy`, `/name` — and comes out the other side
with three problems the app never tells them about.

**Their quests are sized by how long they have been here, not by what they can
do.** `questTier()` keys off lifetime scored days, so every account starts on
`starter` regardless of whether they walk 2,000 steps a day or 14,000. A
brand-new athlete is dealt bars they clear before breakfast; a genuinely gentle
walker who has been here a month is promoted to `strong` for reasons that have
nothing to do with them. The screen that could fix this — `/difficulty` — asks
the user to self-assess with no information in front of them, and its own copy
admits the automatic rule is wrong by construction.

**The Health ask arrives without its best argument.** The one dialog whose
refusal cannot be undone from inside the app is preceded by two value cards that
describe the game, and by nothing that addresses why someone might feel their
own activity is not worth counting.

**And three claims the app makes today are false.** The body-metrics card says
height and weight sharpen Body when no scoring path reads either. The
notification sheet promises pushes at 11 PM and midnight that deviation #52
retired — a false claim about notification volume, on the screen where people
decide whether to accept notifications. Settings says quest difficulty comes
from how long you have been here, which this change makes stale for every
onboarded account.

Separately: **the entire solo cohort can never be asked for notifications at
all.** `shouldAskForNotifications` gates on `hasSquad || hasEvent`, and Kairo is
solo-first. The 08:00 digest is the solo loop's only re-engagement, and it is
structurally unreachable for anyone without a squad.

---

## Solution

The run becomes **seven beats**: `/welcome` → `/one-sky` → `/mirror` →
`/connect` → `/difficulty` → `/privacy` → `/name`.

One new beat, `/mirror`, sits directly above the Health ask and does one job:
move the blame off the user. *You're not lazy — you're just not being counted.*

One new mechanic, **calibration**, replaces self-assessment with a measurement.
After the Health grant, Kairo reads fourteen complete days of step totals from
the phone, takes the median of the days that recorded anything, and proposes a
quest tier. That proposal arrives on `/difficulty` as a header above the choices
that screen already renders — *"Your typical day is 6,240 steps. We'd start you
on Steady."* — with Steady pre-selected. The user can change it there or in
Settings, and their choice still wins outright.

Nothing about those fourteen days leaves the phone. The only thing saved is a
three-value enum in a column that already exists.

The flock ask arrives as a fourth welcome card on Today, after the three that
already run there. The notification ask is not rebuilt — it already exists, and
instead gets truthful copy and a why that includes being here alone.

---

## User Stories

1. As a new Kairo player, I want the run to tell me what the game is before it
   asks for anything, so that I understand what I am granting access to.
2. As a new player who feels bad about how little I move, I want the app to say
   the problem is that nothing has been counting, so that the Health ask reads
   as an offer rather than an audit.
3. As a new player, I want the beat before the Health ask to be short and soft,
   so that it frames the dialog without delaying it.
4. As a new player in a hurry, I want Skip to take me past the pitch but not
   past the reason for the ask, so that I still see the framing before the one
   dialog I cannot undo.
5. As a new player, I want the progress rail to keep moving on every beat, so
   that a longer run does not feel stalled.
6. As a new player paging through the opening value cards, I want the dots to
   promise the number of cards that actually exist, so that the run does not
   imply a card that never arrives.
7. As a new player, I want each button to say what this particular beat is
   about, so that the run does not read as three identical Next taps.
8. As a walker who covers 14,000 steps most days, I want my first quests sized
   to that, so that the tab is not pre-cleared before I wake up.
9. As a genuinely gentle walker, I want my first quests sized to my real days,
   so that the tab is achievable rather than aspirational.
10. As a new player, I want to be told the figure my quest size was derived
    from, so that the pre-selection reads as a measurement rather than a guess.
11. As a new player, I want to override the proposed size on the same screen
    that proposes it, so that the measurement is a default and not a verdict.
12. As a new player, I want my own choice to win outright over anything the app
    measured, so that the app never argues with me about my own difficulty.
13. As a new player with a brand-new phone, I want the app to say it does not
    have much history yet and start me gentle, so that it does not pretend to
    have measured me.
14. As a new player restoring from a backup with patchy history, I want partial
    history to still produce a proposal, so that a few missing days do not throw
    away everything the phone does know.
15. As a new player whose phone sat on a desk for ten days, I want those empty
    days ignored rather than counted as zeroes, so that a period I was not
    carrying it does not drag my size down.
16. As a new player connecting mid-morning, I want today's partial steps left
    out of the calculation, so that the hour I happen to be standing in does not
    change my quest size.
17. As a new player, I want to be told the fourteen-day read happened on my
    phone and only the size setting was saved, so that I know what a measurement
    actually cost me.
18. As a privacy-conscious player, I want the calibration read to touch step
    counts only, so that proposing a quest size does not become a reason to read
    my heart rate and workouts.
19. As a player who later disagrees with the size, I want to change it in
    Settings, so that the onboarding decision is not permanent.
20. As a player who wants Kairo to decide, I want Automatic still available in
    Settings, so that opting back into the automatic rule remains possible.
21. As a player reading Settings, I want the difficulty help text to describe
    the rule that actually applies to me, so that it does not contradict what
    onboarding just did.
22. As a solo player with no squad, I want to be offered notifications once my
    first day has scored, so that the app's main re-engagement loop is reachable
    without recruiting anybody.
23. As a player deciding on notifications, I want the sheet to state the real
    cap of one message a day, so that I am not declining based on a promise of
    late-night pushes the app cannot send.
24. As a player deciding on notifications, I want to know the message arrives at
    8am and says how yesterday went, so that I can judge whether I want it.
25. As a player who taps Not now on notifications, I want no system dialog to
    fire, so that I can be asked again later rather than spending my one
    irreversible prompt.
26. As a player, I want the notification ask to arrive when there is genuinely
    something to tell me, so that it does not read as a permission gauntlet
    during onboarding.
27. As a new player finishing onboarding, I want the welcome cards to explain
    the game before asking me to bring friends, so that the social ask arrives
    after its reason.
28. As a new player, I want a chance to paste an invite code or invite a friend
    on my first day, so that flying with a flock is a real first-day option.
29. As a new player who is not ready to invite anyone, I want a plain Not now,
    so that declining is frictionless and final for that run.
30. As a player who skipped the flock card, I want the Sky tab's invite slot to
    still be there, so that the option is permanent rather than a one-time
    offer.
31. As a new player, I want only one native sheet on screen at a time, so that
    the app does not wedge itself presenting two modals in one frame.
32. As a player reading the body metrics card, I want it to say what height and
    weight are actually for, so that I do not believe editing them changes my
    score.
33. As a player, I want to never be asked for my age, height or weight during
    onboarding, so that the run does not cost me a screen for a question that
    changes nothing.
34. As a VoiceOver user, I want each new beat to read as coherent grouped
    elements, so that a screen is not a dozen meaningless stops.
35. As a player at the largest Dynamic Type sizes, I want every new beat's text
    bounded and scrollable, so that no control — especially a decline — is
    clipped out of reach.
36. As a product owner, I want each beat's impression recorded, so that the
    cost of a longer run is measurable rather than assumed.
37. As a product owner, I want to know whether calibration produced a proposal
    or fell back for lack of history, so that I can tell how often the
    measurement actually fires.
38. As a product owner, I want to know how the notification ask was answered, so
    that widening its why can be judged against real grant rates.
39. As a product owner, I want to know how the flock card was answered, so that
    the social loop's first-day conversion is visible.
40. As a privacy-conscious player, I want no telemetry payload to carry a step
    figure or a proposed tier, so that analytics cannot reconstruct my activity.
41. As a developer, I want the calibration bands derived from the quest
    catalogue, so that moving a tier's targets cannot leave the proposal
    describing the old ones.
42. As a developer, I want a test that also pins the bands as literals, so that
    a catalogue edit that moves a band fails loudly and a human decides.
43. As a developer, I want the calibration rule to be one pure function in the
    keystone, so that the client and any future server consumer cannot disagree.
44. As a developer, I want `questTier`'s comment to record that the median was
    rejected as a standing rule and adopted as a one-shot seed, so that the code
    and the shipped behaviour do not tell two stories.
45. As a developer, I want the profile row to still commit exactly once on the
    name screen, so that deviation #22's deleted flag stays deleted.
46. As a developer, I want nothing asked after that insert, so that
    `resolveRoute` cannot flip to ready under an unfinished screen.

---

## Implementation Decisions

### Body metrics are never asked, and the claim about them is corrected

`height_cm`, `weight_kg` and `birth_year` stay in Settings and are never
collected during onboarding. **The design document's justification was wrong in
one sentence and is corrected here**: it claimed no path in the keystone reads
them, but `strain.ts` lives in the keystone and reads `birth_year` through
`maxHeartRateForAge()`. The true and narrower statement is that **no scoring
path reads any of the three** — Strain is display-only and never touches
`daily_scores`.

The body metrics card's comment currently says height and weight sharpen Body
because active calories depend on body mass. They do not sharpen Body *in
Kairo*: Body reads active calories that arrive from HealthKit already computed
by Apple against the body profile in the Health app, and Kairo's copies are
disconnected from that. The comment is rewritten to say what is true.

### Calibration is one pure function in the keystone

A new `calibratedTier()` joins `questTier` and `QUEST_CATALOGUE` in the
keystone's quest module. It lives there rather than in a module of its own for
the reason the tier-points split already records: it needs the catalogue and
returns a `QuestTier`, so a separate module is either an import cycle or a table
threaded through as an argument, and the argument version has already broken an
out-of-package caller at runtime once.

It takes a list of daily step totals with their local dates and returns either a
proposal carrying the median it came from, or a no-history outcome. It is pure,
zero-dependency, reads no clock and generates no randomness — the caller
computes the window's dates and passes them in, the same discipline `planDay`
follows by scoring against the date being scored rather than wall-clock today.

The rules it holds, all in one place:

- **Days with a zero step total are dropped**, not counted. HealthKit returns a
  zero-sum interval for a day the phone recorded nothing, which is
  indistinguishable at the statistics-collection level from a genuine rest day —
  so a phone that was off for ten days would otherwise contribute ten zeroes and
  median someone to the floor while the screen claims to have measured them.
  This is the same judgment the scored-day count already makes by filtering on a
  positive total.
- **At least four qualifying days are required.** Below that, the outcome is
  no-history and the tier falls back to Automatic.
- **The statistic is the median, never the mean.** One long hike must not
  promote somebody for a fortnight. The Challenge resolver already uses a
  trailing median for the identical reason; this reuses that judgment rather
  than inventing a second one.
- **Bands are each tier's minimum steps target, derived from the catalogue.**
  Today that resolves to 3,000 / 7,000 / 12,000. The proposal is the highest
  tier whose entry bar the median already clears, falling to the lowest tier
  below the middle band. The minimum is chosen over the maximum deliberately: a
  tier's bars should be met on a good day, not already beaten on a median one,
  which is the shape the difficulty screen's copy already promises.

### The window is fourteen complete days ending yesterday

**Today is excluded.** Calibration runs seconds after the grant, typically
mid-morning, and a partial day of a few hundred steps sitting in a fourteen-value
set drags the median down by roughly half a band. The window is the fourteen
complete local days ending yesterday, computed against the *device* zone, because
no profile row and therefore no stored timezone exists yet — the same standing
assumption the connect beat's existing read already makes.

### A third, narrow HealthKit read

`readDailyStepTotals` joins the health source interface beside `readStepsToday`.
It runs the same daily-interval step statistics collection that read already
uses, over fourteen days instead of one: one query, one metric, roughly fourteen
intervals.

**It is deliberately not the sync-path window read**, and the design document's
proposal to widen that one is rejected. That function runs six hourly statistics
collections — steps, distance, active energy, exercise minutes, and heart rate
twice — then every workout sample in the range, then sleep, and returns a bucket
payload. Over fourteen days that is thousands of interval objects plus every
workout, to extract one number, and it would read heart rate, which is
owner-readable only and absent from every projection, for no reason at all.
Reading that much to propose a quest size would leave the screen's privacy claim
technically accurate and morally misleading. The existing read's own comment
already says it is deliberately not that function; the third shape gets a comment
explaining why it exists, the way the second one does.

Adding it to the health source interface keeps it injectable behind the existing
fake. That buys injectability, not coverage — the screens consuming it are
verified by hand, per the repo's standing posture.

### Calibration writes a concrete tier, and Automatic becomes the fallback

The proposal is written into the onboarding answers store as the initial quest
tier, and the difficulty beat renders with it pre-selected. **This means an
onboarded account is no longer on Automatic by default**, and that is the
intended change rather than a side effect: the automatic rule is wrong by
construction for part of the cohort, so seeding past it is the point.

The automatic rule survives as the fallback for accounts that predate
calibration, that hit the no-history outcome, that skip the beat, or that clear
their override in Settings. The keystone's comment is amended to say so, and to
record that a trailing median was rejected **as a standing rule** — because it
makes the bar rise as the user improves — and adopted **as a one-shot seed**,
which cannot rise because nothing re-reads it. Without that amendment the code
says the median was rejected while the app ships it, which is two sources
disagreeing about one decision.

The store gains a third field: the median crosses from the connect beat to the
difficulty beat so the header can print the figure. **The median is never
written to the profile and never enters a telemetry payload.** It lives in
in-memory state that is already cleared on commit, which is what keeps the
screen's claim — the read happened on your phone, only the size setting is
saved — exactly true.

The store's comment stops describing a null tier as what every account starts
on; it is the fallback now, not the default.

### The dedicated calibration screen is not built

The design proposed a `/calibrate` beat between connect and difficulty. It is
merged into the difficulty beat instead. With the proposal pre-selected, a
separate screen says *"we'd start you on Steady"* and the next screen
immediately asks *"how big?"* with Steady already chosen — two screens for one
decision, in a run being lengthened. The difficulty beat already renders the
four choices and already reads real sample targets from the catalogue; it gains
two sentences and a pre-selection. The measurement belongs attached to the thing
it justifies.

### The mirror beat uses a pose, not the reaction system

`/mirror` renders Kairo through the same thumbnail component the welcome beat
already uses for its three birds. **It does not give the `tired` reaction a
producer**, and the design's claim that it would is struck: that reaction is
declared with no producer deliberately, because sleepiness is a daily Mind state
rather than an event, and an onboarding illustration has no account state to key
an occurrence off. Wiring it as a producer would breach a stated invariant in
passing.

### Skip goes to the mirror beat

Both skip affordances currently jump to the connect beat, on the documented
reasoning that the app cannot function without Health so there is no skipping to
the end. That holds, but with a beat now sitting between the pitch and the ask,
skip must land on the mirror rather than past it — otherwise the users most
likely to decline are precisely the ones routed around the argument. Skip's
purpose is getting past the pitch, not past the framing. The mirror beat itself
carries no skip; there is nothing left to skip.

### The progress rail keeps four segments

The rail measures phases, not screens, and its four phases still hold: what this
is (welcome, one-sky, mirror), letting it in (connect), your choices
(difficulty, privacy), and the name. Only the per-screen fill and partial values
move. The paged dots stay — **the design's claim that they duplicate the rail
does not survive reading the component**: the rail answers how far through the
run, the dots answer which value card, and the dots are already hidden from
assistive technology so that only one thing announces position. Their count
currently promises three cards while two exist; the mirror beat becomes the
third and the count becomes correct without being edited.

### The notification beat is not built; the existing ask is corrected and widened

The design proposed a `/notify` beat. Everything it asked for already exists —
a primer sheet presented before the system dialog, a Not now that does not fire
the dialog, a single modal host, and a pure ordering function that puts Health
first and refuses to chain two asks in one session. Two things about it are
wrong:

**Its copy describes three retired triggers.** It promises to tell the user when
a day starts and when it is about to close, and states a cap of three a day with
two exceptions arriving at 11 PM and midnight. Deviation #52 retired all of
that; the app sends one push a day, the 08:00 digest, capped by the digest
selector and by a database constraint. The copy is rewritten to the truth, which
is a stronger prime than the fiction: one message a day, at 8am, saying how
yesterday went and what today needs.

**And it is unreachable for solo players.** The why is widened from having a
squad or a running Battle to include **a first scored day** — the moment there
is genuinely something to say at 8am tomorrow. The ordering rule, the
one-ask-per-session latch and the single modal host are untouched.

This is the deferred notification ask arriving through the mechanism that
already exists rather than as a route, and it is worth pulling forward if
anything else slips: the entire solo cohort is currently excluded, which is a
larger live gap than any beat in this document.

### The flock ask is the fourth welcome card

Joining or creating a squad needs the profile row, so the ask has to come after
the insert — and a route after the insert is deviation #22's trap. The design
proposed a separately leased first-run sheet on Today. That collides with the
welcome cards, which are already a once-ever first-run modal on Today leasing
the same host: a brand-new account would meet both on the same first focus, one
would lose the lease, and the loser would reappear later out of context.

So the flock ask becomes a fourth welcome card: no new modal owner, no second
once-ever marker, no ordering rule between two first-run surfaces, and it lands
in a sequence the user is already tapping through. It carries three real
options — paste an invite code, invite a friend, not now — which means the card
list gains an optional actions slot that only this entry uses; the other three
stay linear reads.

**A known, accepted loss:** the welcome milestone is marked when the run opens,
not when it finishes, so someone who force-quits before reaching card four never
sees it. Card four is not moved to the front to fix this — asking someone to
recruit friends before the game has been explained is the ask arriving before
its why, the rule the notification policy already enforces. A second marker
would fix it and reintroduce exactly the two-surface ordering problem this
arrangement exists to avoid. The loss is bounded: the Sky tab's flock rail
carries a permanent trailing invite slot, so a missed card costs a nudge rather
than the feature. A comment records that the loss is known and why it is
tolerated, so the next reader does not helpfully repair it.

### Terms under the first CTA are cut

The design proposed a terms and privacy line beneath the welcome beat's button.
**There is no policy to link to** — no terms or privacy URL exists in the app
config, in the web project, or anywhere in the app; the privacy beat is a
plain-language in-app screen, not a legal document. And the standing 5.1.3
launch blocker records that the policy and the App Store privacy answers still
do not reflect the race's reciprocal consent gate. Linking now would assert that
a document describing the app incorrectly is current, which is the failure the
privacy beat and the HealthKit sheet rewrite both exist to prevent. The line is
recorded as blocked on the policy rewrite, with the welcome beat named as its
destination once that lands.

### Telemetry: four types, three lifetimes, no migration

The events table's type column is free text with a length check, so none of
these cost a schema change.

- **Beat impressions** fire unguarded on each beat's mount, carrying the route
  name and nothing else. Onboarding runs once per account by construction, so
  the funnel is honest without a store; a back-navigation duplicate is absorbed
  by counting distinct beats. Seven new once-ever milestone keys was the
  alternative and buys a guarantee the funnel does not need.
- **Calibration resolved** is once ever, on the milestone store, carrying only
  whether a proposal was made or history was insufficient. It deliberately does
  **not** record which tier was proposed — that is a three-bucket step count,
  and a step median is a health figure.
- **The notification answer** fires per answer, including deferrals, since that
  sheet is dismissible per session and a deferral can genuinely recur.
- **The flock answer** rides the welcome run's existing once-ever marker; it
  needs no marker of its own because the card cannot be reached twice.

**No payload carries a health figure, a step median, a proposed tier, or a
Motion location.** The scan test that already enforces this class of ban on the
Today tab is extended to cover the onboarding beats — the same guard over more
files, rather than a second guard that can drift from the first.

### Three stale claims are fixed in one commit

The body metrics card's Body claim, the notification sheet's retired-trigger
copy, and Settings' description of where quest difficulty comes from. All three
are false in the app today, all three are independent of everything else here,
and all three ship first.

---

## Testing Decisions

**A good test here asserts external behaviour and nothing else.** It says what
tier a set of daily step totals produces, or which permission ask is due given a
state — never that a particular helper was called, never a snapshot of a
component tree. The repo's posture is strict test-driven development on scoring,
day boundaries, Events, streaks and anti-cheat, and hand verification on device
for UI; this change sits mostly in the second category by design, which is why
it was shaped to concentrate its logic in one pure function.

### The calibration function

The bulk of the coverage, in the keystone's existing quest test file, beside the
tier rule's own tests — that file is the prior art and the new cases follow its
shape directly.

What gets asserted: a median clearly inside each band produces that band; a
median exactly on each boundary produces the expected side; zero-step days are
excluded from the median rather than counted; a set with fewer than four
qualifying days produces the no-history outcome regardless of how high the
non-zero days are; a set of all zeroes produces no-history rather than the
lowest tier; a single very large day does not move the median the way a mean
would; and the returned median is the figure the caller will print.

**The bands are pinned twice, in opposite directions**, following the pattern the
scoring tests already use for the daily step baseline. Once derived from the
catalogue, so that moving a tier's step targets cannot leave the proposal
describing the old ones. Once as literals — 3,000, 7,000, 12,000 — so that the
derivation cannot be too obedient: a catalogue edit that silently drags a band
should fail and put a human in the loop rather than quietly changing what every
new account is proposed.

### The notification ask policy

The existing ask-policy test file gains cases for the widened why: a solo
account with no scored day is still not asked; a solo account with a first
scored day is asked; and the existing guarantees hold unchanged — Health still
wins the slot when both are eligible, a second ask still does not chain onto the
one just answered, and an already-answered permission still produces no ask.
That last group matters more than the new cases: the widening must not reopen
the two-modals-in-one-frame defect that function exists to prevent.

### The payload ban scan

The scan test that already walks the Today tab for banned figures extends its
file list to the onboarding beats. It asserts the same three bans and adds the
step median to what may not appear in a payload.

### What is verified by hand, and how

The mirror beat, the merged difficulty header, the rail's re-partialled fills,
the CTA labels, the fourth welcome card and the corrected notification copy are
all verified on the simulator. Two things are not optional there. Accessibility
structure goes through Xcode's Accessibility Inspector before a build is cut —
each new beat must read as coherent grouped elements, with both halves of the
grouping fix applied, since the documented parent-collapse behaviour has already
failed on a real build. And every new beat is checked at the largest
accessibility content size, with the app **relaunched** after changing it,
because text measurements are cached and a size change on a running app renders
correct text inside stale boxes. That check is what found a permission sheet
that had silently clipped away its own decline control.

---

## Out of Scope

- **A dedicated calibration beat.** Merged into the difficulty beat.
- **A first-day preview beat.** The design proposed showing three real quests at
  the chosen tier as a commitment device. It is cut: it simulates a screen the
  user reaches for real within about ninety seconds, and the version that would
  have been genuinely compelling — promising tomorrow's exact three — cannot be
  built safely, because the quest picker filters on a sleep-capability column
  that does not exist during onboarding and guessing it wrong changes the pool
  size, the rotation, and therefore which three appear.
- **A dedicated notification beat.** The ask exists; it is corrected and widened
  instead.
- **A terms and privacy line under the first CTA.** Blocked on a policy rewrite
  that is already a launch blocker in its own right.
- **Retiring the paged dots.** Based on a misreading of what they indicate.
- **Giving the tired reaction a producer.**
- **Asking for age, height or weight**, now or later, in onboarding.
- **Changing the scoring engine.** Nothing here touches tiers, points,
  thresholds, the day planner, finalization, or the streak. Calibration reads
  raw steps from a local read and never reads a tier, so it is structurally
  clear of the shifted-versus-base ladder trap.
- **Changing the quest contract.** The picker, the catalogue, the completion
  table and the client-and-grader tier agreement are untouched; only the
  override's initial value moves.
- **Changing the automatic tier rule itself.** It stays as the fallback. Making
  the median a standing rule was considered and rejected — it reintroduces the
  rising bar and would require the grader to compute a median it cannot see.
- **The privacy policy and App Store privacy answers.** Still a launch blocker,
  still not fixed here, and nothing in this change should be described as
  fixing it.
- **A native change of any kind.** No new dependency, no native module, no
  package manifest edit.

---

## Further Notes

**Everything here ships over the air.** The reads, the screens and the pure
function are all JavaScript, and nothing touches the manifest, the plugins or
the native config. Confirm the working tree's fingerprint against the last
build's before publishing — if they differ, something native drifted and an
update would publish successfully and silently never arrive.

**The replay-compatibility ADR is unaffected.** Calibration writes a column that
already exists and moves no stored history, so nothing needs rescoring and the
ADR's licence is not being spent.

**Ship order.** The three stale-claim fixes and the CTA labels first — they
correct things that are false in the app today and should not wait behind a
design. Then the mirror beat, which is small and makes the dots' count honest.
Then calibration, which is the real work. The notification widening, the flock
card, and the telemetry and documentation pass are independent of calibration
and of each other; pull the notification widening forward if anything slips.

**Documentation is part of this change, not a follow-up.** The deviations table
gains #60 (body metrics never asked, documented as inert), #61 (a fourteen-day
local median seeds the starting tier) and #62 (the flock prompt is the last
welcome card). The repository guide's onboarding block currently describes six
beats and must describe seven. The user journey walkthrough covers the new run.
And the glossary gains three words that are now load-bearing and appear nowhere
in it: **beat**, **calibration**, and **seed** — the last one especially, since
it is what keeps this change distinct from the standing rule the keystone
records as rejected.

**No ADR.** The decision is reversible by clearing an override, and its
reasoning belongs where a reader will actually hit it — in the keystone's own
comment beside the rule it amends. A separate record would be a second home for
one argument, which is how two sources start disagreeing.

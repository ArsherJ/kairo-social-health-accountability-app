# The app's surfaces — the reasoning


> **2026-09-12 note.** Several files this text calls "still on disk", "unmounted with their tests" or "kept under `@deprecated`" were deleted by the ponytail audit (roadmap deviation #74): `TodayPanel.tsx`, `strain.ts`, `event.ts`, `Avatar.tsx`/`avatar-tint.ts`, `KairoLab.tsx`, `kairo-lab-contract.ts`, `data/*.json`, `validateCharacterManifests`, `species-art.ts`, `species-label.ts`, the `demo/` feature and `scripts/replay-dry-run.mjs`. The schema they served is untouched. Read those sentences as history.
Extracted verbatim from `CLAUDE.md` on 2026-09-08 to keep that file inside its
size limit. **The rules still live in `CLAUDE.md`** (search "Kairo is Playful");
this file is the *why* behind them — the device-seen failure that produced each
layout rule, the alternatives that were refused and what they would have cost,
and the copy decisions each screen makes.

Covers the accessibility pass (2026-08-14), the Playful redesign (deviation #58,
2026-08-30) and everything built on it: the onboarding run and its calibration
(#63) and welcome (#64) beats, the Sky corridor, the growth-stage (#30/#31) and
plumage (#33) art passes, the Flock strip (#25), and the three rounds of
device-seen layout faults (2026-09-05, 2026-09-07).

Superseded era detail — Sunlit's and the pre-Sunlit palettes, the retired tab
layouts — is in `docs/archive/design-history.md`.

---

**Kairo says things without words, and each one needs an accessible name.** A
stat is a glyph with no letters beside it; the character's level band, dominant
stat and ability rating are shape, shadow and ring. The pattern, set by
`StatIcon`, is: **a decorative or duplicative element is hidden**
(`accessibilityElementsHidden`), and **the group that means something is one
element with a composed label**. `src/ui/stat-names.ts` is the single source for
stat words — it also exports `dominanceName()`, since `Dominance` is
`CoreStat | 'balanced' | null` and so the figure needs naming too, and a
parallel table would drift. Where composition has real edges it gets a
tested pure module: `src/features/squad/row-label.ts` exists because a
leaderboard row was twelve separate stops (a six-person board took seventy-odd
swipes), and because "1-day streak" is right on screen and wrong out loud.
Before adding a label, check the text already beside it — the retired
`BattleCard`'s pace marker needed nothing, since its status line already said
"behind pace".

**Three rules the 2026-08-14 device pass added.** First: **grouping is
explicit.** `accessible` + `accessibilityLabel` on a parent is documented to
collapse its descendants on iOS and *did not* on that build — a leaderboard row
still read as separate stops. The mechanism is unconfirmed and the fix
deliberately does not depend on it: the parent keeps both props **and** every
direct child is hidden with `accessibilityElementsHidden` +
`importantForAccessibility="no-hide-descendants"`. Neither half is redundant;
removing one is how this comes back. Second: **the character HUD's layout stays
flow-based.** It was the app's only absolutely-positioned chrome, pinned at
`+8`/`+48`/`+48`/`+132`, and those constants assumed pill heights nothing
enforced — at large Dynamic Type the pills grew past each other and overlapped.
It is one flowing column now; do not reintroduce a `top` on any child. Third:
**before adding an accessible name, read what is already spoken around it.** A
label that repeats an adjacent line is noise; a label inside a control that
already names itself is a bug — `StatCoin` got one inside `StatRail`, which is a
single `Pressable` already speaking every rating on the rail, and it was reverted.

**Accessibility structure is verified in Xcode's Accessibility Inspector on the
simulator before a TestFlight build is cut.** This qualifies the "UI is verified
by hand on device" posture below rather than replacing it: the grouping failure
above cost a full build to find and another to confirm, and the inspector
answers *"is this row one element or twelve"* directly, with no VoiceOver
gestures and no build. Dynamic Type needs no GUI at all —
`xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`
sets it and `xcrun simctl io booted screenshot` captures the result.

**Stat identity is a glyph, not three letters, as of 2026-08-11.** `src/ui/StatIcon.tsx`
owns the only mapping; `StatCoin`, `StatBar` and `LeaderboardRow` all read it. It is
MaterialCommunityIcons on purpose while all chrome stays Feather — the split is
hairline = *things you operate*, solid = *things you are*. Don't blur it in either
direction.

**Kairo is Playful as of 2026-08-30** (deviation #58), which supersedes Sunlit's
palette and type. Sunlit's stale values (amber accent, the `#c9721c` display
ink, Caprasimo/Figtree) are in `docs/archive/design-history.md`; the reasoning
they followed is what this pass followed too. Same move a third time:
**every token in `src/theme.ts` kept its name and changed its value**, so around
ninety call sites re-skinned without being edited. A token names a *role*, never
a hue — `ramp.sage[500]` is a violet now and still means "your lane". Two
families are new: **gold** (earned) and **sky** (the flight). Fredoka and Nunito
replace Caprasimo and Figtree. Six things break easily:

- **A bright fill takes ink, never cream.** Sunlit's accent was amber and
  cream-on-amber was already impossible, so nobody had written it; Playful's is
  orange, which *looks* dark enough to take a cream label and measures
  **2.65:1**. Coral is 2.93 and gold is **1.52**. Four call sites shipped that
  pairing in this redesign's own first pass — the active tab pill, the board's
  day toggle, the streak chip and `CtaPill` — and every one of them rendered
  perfectly. `contrast.test.ts` now asserts the rule for every fill in the
  system *including the failures*, so a palette that later made one dark enough
  for cream fails loudly rather than silently becoming allowed. **`coralEdge`
  carries neither** ink nor cream and is pinned as such: it is a 3px lip, and
  the only wrong thing to do with it is set a word on it.
- **`Glass` is not a blur and must not become one.** `backdrop-filter` has no
  RN equivalent and `expo-blur` is a native module: it would move the
  fingerprint, spend one of the month's fifteen builds and withhold every OTA
  until that build landed. Same trade the Sky corridor already refused for
  `react-native-svg` (#56), and the reason this whole redesign shipped over the
  air. `Gradient` gained a `direction` and is now used ~20 times rather than
  twice; `experimental_backgroundImage` is deliberately unused, because its
  failure mode is a *transparent* view and an invisible active tab is worse
  than a banded one.
- **The corridor climbs now.** `sky-path.ts` went 402×520 → 393×1560 and two
  cubics became three. **`x` is no longer monotonic** — the flight weaves, and
  that assertion was replaced rather than left to rot; `dy < 0` is the
  invariant. `SkyCorridor`'s `BAND` was `0.11` of the *height*, which was the
  narrow axis when the race ran left-to-right and is the long one now: left
  alone it drew a 158pt band down a 361pt screen. Segment length is measured off
  the path now instead of approximated from the box, which is what stopped being
  right when the aspect inverted. **Nothing about the race's mechanics moved** —
  same payload, same client-side re-rank by capped steps, same derived finish
  line, same reciprocal consent gate.
- **The "Did you know?" beat is a phase of `/connect`, not a route, and its
  floor is deliberate.** It covers the real `readStepsToday` between the grant
  and the step reveal. Two things are easy to get wrong: the window opens when
  **`connectHealth` resolves, not at tap** — iOS has the permission sheet up
  during `connectHealth`, so a beat started at tap spends its whole minimum
  behind that sheet and vanishes in the frame it is dismissed — and the card
  comes down at the **later** of "minimum served" and "read finished", never the
  earlier, or a slow read hands over to a reveal with no number in it.
  `hatching-window.ts` is pure and tested on both. `trivia.ts` picks by a hash
  of the account (a `Math.random()` in a render body would swap the card's text
  mid-read, the same reason `pickQuests` is a hash) and states **no effect
  size** — every number in it is the app's own constant or the size of an
  action, and a test bans a bare `%`.
- **Onboarding is seven beats and the last one is still the name** (deviation
  #62, 2026-09-04). `/welcome` → `/one-sky` → `/mirror` → `/connect` →
  `/difficulty` → `/privacy` → `/name`. The design
  puts difficulty and privacy *after* the name, which is deviation #22's trap
  exactly. They ask before it — but `quest_tier_override` and
  `squad_data_consent_at` are in `profiles`' column-level **UPDATE** grant and
  not its INSERT grant, so there is nothing to write to until the row exists.
  `useOnboardingAnswers` holds both and the name screen writes them *after* the
  insert. Nothing is **asked** after the INSERT, the row still commits exactly
  once, and both grants are respected. Read that store before touching the flow.
  The entry moved from `/connect`, so `redirectTarget` returns `/welcome` now.
- **The run is declared once, in `src/features/onboarding/beats.ts`, and four
  numbers are derived from it.** A beat declares its **step**; the registry
  gives it `filled`/`partial` for the rail and `index`/`count` for the paged
  dots. All four were hand-written across the screens, and both pairs had
  already gone wrong the way that invites — the dots promised three cards while
  two existed. `beat-registry.test.ts` scans `app/(onboard)/` and
  `src/features/onboarding/` and fails any screen that puts a literal back, or
  that hand-writes its button words, its skip destination, or its impression.
  **The rail draws one segment per beat, "Step n of 7"** (deviation #75,
  2026-09-14): it measured four phases so adding a beat never lengthened the
  run, and testers read a half-filled segment as no progress and the run as
  stalled. The hatch shares the Health ask's step — a wait the player cannot
  act on is not progress. *Phase* survives only as a `pitch` flag, which Skip
  and the value-card dots derive from; `RAIL_STEPS` is derived from the run.
- **The difficulty beat opens with a measurement, and the tier it proposes is a
  seed rather than a rule** (deviation #63, 2026-09-04). `/connect` reads
  **fourteen complete local days** of step totals off the phone after the grant;
  `calibrateQuestTier()` in `quest.ts` medians them and proposes the highest
  tier whose entry bar the median clears; `/difficulty` states the reading above
  the choices it already renders, with the proposal pre-selected. **A new
  account is therefore no longer on Automatic by default.** Seven things break
  easily:
  - **Deviation #50 rejected the trailing median and this adopts it, and the
    two are not in conflict — a rule re-reads and a seed does not.** #50's
    argument is about a *standing* rule, whose bar rises as the player improves;
    read once into `quest_tier_override`, the same median cannot rise, because
    nothing re-reads it. `questTier()` is untouched and is still the fallback
    for accounts that predate calibration, hit `no-history`, skip the beat, or
    clear their override, and **its comment records both halves** — without that
    the code says the median was refused while the app ships it.
  - **The whole rule set is one pure function in `quest.ts`**, not a module of
    its own: it needs the tier rule *and* the catalogue, and a sibling importing
    both is an import cycle the moment either wants the result back. Threading
    `QUEST_CATALOGUE` through as an argument is the `TIER_POINTS` mistake, which
    broke an out-of-package caller at runtime rather than compile time.
  - **Today is excluded, zeroes are dropped, four qualifying days are the
    floor.** The grant is usually taken mid-morning, so a partial day drags the
    median down by roughly half a band. A zero-sum day is indistinguishable from
    a phone in a drawer or a phone bought last week, so counting them would
    median a new-phone player to the floor while the screen claims to have
    measured them — and a fortnight of zeroes is `no-history`, **never**
    Starter. `no-history` and a low proposal are different sentences and must
    stay so: one means we could not measure, the other means we did.
  - **Bands are each tier's *minimum* steps target, derived from the catalogue
    and pinned as literals by the same test.** The minimum because a tier's bars
    should be met on a good day, not already beaten on a median one; both halves
    of the guard because the derivation stops a second number describing the old
    bars and the literal stops a catalogue edit silently re-sorting every new
    account. Same arrangement `DAILY_STEP_BASELINE` has.
  - **`readDailySteps` is one daily-interval step collection and must stay
    narrow.** `readHealthWindow` over fourteen days is the obvious reuse and
    runs six hourly collections plus every workout sample plus sleep —
    including **heart rate**, owner-readable only and absent from every
    projection. Reading that much to propose a quest size would leave the beat's
    privacy claim technically accurate and morally misleading;
    `calibration-read.test.ts` scans the function body and fails if it widens.
  - **Nothing about those fourteen days leaves the phone**, and the screen says
    so. The median crosses beats in `useOnboardingAnswers` (already cleared on
    commit), is never written to `profiles`, and never enters a telemetry
    payload — a scan holds both. `calibration_completed` carries `{ outcome }`
    and **not the tier proposed**, once ever on an MMKV marker, because
    re-entering `/connect` and granting again re-runs the reading.
  - **The player's answer wins outright, and `questTierChosen` is what makes
    that true.** Pre-selection writes `questTier`, so without a flag a seeded
    value is indistinguishable from a chosen one and a second reading would
    reach two screens forward and undo a choice. No calibration *screen* is
    built: with the proposal pre-selected, "we'd start you on Steady" followed
    by "how big?" with Steady already chosen is two screens for one decision.
- **The mirror beat is third and both skip affordances land on it.**
  `onboardingSkipTarget()` derives that as the last beat of the opening phase
  rather than naming a route twice: skip's purpose is getting past the pitch,
  and the pitch *is* phase 0. Both cards used to name `/connect`, which was
  right while the pitch ended there — landing past the mirror beat would route
  the people most likely to decline around the argument written for them, on
  the beat that exists to move blame off them before the one dialog whose
  refusal cannot be undone from inside the app. The beat itself carries no
  skip. Kairo appears on it as a **pose with a heavy ground shadow** and the
  `tired` reaction still has **no producer** — sleepiness is a daily Mind state
  rather than an event, and an onboarding screen has no account state to key an
  occurrence against.
- **The welcome run is four cards, the fourth is the flock ask, and it is a
  card rather than a sheet** (deviation #64, 2026-09-04). The run is already a
  once-ever first-run `<Modal>` on Today leasing the same root view controller
  as the permission asks and the details sheet, so a *separately leased* flock
  sheet — which the design proposed — would put two first-run surfaces on one
  first focus, one losing the lease and reappearing later out of context. As a
  fourth card it needs **no new modal owner, no second once-ever marker and no
  ordering rule**. Five things break easily:
  - **Only one card carries an actions slot, and a test asserts exactly one
    does.** Cards one to three are linear reads with a next button; card three
    is the *reason* a flock exists (`FREE_SQUAD_MAX_MEMBERS` birds, one flag)
    and lost its invite CTA to card four, which is the ask. A second decision
    point in a run of linear reads is what this trades against.
  - **The interrupted run's loss is known and must not be repaired.**
    `welcome_seen` is claimed when the run *opens*, so a force-quit before card
    four means the ask is never seen. Moving it to the front is the ask
    arriving before its why; a second marker reintroduces the two-surface
    ordering problem. It is bounded by the Sky tab's permanent trailing invite
    slot. The reasoning is written into `WelcomePopups.tsx` for that reason.
  - **The join door is withheld from somebody who already has a squad.** A
    non-null `inviteCode` *is* the proof of one and the free tier holds one, so
    the join door for them is a path that can only fail; they get the share.
  - **`flock_prompt_answered` carries `{ answer }` and records which door was
    taken, not what came of it.** `squad_joined` and `squad_created` already
    say whether a squad resulted. It rides `welcome_seen` and needs no marker.
  - **Every word lives in `welcome-cards.ts`**, zero-runtime-import apart from
    the keystone and `theme.ts` reached by relative path, so root Vitest holds
    the copy honest — including that `RACE_FINISH_LINE` and
    `FREE_SQUAD_MAX_MEMBERS` are read from the constants. `WELCOME_NEXT_LABEL`
    is there too, because `beat-registry.test.ts` scans these directories and
    bans a `label="…"` literal on an `OnboardingCta`. The request crosses to
    the Flock tab as `?pane=join`; `flock-pane.ts` owns **both** the href and
    the parser, so a typo cannot make one side silently disagree, and the tab
    **consumes and clears** it — Expo Router keeps tab screens mounted, so a
    parameter left in place would reopen the form on every later visit.
  - **The sheet is bounded, scrolls, and lays its content out against a point
    width** — all three halves of the permission sheet's 2026-08-17 lesson,
    load-bearing here only since the fourth card. It was unbounded by design
    ("as tall as its copy"), which is survivable with one CTA and not with two
    pills and a decline under a 240pt art panel: at the largest content sizes
    the child clipped off the bottom is **"Not now"**, and `overflow: 'hidden'`
    means it is clipped silently rather than spilling visibly. The art scrolls
    with the rest; pinning it eats the bound. Three assertions pin it.
  - **`OnboardingCta` takes `lines?: 1 | 2`, default 1, and this sheet passes
    2.** The same pill has the whole screen on a beat and loses four lots of
    `space.lg` inside a scrim, so at the `chrome` scale's 1.4× cap a three-word
    label no longer fits on a 320pt screen and `numberOfLines={1}` ellipsises
    it — a control whose words are cut is one somebody cannot act on. It is
    also why the design's "Paste an invite code" ships as **"I have a code"**.
  - **One answer per run, on a ref.** `setOpen(false)` lands on the next render
    and RN can deliver taps to two `Pressable`s in one frame, so without the
    guard a fast double-tap files two events *and* pushes both destinations.
    `welcome_seen` bounds the card, not the frame.
- **Each beat records one impression**, `onboarding_beat_seen` with `{ route }`
  and nothing else, emitted by `useBeatImpression` — one hook taking a beat
  name, which is what makes "the route name only" true by construction rather
  than by review, since `/connect` is holding today's step count while it
  reports. **Unguarded, on mount**: the run happens once per account, so the
  funnel is honest with no marker store and a back-and-forward duplicate is
  absorbed by counting distinct beats. `userId` is deliberately **not** an
  effect dependency — it resolves a frame late and a dep fires the beat twice,
  once buffered and once live, which is the one duplicate that is not a person
  navigating. The hatch reports nothing; it is a phase of `/connect`, whose own
  impression covers the moment.
- **The disclosure gate did not move, and Today's hero is where it nearly
  did.** The three glass stat coins on the sky are the same
  `ratingForStatPoints` over the same lifetime rollups the You tab's rail reads,
  so they carry the same `full` gate — an ungated copy on the screen a brand-new
  account opens first would have undone deviation #37 by the back door. The
  sleep and lane tiles are the Strain/Sleep rows in a fourth dress and keep
  theirs. Quests, the hero, the race line and the Daily Walk stay ungated.
- **One icon family.** The Feather/MDI split (hairline = things you operate,
  solid = things you are) is **retired**. Its stated reason was that a hairline
  glyph beside a fat display numeral reads as a clerical annotation; Playful
  sets the whole surface in that register, so the reason points the same way and
  the surface it points at changed. All six Feather call sites moved.
  Reintroducing a second family is a design decision, not a convenience.
  Relatedly, `STAT_COLORS` **reverses** Sunlit's "no per-stat hue" rule: a Flock
  row carries four stat figures at 11pt with no words beside them, and shape
  alone does not separate three things at a glance. The hues are not new ones.

**`Screen bleed` hands the top inset back, and forgetting it is invisible until
somebody looks at a device.** Three of the four bleeding surfaces re-applied it;
`ProfileHeader` did not, so the You tab drew its handle under the clock and its
gear inside the Dynamic Island's cutout — where the only route to Settings could
not be tapped. Nothing errored and the screen was recognisably itself apart from
one row. `src/ui/bleed-inset.test.ts` now scans every `<Screen bleed>` for an
`insets.top`, following one level of imports because the header component is
usually what pads rather than the route file. It was verified against the real
bug: reintroduce it and the test names `app/(tabs)/profile.tsx`.

**The Sky flock rail is one row with exactly one trailing slot.** It used to
draw a dashed seat per unfilled place — five circles for a squad of one, which
wrapped to a second row and read as five separate things to do rather than as
one invitation. Four roster slots then one trailing slot, which is the invite or
an overflow `+N`, never both and never none. `MAX_SLOTS`/`SEAT` are a real width
budget (320pt screen − rail inset − padding = 260pt; 5×46 + 4×6 = 254), and
`flexWrap` is deliberately **absent**: this has to fail by clipping, which is
visible, rather than by wrapping, which is what it did and what looked like a
design. Withheld members sort last, so the row never drops a bird that has a
position in favour of one that does not. **Over a ghost race the rail is
titled YOUR RECENT DAYS** (2026-09-14, issue #45), with one line under the
seats — *Each faded bird is one of your own past days.* — because a rail that
still said "your flock" over a solo player's own past days read as strangers,
or as a bug. The title block is one accessible element whose label includes
the note; `sky-screen-copy.ts` holds both titles and the note; the info
button's explanation stays about the ridge, one explanation per fact.

**Four device-build UI faults, fixed 2026-09-05, all OTA.** They shipped
together because each is the same shape: a rule that was already written down
somewhere, applied in one place and not the next.

- **`LockedSlot` is one row for every free seat**, and `Leaderboard` renders it
  once. It drew a numbered dashed row *per* unfilled place — five identical
  full-width rows under a squad of one, most of a screen of them — which is the
  Sky rail's failure above, in the second surface, four days after the first was
  fixed. The row carries the count (`3 seats open`) and no rank, because one row
  standing for seats 2 through 6 cannot honestly wear one number; `SoloBoard`
  passes `remaining={1}` and reads the same. `resolveSlots` is untouched — the
  count was never wrong, only how many times it was drawn.
- **`StatRail` declares `flexDirection: 'row'`.** It was built as a column down
  the edge of the character screen's diorama, so the default direction *was* the
  layout and was never written down; deviation #59 re-mounted it in the You
  tab's flowing page, where it stacked three 54pt coins vertically down the left
  margin. Nothing errored and no test could see it. A layout that depends on a
  default is a layout that moves when its container does — declare the axis.
- **Counted figures go through `countWords` in `quest-copy.ts`.** HealthKit
  reports active energy as a float, so `toLocaleString()` on the raw value put
  "395.66 active kcal" in Today's one visible sentence and "4.34 of 400" in the
  details sheet — one section below a Body row that already said "4 kcal",
  because `todayDetails` had rounded it and the quest copy had not. One helper,
  used by every surface that prints a counted figure, with a test on each.
- **`TodayDetailsSheet` takes the bottom safe-area inset.** A `<Modal>` presents
  on the root view controller and gets no inset of its own, so "Close" — its
  only dismissal — sat over the home indicator's swipe region. The 2026-08-17
  sheet lessons are about the *top* and the width; this is the third edge, and
  `Screen` already applies the rule for every tab.

**Three more device-seen layout faults, fixed 2026-09-07** (issue #28). Same
shape as the four above: a rule the app already knew, not applied in the next
place.

- **The flight is inset below the flock rail**, and `flight-frame.ts` owns the
  arithmetic. The Sky's drawing box began at content offset zero while the rail
  is pinned over the top of the screen, so the *top* of the path — the ridge,
  where everyone who cleared the Daily Walk sits, because `cappedSteps` stops at
  the line — was drawn under the rail with its head cut off, on the tab meant to
  be the second screenshot. An inset rather than a nudge to where the screen
  opens: a scroller cannot go above offset zero, so the **top of the path**
  becomes unreachable by the rail at any offset the reader can produce, instead
  of being clear only at the one offset the screen chose. It claims nothing
  more — birds below the top scroll under the rail as the reader climbs, which
  is what pinned chrome means and is not what was broken.
  Three things break easily. **The rail's height is measured, not assumed** — it
  carries a line of type, so it grows with Dynamic Type and a constant would be
  right at one text size only. The measurement lands a frame late, and that is
  harmless by construction rather than by luck: the inset and the opening
  offset move together, so the flight does not visibly shift when the rail
  reports, and a test pins it. **`flightFrame` is handed `chromeBottom`, so
  every assertion about it holds for whatever the screen composes** — drop the
  rail out of that sum and the flight goes back under it with the whole suite
  green. A source scan on `sky.tsx` is what closes that, the same move
  `bleed-inset.test.ts` makes. **The opening position is also clamped above
  the pinned foot** (2026-09-14, issue #45): `flightFrame` takes `footTop` —
  the viewport less the bottom inset, the tab-pill clearance and the measured
  foot — and a player with no steps yet, whose bird is at the ground where the
  standing card and the freshness line are pinned, opens with the bird, its
  label and the gap above it. The foot wins over the rail when a 320-point
  phone at the largest text size cannot satisfy both, because the bird is what
  the reader came for; the foot measuring late leaves `openAt` unchanged,
  since the placement lifts the bird by the same amount. Opening position
  only — birds still scroll under the foot. **The gradient spans
  the whole scroller**, inset included, or the inset is a band of `colors.night`
  above the sky rather than clear air. And **the inset moves the drawing box,
  not the path**: clouds, band, birds and both labels are positioned inside that
  one box, so nothing can be left behind at an old coordinate. `flightFrame`
  also took over the open-offset arithmetic the screen had inline, which is what
  makes "opens on your own bird, a third down" testable at all.
- **The invite code shrinks rather than reflows.** It took the default `prose`
  scale — 1.8x on a 38pt face with 10pt of letter-spacing — and broke to a
  second line at the largest sizes with one character orphaned under the tab
  bar. A code is drawn geometry, so it takes `fixed` and then
  `numberOfLines={1}` + `adjustsFontSizeToFit` + a `minimumFontScale` floor. The
  three are only correct together: the line limit alone truncates a character,
  `adjustsFontSizeToFit` alone is free to wrap, and no floor lets iOS shrink six
  characters that have to be read aloud past legibility. Guarded by a source
  scan in `invite-code.test.ts` that reads the `<Text style={styles.code}>` tag
  itself, not the file — a `numberOfLines` elsewhere on the board must not
  satisfy it.
- **The dev client's floating gear is off, and it was never in TestFlight.**
  `expo-dev-client`'s podspec declares
  `s.dependency 'expo-dev-menu', :configurations => :debug`, so the pod that
  draws it is not linked into a Release configuration at all and `ios-production`
  builds Release — the confirmation the ticket asked for is in the podspec, not
  in a build. For the development build `hideDevMenuFloatingButton()` writes
  `showFloatingActionButton: false` through the optional `DevMenuPreferences`
  native module, `__DEV__`-guarded, from the root layout. **Deliberately a
  runtime write rather than `ios.infoPlist.EXDevMenuShowFloatingActionButton`**,
  which sets the same default declaratively and is a fingerprint input: measured
  on 2026-09-07, that one line took the tree's runtimeVersion from `9d76c5d3…`
  to `89a1b399…`, so it costs a native build and withholds every OTA until that
  build lands. Shake, the three-finger long press and ⌘D still open the menu;
  only the gear is gone.

**The character's body follows its growth stage as of 2026-09-07** (issue #30).
*Superseded 2026-09-11 by deviation #73: the plush eagle v3 pack has one body,
`KAIRO_STAGE_ASSETS` and `{ kind: 'stage' }` are deleted, and the growth stage
now reads as size only — through `figureResponse`'s `bodyScale` and the ground
shadow, which this section already describes and which is unchanged. The framing
rule below outlived the stages and now binds the whole pack. Kept because the
reasoning about why a level-up has to be visible, and about computed `require`
paths, is still live.*
`staticFigureSelection` takes an `EvolutionStage` and returns a fourth variant,
`{ kind: 'stage', stage, pose }`, which `KAIRO_STAGE_ASSETS` resolves. **The
nine images landed on 2026-09-08** (issue #31), so every stage draws its own
body and the level-6 boundary is the pale down chick becoming a brown-winged
bird. **The device pass is still owed**: the framing is measured by test and the
art was reviewed off-device, and neither is the look at a real screen at each
boundary that #31's fourth criterion asks for. Six things break easily:

- **The stage rides on idle, walk and run, never on the base render.** That is
  the whole reason the ticket exists: `motionPose()` always answers, so
  `{ kind: 'base' }` is unreachable from `resolveLivingMirror` and a stage
  applied there would almost never draw. `STAGE_POSES` is the three; `sleep`,
  `workout` and `race_victory` stay adult-only, and issue #31 commissioned nine
  rather than twelve for exactly that reason.
- **A pre-adult reaction draws that stage's own art, and the cost is permanent
  rather than interim.** `race_victory` is one stage's picture, so a young bird
  celebrating keeps the body it was standing in — otherwise it turns into an
  adult for three seconds on the level-up this whole change exists to serve. So
  a pre-adult celebration shows that stage's walk rather than the wings-out
  pose, and the reaction is still *spoken*, since Today renders
  `reaction.sentence` over its next step. Letting the adult pose through "while
  the art happens to be shared" was the alternative, and it would have flipped
  the rule silently on the day the artwork arrived.
- **Mind-state art stays adult-only at every stage, deliberately.** A sleepy
  adult is a smaller lie than a celebrating one: the state images are
  wearable-gated, so most accounts never reach them, where every account
  celebrates. Revisit at the animation handoff.
- **Twelve literal `require`s, and a computed path is the silent failure.**
  Metro resolves `require` statically, so `require(`…${stage}…`)` is a blank
  image on a device and nothing at build time — `species-art.ts` already
  records the trap. `Record<EvolutionStage, Record<StagePose, …>>` fails `tsc`
  on a missing cell; `character-assets.test.ts` parses the initializer and
  fails a cell that is missing, computed, or naming a file that is not there.
  A regex over the file cannot tell which cell it is looking at. **It also
  fails two cells that name the same file**, which is what the aliased interim
  looked like and what an accidental copy-paste would restore: a stage drawing
  another stage's body is a growth boundary a player crosses and cannot see.
- **One derivation of the stage reaches both readings.** The screen derives it
  once from the level and hands it to `resolveLivingMirror` *and* to
  `CharacterFigure`, which reads the figure's stage off the **selection** and
  its own `stage` prop only for the ground shadow and the ring — presence, from
  §6's level bands, which is a different reading of the same number. The stage
  vocabulary is declared once too: `GROWTH_STAGES` is derived from
  `GROWTH_STAGE_NAMES`, and `firstLevelOfStage` — in `kairo-lab-contract.ts`,
  because a decision in a `.tsx` is untestable — derives 1/6/11/21 from
  `evolutionStageForLevel` rather than restating the thresholds.
- **The stage names are a development vocabulary.** `GROWTH_STAGE_NAMES` labels
  the artwork and the asset lab; the figure's accessible name says the level,
  and no player surface speaks a stage.

**The nine growth-stage images landed on 2026-09-08** (issue #31), and
`scripts/generate_stage_art.py` is what produced them and what will reproduce
them. Each is an **identity-preserving edit of the adult render for that same
pose** rather than a fresh generation, so the camera, the palette and the line
weight come along rather than being described; the prompt moves only what age
moves — the down-to-feather transition, the crest fan's growth, the wing length
and the head's share of the figure. Five things break easily:

- **The pose does not come along for free, and saying so in the constraints is
  not enough.** `IDENTITY` has asked for "the same pose … as the input image"
  since the first run, and the first nine came back with every foot flat and
  level — hatchling walk indistinguishable from hatchling idle, on artwork whose
  whole reason for being nine rather than three is that the three *poses* draw.
  Age is the loudest thing in the prompt and the model resolves the conflict by
  drawing a well-posed bird of the right age standing still. `POSE_PROMPTS`
  restates each pose's own stagger and wing set as a positive instruction, which
  is what fixes it, and it also has to say the lifted foot is drawn **open with
  its toes** — otherwise it comes back as a closed fist.
- **`--input-fidelity high`, and `low` is the API's default.** Without it a
  stage's three renders drift into three different birds — a black-eyed walk
  beside a brown-eyed idle — which fails the ticket's second criterion
  sideways: the stages read as ages, and the poses inside one stage do not read
  as one bird.
- **`normalise()` owns the framing, and the model never does.** Each render is
  trimmed to its own alpha and re-laid out against the **adult's** bounding box
  for that pose — same 570×636 canvas, same centre line, same figure height,
  same feet-on-the-bottom-edge ground line. That is what makes "no screen needs
  a layout change" true rather than hoped, and it is why the artwork must never
  be pre-shrunk: `figureResponse`'s `bodyScale` stands a hatchling smaller in
  the same box, so a hatchling drawn small would shrink twice.
- **The paste is unmasked and the alpha floor runs twice, both for the ground
  line.** `paste(im, box, im)` blends the source through its own alpha, so a
  bottom row at alpha 1 lands at 1/255 of itself and rounds away — the figure
  lifts a pixel off the shared ground line, invisibly. And LANCZOS rings a few
  single pixels out past the silhouette at alpha 9 to 13, which is why
  `ALPHA_FLOOR` is 16 rather than the 8 that cleared the API's ghost: one
  invisible speck above the head moves `generate_crest_masks.py`'s tip and
  tints the sky. `character-assets.test.ts` pins the frame against the adult's
  own bounds, ground line exactly and figure height within a pixel of a
  resample.
- **Nine, and never a tenth.** `sleep`, `workout` and `race_victory` stay
  adult-only, so a pre-adult celebration draws that stage's walk — see the #30
  block above for why that is the right trade and not an interim one.

**Two eagles in a flock stop looking identical as of 2026-09-07** (issue #33).
The **crest** takes the hue of the dominant stat and the **body's scale**
follows the growth stage, so the cohort gate's "the bird changes" was met by two
things that did not depend on the nine images landing — and it now carries them
too (issue #31, 2026-09-08). Eight things break easily:

- **`plumage.ts` reads lifetime points, and the `dominance` prop is the trap.**
  `useDominantStat` is the last fortnight, which is right for the lane and for
  the All-Rounder's ring and wrong here for a structural reason:
  `squad_leaderboard()` projects the **lifetime** rollups and nothing narrower,
  so a flock row could not compute the fortnight's answer without widening a
  projection §5 keeps narrow. Both surfaces feed `crestTint` the same three
  numbers — Today the `profiles` rollups it already passes as `lifetimePoints`,
  the row its own `ratings` — so one player cannot wear a violet crest on their
  own screen and a coral one in a friend's list. `CharacterFigure` therefore
  gained no prop; it reads the one it already had.
- **The crest, never the bird, and a balanced player takes no hue.** The figure
  already says four things by shape (stage, the shadow's spread by level, its
  weight and tint by Body, the presence ring by mastery) and a fifth drawn on
  the body makes the centrepiece a readout. `crestTint` goes through
  `laneStat`, so the balanced rule and the two absences — `null` for an
  unstarted character, `undefined` for a query in flight — have **one** home
  rather than a second copy that disagrees; `lane.ts` already carries the
  argument that picking a stat for somebody whose stats are level invents a
  preference they have not shown.
- **The art is flattened, so the crest is a generated mask and not a layer.**
  `scripts/generate_crest_masks.py` writes one per render into
  `assets/character/crests/`, named `crest_<the render's own filename>` — the
  name is the mapping. It finds the crest by **geometry, not colour**: the
  topmost opaque row inside the central 44% of the canvas, because
  `race_victory` and `workout` raise the wings above the eyes and a full-width
  scan tints a wingtip. Multiplying by the figure's own alpha is what keeps the
  hue off the sky. **Rerun it after any change to the art it reads** — issue
  #31's nine growth-stage images are in `SOURCES` for that reason, so a stage
  render regenerated without a mask rerun is a red test rather than a hatchling
  whose tint sits over an adult's crest. The script's own `SOURCES` is the
  fourth copy of the render list and the only one no compiler sees, so a test
  parses it and fails when it drifts from `REQUIRED_PNG`.
- **A runtime rectangle was the alternative and it is worse.** React Native has
  no mask or blend primitive without a native module, and a native module costs
  one of the month's fifteen builds and withholds every OTA until that build
  lands — the same trade `Glass` and the Sky corridor already refused. A clipped
  rectangle can say *where* but not *how softly*, and a hard horizontal cut
  across a head reads as a bug. Verified OTA-safe: the tree's fingerprint is
  still `9d76c5d3`, build 23's.
- **`CREST_TINT_OPACITY` is 0.62 and full strength is the mistake.**
  `tintColor` keeps an image's alpha and replaces everything else, so a mask
  filled at full strength erases the outlines and shading underneath and the
  crest reads as a coloured blob glued to a bird.
- **`STAT_COLORS` moved to `src/ui/stat-colors.ts`**, re-exported from
  `StatIcon.tsx` so no call site changed. It was unreachable from a test —
  `@expo/vector-icons` reaches React Native's Flow syntax — which is
  `stat-names.ts`'s move out of the same file, and `avatar-tint.ts`'s out of
  `Avatar.tsx`, where a fill table with no reachable ink turned out to have no
  ink rule at all.
- **The crest is never spoken, and the guard is scoped to the labels.** The
  dominant stat is already in a flock row's reading order as three ratings, so
  a hue announced beside it says the same fact twice. `plumage.test.ts` scans
  from `livingCharacterLabel`'s and `leaderboardRowLabel`'s own declarations
  rather than over their files, because `living-mirror.ts` legitimately names
  `colors` for the ground shadow's shade — a guard that fails on honest code
  gets loosened until it guards nothing.
- **The scale is a multiple of the art, never of the frame.** `bodyScale` in
  `figureResponse` returns 1 at the adult stage and less below it; the caller's
  box does not move, so a hatchling stands smaller and lower in the same space
  and no screen relays. It lives there rather than inline in
  `CharacterFigure.tsx` for the reason the whole module exists. **The
  thumbnail deliberately does not scale** — its `size` *is* a caller's layout
  geometry, and a flock row differentiates by crest.
- **"Crest" now names two things and `CONTEXT.md` separates them.** Capital-C
  is the ceiling day's **sky** (`Diorama`'s `crest` prop, `ceilingLine`);
  lowercase is the bird's head feathers, which the Rive artboard has named that
  way since the asset contract. The feature word is **plumage**, which is what
  the module and the lab section are called.

**The You tab's header band carries no bird of its own.** It drew a 104pt one,
centred, and the avatar ring then overlapped the band by 42pt and landed on it —
the same art at two sizes, the larger sliced across the chest by the smaller.
The two ground shadows were pinned at fixed left/right offsets against that
bird, so with it gone behind the disc they read as two stray grey pills at the
horizon. One shadow, centred under the ring that actually casts it. The ring is
the bird on this screen; the band is the daylight behind it.

**The Flock band names the day's leader** from `rows[0]` — no extra request, and
**ordered by the board rather than by the race**: `squad_leaderboard()` sorts by
the program-weighted total (deviation #11), so the name on the band is the top
of the rows beneath it. The Sky corridor re-ranks the same payload by capped
steps and can legitimately name somebody else; two races, each screen naming its
own. It follows `mode`, so a finished day reads "won the day" rather than the
live "is ahead" — the same class of care the completed board takes with the
streak figure. Guarded on two or more rows, because "you are ahead" in a squad
of one is the app congratulating somebody for being alone.

Also in this pass: **Settings is its own screen** (`/settings`, behind the gear
on You) — a move, not a feature; quest difficulty, timezone, notifications, sign
out and delete account were loose at the foot of a two-and-a-half-screen tab.
**`src/theme.ts` is the only file that may name a typeface**, which was not being
kept — seven call sites still said `'Figtree-Bold'` as a string literal, and RN's
answer to an unknown family is a silent fallback to the system face, invisible on
a simulator that has the old font and visible only on a clean device.
`type-faces.test.ts` scans for it and also checks every named face is actually
loaded and present on disk. **"Dress your Kairo" is deliberately not built**: the cosmetic PNGs were
flattened full-character previews, not composable layers, so a four-slot tray had
no assets behind it. Deviation #73 deleted them outright along with the manifest
and its validation — keeping a validated contract for an unbuilt feature meant
every pose change paid it a tax, and `summit` would have paid it across twelve
entries. Building it later starts from layers.

**Avatar's tint table lives in `avatar-tint.ts`, and that is why its inks are
tested.** The table sat in `Avatar.tsx`, which reaches React Native, so
`contrast.test.ts` — the file whose whole job is *every painted fill and what
may be set on it* — could not read it, and the self tint set **cream on
`colors.accent` at 2.65:1** for as long as the component existed: the one
pairing the `brightFills` block asserts must fail, one file away from it. This
is `stat-names.ts`'s move in a fourth place, and the rule it makes concrete is
that a fill table with no reachable ink is a fill table with no ink rule.
`colors.text` is the ink (5.53); `ramp.accent[900]` is the tempting wrong answer
at **4.39**, because it is what the other four rows use, and a test asserts that
failure so nobody reaches for it. **Nothing mounts `Avatar` today** — deviation
#55 resolved its six fallbacks through `displaySpecies()` — so this was latent
rather than shipped, and the table is what a remount now inherits.

**The Flock strip is the flock, not your week, as of 2026-09-06** (issue #25,
the surviving half of deviation #66). One disc per member, filled for everybody
who cleared the Daily Walk, their initial above it — **above, not on**: the
filled disc is `colors.accent`, and a letter laid over it would be cream on a
bright fill, which is the one pairing the palette forbids. `flock-walk.ts` decides every
mark and the spoken count; `FlockStrip.tsx` only paints them. It costs no
request — the members come out of the payload the list already fetched. Five
things break easily:

- **It draws a count, and the week strip's comment said it never could.** That
  refusal was right about a *moment*: "three of four are in" is a claim that
  does not exist for everybody at once (§2). The count is not about a moment.
  `squad_leaderboard(p_mode => 'current')` returns **each member's own** local
  date, so the sentence is "three of four have cleared their own today" — true
  continuously, and emptying for each member at their own midnight with nobody
  else's mark moving. Anything that later ranks or counts this strip off one
  shared calendar date reintroduces exactly the claim the old comment refused.
- **A withheld member gets a mark and no verdict.** The consent gate is
  reciprocal and per row (deviation #47), so `steps: null` means *unknown*, not
  zero — countable neither as cleared nor as missed. They keep a disc, so the
  row still has one per member, and it is a **ring rather than a grey fill**:
  a grey fill is what "did not walk" looks like, and the Philippine market is
  not to be told it missed a day for keeping its numbers private. They are
  absent from **both** halves of the count — putting them in the denominator
  lets a private decision deflate everybody else's number, which is the leak
  whole-squad gating had.
- **It withholds itself twice, and the second guard is not the first.**
  `flockWalk` returns null for a squad of one *and* for fewer than two
  **visible** members. The second is the normal state for a viewer who never
  consented — the gate is reciprocal, so their own row reads null alongside
  everybody else's — and "1 of 1 walked today" is the leader line's
  congratulating-somebody-for-being-alone wearing a circle.
- **It follows `mode`.** The board toggles Today/Yesterday and the strip reads
  the same rows, so the label says "today" or "yesterday" rather than drawing a
  today claim over a yesterday board. `FlockMarkState`'s `unmet` deliberately
  carries no tense for the same reason: whether it reads as *not yet* or as
  *missed* is the label's job, never the disc's.
- **The clearance bar is `DAILY_STEP_BASELINE`, imported, never 10,000.** Same
  rule the race keeps — `RACE_FINISH_LINE` *is* that constant — so the third
  reading of the bar on this tab cannot drift from the other two. The strip is
  clear of the `AGI`/`AGI_base` trap only because it reads raw steps off the
  projection and never a stored tier.
- **The marks keep board order, and that is not the Sky rail's rule.** The rail
  sorts withheld members last because it has four seats and has to decide who
  gets dropped; the strip has one mark per member and drops nobody, so there is
  nothing to protect. Sorting rings to the end would additionally *group* the
  people who declined into a visible cohort, which is a louder statement about
  a private decision than leaving them where the board already puts them.

**Two sentences stopped being false on 2026-09-07** (issue #26). Both are copy
the app states as fact, and both now live in pure modules root Vitest can hold.

- **A squad of one reads the Sky's sentence, not a standing.** The Flock band
  answered `1st · of 1 · leading` on the tab immediately next to the one saying
  *"You have the sky to yourself. The ridge is the opponent"* — the app refusing
  to flatter you on one screen and doing exactly that on the next. The leader
  line beside it was already guarded on two or more rows; this was a **second,
  separate sentence** that never got the same guard. `resolveSquadStanding`
  answers `{ kind: 'alone' }` first and the band renders `SOLO_SKY_OBSERVATION`
  — the Sky's own string, **imported**, because two copies of one true sentence
  is two things to keep true. Three things break easily. **The squad's size
  decides it, never the board**: `squad_leaderboard()` left-joins
  `daily_scores`, so an unmoved member is still a row and an empty board is
  still a squad of one — `rows.length` would call a two-person squad alone for
  the frame before its second row lands. **`alone` carries no rank and no
  denominator**, and a test asserts the key list, so no later edit can reach for
  one. And **the copy moved out of `Leaderboard.tsx` into `standing.ts`** —
  `ordinal`, `standingHero` and `standingSubline` — because a rule about what a
  screen may say has no guard on it while it lives in a `.tsx` that root Vitest
  cannot load. `SkyStanding` had already made this fix for `1 of 1` on
  2026-09-02; this is the same fix in the second surface — and in the third,
  since **the rows beneath the band were saying it too**. `LeaderboardRow` takes
  `ranked`, false on a board of one, which withholds the rank glyph *and* the
  `Rank 1` that `leaderboardRowLabel` spoke; `RowLabelInput.rank` is
  `number | null` rather than a flag beside a number, so there is no second
  field to disagree with the first. `SoloBoard` passes it too: its own doc
  argued there was no "1st of 1" to draw there while the row drew the 1 anyway.
  `ordinal()` is one module now (`ordinal.ts`) rather than a copy each in
  `standing.ts` and `race-label.ts`.
- **The shield sentence names the streak minimum below it.**
  `shield_available_on === null` means only that no shield is *recharging* —
  it is null from the first scored day — while `advanceStreak` also requires
  `SHIELD_MINIMUM_STREAK`, so "Shield banked — one missed day is safe" was the
  first promise a new account read on the You tab and was false for its first
  four days, on the one mechanic whose whole value is being believed *before*
  the day it is needed. `shield-note.ts` holds both halves of the eligibility
  and derives the `5`. **A pending recharge is named first, at any streak
  length**: it is the binding constraint and was never the false half — a spent
  shield catches nothing however long the streak grows, and a streak that breaks
  after one is spent reaches five days again a fortnight before the charge
  returns, so naming only the streak bar there is the same understatement in a
  second place. The pill's colour reads `banked` off the same decision as its
  words, rather than re-deriving it from the raw column.

**This whole redesign shipped over the air, and that was verified rather than
assumed**: the tree's fingerprint was `324fba3e`, byte-identical to build 22's.
(**Build 23, 2026-09-02, moved it to `9d76c5d3`** — one string in
`NSHealthShareUsageDescription`, and nothing else; every OTA since targets the
new runtime.) Fredoka and Nunito are copied into `assets/fonts/` and loaded through
`useFonts`, *not* added as npm dependencies — `package.json` is a fingerprint
input and adding two lines to it would have cost one of the month's fifteen
builds to ship a font.


---

## Two schemes and a dashboard (2026-09-10, deviation #72)

The rules are in `CLAUDE.md` under "Kairo follows the phone's appearance and
Today is a dashboard"; this is the why.

**What the screens had become.** By 2026-09-08 every tab opened on a field of
colour: Today on a 452pt sky with glass pills floating over it, Flock on a
violet-into-pink band, You on a sky band under a ring, and the tab bar carried
four gradient fills that crossfaded as the pill travelled. Each was argued for
on its own and each argument still reads well; together they were the same
gesture four times, and the one word a reviewer had for the whole was
"template". The brief for this pass was minimalist yet playful, a dark scheme,
a Today that shows progress rather than a picture, and a Sky whose four-screen
corridor could be navigated rather than only scrolled.

**Why the tokens did not change name, again.** The dark scheme is the third
time the palette has moved under ninety call sites, and the reason it could is
the reason Sunlit → Playful could: a token names a role. What is new is that a
role now has two values at once, and the ramp's *ink-strength* contract is the
thing that makes that safe. Read as brightness, a dark palette would have to
reverse the scale and every `ramp.x[200]` wash would become a near-black; read
as strength, the low steps become dark tints and the high steps light tints,
and the sentence "200 is a wash you set text on, 700 is an ink" stays true on
indigo. So a stylesheet written against the light ramp is correct against the
dark one without being read. The two exceptions — `ink` and `onDeep` — exist
because a bright fill does not care what the page is: orange takes dark ink at
noon and at midnight, and `colors.text` (which flips) on a bright fill was the
one migration mistake that would render perfectly in the light scheme and
vanish in the dark one. Every bright-fill label was moved to `ink` in the same
pass and the dark block of `contrast.test.ts` asserts it.

**Why the static exports stay.** Root Vitest reads `colors` and `ramp` in a
dozen tests, `avatar-tint.ts` and `stat-colors.ts` are fill tables, and the
onboarding run carries its own night beats and a design that was never meant
to invert. Making the static exports the light palette, and adding `themes`
beside them, meant nothing that worked stopped working and the migration could
proceed screen by screen. The screens left on the static palette are named in
`CLAUDE.md` and are a decision, not a backlog.

**Why the global scheme lives in a store.** The preference is on MMKV and the
phone's answer is synchronous, so the scheme is known before the first render
without a global provider. `useStyles`
caches one sheet per factory per scheme, keyed by the factory's identity —
which is why a factory must be a module-level constant, and why the doc
comment on every `makeStyles` says so.

The 2026-09-11 branch alignment adds a narrow `ThemeScope`: preview controls
and authored onboarding scenes need a local rendering choice, not a write to
the device preference. It selects the same canonical theme and preserves the
stylesheet cache. Shared cards and sheets now follow that choice together;
the independent preview palette is removed. The fixed night beats keep light
status-bar ink even when the rest of the app is light.

**Why `userInterfaceStyle` had to move, and what it costs.** `dark` in
`app.config.ts` forces the iOS trait collection, so `useColorScheme()` reports
dark on a phone set to light; a "System" option built on that would be a lie
with a label. `automatic` is one string and a native field, so the fingerprint
moves and the pass ships with one of the month's builds rather than over the
air. That was weighed against a Light/Dark toggle with no System option — OTA-
shippable, and wrong: the reader who keeps their phone dark for the battery
and wants the bird in daylight is real, but so is everybody else, and asking a
phone a question it has already answered is how an app ends up dark at noon.

**Today: the dashboard keeps the Mirror's rules.** Deviation #59 argued that
seven surfaces competing to be read was the failure, and put one figure on the
screen. The request here was the opposite shape — progress at a glance — and
the honest answer was to change the shape and keep the rules: `today-board.ts`
composes every sentence a tile says under the same bans #59's `kairo-voice.ts`
keeps (raw units, no engine key, unknown never zero), the Motion tile reaches
the ridge through `DailyWalkState.remaining` so the baseline never appears as
a literal, and the quest rows draw exactly the three entries `todayQuests()`
resolves with `selectNextStep()`'s pick marked. The scene did not go: it is a
236pt card in the column, and the reaction, the ceiling line and the crest sky
are exactly where they were. What went was the glass — three pills floating
over a picture were the loudest thing on the screen — and the location word,
which is the Motion tile's eyebrow now.

**Sky: a map, not a picture.** The corridor is four screens tall and the
reader sees one; the strip on the right draws all four. Two things were
settled in `minimap.ts` before anything was drawn. The strip is built from the
*same* `flightFrame` numbers the corridor is drawn with — `contentHeight`,
`topInset`, `boxHeight` — so a bird's dot and a bird's marker are one
arithmetic, and a test asserts that ties pulled apart on the corridor are
pulled apart on the strip. And the window is a clamp: the scroller overscrolls
past both ends on iOS, and a window drawn off the end of the map reads as the
map being wrong. The window rides the scroller's native `Animated.Value`
through an interpolation whose `extrapolate: 'clamp'` is `viewportWindow`'s
clamp restated, so a fling never leaves it behind. A touch on the strip calls
`offsetForMapY()`, which centres the screen on the touched point and clamps
to what the scroller can reach; a drag is the same call on every move. The
strip is sized between the measured rail and the measured foot, for the
Dynamic Type reason the rail was always measured. The corridor itself is
painted by the reader's steps — the segments behind their bird take the
accent — which is the Motion tile's meter said in the corridor's own
language, and is what the request meant by the path changing with steps.

**The bar.** Four gradients crossfading under a moving pill was the single
loudest element in the app and the one that read most as a template. One
accent wash with the accent's own ink says which tab and nothing else, keeps
the travel, and holds under both schemes by the ramp's contract. `NAV_HEIGHT`
is still 96 so no screen's clearance moved.

**Flock and You.** The board's band carried the squad's identity as a field of
colour; the name carries it. Everything the band held is on the page in the
same order. The leader's row takes a gold rule down its leading edge rather
than a sage tint, because gold means earned and a whole tinted row competed
with the self tint. The day toggle became a `SegmentedControl`, whose selected
segment is a raised surface in the page's ink — the accent fill it had made a
filter look like the screen's action. You's sky band went for the reason the
ProfileHeader's own comment gave for removing the bird from it: the ring is
the bird on that screen, and a band behind it was a fourth painting of one
daylight. The ring sits beside its words now rather than above them, because a
centred stack left half the width empty. Both screens still `bleed` and take
`insets.top` themselves.

**What deviation #72 did not do.** At that point the onboarding run and sign-in
stayed light. The 2026-09-11 pass below supersedes the onboarding half; sign-in
remains authored light. `Avatar`, `TodayPanel` and `KairoLab` stayed unmounted.
The device matrix was still owed at the end of #72; later evidence belongs to
the warm-pastel implementation record, not retroactively to this section.

---

## Warm-pastel plush composition (2026-09-11)

The plush eagle made the remaining saturated chrome feel like a frame from a
different product. The palette therefore moved under the existing semantic
roles again: warm cream/charcoal pages, cocoa/cream text, apricot for the person
and primary action, lilac for support and selection, mint for secondary/restful
surfaces. The contrast and ink-strength contracts did not move. A bright fill
still takes dark ink in both schemes; runtime components still read `Theme`
rather than naming screen-local colors.

**Today combines instead of stacking.** A 236-point illustration followed by a
separate Motion tile made the first viewport choose between the character and
the reason to move. `TodayProgressHero` places the already-derived reading and
the existing `Diorama` beside each other, stacking when width or text requires.
The hero does not fetch or resolve anything: `resolveLivingMirror` still owns
Mind, verified-strength, summit and reaction priority; `figureResponse` still
owns growth; aura/plumage and the crest sky remain with the figure. Motion is
removed from the supporting tiles so one day never prints the same reading
twice.

**Sky changed paint, not flight in the initial plush pass** (the open-flight
refinement below supersedes this presentation). The bead-like path became a finer projected
trail, but `flightFrame`, `raceProgress`, `placeRacers`, minimap mapping and the
measured rail remain the only authorities. The distinction matters: a quieter
path can be reviewed as presentation, while new geometry would change where a
person appears to stand. Browser pointer drag and simulator taps/accessibility
adjustment exercise the same responder; native coordinate-drag automation is
not reliable evidence and stays named as a limitation.

**Flock and You give the reading room.** The perch is a compact gathering so
the Today/Yesterday board enters the first viewport earlier, with one invite and
the existing leader/self/private/solo semantics. Perch cards keep a compact
minimum, but a maximum-length name may widen its own card within the horizontal
roster and wrap without a line clamp; preserving a two-line silhouette is not a
reason to hide a person's name at large text. You uses one shared portrait and
identity header, then streak, selectable records, growth and calendar; a second
bird or trophy would invent a second reward language. Native actions remain
native: best-day Share is opened and canceled during safe preview QA, never
simulated as sent.

**Onboarding is one themed run.** The seven routes now mount shared view
components in both schemes. Routes retain impressions, Health permission,
calibration, pending answers, profile insertion and navigation; the account-free
preview injects only callbacks and local values. The setup panel remains a phase
of Connect, never an eighth route. Privacy copy is passed from `PRIVACY_CLAIM`,
and the policy action opens the public page without changing an answer.

**The safe preview has one inset boundary.** Its toolbar consumes the physical
top inset; a nested `SafeAreaInsetsContext.Provider` gives only the shared canvas
`top: 0` while preserving the real bottom value. Fixing the production screens
to compensate would have under-padded every real route. Fixture controls expose
long names, ridge/summit, ceiling/reaction, missing sleep, private, loading and
error states through the production resolvers and views; solo ghost days use
the real race resolver, and the You fixtures cover each shield branch. The
nested Name view receives its measured window offset for keyboard avoidance,
while the production route retains zero. The preview remains sample-data
verification, not authenticated HealthKit or backend evidence; the exact
boundary and current matrix live in `mobile-screen-preview.md`.

## Open-air Sky refinement (2026-09-11)

The user removed the track metaphor: the flock now flies through open sky
toward layered ridges, with automatic sideways drifting rather than manual
steering. The main view and minimap have no winding stroke or dotted trail.
Forward distance stays proportional to the existing earned-step progress; time
only animates decorative lateral movement and scenery, never scores or rank.

The presentation projection is shared by the scene, minimap and Locate. Stable
identities keep refetches from randomly rearranging the lateral rest positions.
Nearby birds fan out only for legibility; their spoken percentages and rankings
continue to describe earned progress, not that decorative spacing. Collision
bounds include the whole bird, its name and its full sideways excursion.
Measured `flightFrame` clearances and independent name-label anchors still
apply, including at the ridge and ground. The minimap remains a 44-point scrub
target with accessible adjustment, not a steering control.

Ambient motion runs only while the screen/app is active and Reduce Motion has
resolved off. It stops and returns to a static rest position otherwise. The
existing v3 figure is translated, not regenerated or assigned a new gameplay
state. Shared native Views and theme roles provide the scenery; no new native
dependency or asset build is introduced. The curved keystone helpers remain
historical/reusable geometry, not the new Sky presentation authority; core
ranking, scoring, consent, ghosts and finish-line semantics are unchanged.


## The screen rules, in full (moved from `CLAUDE.md` 2026-09-12)

**Kairo's warm-pastel plush presentation is current as of 2026-09-11.** The
palette and shared controls keep the semantic-role and contrast contracts below.
Today combines Motion progress and the resolved figure in one responsive hero;
Sky uses a finer trail without changing `flightFrame`, race progress or minimap
math; Flock compacts the perch and keeps board semantics; You uses one shared
portrait/header; all seven onboarding routes consume theme-aware shared views.
The safe preview mounts those views with local fixture state and no production
auth, health, profile, consent or telemetry effects. Detailed preview boundaries
and verification limits live in `docs/engineering/mobile-screen-preview.md`.

**Appearance architecture established 2026-09-10** (deviation #72). The
screen-layout descriptions in this block are historical where the 2026-09-11
warm-pastel presentation above replaces them; the scheme, token, inset and
geometry contracts remain current. The reasoning is in
`docs/engineering/surfaces.md` under the dated headings:

- **Two schemes, one set of roles.** `src/theme.ts` keeps every token name and
  adds `light`, `dark`, `themes`, `Theme` and `Scheme`. The static exports
  (`colors`, `ramp`, `glass`, `shadow`, `earnedColor`) **are the light
  palette** and stay: root Vitest reads them and `contrast.test.ts` holds both
  palettes to the same claims. Authored sign-in still reads the light roles;
  onboarding now consumes the local theme scope. A themed screen writes
  `const makeStyles = (t: Theme) => StyleSheet.create({...})` at module scope
  and reads `useStyles(makeStyles)`; a one-off colour reads `useTheme()`. The
  factory **must be a module-level constant** — the cache is keyed by its
  identity, so an inline factory rebuilds the sheet every render.
- **The ramp's ink-strength contract holds in both schemes, and that is what
  makes the migration correct by construction.** Under the dark scheme the low
  steps are dark tints and the high steps are light tints: `ramp.x[200]` is
  still a wash you set text on, `[500]` still a fill, `[700]`/`[800]` still
  inks. The middle of every ramp is the same hue at night — a fill is a fill.
- **Two tokens do not flip.** `colors.ink` is always dark and sits on a bright
  fill (the primary button, the streak pill, a cleared calendar day, the
  selected segment); `colors.onDeep` is always light and sits on a deep fill
  (teal, sage 600, night). **`colors.text` on a bright fill is the mistake**:
  it renders correctly in the light scheme and vanishes at night. Every
  bright-fill label in the app reads `ink` now, and the dark block of
  `contrast.test.ts` asserts `ink` on every bright fill and `onDeep` on every
  deep one.
- **`userInterfaceStyle` is `automatic`.** It was `dark`, which forced the trait
  collection and made `useColorScheme()` unable to report the phone's answer;
  `system` would have been a lie. It is a native field, so the fingerprint
  moves and this ships with a build. `useScheme()` reads the MMKV preference
  (`appearance-store.ts`, its own storage id, untouched by sign-out) through
  `resolveScheme()` (`appearance.ts`, zero-import, tested); a phone that
  reports nothing reads as light, never a silent flip to dark. The status bar
  follows the focused surface via `status-bar-tone.ts` in `app/_layout.tsx`.
- **Local theme scopes use the same tokens.** `ThemeScope` in `use-theme.ts`
  overrides rendering only, never the stored preference. The root scopes the
  authored auth routes to light; onboarding consumes the current scheme and
  `statusBarTone` follows each surface. The sample preview scopes its own light/dark toggle so
  `Screen`, cards, sheets and scenery all change together. Preview boundaries
  and verification are in `docs/engineering/mobile-screen-preview.md`.
- **Today is a dashboard and the Living Mirror's rules are what keep it
  honest.** `today-board.ts` composes every tile sentence and is the only place
  a tile's words come from — raw units only, no engine key, unknown is never
  zero, and the Motion tile reaches the ridge through `DailyWalkState` so no
  literal appears (`today-composition.test.ts` scans for one). `TodayTiles`
  and `QuestRows` draw; `todayQuests()` still resolves exactly three and
  `selectNextStep()` only marks one of them. The scene is `Diorama` at
  `SCENE_HEIGHT` (236), a card in the column rather than the page's header,
  and the location word is the Motion tile's eyebrow. `TodayCount` is gone.
- **The Sky minimap is a map, not a picture.** `SkyMinimap` is pinned to the
  right edge between the measured rail and the measured foot — both
  `onLayout`, for the Dynamic Type reason the rail always was — and sized by
  `minimapHeight()`. It draws `miniPath`, `miniRacers` and the ridge from the
  **same** `flightFrame` numbers the corridor is drawn with, so the two cannot
  disagree about where a bird is; the window's `translateY` is an
  interpolation of the scroller's native `Animated.Value`, and a touch or drag
  on the strip calls `offsetForMapY()` and `scrollTo`. **The corridor is
  painted by steps**: `SkyCorridor` takes `progress` (the reader's own
  `raceProgress`, capped at the line) and paints the flown segments in the
  accent. `flight-frame.test.ts`'s scan of `sky.tsx` is unchanged and still
  binds.
- **The bar is one wash.** `TabPill`'s four per-tab gradients went; the moving
  pill is `ramp.accent[200]` with `accentDeep` on it, so the bar says which
  tab and nothing else. `NAV_HEIGHT` is still 96; `BAR_HEIGHT` is 68.
- **`SegmentedControl` is the only filter control**, and its selected segment
  is a raised surface in the page's ink, never an accent fill: the board's
  Today/Yesterday toggle painted its active half orange, which made a filter
  look like the screen's primary action. `Tile` is the dashboard's unit — one
  accessibility element, two sizes and no third.
- **Flock and You have no bands.** The board's violet-into-pink field and the
  You tab's sky band are gone; both screens still `bleed` and take
  `insets.top` themselves (`bleed-inset.test.ts`). The leader's row carries a
  gold rule down its leading edge rather than a sage tint; the flock strip's
  marks sit on the page in the page's inks, and its withheld mark is still a
  ring. The You tab's ring sits beside its words rather than above them.

**Kairo is Playful as of 2026-08-30** (deviation #58), which supersedes Sunlit's
palette and type; Sunlit's stale values are in `docs/archive/design-history.md`.
Every token in `src/theme.ts` kept its name and changed its value, so around
ninety call sites re-skinned without being edited — **a token names a role,
never a hue** (`ramp.sage[500]` is a violet now and still means "your lane").
Fredoka and Nunito replace Caprasimo and Figtree, **copied into
`assets/fonts/` and loaded through `useFonts`, not added as npm dependencies**,
because `package.json` is a fingerprint input.

**`docs/engineering/surfaces.md` holds the reasoning for every screen rule
below** — the Playful redesign in full, the onboarding run and its calibration
and welcome beats, the Sky corridor, the growth-stage and plumage art passes,
and the three device-fault rounds that produced most of the layout rules.
**Read it before adding or reshaping a screen**; the rules themselves:

- **A bright fill takes ink, never cream.** `colors.accent` measures 2.65:1
  against cream, coral 2.93 and gold 1.52, and all three render perfectly —
  four call sites shipped that pairing in this redesign's own first pass.
  `contrast.test.ts` asserts the rule for every fill *including the failures*,
  so a palette that later made one dark enough for cream fails loudly.
  `coralEdge` carries neither ink nor cream and is pinned as such. Body-size
  accent text is `colors.accentDeep`; large display type is `colors.accentInk`.
  The ramps' step contract is ink strength — 200 a wash, 500 a fill, 700/800
  inks — and ~37 call sites depend on it.
- **No native module may be added for a visual effect.** `Glass` is not a blur
  and must not become one; the Sky corridor is twenty-four rotated plain-RN
  segments rather than `react-native-svg`; the crest tint is a generated mask
  rather than a runtime blend. Each would move the fingerprint, spend one of the
  month's fifteen builds and withhold every OTA until that build landed.
  `Gradient` gained a `direction`; `experimental_backgroundImage` is
  deliberately unused, because its failure mode is a transparent view.
- **One icon family.** The Feather/MDI split is retired; reintroducing a second
  family is a design decision, not a convenience. `STAT_COLORS` (in
  `src/ui/stat-colors.ts`, re-exported from `StatIcon.tsx`) reverses Sunlit's
  no-per-stat-hue rule, because a Flock row carries four stat figures at 11pt
  with no words beside them.
- **`src/theme.ts` is the only file that may name a typeface.** RN falls back to
  the system face silently for an unknown family — invisible on a simulator that
  has the old font. `type-faces.test.ts` scans for literals and checks every
  named face is loaded and on disk.
- **Onboarding is seven beats and the last one is still the name**: `/welcome →
  /one-sky → /mirror → /connect → /difficulty → /privacy → /name`. Add steps
  **before** the name, never after — anything asked after the INSERT flips
  `resolveRoute` to `'ready'` under an unfinished screen and needs deviation
  #22's deleted `finishingOnboarding` flag back. `/difficulty` and `/privacy`
  ask before the row exists and `useOnboardingAnswers` holds their answers until
  `/name` writes them, because `quest_tier_override` and `squad_data_consent_at`
  are in the UPDATE grant and not the INSERT grant. **The run is declared once,
  in `src/features/onboarding/beats.ts`** — a beat declares its phase and the
  registry derives the rail's fills, the paged dots and the button words;
  `beat-registry.test.ts` fails any screen that hand-writes one, its skip
  destination or its impression. The rail draws **one segment per beat**
  (deviation #75); the pitch is a flag, not a rail phase.
  `onboardingSkipTarget()` derives the skip landing as the last beat of the
  pitch (the mirror), rather than naming a route twice.
- **The difficulty beat opens with a measurement, and the tier it proposes is a
  seed rather than a rule** (deviation #63). `/connect` reads fourteen complete
  local days through `readDailySteps`; `calibrateQuestTier()` in `quest.ts`
  medians them, drops zeroes, excludes today and needs four qualifying days,
  and `no-history` is a different sentence from a low proposal. `questTier()` is
  untouched and stays the fallback; the whole rule set is one pure function in
  `quest.ts` rather than a sibling module, and `QUEST_CATALOGUE` is imported
  rather than threaded through. `readDailySteps` must stay one daily-interval
  step collection — `readHealthWindow` would read heart rate to size a quest.
  Nothing about those days leaves the phone: no `profiles` write, no telemetry,
  and `calibration_completed` carries `{ outcome }` and not the tier proposed.
  `questTierChosen` is what makes the player's answer win outright.
- **The welcome run is four cards and the fourth is the flock ask** (deviation
  #64) — a card rather than a sheet, because a separately leased sheet would put
  two first-run surfaces on one first focus. Exactly one card carries an actions
  slot and a test asserts it. `welcome_seen` is claimed when the run **opens**,
  so an interrupted run loses the ask; that loss is bounded by the Sky tab's
  permanent invite slot and must not be repaired with a second marker. The join
  door is withheld from an account that already has a squad. Every word lives in
  `welcome-cards.ts`, reading `RACE_FINISH_LINE` and `FREE_SQUAD_MAX_MEMBERS`
  from the constants; the request crosses to the Flock tab as `?pane=join`
  through `flock-pane.ts`, which owns both the href and the parser, and the tab
  **consumes and clears** it. One answer per run, on a ref.
- **Each beat records one impression** — `onboarding_beat_seen` with `{ route }`,
  from `useBeatImpression`, unguarded on mount, and `userId` is deliberately not
  an effect dependency. The hatch (`/connect`'s "Did you know?" phase) reports
  nothing: it is a phase, not a route. Its window opens when `connectHealth`
  **resolves, not at tap**, and closes at the **later** of "minimum served" and
  "read finished" (`hatching-window.ts`); `trivia.ts` picks by a hash of the
  account and states no effect size.
- **Native modals lease `src/ui/modal-owner.ts`** — permission asks, welcome
  cards and Today details must never be visible under different owners in one
  frame. Claim in an effect, release in the same effect, never from a close
  callback.
- **The sheet lessons apply to every bounded surface**: a `maxHeight`, a
  `ScrollView` that is `flexGrow: 0, flexShrink: 1`, and content wrapped in a
  `View` with an explicit **point** width (`width: '100%'` resolves against a
  ScrollView measuring that content). `Panel` sets `overflow: 'hidden'`, so an
  oversized sheet is clipped **silently** and the child that goes is the decline
  control. `OnboardingCta` takes `lines?: 1 | 2` for the same reason. Find this
  class of bug with
  `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`,
  and **relaunch after changing content size** — RN caches text measurements.
- **`<Screen bleed>` hands the top inset back**, and forgetting it is invisible
  until somebody looks at a device: the You tab drew its only route to Settings
  inside the Dynamic Island's cutout. `src/ui/bleed-inset.test.ts` scans every
  bleeding surface, following one level of imports. A `<Modal>` gets no inset of
  its own, so `TodayDetailsSheet` takes the **bottom** inset for its only
  dismissal.
- **A rail or list draws one trailing slot, never one per free seat.** The Sky
  flock rail is four roster slots then one trailing slot (the invite or an
  overflow `+N`, never both and never none), with `flexWrap` deliberately absent
  so it fails by clipping rather than by wrapping; `LockedSlot` is **one** row
  carrying the count and no rank. Withheld members sort last on the rail, and
  keep board order in the strip.
- **The flight is inset below the flock rail**, and `flight-frame.ts` owns that
  arithmetic plus the opening offset. The rail's height is **measured**, not
  assumed; `flightFrame` is handed `chromeBottom` so every assertion holds for
  whatever the screen composes, and a source scan on `sky.tsx` closes the rest;
  the gradient spans the whole scroller, inset included; the inset moves the
  **drawing box**, not the path.
- **Counted figures go through `countWords` in `quest-copy.ts`** — HealthKit
  reports active energy as a float, and "395.66 active kcal" shipped in Today's
  one visible sentence. **`StatRail` declares `flexDirection: 'row'`**: a layout
  that depends on a default moves when its container does. **The invite code
  takes the `fixed` scale plus `numberOfLines={1}`, `adjustsFontSizeToFit` and a
  `minimumFontScale` floor** — correct only together, and guarded by a scan of
  the tag itself.
- **The dev client's floating gear is turned off at runtime**
  (`hideDevMenuFloatingButton()`, `__DEV__`-guarded), deliberately **not** via
  `ios.infoPlist.EXDevMenuShowFloatingActionButton`, which is a fingerprint
  input and costs a native build. It was never in TestFlight: `expo-dev-menu` is
  a debug-only pod.
- **The character is the plush eagle v3 pack, and there is no per-stage body**
  (deviation #73, 2026-09-11, superseding issues #30/#31). Eleven renders and
  eleven crest masks under `assets/character/{base,poses,states,crests}`, named
  **without a version suffix** — v1 is deleted, not shipped beside it, so there
  is nothing to disambiguate from. `KAIRO_STAGE_ASSETS`, `KAIRO_STAGE_CRESTS`,
  `STAGE_POSES` and the whole cosmetics system are gone with it, and the bundle
  fell from 7.7 MB to 1.2 MB. Literal `require`s are still mandatory — a computed
  path is a blank image on a device and nothing at build time — and
  `character-assets.test.ts` still fails a cell that is missing, computed or
  naming an absent file.
- **The growth stage now reads as *size*, never as anatomy.** `staticFigureSelection`
  has no `{ kind: 'stage' }` branch and `resolveLivingMirror` takes no stage at
  all; `CharacterFigure` keeps the prop because `figureResponse`'s `bodyScale`,
  the ground shadow and the presence ring all read it. Restoring per-stage bodies
  is re-adding one table and one branch. **Shipping mixed was refused**: a
  character that silently becomes a different species at level 21 reads as a bug,
  and pointing all four stage cells at one file is exactly what
  `character-assets.test.ts`'s `'two stages share a drawing'` assertion exists to
  reject. `firstLevelOfStage` still derives 1/6/11/21 from
  `evolutionStageForLevel`, and the stage names are still a development
  vocabulary no player surface speaks.
- **`dayPose()` resolves Motion against Body, and `summit` wins outright.**
  Ridge draws `summit` whatever else happened; below it, **a verified strength
  session takes the figure for the rest of the day** and draws `workout`;
  otherwise the Motion ladder answers. Two axes want one drawing, so the order is
  stated in one function and tested, rather than being an accident of branch
  placement. The trade is deliberate — a trained player at the treeline loses
  that day's `walk` — because Motion still reads in the tile, the meter and the
  location word, while Body reads nowhere but the figure and the ground shadow.
  It takes **minutes, not the occurrence id**: `living-reaction.ts` still reads
  `verifiedWorkoutOccurrence` to fire the one-shot celebration, and a count
  cannot re-fire anything. `resolveLivingMirror`'s `verifiedStrengthMinutes` is
  **required and never defaulted**, or "did not train" and "caller forgot" become
  the same silent answer.
- **`summit` is the seventh pose and the ridge draws it** (deviation #73).
  `motionPose()` returns `idle → walk → run → summit` across the five Motion
  bands, so the day's finish stops looking identical to 80% of the way there. It
  is **persistent, not a celebration**: `daily_walk` still fires its
  `race_victory` reaction on the crossing and still wins the priority cascade for
  `REACTION_HOLD_MS`, and the figure settles into `summit` afterwards. The name
  is deliberately not `ridge` — that word already means the step count, the
  Motion band and the race's finish line, and `CONTEXT.md` carries `summit` as
  silent development vocabulary. **No surface speaks it**, and `MOTION_LOCATIONS`
  is unchanged: the ladder still ends at the ridge and `locationName` still says
  "Ridge".
- **`scripts/generate_crest_masks.py` is the only character art generator left**,
  and it must be **re-run after any change to the art in its `SOURCES`**, which a
  test holds against `REQUIRED_PNG`. Its constants were not retuned for v3 — they
  reproduce the pack's checked-in masks byte-identically. `generate_stage_art.py`
  is deleted; there is no stage art to generate. **A render must be framed against
  the base** — same 570 × 636 canvas, same figure height, same ground line, same
  centre — and `character-assets.test.ts`'s "frames every render against the base"
  is what holds it, because `bodyScale` can only make a young bird small if the
  artwork never is.
- **Run's stance is a camera problem, not a prompt problem.** Deviation #73
  committed to fixing its "bouncy hop/skip" read and three `gpt-image-2` edits
  failed: one streamed the wings off both canvas edges, one read as a bird
  sitting with its legs out. Running is a side-on motion and every pose in this
  pack is front-facing — a front view can show a leg stagger and a few degrees of
  lean, not travel. The shipped pose buys its motion with asymmetry and a raised
  foot, which is what reads at 44 and 72 px. Fixing it means a three-quarter view
  for `run`, which is a decision about the whole pack's camera. Attempts and
  prompts are in `output/imagegen/plush-eagle-v3/pose-commission-01/`.
- **Two Mind faces are local edits, not generations.** `sleepy` and
  `well_rested` are deterministic Pillow edits of the idle render — Mind's whole
  premise is that the body does not move, only the face, and generating a whole
  bird to shift two eyes is how identity drifts. `normal` is a byte copy of idle
  under a second filename, because the registry guard reads paths and a shared
  path reads as a duplicated cell. `staticFigureSelection` never picks `normal`,
  and nothing draws the `sleep` pose at all — it exists so the registry stays
  whole.
- **The crest takes the dominant stat's hue and the body's scale follows the
  stage** (issue #33), which is how two eagles in a flock stop looking
  identical. `crestTint` reads **lifetime** points through `laneStat` — not
  `useDominantStat`'s fortnight, which `squad_leaderboard()` cannot project — so
  Today and a flock row cannot disagree; a balanced player takes no hue. The
  crest, never the bird: the figure already says four things by shape.
  `scripts/generate_crest_masks.py` finds the crest by **geometry** (topmost
  opaque row inside the central 44%) and must be **re-run after any change to
  the art in its `SOURCES`**, which a test holds against `REQUIRED_PNG`.
  `CREST_TINT_OPACITY` is 0.62 — full strength erases the outlines beneath. The
  crest is never spoken, and `plumage.test.ts` scans from the two label
  functions' own declarations. The thumbnail deliberately does not scale.
  **"Crest" names two things**: capital-C is the ceiling day's sky, lowercase is
  the bird's head feathers; the feature word is **plumage**.
- **The You tab's header band carries no bird of its own** — the ring is the
  bird on that screen — and one ground shadow, centred under it.
- **The Flock band names the day's leader** from `rows[0]`, ordered by the board
  rather than by the race, following `mode` ("won the day" vs "is ahead"), and
  guarded on two or more rows. **A squad of one reads the Sky's own sentence**:
  `resolveSquadStanding` answers `{ kind: 'alone' }` from the **squad's size,
  never the board's row count**, carries no rank and no denominator, and renders
  `SOLO_SKY_OBSERVATION` imported from the Sky. `LeaderboardRow` takes `ranked`,
  false on a board of one, which withholds the glyph *and* the spoken `Rank 1`;
  `RowLabelInput.rank` is `number | null` rather than a flag beside a number.
  The copy lives in `standing.ts` and `ordinal()` is one module.
- **The shield sentence names the streak minimum below it.**
  `shield_available_on === null` means only that nothing is recharging, so
  `shield-note.ts` holds both halves of the eligibility, derives the `5`, and
  names a pending recharge first at any streak length.
- **`Avatar`'s tint table lives in `avatar-tint.ts`** so `contrast.test.ts` can
  read its inks; it had shipped cream on `colors.accent` for as long as the
  component existed. `colors.text` is the ink; `ramp.accent[900]` is the
  tempting wrong answer at 4.39 and a test asserts that failure. Nothing mounts
  `Avatar` today.
- **Settings is its own screen** (`/settings`, behind the gear on You), and
  **"Dress your Kairo" is deliberately not built.** Its twelve PNGs were
  flattened full-character previews rather than composable layers, and deviation
  #73 deleted them along with `KAIRO_COSMETIC_ASSETS`, `data/cosmetics.json` and
  the manifest validation — keeping a validated contract for an unbuilt feature
  meant every pose change paid it a tax, which `summit` would have paid across
  twelve entries. Building it later starts from layers, which is where it always
  had to start.
- **Kairo says things without words, so a group that means something is one
  element with a composed label** and its decorative children are hidden. That
  grouping is **explicit** — the parent keeps `accessible` +
  `accessibilityLabel` **and** every direct child is hidden with
  `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`;
  neither half is redundant. Before adding a name, read what is already spoken
  beside it — a label that repeats an adjacent line is noise, and one inside a
  control that already names itself is a bug. Where composition has real edges
  it gets a tested pure module: `src/features/squad/row-label.ts` exists because
  a leaderboard row was twelve separate stops. The character HUD's layout stays
  **flow-based** — it was the app's only absolutely-positioned chrome and its
  pills overlapped at large Dynamic Type; do not reintroduce a `top` on any
  child. Structure is verified in Xcode's Accessibility Inspector on the
  simulator before a TestFlight build is cut — it answers "is this row one
  element or twelve" with no build and no VoiceOver gestures.

**This whole redesign shipped over the air, and that was verified rather than
assumed**: the tree's fingerprint was `324fba3e`, byte-identical to build 22's.
**Build 23, 2026-09-02, moved it to `9d76c5d3`** — one string in
`NSHealthShareUsageDescription` and nothing else — and every OTA since targets
that runtime, the plumage pass included.

# One Kairo, One Sky — design

**Date:** 2026-08-27
**Status:** Design approved. Awaiting implementation plan.
**Source:** Claude Design project `8c5c7e39-2209-49f9-ac37-f9918c3e4414`, `Canvas.dc.html`, section **Turn 2 — One Kairo, One Sky**.
**Proposes roadmap deviations:** **#53 · #54 · #55 · #56 · #57**

The canvas holds two turns. **Turn 2 is authoritative and Turn 1 is superseded
by it** — Turn 1 is a fox named Pip, five tabs, and `Strength / Agility /
Intellect` stat cards, none of which survive its own "What changed from turn 1"
panel. Anything in this document that cites the design cites Turn 2 (screens
2a–2e).

---

## 1. Thesis

> Every player is a Philippine eagle, the race is one shared sky, and the app
> speaks in the bird's voice rather than its own.

Kairo already has the right engine and the wrong surface. The scoring is
finished, the race is real, and the visual system is one shift away from the
design. What the app does not have is a *character* — it has four of them, so it
has none, and the daily race is drawn as six bars stacked in a card. This
redesign spends nothing on the engine and everything on the two things a player
actually sees: who their character is, and where the race happens.

## 2. What this covers, and what it explicitly does not

**Covers.** The Sunlit token system; the four-tab restructure and the
dissolution of the character tab; the retirement of the species picker; the sky
corridor; the bird's-voice copy modules; and the documentation that governs all
five.

**Does not cover — and this list is the scope contract:**

| Out of scope | Why |
|---|---|
| `tierFor`, `TIER_POINTS`, `THRESHOLDS`, `computeDailyScore`, `planDay` | The engine is finished. Deviation #23's split holds: the surface gets the player's vocabulary, the engine keeps its own. |
| Any migration, any `supabase/` change, any Edge Function redeploy | There is no schema change in this work. `profiles.species` is read differently, never written differently. |
| `RACE_FINISH_LINE`, `rankRacers`, `cappedSteps`, `Racer` | The race's *mechanics* are unchanged. Only its drawing moves. |
| `finalizable_days()`, `isFinalizable()`, the streak, quests' XP | Untouched. |
| The disclosure gate's constant, threshold, `total > 0` filter, or gated list | Deviation #37 survives intact. §7.3 states where each gated surface lands. |
| `docs/mvp-scope.md`'s IN/OUT contract | No feature enters or leaves the MVP. |

**One thing changes that looks like backend and is not.**
`src/features/notifications/routing.ts` remaps three `screen` values to new
routes. `dispatch-notifications` keeps sending exactly what it sends today; the
client decides where that lands. No function is redeployed.

## 3. Governing decisions

Taken with the user on 2026-08-27, before this document existed.

1. **Visual language *and* screen composition**, not a reskin and not a data-model pivot.
2. **"Flock" and "Sky" enter the player-facing vocabulary.** Table names, `squads.program`, `ChallengeArea` and every engine key stay as they are.
3. **The "How Aeon grows" block renders Motion / Body / Mind**, from `src/ui/stat-names.ts`. The mock draws `AGI` / `STR` / `MND`; those are engine keys and deviation #51 removed the last of them from the surface. The design is followed in layout and colour, not in vocabulary.
4. **Type stays Caprasimo + Figtree.** The canvas sets Archivo Black + Nunito Sans, but its `<helmet>` links Google Fonts while the project's own `assets/fonts/` carries the repo's `Caprasimo-Regular.ttf` and three `Figtree` cuts. That reads as what the browser could reach, not as a type decision. Same two roles, same hierarchy, no new asset.

---

## 4. Deviation #53 — the Sunlit token system

### 4.1 The palette shifts; it does not fork

`src/theme.ts` keeps every token name it has. `ramp.accent` becomes an amber
ramp where it was terracotta, `ramp.neutral` re-roots on the design's
`#3E2E22`, and `colors.bg` / `colors.surface` / `colors.surfaceLift` take the
design's cream, tint and card values. Roughly sixty files that already read
those tokens pick up Sunlit without being edited.

A parallel `sunlit.ts` was rejected for the reason `STAT_NAMES` and
`dominanceName()` exist: two tables of the same thing drift, and nothing fails
when they do.

### 4.2 `colors.accent` splits into three roles — the load-bearing part

Today `colors.accent` (`#c67139`) is used both as a fill and as text. The
design's amber is a **fill colour only**. Measured against the design's own
grounds:

| token | value | job | contrast | verdict |
|---|---|---|---|---|
| `colors.accent` | `#F5A623` | fills, meters, the flag, the active tab glyph | 1.9:1 as text on cream | **fill only** — ink on it is `colors.text` |
| `colors.accentInk` | `#C9721C` | the hero numerals (56pt) and other large accent type | 3.3:1 on `#FFF6E8` | large-text AA |
| `colors.accentDeep` | `#8F5A08` | accent text on the `#FCEBCB` tint | 4.9:1 on `#FCEBCB` | AA at body size |

`accentDeep` is **deliberately darker than the mock's `#A0670C`**, which
measures 4.0:1 and is drawn at 12.5px — under AA for body text. This is the one
place the implementation overrides the drawing, and the reason is recorded here
so it is not "corrected" back later.

**The migration is 54 call sites and none of them is automatic.** Counted on
2026-08-27 across `src` and `app`:

| shape | count | disposition |
|---|---|---|
| `color: colors.accent` (text) | 16 | → `accentInk`, or `accentDeep` on a tint ground |
| `backgroundColor` / `border*Color` | 14 | stay on `accent` |
| passed as a prop — `color={colors.accent}` | 24 | **classify individually** |

The third row is the trap and it is why a find-and-replace is forbidden here.
`<Meter color={colors.accent}>` is a fill and stays; `<ActivityIndicator
color={colors.accent}>` and `<Feather color={colors.accent}>` are ink on cream
and drop to 1.9:1 if they stay. The prop name is `color` in all three cases and
tells you nothing.

The plan must enumerate all 54 and record the disposition of each, rather than
describe a rule and trust it. The fifteen files involved are listed by
`grep -rn "colors.accent\b" src app`.

### 4.3 New roles

| token | value | job |
|---|---|---|
| `colors.sky` | `#FFE7BC` | The warm field the bird occupies. **A place, not a card** — it has no shadow, no radius of its own at the top, and nothing else may use it. |
| `colors.accentEdge` | `#DC9014` | The 3px lip under a primary button. |
| `colors.teal` / `tealEdge` / `tealTint` / `tealInk` | `#35A99B` / `#2A8A7E` / `#E4F2EC` / `#2F5C50` | The secondary action, and the sleep card. |
| ~~`colors.moss` / `mossTint` / `mossInk`~~ | — | **Superseded during planning (2026-08-27).** The design's moss card is `#EEF3DC` on `#4C5A32`, which is `ramp.sage[200]` and `ramp.sage[800]` to within a hair — a fifth family would be two tables of the same colour. Sage covers it. See plan 1, Task 2. |
| `colors.coral` | `#FF7A5C` | The streak dot. One job. |

`colors.sage` stays and keeps meaning "your lane, never a call to action". Moss
is a *tint family* for a card ground; sage is a line colour. They are not
interchangeable and the docstrings must say so.

### 4.4 Primitives that change shape

- **`src/ui/Button.tsx`** — the design's buttons carry a 3D lip
  (`box-shadow: 0 4px 0 <edge>`). Primary is amber with `colors.text` on it;
  secondary is teal with cream on it; ghost is unchanged. In RN this is a
  `borderBottomWidth` in the edge colour, not a shadow — a shadow blurs and the
  design's lip is hard.
- **`src/ui/Panel.tsx`** — two variants added. `sky` (the `colors.sky` field,
  no shadow) and `tint` (`#FCEBCB`, the "this row is you" ground). `plain`,
  `lift` and `earned` keep their meanings.
- ~~**`src/ui/Screen.tsx`**~~ — **not edited.** This anticipated `NAV_HEIGHT` moving when the bar flattened. It does not: the discs become a bar of the same height, so `TAB_PILL_CLEARANCE` is unchanged. See plan 1, Task 6.

`Panel`'s `overflow: 'hidden'` stays. It is what clipped the permission sheet on
2026-08-17, and the lesson recorded there — bound the height, scroll it, and
give text an explicit point width — applies unchanged to every new card here.

---

## 5. Deviation #54 — Today · Sky · Flock · You

### 5.1 The character tab dissolves

The design has no character tab. Screen 2b puts the bird at the top of Today;
2e puts its level, species and growth on You. Keeping a third home for it would
mean three screens whose subject is the character, which is what deviation #50
split apart in the first place.

| route | today | becomes |
|---|---|---|
| `app/(tabs)/index.tsx` | Character (829 lines) | **Today** (2b) |
| `app/(tabs)/sky.tsx` | — | **Sky** (2c), new file |
| `app/(tabs)/flock.tsx` | — | **Flock** (2d), from `squad.tsx` |
| `app/(tabs)/profile.tsx` | Profile | **You** (2e) |
| `app/(tabs)/today.tsx` | Today | deleted; merged into `index` |
| `app/(tabs)/squad.tsx` | Squad | deleted; renamed to `flock` |

`index` stays the index deliberately. It is where the app opens, it is what
`redirectTarget()` sends a ready user to, and it is what three historical push
payloads already resolve to.

### 5.2 `TabPill` flattens

One white pill, four equal items, a Feather glyph over an uppercase label,
amber when active and `ramp.neutral[400]` when not.

**The raised centre disc is retired**, and deviation #50's own reasoning is why:
a raised disc means *anchor*, and the anchor was the character tab. With no
character tab there is nothing to raise, and raising an arbitrary one of the
remaining four is exactly what that deviation forbids.

The geometry constraint it recorded still binds, and now binds harder because
the labels are painted. Four equal items must fit 320pt less the bar's own
`14pt` insets — 292pt of usable width. At `4 × 64 + 3 × 8 = 280` it fits at
default type. At the `chrome` scale's 1.4× cap a 10pt label reaches ~14pt and
"FLOCK" measures ~56pt, so the items must be allowed to **shrink to their
content** rather than hold a fixed 64: `flex: 1` per item with the label
`numberOfLines={1}`. A fixed width here is the two-column row that could not fit
past ~1.3×, in a new place.

`NAV_HEIGHT` stays **96** so `TAB_PILL_CLEARANCE` does not move and no screen's
bottom padding changes.

`LABELS` stops being accessibility-only and becomes painted text. It is still
the `accessibilityLabel`, so the strings remain load-bearing in both jobs.

### 5.3 Push routing moves with the routes, or taps go nowhere

`/today` and `/squad` stop existing. A tap that lands nowhere is
indistinguishable from push being broken — the rule `goal_completed` is kept
alive by — so `notificationTarget()` remaps:

| `screen` | was | becomes | note |
|---|---|---|---|
| `'today'` | `/today` | `/` | The digest's live destination (#52). Today is the index tab now. |
| `'squad'` | `/squad` | `/flock` | Historical, from the retired evening loop. |
| `'character'` | `/` | `/` | Unchanged. |
| `'train'`, `'events'`, `'goals'` | — | unchanged | |

`NotificationDestination` loses `/today` and `/squad` and gains `/flock`.
`routing.test.ts` is updated in the same commit. **No Edge Function changes** —
the payloads are identical, only their interpretation moves.

---

## 6. Deviation #55 — one Kairo

### 6.1 Display-only, and therefore reversible

`profiles.species` is **not migrated, not dropped and not written**. `species.ts`
gains:

```ts
export const DEFAULT_SPECIES: SpeciesId = 'eagle';
```

and every art lookup resolves `species ?? DEFAULT_SPECIES`, forced to `'eagle'`
at the render boundary. The registry keeps all four entries, the column keeps
every stored value, and reversing this decision is a one-line change rather than
a migration.

This is the same disposition `profiles.character_body` has — except that column
is dead, and this one is merely quiet.

**Existing choosers see their character change.** Someone who picked a tamaraw
renders as an eagle after this ships. That is the point of the deviation rather
than a side effect of it, and the stored value is what makes it undoable.

### 6.2 Retired

- `src/features/character/SpeciesPicker.tsx`
- `app/species.tsx`
- `app/(onboard)/character.tsx`
- The Companion panel in `app/(tabs)/profile.tsx`

**`species-label.ts` stays.** `Diorama.tsx` reads `speciesFigureLabel()` for the
hero's accessible name, and the hero survives on Today — so the module is live,
not orphaned. Its tests stay green.

`SPECIES_HABITATS` and the three unused figure PNGs stay on disk. They cost
nothing and they are half of what "reversible" means.

### 6.3 Onboarding becomes two screens

`/connect` → `/name`, with `/name` rendered as screen 2a — the bird, the name
field, and SAY HELLO.

This **removes** a step rather than adding one, so deviation #22's rule is not
merely respected but strengthened: the profile row still commits exactly once,
still on the last screen, and `finishingOnboarding` stays deleted. `/name` stops
reading a `species` route param and writes `DEFAULT_SPECIES` in the same INSERT
it already performs.

`/connect` is unchanged, including its local `readStepsToday` read against the
device zone — there is still no profile row at that point.

---

## 7. Deviation #56 — the sky corridor

### 7.1 The mechanics do not move

The corridor draws the same `Racer[]` `RaceTrack` draws today, from the same
`squad_leaderboard()` payload, re-ranked on the client by capped steps. Every
rule deviation #46 recorded still holds and must be restated in the new file's
docstring:

- `RACE_FINISH_LINE` is `DAILY_STEP_BASELINE`, **derived, never a literal.**
  `10_000` must not appear in the new modules.
- The race **never reads a tier**, so it stays clear of the `AGI` / `AGI_base`
  trap by construction.
- The client re-ranks; **SQL keeps ordering by the program-weighted total.**
  Ranking once in SQL silently deletes the program feature (deviation #11).
- A row whose `steps` is null keeps its place and gets no position.

The flag reads **`10,000 steps`**, not the mock's `10 KM`. Steps to kilometres
needs a stride assumption the engine does not have and will not acquire for a
label, and a second number describing the same bar is what the derived constant
exists to prevent.

### 7.2 Drawn without a new native dependency

The corridor is a cubic Bézier. `react-native-svg` would draw it directly and
was rejected: it is a native module, so it moves the fingerprint, costs one of
the month's fifteen EAS builds, and withholds every OTA update until that build
lands. This whole redesign is otherwise OTA-shippable and that is worth
protecting.

Instead the band is **~24 short rounded segments positioned and rotated along
the curve**, all plain React Native. The curve lives in
`packages/kairo-core/src/sky-path.ts` — zero-dependency, no clock, no
randomness, tested in Node like everything else in the keystone:

```ts
export function pointAt(t: number): { x: number; y: number };   // normalised 0..1
export function tangentAt(t: number): { dx: number; dy: number };
export function placeRacers(progress: readonly number[]): Placement[];
```

`placeRacers` owns the **de-overlap rule, which is not an edge case here.**
`cappedSteps` stops at the finish line, so two active people are tied *by
construction* — CLAUDE.md says so — and on a single shared corridor a tie means
one marker drawn on top of another. Racers within a threshold along the curve
are offset perpendicular to the tangent, deterministically and in rank order, so
the picture does not twitch between polls.

Putting the geometry in the keystone rather than in the component is the same
call `pooledDays()` records: the thing two renderings must agree about does not
live inside one of them.

### 7.3 Accessibility

Each racer marker is **one element carrying both halves** of the 2026-08-14
grouping fix — `accessible` + `accessibilityLabel` on the marker, and
`accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`
on every direct child. Neither half is redundant; the documented collapse did
not happen on that build.

The corridor itself is decorative and hidden. `raceLaneLabel()` in
`race-label.ts` already composes the sentence a marker needs and is extended
rather than replaced.

### 7.4 Retired

`RaceTrack.tsx`, `RaceLane.tsx` and `RaceCard.tsx`, once Sky ships.
`Leaderboard.tsx` drops its `RaceTrack` mount. `race-label.ts` survives — the
corridor and the Today sentence both read it.

---

## 8. Deviation #57 — Flock and Sky

Player-facing vocabulary only, exactly as deviation #23 split tiers and #51
split stat names:

| Surface says | Engine, schema and config keep |
|---|---|
| flock | `squads`, `squad_members`, `squad_leaderboard()`, `squads.program`, `useMySquad` |
| sky | `race.ts`, `RACE_FINISH_LINE`, `rankRacers`, `Racer` |

"Squad" survives in `SquadDataConsentSheet`'s copy **only if** the consent text
is left alone — it is a privacy disclosure that members have already read, and
rewording it is a separate decision with a separate review. Flag it in the plan;
do not silently reword it.

`squad_data_consent_granted`, `race_seen` and `quest_cleared` keep their names.
They are analytics values with historical rows behind them, and
`kairo_retention()` is deliberately unchanged across pivots.

---

## 9. The bird's voice

`src/features/character/kairo-voice.ts`, pure and tested, in the house split
that `race-label.ts`, `row-label.ts`, `program-copy.ts` and `quest-copy.ts`
already establish — decision in a zero-import module, performance in the
component.

It composes the design's sentences from figures the screen already has:

> "Enough to lift Aeon clear over the valley. Ramon's is still 1,240 ahead of you."
> "Aeon slept when you did. Seven hours twenty — it has energy to burn all afternoon."
> "One more loop of the block and Aeon's Motion tops out for the day."

Three rules for the module, all of which the existing copy modules already obey:

- **It never prints a score total.** Raw units only (deviation from 2026-08-15, still in force).
- **It never prints an engine key.** Stat words come from `stat-names.ts`, by relative path — `program-copy.ts` shows why, and the barrel is not importable from a module root Vitest tests.
- **A missing figure yields a shorter sentence, never a fabricated one.** `sleepMinutes: null` means "No reading yet", the same rule `finalize-days` grades by.

This is what carries the race onto Today, and it is why `RaceCard` leaves that
screen: the race is a top-level tab now, and the hero sentence names the gap.
**The `race_seen` daily marker moves to the Sky screen**, which is now literally
what it measures. `claimDaily` keys and the once-per-local-day rule are
unchanged.

---

## 10. What the mocks do not show

Each mock is one non-scrolling 402×874 viewport. The real screens scroll and
carry shipped features the drawing has no room for. **Every one is kept**,
restyled into the Sunlit card language, below the design's composition.

| Screen | Design's composition (above) | Kept below |
|---|---|---|
| **Today** (2b) | Hero bird in `colors.sky`, level pill, streak pill, the day's steps at 56pt, the voice sentence, the sleep card, the lane card | `QuestList`, `DailyWalkCard`, `TrainEntry`, `SyncStatus`, `FirstSyncCallout` |
| **Sky** (2c) | The corridor, markers, the flag, the standing card, CHEER THE FLOCK | The no-squad and no-consent states |
| **Flock** (2d) | Squad name, the week strip, the flock diorama, ranked rows, the invite code | `SquadEventPanel`, `CreateSquadForm`, `JoinSquadForm`, `SoloBoard`, `SquadDataConsentSheet`, `LockedSlot`, `SlotUnlockReveal` |
| **You** (2e) | Avatar + XP ring, name, level, streak card, "How Aeon grows", timezone | `StatRail`, `BodyMetricsCard`, `NotificationSettingsCard`, quest difficulty, sign out, delete account |

### 10.1 The stacked routes are re-skinned, not re-composed

`app/train.tsx`, `app/progress.tsx`, `app/event/new.tsx`, `app/event/[id].tsx`,
`app/join/[code].tsx`, `app/delete-account.tsx` and `app/(auth)/sign-in.tsx`
have no mock. They inherit Sunlit through the tokens in stage 1 and are
**checked, not redesigned** — the check being that nothing on them relied on
`colors.accent` meaning both a fill and a text colour. `train.tsx`,
`progress.tsx` and `delete-account.tsx` are three of the fifteen files in §4.2's
count, so they are already in that enumeration.

Apple's branded Sign in with Apple button on `(auth)/sign-in.tsx` is **not**
restyled. It is required by their HIG and swapping it for Kairo's `Button` is a
review risk, which is why it is not one already.

### 10.2 The disclosure gate is unchanged, and here is where each gated surface lands

Deviation #37's constant, its `total > 0` filter, its lifetime-not-recent rule
and its `resolved && stage` navigation rule are all untouched. What moves is
only *which file* mounts each gated thing:

| Gated surface | Was on | Now on | Gate |
|---|---|---|---|
| `StatRail` | Character | **You** | `stage === 'full'` |
| Strain / Sleep rows | Character | **Today**, as 2b's sleep and lane cards | `stage === 'full'` |
| `TrainEntry` | Today | **Today**, unchanged | `stage === 'full'` |
| `/train` redirect | — | unchanged | `resolved && stage === 'core'` |

A `core` account therefore meets: the bird, the day's steps, the voice sentence,
three quests, and the Daily Walk. That is one more live thing than it meets
today, and nothing was taken out of the gate.

`useDisclosure`'s doc comment lists the gated surfaces. **It is updated in the
same commit** — it was written down precisely because it never had been, and
that is what let a wider reading look plausible.

---

## 11. Testing

**Automated.**

- `packages/kairo-core/src/sky-path.test.ts` — endpoints, monotonicity along `t`, tangent continuity, and the de-overlap rule at an exact tie (which is the common path, not an edge case).
- `src/features/character/kairo-voice.test.ts` — every branch, plus a scan asserting no output contains a score total or an engine key.
- `src/features/notifications/routing.test.ts` — updated for the three remapped screens; the historical payloads must still land somewhere real.
- `src/ui/stat-names.test.ts` — the Agility scan stays green over `src` and `app`, including every new file.
- `npm run typecheck` and `npm test` gate the branch.

**By hand, on the simulator.** UI is verified by hand (§15), and two passes are
mandatory rather than optional here because both classes of bug this design can
reintroduce were found the hard way:

1. `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`, **then relaunch the app** — RN caches text measurements, so a size change on a running app renders correct text in stale boxes. Every new card is checked for the permission sheet's three failures: unbounded height, unbounded width on a direct `Text` child of a scroll container, and a two-column row that cannot fit past ~1.3×.
2. **Xcode's Accessibility Inspector** on the Sky corridor and the Flock rows, before any TestFlight build. It answers "is this one element or twelve" directly, with no VoiceOver gestures and no build — the grouping failure cost two builds to find and confirm.

**Not verifiable here.** Simulator UI automation is blocked on this machine
(synthetic clicks land 60–120s late), so taps and the Inspector pass go to the
user. Dynamic Type and screenshots are headless and are mine.

## 12. Shipping

Everything in this design is JS and assets, so it reaches installed builds with
`npm run eas:update:production` and spends no build quota. **This is a property
worth defending**: it is the whole reason `react-native-svg` was rejected in
§7.2. If any step of the plan reaches for a native module, that is a signal to
stop and re-cost, not to spend a build.

`npm run eas:fingerprint` before and after is the check that the property held.

## 13. Documentation, in the same pass

Not a follow-up:

- **`CLAUDE.md`** — five new deviation blocks; the "four tabs" block rewritten; the species block amended to display-only; the race block amended for the corridor; `colors.accent`'s three roles recorded, because the split is the single easiest thing here to undo by accident.
- **`docs/roadmap.md`** — rows #53–#57 in the approved-deviations table.
- **`docs/user-journey.md`** — onboarding is two screens; the daily loop opens on the bird; the race is a tab.
- **`README.md`** — tab set and the species statement.
- **Notion** — on request only, per the standing convention. Not part of this pass unless asked.

## 14. Implementation order

Five stages. Each ends green on `npm test` and `npm run typecheck`, and stages
1–2 are prerequisites for everything after them.

1. **Tokens and primitives** — `theme.ts`, `Button`, `Panel`, and the `colors.accent` call-site migration. The whole app re-skins here and is verifiable before any screen moves.
2. **Navigation** — `TabPill`, `(tabs)/_layout.tsx`, the route renames, `routing.ts` + its test. The app is navigable in the new shape with old screen bodies.
3. **One Kairo** — `DEFAULT_SPECIES`, the deletions, onboarding down to two screens.
4. **Screens** — Today, You, Flock re-composed against 2b / 2e / 2d, and `kairo-voice.ts`.
5. **Sky** — `sky-path.ts` and its test, the corridor, the retirement of `RaceTrack` / `RaceLane` / `RaceCard`.

Documentation lands with the stage that causes it, not at the end.

## 15. Risks

| Risk | Mitigation |
|---|---|
| The `colors.accent` split is reverted by a later edit reaching for one token | Recorded in `CLAUDE.md` with the measured contrast figures, and in `theme.ts`'s docstring |
| The corridor's markers overlap on a tie and the board twitches between polls | `placeRacers` is deterministic and rank-ordered; the tie case is a named test |
| A push sent before the deploy is tapped after it and lands nowhere | `routing.ts` keeps every historical `screen` value resolving to a real route |
| The 829-line character screen loses a behaviour during redistribution | Stage 4 is a re-composition of existing components, not a rewrite of them; the file's hooks are inventoried before it is deleted |
| Dropping `RaceCard` loses the `race_seen` marker | It moves to Sky in the same commit, with the same `claimDaily` key |

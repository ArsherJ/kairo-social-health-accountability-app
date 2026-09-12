# The character — one eagle, the Living Mirror, the art pack — the rules in full


> **2026-09-12 note.** Several files this text calls "still on disk", "unmounted with their tests" or "kept under `@deprecated`" were deleted by the ponytail audit (roadmap deviation #74): `TodayPanel.tsx`, `strain.ts`, `event.ts`, `Avatar.tsx`/`avatar-tint.ts`, `KairoLab.tsx`, `kairo-lab-contract.ts`, `data/*.json`, `validateCharacterManifests`, `species-art.ts`, `species-label.ts`, the `demo/` feature and `scripts/replay-dry-run.mjs`. The schema they served is untouched. Read those sentences as history.
Moved verbatim from `CLAUDE.md` on 2026-09-12 (ponytail audit) to keep that file inside its size limit. The rules are summarised in `CLAUDE.md`; this is the full text and the *why*.

**The character is an animal as of 2026-08-18** (roadmap deviation #40, which
supersedes #27). **Deviation #55 supersedes the *choosing* half of it on
2026-08-27** — every character is now the eagle and the picker is retired; the
registry, the column and the art are all unchanged. Four Philippine endemic
species — `'pilandok' | 'tamaraw' | 'carabao' | 'eagle'` — live in
`src/features/character/species.ts`, a
zero-import registry that is the single source for ids, names, hues,
affinities and blurbs. **`affinity` is flavour and nothing in `@kairo/core`
imports that file**: a species never touches scoring, and adding a mechanical
bonus later would rescore history, because `daily_scores` is replayed from
stored buckets. Four things break easily:

- **`profiles.species` is a new nullable column; `profiles.character_body` is
  dead**, never written and read by no surface — the same disposition as
  `profiles.sex`. Its TypeScript parser was deleted (a parser for a value no
  screen can produce documents nothing); the column comment and its schema test
  are what record the disposition.
- **`SpeciesPicker`, `/species`, `app/(onboard)/character.tsx` and the home
  screen's one-per-launch prompt are all gone** (deviation #55, 2026-08-27).
  The picker was mounted by two routes because `redirectTarget` cuts both ways
  — a `ready` user inside `(onboard)` is bounced to `/`, a `needs-profile` user
  outside it to `/connect` — and that is worth remembering the next time a
  screen has to serve both cohorts, not for this one.
- **The profile row commits exactly once, on the `/name` screen** — still
  load-bearing however many screens precede it (six since deviation #58; see its
  block below). Deviation #22 deleted the `finishingOnboarding` flag when
  onboarding briefly collapsed to one step; asking anything *after* the INSERT
  flips `resolveRoute` to `'ready'` under the unfinished screen and needs that
  flag back. Add onboarding steps *before* the name, never after.
- **The picker's layout lessons outlived it and now live on `/name`**: it
  scrolls, and its text sits in a `View` with a real width. Both are the
  permission sheet's 2026-08-17 lessons, and on a screen carrying a 28pt input
  they are not optional.

**There is one Kairo, and it is a Philippine eagle, as of 2026-08-27**
(deviations #55, #57). Four things break easily:

- **`profiles.species` is untouched and must stay so.** The eagle is resolved at
  the *render boundary* by `displaySpecies()`, which takes the stored value and
  ignores it. Nothing migrates, nothing is dropped, and `parseSpecies` still
  accepts all four — narrowing it would fail every stored row on read, which is
  the difference between a display decision and a destructive one. Reversing #55
  is deleting one line. Six call sites resolve through it and each lost its
  `Avatar` fallback, `CharacterFigure`'s View primitives with them; `Build` now
  holds only `shade` and `weight`, the pair the ground shadow reads.
- **Retiring the picker removed a screen** (it sat before `/name`). This
  *strengthens* deviation #22's rule rather than merely respecting it: the
  profile row still commits exactly once, on `/name`, whatever precedes it (the
  flow is six screens as of deviation #58 — see its block below). Add onboarding
  steps **before** the name, never after — anything after the INSERT flips
  `resolveRoute` to `'ready'` under an unfinished screen and needs the deleted
  `finishingOnboarding` flag back.
- **`kairo-voice.ts` owns what the bird says**, and it is zero-runtime-import so
  root Vitest can test it — it reaches `stat-names.ts` by relative path, exactly
  as `program-copy.ts` does, because the `@/ui` barrel does not resolve there.
  Three rules have tests behind them: no score total, no engine key, and a
  missing figure yields a *shorter* sentence rather than a fabricated one. The
  null night reads "No reading yet", which is the rule `finalize-days` grades
  by — a raw `daily_sleep.minutes` read would have the card congratulating
  somebody on a night the engine ignored.
- **The Today tab is the character screen and the old Today tab merged**, and
  the race on it is a *sentence*, not a card. The card is gone; the picture is
  the Sky tab, and `race_seen` fires there — the marker measures looking at the
  race, and this screen no longer shows one. **Deviation #59 removes even the
  sentence** — see the Living Mirror block below for what Today is now.
  `TodayPanel`, `character/standing.ts`, `character/stat-detail.ts` and
  `character/species-label.ts` are unmounted and still on disk with their tests.
- **The app says so out loud as of 2026-09-08** (issue #32), in exactly one
  place *it is printed*: `speciesLine()` in `species.ts` returns *"A Philippine
  eagle"* and the You tab renders it under the character's name. Said is not the
  same as shown — `LeaderboardRow` has passed `SPECIES_NAMES[displaySpecies()]`
  into `leaderboardRowLabel` since deviation #40, so a flock row has spoken the
  species all along, and it stays. The sweep below cannot see that path, because
  it is a registry lookup and a phrase scan only finds copy somebody typed.
  Four things break easily.
  **The words live in the registry and nowhere else** — `species-line.test.ts`
  sweeps every non-test file under `app/` and `src/`, comments stripped, and
  fails the phrase in any file but `species.ts`, so a second surface reads the
  function rather than writing the sentence again. **`noun` is a second string
  beside `name`, not a derivation**: a label takes a label's capitals
  ("Philippine Eagle") and a sentence takes the species-name rule ("Philippine
  eagle"), and no transform gets from one to the other for all four — so the
  test asserts instead that the two say the same words and differ only in case,
  which is `SPECIES_NAMES`' anti-drift rule where a derivation cannot reach.
  The article is written out for the same reason a derivation was refused: no
  noun here begins with a vowel, `SPECIES_IDS` mirrors a CHECK constraint, so a
  fifth species is a migration — and the test's exact four-line assertion is
  what fails in front of whoever writes the fifth sentence.
  **It is one line and must stay one**: not a species readout, not a fact card,
  not a second noun for the character, which still has none — the registry's
  `blurb` is endemic-fact copy that belonged to the retired picker.
  And **the App Store description is held to the same words** by an assertion
  over `docs/app-store-listing.md`, which is the repo's copy of a field typed
  into App Store Connect by hand, exactly like `NSHealthShareUsageDescription`
  and the privacy answers. That file makes **no privacy claim of its own** and
  points at the policy instead, deliberately: it is not registered with
  `claim-surfaces.test.ts`, because a guard over a doc would imply a guard over
  a field nothing in this repo can reach. **The figures in it are pinned to the
  constants** — the Daily Walk baseline and the free flock size — by the same
  test, which is the welcome cards' rule applied where Markdown cannot import;
  a description promising 10,000 steps after the baseline moved would be a
  false claim in the one place a stranger reads before installing.

**Today is the Living Mirror as of deviation #59** (2026-09-01). Its
always-visible order is the KAIRO scene, compact Level/personal Streak, Motion
location plus one step figure, one quest-backed next step, then **See today's
details**. The Sky owns the race; You owns Mastery and records. Do not put race
copy, Mastery coins, three quest rings, sleep/lane tiles, a Daily Walk card, or
a Challenge card back on Today. Nine things break easily:

- **The visible next step never changes the quest contract.** `todayQuests()`
  still resolves exactly three entries from account + local date + tier +
  `has_sleep_source`; `selectNextStep()` only ranks those entries. The server
  grades the same set and completion XP still latches. It is the **nearest
  incomplete quest across Motion and Body together** — deliberately not
  Motion-first with a fallback, which let a Body quest at 95% lose to a Motion
  quest at 80%. The Strength Challenge opt-in (`profiles.trains_strength`) is
  the sole override and wins outright; "attainable" means `!met` and nothing
  more, because a pace or time-of-day heuristic is the fabricated time estimate
  the design forbids. An incomplete sleep quest is an observation in details,
  never a daytime action.
- **The personal Streak and the Daily Walk run are different.** The HUD reads
  `streaks.current_streak`; Motion details reads `dailyWalkState().streak`.
  Never alias either value or label — `walkNote()` says "run" and a test pins
  it, because that sentence now lands on a screen whose header shows the other
  figure.
- **The Motion ladder is `branch → treeline → valley → climb → ridge`, and
  `ridge` is 100%.** "Ridge" already names `RACE_FINISH_LINE`, which *is*
  `DAILY_STEP_BASELINE` — the Sky tab draws `10k · ridge`, `trivia.ts` says
  "steps to the ridge", and `spreadLine` is forbidden the word for exactly this
  reason. Never move it to a lower band and never introduce "Cleared" or
  "Clearing" as a second name for the finish. It follows that `dailyWalkMet` and
  `location === 'ridge'` are the same fact: the arrival gets **one** reaction,
  owned by `daily_walk`, and `reactionCandidates` builds no location candidate
  for the top band.
- **The presence ring is `auraStrength()`'s, not Body's.** Peak rating across
  all three stats, with the All-Rounder's ring unconditional — the argument is
  in `aura.ts` and predates the Living Mirror. Body drives the ground shadow's
  weight and tint only. Deriving the ring from `str_total` deletes it for every
  Motion- or Mind-dominant player and every All-Rounder, and since Today is the
  only screen mounting `CharacterFigure`, that is the whole app. This is why
  Today still queries `dominance` and passes `lifetimePoints`.
- **Static Living Mirror art is priority, not composition.** Current PNGs are
  flattened full-character images. Render one of reaction pose → non-neutral
  Mind state → Motion pose → base. Body uses the ground shadow; do not distort
  the canonical figure or manufacture pose × state × Body exports. **This
  priority and `REACTION_HOLD_MS` are the only two things Rive replaces** — the
  character asset system design stays authoritative for V1, `kairo_v1.riv` is
  being authored, and the trigger vocabulary (`ReactionKind`) is kept separate
  from the animation vocabulary (`KairoReactionId`) precisely so the swap
  touches no trigger rule. Rive signals its own completion, so the fixed timer
  dies with the static art. `tired` is in `KAIRO_REACTIONS` with **no
  producer**, deliberately: sleepiness is a daily Mind state, not an event.
- **Only the presented reaction is consumed, and an opening is a focus or a
  foreground.** Marking every unseen candidate seen means a level-up
  permanently swallows the Daily Walk clear and a personal best on the same
  afternoon. Today is a persistent tab, so a mount-scoped guard is one
  evaluation per app launch; `useFocusEffect` plus `AppState` is what "opening
  Today" means to a person, and `REACTION_FLOOR_MS` (30s) is what stops
  tab-flicking dripping four celebrations in ninety seconds. `moments.ts` is a
  **fixed-size** store — five kind keys plus one observed level per account,
  each holding the last occurrence id — never an append-only ledger; occurrence
  ids are date-keyed so nothing needs pruning.
- **`living-reaction.ts` is the only producer of a `level:a->b` occurrence.**
  `reactionForLevelChange()` in `character-resolver.ts` emitted the identical
  string and is deleted; two producers of one occurrence id is how they drift.
- **Today now adds two owner-only reads deliberately:** today's verified
  strength-session evidence (`useTodayStrengthSummary`) and personal records.
  Neither reaches a projection or telemetry. The strength display predicate is
  contract-tested against the server allowlist (`WORKOUT_SOURCE_ALLOWLIST`), and
  `summarizeTodayStrength` tie-breaks on `hkUuid` because PostgREST guarantees no
  row order and a flipping `latestOccurrence` re-fires a celebrated reaction.
  Scoring remains server-authoritative. In exchange the leaderboard, recent-day
  and race-rank reads are gone from this screen.
- **Native modals lease `src/ui/modal-owner.ts`.** Permission asks, welcome
  cards and Today details must never be visible under different owners in the
  same frame — a `<Modal>` presents on the root view controller wherever it is
  mounted, and UIKit refuses the second silently and wedges the window. Each
  surface claims in an effect and releases in the same effect, never from a
  close callback, so a native dismissal and a button dismissal cannot diverge.

**The disclosure gate did not move, and its list on Today is now one item.**
Same `DISCLOSURE_THRESHOLD_DAYS`, same `total > 0` filter, same lifetime
reading, same `resolved && stage` navigation rule — deviation #37 is untouched.
What got shorter is the list of surfaces: the only gated thing on Today is the
**Challenge link inside the details sheet**, hidden on `stage` alone. `StatRail`
is on You with its own gate; the Strain/Sleep rows and the Challenge-entry card
are *deleted*, not ungated. `/train`'s own `resolved && stage` redirect is the
real door.

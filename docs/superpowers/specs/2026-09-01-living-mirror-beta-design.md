# Living Mirror — beta design

**Date:** 2026-09-01

**Status:** Implemented in the current beta; automated suite green (1,343 schema/app + 456 core). The simulator visual, Dynamic Type and VoiceOver matrix in Task 10 Step 6 of the plan is outstanding — it needs a hand pass on a booted simulator, which this machine cannot drive.

**Proposes roadmap deviation:** **#59**
**Vocabulary:** `CONTEXT.md`

## 1. Thesis

> KAIRO is the interface: real activity changes one living scene, and the scene
> offers one gentle next step.

The current Today screen asks several systems to be the main loop at once. Its
hero carries Level, Streak, three Mastery coins and steps; the scroll adds three
quest rings, race copy, character observations, spread and ceiling explanations,
sleep and lane tiles, sync state, the Daily Walk, Challenges, disclosure copy and
help. Every item can be defended alone. Together they make the character the
decoration around a health dashboard.

This design makes companionship primary, achievement secondary and social
momentum optional. KAIRO reflects what the player already did; opening the app
is never required to claim progress. A quiet day produces a quiet companion,
not a sick pet, disappointed coach or decaying character.

The beta tests that emotional loop with the existing static asset boundary. It
does not pretend flattened PNGs can compose Body, Motion and Mind. Rich physical
Body growth remains the V1 destination and does not justify a Cartesian asset
pack in the beta.

## 2. Authority and supersession

This document changes screen composition, character presentation and quest
placement only. It supersedes:

- the Today composition in
  `docs/superpowers/specs/2026-08-27-one-kairo-one-sky-design.md` §10;
- the visible three-ring quest arrangement in
  `docs/superpowers/specs/2026-08-25-the-today-tab-design.md` §7; and
- any earlier character-surface decision that places Mastery on Today.

In roadmap terms, deviation #59 supersedes **#50**'s Today composition (the
three visible quest rings and the Challenge door) and **#57**'s race sentence on
Today. It must name both in its row: a deviation that does not say what it
retires is what let the three-ring arrangement outlive its own design.

It does **not** supersede the quest engine, quest XP, Daily Walk rules, race,
scoring, Mastery, disclosure capability, health ingestion or character identity.
Nor does it touch **#37** — the disclosure threshold, the `total > 0` scored-day
filter and the `resolved && stage` navigation rule are all unchanged; only the
list of surfaces the gate covers on Today gets shorter. It also does not
supersede the character asset system design (§4.4), which remains authoritative
for V1. Those existing decisions remain authoritative.

## 3. Product principles

1. **Companion, not dependent.** KAIRO notices effort and rests on quiet days.
   It never weakens, becomes ill or implies the player owes it activity.
2. **Real life pays automatically.** Health activity counts without an app open,
   claim button, check-in or bonus for launching.
3. **One shared scene.** Motion, Body and Mind are meanings inside one character
   presentation, not three mini-games.
4. **One reading, one next step.** Today leads with steps and one selected quest.
   Everything else is available on demand.
5. **Capability before prompting.** An account without a verified sleep source
   sees no Mind reading, empty slot or Mind suggestion.
6. **No punishment.** Lifetime progress never falls. Missing a target adds no
   character damage or new penalty.
7. **The engine stays honest and hidden.** Raw units explain the day; score totals
   and Bronze/Silver/Gold remain internal.

## 4. The living-mirror model

HealthKit and the existing server calculations remain the source of truth. A
pure presentation model resolves those inputs into exactly five outputs:

```text
health buckets + verified sleep + profile rollups + quests + occurrence markers
                                      |
                                      v
     location/pose + Body presence + Mind state + next step + reaction
                                      |
                                      v
                         Today scene and details sheet
```

The model does not calculate points, modify health data or introduce another
progression ledger. The Today screen consumes its result; it does not repeat the
rules inline.

### 4.1 Motion — where KAIRO is

Motion drives the scene's location. Its progress is a read-time projection of
steps against `DAILY_STEP_BASELINE`, the same fixed finish line used by the
Daily Walk and Sky race. There is no second Motion target.

| Progress | Scene language |
|---|---|
| 0–24% | Branch |
| 25–49% | Treeline |
| 50–74% | Valley |
| 75–99% | Climb |
| 100%+ | Ridge |

**The Ridge is the finish, and it already means that everywhere else in the
app.** `RACE_FINISH_LINE` *is* `DAILY_STEP_BASELINE`, the Sky tab's finish
marker reads `10k · ridge`, the onboarding trivia card says "steps to the
ridge", and `kairo-voice.ts` reserves "cleared the ridge" for progress ≥ 1 —
which is also why `spreadLine` is forbidden from using the word for a shifted
band. Assigning "Ridge" to a 75–99% band would put two values behind one noun,
so the fourth band is **Climb** and the top band keeps the word the app has
always used for it. One number, four readings: the Daily Walk's baseline, the
race's finish, the Motion scene's summit and the ridge the character clears.

The scene caps at the Ridge just as the race caps at its finish. Running can
select a more energetic available pose, but does not add a running meter or
separate reward.

### 4.2 Body — how KAIRO carries itself

Body still reads active calories plus verified strength-session credit through
the existing scoring model. Lifetime Body Mastery never falls.

The commissioned destination is gradual torso and wing development. The beta
does not have those composable assets. It therefore uses the existing character
presence vocabulary—ring/shadow treatment driven by lifetime Body progression—
and the existing workout pose after a verified strength session. It does not
scale or distort the canonical figure, name a physique tier to the player or
celebrate body shape.

A later physical Body treatment requires layered source art reviewed against
`assets/CHARACTER_BIBLE.md`, `assets/CHARACTER_SPEC.json` and the golden
reference. It must not be implemented as pose × Mind × Body flattened exports.

### 4.3 Mind — how KAIRO presents today

The latest scored, verified sleep duration selects one of the existing daily
states: sleepy, normal or well-rested. This state changes the eyes, crest and
posture for the day. A low-sleep state is calm and slower, never sick, sad or
accusatory.

Mind cannot be repaired with an in-app action after waking. When
`has_sleep_source` is false, the model selects the neutral character image and
omits Mind from readings, quests and suggestions. It never displays zero for an
unknown night.

### 4.4 Static beta composition

The pose and state PNGs are full-character previews, not independent layers.
The beta therefore uses this priority instead of claiming simultaneous visual
composition:

1. one-shot milestone pose, when an unseen reaction is being presented;
2. a non-neutral daily Mind image;
3. the Motion-appropriate idle, walk or run pose;
4. the neutral base fallback.

Motion location remains visible through the scene even when Mind owns the
figure. Body remains visible through the independent presence treatment. This
is the beta-pragmatic route approved for the current art boundary.

**This priority is the part Rive replaces, and nothing else is.** The approved
character asset system (`docs/superpowers/specs/2026-08-27-kairo-character-asset-system-design.md`)
is authoritative for V1 and its architecture is one embedded `kairo_v1.riv`
bound to the semantic contract already in `src/features/character/character-contract.ts`.
The beta ships static PNGs because that file is still being authored; the
living-mirror resolver's five outputs are the seam, so the swap replaces
`staticFigureSelection` and touches nothing else. Two beta-only mechanisms die
with it and are marked as such in place: the fixed reaction timer (§8), because
Rive signals its own completion and the asset spec forbids a timeout that
guesses, and the flattened pose/state selection itself. Nothing in this design
may assume the static boundary is permanent.

## 5. Today information hierarchy

### 5.1 Always visible

The approved **Balanced mirror** hierarchy is:

1. the KAIRO scene;
2. compact Level and Streak indicators;
3. the current Motion location and one step figure;
4. one selected next-step sentence; and
5. **See today's details**.

The step figure is the only large reading. KAIRO remains the largest visual
element. The visible sentence names an attainable action without urgency,
medical advice or a fabricated time estimate.

**The location name is always rendered, Branch included.** A label that appears
at 2,500 steps and not before reads as a rendering fault, and Branch is where
KAIRO lives rather than a failure state. The five words are the enum values
capitalised — Branch, Treeline, Valley, Climb, Ridge — with no second table
mapping one to the other, because a parallel table of the same five words is
stale by construction.

### 5.2 Removed or merged from Today

| Current surface | Disposition |
|---|---|
| Three Mastery coins | Remove from Today; Mastery stays on You. |
| Three quest rings | Replace with one selected quest sentence. |
| Race gap/status line | Remove from Today; the full race stays on Sky. |
| Sleep and dominant-lane tiles | Express through KAIRO and optional details. |
| Daily Walk card | Fold its step target into Motion; move its distinct cleared-walk run into Motion's details. |
| Challenge entry card | Move to the details sheet footer. |
| Permanent progress-help link | Move explanation into the details path. |
| Spread, ceiling and sync prose | Show only when the state makes each relevant. |

This is a presentation move, not data deletion. History, records, Mastery,
Challenge completion, quest completion and XP remain intact.

## 6. One next step, backed by the existing quest engine

The three derived daily quests and their completion/XP rules remain unchanged.
The living-mirror model ranks today's three and presents one as the next step.
The other two appear under **More for today** in the details sheet. The server
therefore never grades an invisible set different from the client's set.

Selection is deterministic and uses this order:

1. Exclude any quest whose capability is unavailable. Existing
   `has_sleep_source` filtering remains authoritative for Mind.
2. Exclude completed quests from the next-step slot; completed entries remain
   visible under More for today as completed.
3. Exclude an incomplete Mind quest from the next-step slot. Today's verified
   sleep was decided before waking and cannot be repaired during the day. The
   quest remains a neutral observation under More for today and can still clear
   if delayed verified data arrives.
4. Prefer a Body quest when it is one of today's three, is incomplete, and the
   account has opted into a Strength Challenge (`profiles.trains_strength`).
   This override **wins outright** — it is the one case where the selector
   deliberately passes over a nearer step, because opting in is an explicit
   statement about what the player is training. The selector never synthesizes
   a Challenge-specific quest.
5. Otherwise select the **incomplete quest nearest completion across Motion and
   Body together**, by its existing raw-unit progress fraction, breaking ties by
   the stable daily quest order.
6. If all actionable quests are complete—or the only incomplete quest is a Mind
   observation the player cannot change—replace the prompt with permission to
   stop and no new task.

**"Attainable" means `!met` and nothing more.** Every incomplete quest is
arithmetically reachable until midnight, and a time-of-day or pace heuristic
would be exactly the fabricated time estimate §5.1 forbids.

**One nearest rule, not a Motion rule and then a fallback.** An earlier draft
preferred the nearest incomplete *Motion* quest before considering anything
else, which meant a Body quest at 95% lost to a Motion quest at 80% — the
selector routinely passing over the step the player was closest to clearing.
"One gentle next step" is only honest if it is the nearest one.

Quest metrics map to two categories: `steps`, `distance_m` and `active_hours`
are **Motion**; `active_kcal` is **Body**; `sleep_minutes` is Mind and is
excluded by rule 3. `active_hours` sits with Motion because in the engine it is
an AGI threshold shift, not a stat of its own.

The selector never invents a fourth quest, changes a target or pays separate XP.
It does not convert steps to minutes without measured personal pace.

Reaching the Daily Walk finish *is* reaching the Ridge — one threshold, one
arrival, and §8 gives it one reaction. The stronger sentence "KAIRO has
everything today can give it" remains reserved for the existing whole-day
scoring ceiling; those two conditions are not aliases, and a day can reach the
ceiling with a quest still open.

## 7. Optional details bottom sheet

**See today's details** opens the approved bottom sheet over Today. It contains:

- **Motion:** steps, distance and the distinct Daily Walk run;
- **Body:** active energy and verified strength-session minutes when present;
- **Mind:** verified sleep duration, only when capability and a reading exist;
- **More for today:** the other two daily quests and the selected quest's state;
- a link to active Challenges; and
- sync status or explanatory copy only when relevant.

Rows use player words from `STAT_NAMES` and raw units. They do not show score
totals, internal tiers, engine keys or a duplicated Mastery rail. Missing Mind
removes the row and closes the space. A pending query retains the last confirmed
reading rather than flashing zero.

The compact header keeps the existing personal Streak. The Daily Walk run is a
different value and is named **Daily Walk run** inside Motion's details; the two
must never share one label or figure.

**Motion's details keep one sentence explaining what the Daily Walk is**, reusing
`daily-walk.ts`'s existing sentence rather than writing new copy. Deleting `DailyWalkCard`
otherwise removes the only place in the running app that says the baseline is
fixed and does not grow with the player — after which the number appears
nowhere but a trivia card seen once during onboarding. The surviving sentence
must read the baseline from `DAILY_STEP_BASELINE`; the two `'10,000 steps'`
literals in that function are replaced in the same commit, its cold-start
"start a streak" becomes "start a run" — the personal Streak and the Daily Walk
run must never share a word, and this sentence now sits below a header showing
the Streak — and the now-unused headline half is deleted with the card.

The Challenges link follows the existing disclosure gate and appears only at the
`full` stage. That link is the **only** surface the gate still hides on Today:
`StatRail` has moved to You and the Strain, Sleep and Challenge-entry cards are
deleted, so `core` and `full` accounts otherwise see an identical screen and
`/train`'s own redirect is the real door. `useDisclosure`'s doc comment is the
written-down list of gated surfaces and is rewritten to say exactly that.

**The details trigger is hidden, not disabled, until confirmed or cached totals
exist.** A dead control with nothing explaining it is the same false accusation
`QUIET_GRACE_MS` exists to prevent; a control that is not there yet reads as
"not yet". Everything above it renders from cached or neutral state, so nothing
is left behind.

The sheet is one accessible modal surface. It must respect the project's
single-modal convention and cannot be presented while a permission ask owns the
modal host.

## 8. Emotional behavior

KAIRO's reactions recognize changes rather than demand care.

| Trigger | Beta presentation | Animation id | Stable occurrence |
|---|---|---|---|
| New Motion location (Treeline, Valley, Climb) | Brief happy response | `happy` | local date + location |
| Verified strength session | Workout/proud pose | `excited` | workout identity |
| Reaching the Ridge — the Daily Walk cleared | Victory pose, "cleared the ridge" | `victory` | local date |
| Personal record | Victory pose and specific sentence | `victory` | date + achievement |
| Level increase | Level-up sentence with victory fallback pose | `level_up` | previous level → current level |

**The Ridge belongs to the Daily Walk, not to the location ladder.** `dailyWalkMet`
and `location === 'ridge'` are the same comparison against the same constant, so
a location candidate at the top band would be a second reaction for one arrival —
firing minutes later, after the walk had already been celebrated. The location
trigger therefore covers Treeline, Valley and Climb only, and the Ridge arrival
is spoken with the sentence the app already had: *"cleared the ridge. The Daily
Walk is done."*

**Two vocabularies, deliberately.** The trigger names above are what the model
decides; `KairoReactionId` in `character-contract.ts` is what the renderer
plays, and the table maps one to the other. Keeping them separate is what lets
Rive take over the right-hand column unchanged (§4.4). `reactionForLevelChange()`
in `character-resolver.ts` is deleted rather than kept alongside — it produces
the identical `level:a->b` occurrence string, and two producers of one id is how
they drift. `tired` stays in `KAIRO_REACTIONS` with no producer and a comment
saying why: sleepiness is a daily Mind state rather than an event, and the value
is part of the manifest contract Rive binds to.

Priority is Level increase → personal record → Daily Walk → verified workout →
Motion location. Only the highest unseen occurrence is presented per opening.

**Only the presented occurrence is marked seen.** Lower-priority unseen changes
survive and can present on a later opening the same day; they are not discarded.
Consuming them all would mean a level-up permanently swallowed the Daily Walk
clear and a personal best on the same afternoon — one reaction per opening is
the rule, and silently destroying the others is a different rule that was never
argued for. Occurrence ids are date-keyed, so yesterday's unshown occurrence
simply fails to match today's candidate and no pruning is needed.

**An opening is a screen focus or an app foreground, not a mount.** Today is a
tab screen in a persistent navigator, so a mount-scoped guard means one
evaluation per app launch: walking four thousand steps and returning from the
Sky tab would show nothing, while cold-launching twice in a minute would fire
twice. Focus plus `AppState` `active` is what "opening Today" means to a person.

**A reaction fires only if the previous one ended at least 30 seconds ago.**
Focus-driven openings plus surviving occurrences would otherwise drip four
celebrations through ninety seconds of tab-flicking. The floor preserves the
drip across a real day and kills it inside one session; it is one constant, and
the week-one interviews are what should move it.

After the bounded response, KAIRO returns to the current valid static selection
with the latest inputs reapplied. The bound is a fixed timer **only because the
art is static** — see §4.4; Rive signals its own completion and the asset spec
forbids a timeout that guesses at it.

The existing `tired` reaction is not triggered in the beta. Sleepy remains a
daily Mind state; inactivity uses calm idle. Reduced-motion mode skips the
transition and shows the final pose plus sentence.

KAIRO's voice follows four rules:

- use the character's given name;
- state the observation before the consequence or suggestion;
- celebrate effort and records, never body shape; and
- never use guilt, countdown pressure or “KAIRO needs you” language.

The existing single morning digest remains the only scheduled engagement push.
This design adds no notifications.

## 9. Loading, failure and boundary states

- **Syncing:** retain the last confirmed scene and values. A subtle status can
  appear inside details.
- **Sync failure:** show a recoverable status in details. KAIRO's emotion does
  not mirror infrastructure failure.
- **No activity:** show the Branch scene and a peaceful idle. Do not describe
  the player as failing.
- **Unknown sleep:** neutral image and no Mind figure; never `0h`.
- **No sleep capability:** omit Mind entirely from the sheet and quest set.
- **Midnight:** reset Motion location using the new local day, preserve lifetime
  Body treatment, and apply the latest attributable verified sleep.
- **Backfill:** update the projection but do not replay every historical
  reaction. Same-day unseen occurrences may present once; older ones do not.
- **Several changes at once:** apply the priority in §8.
- **Invalid input:** use neutral fallbacks and development diagnostics. Do not
  let non-finite or rejected values drive the scene.
- **Offline:** render cached confirmed state. The next-step sentence must match
  the cached quest set rather than a partially refreshed mixture.

## 10. Module boundaries

The implementation plan should preserve these seams:

- a pure **living-mirror resolver** owns the five outputs in §4;
- a pure **next-step selector** ranks the existing three quest states;
- a pure **reaction selector** owns priority and stable occurrence ids;
- the Today route gathers query inputs and renders the resolved model;
- the character renderer performs a supplied static selection and owns no
  health interpretation;
- the details sheet renders supplied rows and owns no scoring or capability
  rules; and
- local occurrence storage remembers seen reactions without becoming a second
  progression ledger.

No module may duplicate scoring thresholds, quest targets, stat names or the
Daily Walk literal. Those remain imported from their current authorities.

## 11. Accessibility and responsive behavior

- The character image has one composed label describing KAIRO's current
  presentation; decorative scene layers stay hidden.
- Level, Streak, steps and the next step remain separate, ordered reading stops.
- Each details row is one accessible element combining its label and value.
- The sheet has a named heading, predictable dismissal and restored focus.
- Large text must not overlay the character. HUD groups stay in flow and the
  sentence can grow below the scene.
- At the smallest supported phone, KAIRO, the step figure and the complete next
  step remain visible without horizontal scrolling.
- Reduced-motion mode uses state swaps without float, crossfade or celebratory
  movement.
- Color never carries Motion location, completion or capability alone.

## 12. Verification and beta learning

### 12.1 Automated verification

Tests should pin:

- all five Motion location boundaries and the derived Daily Walk constant, plus
  the assertion that the top band is reached at exactly `DAILY_STEP_BASELINE`
  and that no Living Mirror module contains a literal `10000`;
- next-step capability filtering, completion filtering, immutable Mind exclusion,
  the Strength Challenge override winning outright over a nearer quest, nearest
  selection across Motion and Body together, and deterministic tie-breaking;
- the metric-to-category map, including `active_hours` as Motion;
- all-complete behavior;
- missing/unknown Mind behavior;
- static-selection priority across reaction, Mind and Motion;
- reaction priority, stable occurrence ids, no replay, and that a location
  candidate is never built for the Ridge;
- that only the presented occurrence is consumed and the rest survive;
- midnight and backfill policy;
- no score total, tier name or engine key in player copy — guarded
  **case-sensitively and word-bounded** (`/\b(AGI|STR|MND)\b/`), because a loose
  `/str/i` matches "strength session" and a loose `/agi/i` matches "Dagit"; and
- accessibility labels for Today and every details row.

Representative integration combinations include neutral and extreme Body
progress, every Mind state, every Motion location, missing cached data, a sync
error, reduced motion and large text.

### 12.2 Product measurement

The beta asks whether the living mirror supports healthy behavior through week
three, not whether it maximizes launch count. Measure D21 alongside:

- a daily Today-open marker;
- details-sheet opens;
- which quest category was selected as the next step;
- meaningful reaction impressions; and
- subsequent same-day health progress, reported as association rather than
  causation.

Telemetry payloads contain categories and occurrence kinds, not raw health
figures. **A reaction impression carries its kind and never its location**: a
Motion band is a five-bucket step count, and shipping it would be a raw health
figure in a coarser dress. `quest_cleared` already sets the precedent by
carrying `{ tier }` and never a quest id. If band-level breakdown turns out to
matter after the week-one interviews, that is a deliberate decision with a
privacy review attached, not something added quietly. Existing `race_seen`,
`quest_cleared` and first-score milestones retain their historical meanings.

Interview beta users at weeks one and three about:

- whether they understood what changed KAIRO;
- whether the character felt encouraging, neutral or pressuring;
- whether they voluntarily reopened after activity;
- whether the next step influenced movement, training or rest; and
- how they felt on a quiet day.

No universal numeric retention threshold is declared in this design because no
living-mirror cohort exists yet. The first cohort establishes the baseline; the
qualitative failure condition is immediate: confusion about what changes KAIRO,
or guilt caused by inactivity, fails the design even if opens rise.

## 13. Explicitly out of scope

- scoring, threshold, normalization, Mastery or record changes;
- database migrations or Edge Function changes;
- a new currency, shop, cosmetic inventory or monetization;
- care meters, hunger, illness, character damage or app-open rewards;
- AI-generated coaching, personality or weekly recap;
- separate Body, Motion or Mind mini-games;
- a new leaderboard or race mechanic;
- new scheduled notifications;
- commissioned composable Body art or flattened state combinations; and
- Rive integration or a new native dependency.

The V1 upgrade path is deliberate: replace the beta's static-selection priority
with the embedded `kairo_v1.riv` and its composable layered art, while keeping
the living-mirror resolver, its five semantic outputs and the trigger vocabulary
in §8 unchanged. The fixed reaction timer goes at the same time. Rive is out of
scope for the beta because the file is still being authored, not because the
static boundary is the destination.

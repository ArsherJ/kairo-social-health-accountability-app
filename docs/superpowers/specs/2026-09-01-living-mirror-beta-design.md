# Living Mirror — beta design

**Date:** 2026-09-01

**Status:** Design approved; awaiting written-spec review

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

It does **not** supersede the quest engine, quest XP, Daily Walk rules, race,
scoring, Mastery, disclosure capability, health ingestion or character identity.
Those existing decisions remain authoritative.

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
| 75–99% | Ridge |
| 100%+ | Cleared |

The scene caps at Cleared just as the race caps at its finish. Running can
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
4. Prefer a Body quest when it is one of today's three, aligns with an opted-in
   Strength Challenge and remains attainable. The selector never synthesizes a
   Challenge-specific quest.
5. Otherwise prefer the incomplete Motion quest nearest completion by its
   existing raw-unit progress fraction.
6. If none of those rules chooses one, select the nearest incomplete attainable
   quest across the remaining stats, breaking ties by the stable daily quest
   order.
7. If all actionable quests are complete—or the only incomplete quest is a Mind
   observation the player cannot change—replace the prompt with permission to
   stop and no new task.

The selector never invents a fourth quest, changes a target or pays separate XP.
It does not convert steps to minutes without measured personal pace.

Reaching the Daily Walk finish clears the Motion scene. The stronger sentence
"KAIRO has everything today can give it" remains reserved for the existing
whole-day scoring ceiling; the two conditions are not aliases.

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
must never share one label or figure. The Challenges link follows the existing
disclosure gate and appears only at the `full` stage.

The sheet is one accessible modal surface. It must respect the project's
single-modal convention and cannot be presented while a permission ask owns the
modal host.

## 8. Emotional behavior

KAIRO's reactions recognize changes rather than demand care.

| Trigger | Beta presentation | Stable occurrence |
|---|---|---|
| New Motion location | Brief happy/energetic response | local date + location |
| Verified strength session | Workout/proud pose | workout identity |
| Daily Walk or personal record | Victory pose and specific sentence | date + achievement |
| Level increase | Level-up sentence with victory fallback pose | previous level → current level |

Priority is Level increase → personal record/Daily Walk → verified workout →
Motion location. Only the highest unseen occurrence is presented per opening;
lower-priority changes are acknowledged by the resulting scene rather than
queued into a celebration reel.

An occurrence is marked seen when its presentation starts. Reopening does not
replay it. After the bounded response, KAIRO returns to the current valid static
selection with the latest inputs reapplied.

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

- all five Motion location boundaries and the derived Daily Walk constant;
- next-step capability filtering, completion filtering, immutable Mind exclusion,
  active Strength Challenge precedence and deterministic tie-breaking;
- all-complete behavior;
- missing/unknown Mind behavior;
- static-selection priority across reaction, Mind and Motion;
- reaction priority, stable occurrence ids and no replay;
- midnight and backfill policy;
- no score total, tier name or engine key in player copy; and
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
figures. Existing `race_seen`, `quest_cleared` and first-score milestones retain
their historical meanings.

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
with composable layered art while keeping the living-mirror resolver and its
semantic outputs unchanged.

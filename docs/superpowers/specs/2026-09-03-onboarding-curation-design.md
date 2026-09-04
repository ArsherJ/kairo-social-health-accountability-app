# Onboarding curation — design

**Date:** 2026-09-03
**Status:** Proposed. Nothing here is built.
**Supersedes:** nothing. Extends the six-beat run introduced with deviation #58.
**Reference material:** five screenshots of *Brainrot*'s onboarding, supplied as
inspiration. They are cited as **B1–B5** below.

---

## 0. The question, answered first

> *Do I need personalization like asking the user's age, height, and weight to
> have a personalized quest?*

**No. Asking for them would make the flow longer and the quests no better.**

Kairo already stores all three. They are inert:

| Column | Every consumer in the repo | Reaches scoring? |
|---|---|---|
| `height_cm` | `body-metrics.ts` (limits), `BodyMetricsCard.tsx` (edits it), `update-profile.ts` (write type), `queries.ts` (read type) | **No** |
| `weight_kg` | the same four | **No** |
| `birth_year` | the same four, plus `maxHeartRateForAge()` in `strain.ts` | **No** — Strain is display-only and never touches `daily_scores` |

No path in `packages/kairo-core` reads any of them. A question whose answer
changes nothing is the most expensive question in a funnel: it costs a screen,
it costs trust when the user later notices nothing changed, and it invites the
reader to assume the app is measuring them when it is not.

### The claim in the code is wrong and should be corrected

`src/features/profile/BodyMetricsCard.tsx` says:

> *Height and weight sharpen STR — active calories depend on body mass.*

They do not sharpen STR **in Kairo**. Body reads `active_kcal`, which arrives
from HealthKit already computed by Apple against the body profile in the *Health
app*. Kairo's `height_cm` / `weight_kg` are a second, disconnected copy that
Apple never sees and the engine never reads. Editing them changes no score.

This is a stale doc comment of exactly the kind CLAUDE.md says to fix in place,
not a reason to build a form. **Recommendation: correct the comment, keep the
fields in Settings, and never ask for them during onboarding.**

### What "personalized quest" actually means here

A quest is personal when its *size* fits the person. Size is decided by
`questTier()`, which keys off `trailingScoredDays` — **how long you have been
using Kairo**. The code already admits this is the wrong axis:

> *`questTier()` keys off how many days have scored, which measures engagement
> rather than fitness, so it is wrong by construction for a long-standing gentle
> user and a brand-new athlete alike.* — `app/(onboard)/difficulty.tsx`

That is the real personalization gap, and body metrics do not close it. **A
measurement of the user's actual walking does.** Kairo can take one, locally, on
the screen it already owns — see §3.

---

## 1. What Brainrot is doing, beat by beat

| | Beat | The move |
|---|---|---|
| **B1** | Paged carousel in a phone mockup, "Get started", ToS/Privacy beneath | Sells the product *before* the funnel. Terms are placed where consent is actually given. |
| **B2** | "Welcome to Brainrot!" — mascot, thin progress rail, back arrow | Names the destination. Rail says "this is finite". |
| **B3** | "Meet your brain / **He's doing OK.**" | Introduces the mascot **with a state**. The state is the product's whole readout, seeded before anything is measured. |
| **B4** | "The more you brainrot, the more your brain rots." Mascot slumped, holding a phone | Cause and effect, stated once, shown not argued. |
| **B5** | "**You're not addicted. Your brain is being exploited.**" Mascot melting under notification chips. CTA: "Good to know" | **Absolution.** Moves blame off the user and onto the environment, immediately before asking for something. |

### The five patterns worth stealing

1. **The mascot is the progress bar.** One character across every beat, its state
   carrying the argument. Kairo has a stronger version of this asset already —
   `KairoThumbnail` poses and `KAIRO_REACTIONS`.
2. **Absolution before the ask (B5).** The single highest-leverage screen in that
   flow. It converts a request for private data from *"prove yourself to us"*
   into *"let something finally notice."*
3. **CTA copy carries the beat.** "Let's go!", "Continue", "Good to know" —
   never three identical buttons. Kairo currently says **"Next" three times in a
   row.**
4. **One progress system.** Brainrot uses a rail and nothing else. Kairo renders
   `OnboardingRail` *and* `OnboardingDots` on beats 1–2, then the rail alone
   afterwards — two answers to "how far in am I?" on the same screen.
5. **Terms under the first CTA (B1).** `/welcome` has none today.

### What to explicitly *not* steal

- **The self-report quiz.** Brainrot asks because it *cannot measure* screen time
  until Screen Time is granted. Kairo measures on beat 4. A self-report is a
  substitute for a measurement, and Kairo does not need the substitute.
- **A fabricated score** ("your brain age is 43"). The codebase already bans this
  class of number in three places — `trivia.ts` forbids a bare `%`,
  `living-mirror.ts` forbids a fabricated time estimate, and `kairo-voice.ts`
  yields a *shorter* sentence rather than an invented figure. The funnel inherits
  that rule.
- **A paywall.** `docs/mvp-scope.md`: *"This beta is explicitly non-monetized."*
- **Loss-aversion pressure** ("don't lose your streak") before a streak exists.

---

## 2. Recommended flow — ten beats

Current: `/welcome` → `/one-sky` → `/connect` → `/difficulty` → `/privacy` → `/name`

Proposed:

| # | Route | Beat | Status |
|---|---|---|---|
| 1 | `/welcome` | What this is | keep; retune CTA, add terms |
| 2 | `/one-sky` | What the game is | keep |
| 3 | **`/mirror`** | **Absolution — B5's move** | **new** |
| 4 | `/connect` | Health grant → "Did you know?" → step reveal | keep; **widen the read** |
| 5 | **`/calibrate`** | "Your last 14 days" → a proposed size | **new** |
| 6 | `/difficulty` | Confirm or override the proposal | keep; now pre-selected |
| 7 | **`/first-day`** | "Here is a day at this size" — real quests | **new** |
| 8 | `/privacy` | What leaves the phone | keep |
| 9 | **`/notify`** | Primed push ask | **new** |
| 10 | `/name` | Meet your Kairo — **profile row INSERTs here** | keep |

Then, **outside `(onboard)`**: a first-run flock sheet on Today. See §5.

### Why the order is what it is

- **`/mirror` sits immediately before `/connect`** for the same reason B5 sits
  before Brainrot's ask. The Health grant is the one dialog whose refusal cannot
  be undone from inside the app; it deserves the flow's best framing directly
  above it.
- **`/calibrate` sits immediately after `/connect`** because that is the frame in
  which the app has just read real data and has something true to say. It is the
  payoff for the grant, delivered within one screen of it.
- **`/first-day` sits after `/difficulty`** so the abstract choice ("Steady")
  becomes a concrete object the user accepts. Commitment to a specific thing
  beats commitment to an adjective.
- **`/name` is still last, and everything is still asked before it.** Deviation
  #22 is untouched: the profile row commits exactly once, on the name screen, and
  nothing is asked after the INSERT. Every new beat above respects that.

### Copy direction for the new beats

**`/mirror`** — Kairo slumped, ground shadow heavy.

> **You're not lazy.**
> You're just not being counted.
>
> Most days disappear the moment they end. Nothing saw the walk to the jeepney
> stop, the stairs, the long way home.
>
> Kairo counts them. That's all it does — and that turns out to be enough.
>
> CTA: **Show me**

This is B5's structure exactly: *negate the shameful self-diagnosis → name the
real cause → position the product as the fix → soft CTA.* It also gives
`ReactionKind`'s `tired` its first producer, which is currently declared with
none.

**CTA rewrite across the run** — one "Next" becomes six distinct beats:

| Beat | Today | Proposed |
|---|---|---|
| `/welcome` | Next | **Let's fly** |
| `/one-sky` | Next | **I'm in** |
| `/mirror` | — | **Show me** |
| `/connect` | (existing) | keep |
| `/calibrate` | — | **Sounds right** |
| `/difficulty` | Next | **Lock it in** |
| `/first-day` | — | **Deal me in** |
| `/privacy` | (existing) | **Good to know** |
| `/notify` | — | **Wake me at 8** |
| `/name` | (existing) | keep |

---

## 3. The calibration beat — the core proposal

This is the piece that replaces "ask age, height, weight". It is the only new
*mechanic*; everything else in §2 is copy and sequencing.

### What it does

1. On `/connect`, after the grant, widen the existing local read. `readStepsToday`
   becomes a **14-day trailing window** through `readHealthWindow`, which already
   exists and is already date-predicated for exactly this reason.
2. Take the **median** of daily step totals over days that have any data.
3. `/calibrate` shows that figure and proposes a starting size.

> Your last two weeks
> **6,240 steps** on a typical day
>
> We'll start you on **Steady** — three quests a day, sized to that.
> You can change it now, or any time in Settings.

### Why median, not mean

One 25,000-step hike must not promote somebody to Strong for a fortnight.
`resolveChallenge()` already uses a trailing median for the identical reason;
this reuses the established judgment rather than inventing a second one.

### Why this is safe against the traps CLAUDE.md names

- **It never reads a tier.** It takes raw steps from a local HealthKit read, so
  it cannot fall into the `AGI` / `AGI_base` trap. It is the same posture the
  race already takes and for the same stated reason.
- **It writes nothing new.** The output is `quest_tier_override` — a column that
  *already* exists, is already in `profiles`' column-level UPDATE grant, and is
  already the one value both the client's `pickQuests` and `finalize-days`'
  grader read. No fourth tier, no parallel rule, no new client/grader contract.
- **It reuses the existing store.** `useOnboardingAnswers.questTier` already
  carries a tier from `/difficulty` to `/name`. Calibration sets its initial
  value; the write path is unchanged.
- **The proposal is a default, not a verdict.** `/difficulty` still renders, still
  offers Automatic and all three tiers, and the user's choice still **wins
  outright** — the precedence inside `questTier()` is untouched.
- **Thresholds derive from `QUEST_CATALOGUE`, never literals.** The same rule
  `DAILY_STEP_BASELINE` follows. A tier whose step targets move must move its own
  calibration band with it, or the screen starts proposing a size the catalogue
  no longer deals.

### The honest edge cases

| Situation | What the screen says |
|---|---|
| Fewer than ~4 days of history | *"Not much history yet — we'll start you gentle and grow with you."* Falls back to **Automatic**. Never invents a median. |
| Zero data returned | The same language `syncStatus` uses. **HealthKit does not report read-permission denial**, so the app can only ever say nothing has arrived — never that the user declined. |
| Watch user, years of history | Proposes Strong. Working as intended. |

### The privacy story, which should be on the screen

The 14-day read happens **on the phone, before a profile row exists**, exactly as
`/connect`'s `readStepsToday` already does against the device zone. Nothing about
those fourteen days is uploaded. What gets written is a three-value enum. That is
a genuinely strong claim and it is worth one line of screen real estate:

> We read this on your phone. Only the size setting is saved.

Per the standing rule: this claim must stay exactly true. If calibration ever
starts uploading the window, this line changes in the same commit.

---

## 4. `/first-day` — the commitment beat without a new column

Brainrot's funnel builds commitment through effort (a long quiz). Kairo can build
it through **specificity**, at zero cost, because `pickQuests` is a pure function.

The screen shows three real quests drawn from `QUEST_CATALOGUE` at the chosen
tier — the same table the engine deals from — under a header like *"A day at this
size"*, with the CTA **"Deal me in"**. The user accepts a concrete object rather
than an adjective. Nothing is stored; the commitment is psychological and the
content is true.

**One trap to name before anyone implements this.** It is tempting to promise
*tomorrow's exact three* by calling `pickQuests` with tomorrow's local date — the
function is pure and the user id exists before the profile row does. Resist it
unless `hasSleep` can be resolved *identically to the server's*. `pickQuests`
filters on `hasSleep`, which both sides read from `profiles.has_sleep_source` —
a column `sync-health` writes and which **does not exist yet during onboarding**.
Guess it wrong and the pool size changes, the rotation changes, and the three
quests promised on this screen are not the three that appear. That is precisely
the client/grader disagreement the shared-column design exists to prevent.

**Recommendation: frame it as "a day at this size", not as tomorrow's draw.** The
motivational value is nearly identical and no contract is created.

---

## 5. The flock ask, and why it cannot be an onboarding route

Kairo is a race, and a new account currently lands on Today with an empty sky and
no prompt to fill it. Adding a skippable flock beat is right. **It cannot go
inside `(onboard)` after `/name`.**

Joining or creating a squad requires the profile row, so the ask must come after
the INSERT. But `redirectTarget` bounces a `ready` user out of `(onboard)` to `/`
— which is deviation #22's trap exactly, and closing it means reviving the
deleted `finishingOnboarding` flag.

**Recommendation: a first-run sheet on Today, not a route.** It is presented on
first focus after onboarding, leased through `src/ui/modal-owner.ts` so it can
never be on screen in the same frame as the permission ask or the details sheet,
and dismissed permanently through the once-ever marker store in
`milestone-store.ts` (**not** the per-session marker, which fires every relaunch).

Content: *"Flying alone is fine. It's better with a flock."* → **Paste an invite
code** / **Invite a friend** / **Not now**. Three options, all real, none dark.

---

## 6. The notification beat

The 08:00 `daily_digest` is the app's principal re-engagement loop and nothing in
onboarding asks for it. Add `/notify` as beat 9 — **before** `/name`, which is
safe because a system permission needs no profile row.

Kairo's cap is unusually honest and saying it out loud is the strongest possible
prime:

> **One message a day. That's the cap.**
> At 8am we tell you how yesterday went and what today needs. That's it —
> no streaks nagging you, no "someone passed you" at 11pm.
>
> CTA: **Wake me at 8** · secondary: **Not now**

The primer must precede iOS's dialog, and **"Not now" must not call
`requestNotificationPermission()`** — a declined system prompt is unrecoverable
in-app, and a user who taps "Not now" here can be asked again later.

---

## 7. Telemetry

The funnel vocabulary already exists (`squad_data_consent_granted`, `race_seen`,
`quest_cleared`, `event_created`). Four new beats are unmeasurable without
markers. Proposed, all **category-only**:

| Event | Lifetime | Payload |
|---|---|---|
| `onboard_beat_seen` | once per beat per account | `{ beat }` — the route name, nothing else |
| `calibration_resolved` | once ever | `{ outcome: 'proposed' \| 'no_history' }` |
| `notification_ask_answered` | once ever | `{ answer: 'granted' \| 'declined' \| 'deferred' }` |
| `flock_prompt_answered` | once ever | `{ answer: 'joined' \| 'invited' \| 'skipped' }` |

**No payload may carry the step median, the proposed tier's underlying figure, or
any health number.** A step median is a health figure; the ban that
`living-mirror-events.test.ts` enforces on Today applies here unchanged. Note
that `calibration_resolved` deliberately does not record *which* tier was
proposed — that would be a three-bucket step count.

`kairo_retention()` is unchanged. The definition of an active day does not move.

---

## 8. Risks and open questions

1. **`hasSleep` during onboarding** — §4. Resolved by not promising the exact
   draw. Revisit only if someone wants that promise.
2. **Calibration bands must derive from the catalogue**, not be typed in. A test
   should pin them the way `scoring.test.ts` pins `DAILY_STEP_BASELINE` at
   10,000 — deriving guards staleness, the literal guards over-obedience.
3. **Time-to-value gets longer.** Six beats become ten. `onboard_beat_seen` is
   what makes the trade measurable rather than assumed; if `/mirror` or
   `/first-day` shows drop-off, cut it.
4. **App Review 5.1.1** — the run still cannot proceed without Health, and
   `/welcome`'s Skip goes *to* `/connect` rather than past it. That is honest,
   but reviewers sometimes read a hard requirement as a refusal to function.
   Flagged, not resolved.
5. **The standing launch blocker is unchanged.** The privacy policy and the App
   Store privacy answers still do not reflect deviation #47's consent gate
   (guideline 5.1.3). Nothing here fixes that and nothing here should ship
   claiming it does.
6. **Accessibility.** Every new beat follows the 2026-08-14 rules — explicit
   grouping with both halves, flow-based layout with nothing pinned to a height
   nothing enforces, and text inside a `View` with a real point width. Verify at
   `accessibility-extra-extra-extra-large`, and **relaunch after changing content
   size** — RN caches text measurements.

---

## 9. Sequencing

Every phase is **OTA-shippable**. No new npm dependency, no native module, no
`package.json` edit — `readHealthWindow` and `expo-notifications` are both already
in the build. Confirm with `npm run eas:fingerprint` against the last build before
publishing, but nothing here is expected to move it.

| Phase | Work | Cost |
|---|---|---|
| **A** | Copy only: six CTA labels, drop `OnboardingDots` in favour of the rail alone, terms under `/welcome`'s CTA, **fix `BodyMetricsCard`'s stale STR claim** | hours |
| **B** | `/mirror` beat | half a day |
| **C** | **Calibration** — widen the `/connect` read, `/calibrate`, pre-select `/difficulty` | the real work |
| **D** | `/first-day` | half a day |
| **E** | `/notify` | half a day |
| **F** | Flock first-run sheet on Today | a day, mostly modal leasing |

Phase A is worth doing on its own even if nothing else lands.

---

## 10. Proposed roadmap deviations

To be added to `docs/roadmap.md`'s approved-deviations table if this is accepted.
Latest existing entry is #59.

| # | Spec says | We build | Why |
|---|---|---|---|
| 60 | §5 collects height, weight and birth year to sharpen scoring | **Never asked in onboarding; the fields stay in Settings and are documented as inert** | No path in `kairo-core` reads height or weight; Apple applies body mass before Kairo sees a calorie. `birth_year`'s only consumer is display-only Strain. A question that changes no score does not earn a screen. |
| 61 | Quest size follows `questTier()`'s trailing-scored-days rule | **A 14-day local HealthKit median proposes the starting tier** | The trailing-days rule measures engagement, not fitness — wrong by construction for a new athlete. Calibration sets `quest_tier_override`, the column both the client and the grader already read; the user's own choice still wins outright. |
| 62 | Onboarding ends at the name screen | **A flock prompt follows, as a first-run sheet on Today rather than a route** | Squad membership needs the profile row, and deviation #22 forbids asking anything after the INSERT. A leased sheet gets the social loop a first-day chance without reviving `finishingOnboarding`. |

---

## Appendix — where each Brainrot pattern lands

| Brainrot | Kairo | Phase |
|---|---|---|
| B1 — terms under the first CTA | `/welcome` gains them | A |
| B2 — thin rail, one progress system | `OnboardingRail` alone; dots retired | A |
| B3 — mascot introduced *with a state* | Already stronger via poses and `KAIRO_REACTIONS` | — |
| B4 — cause and effect, shown not argued | `/one-sky` already does this with the real corridor | — |
| B5 — **absolution before the ask** | **`/mirror`** | B |
| CTA copy carries the beat | Six relabelled buttons | A |
| Self-report quiz → a "score" | **Rejected.** Replaced by a real measurement | C |

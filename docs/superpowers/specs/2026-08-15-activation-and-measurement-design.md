# Activation and measurement — design

**Status:** approved 2026-08-15.

Third spec written on 2026-08-15, and the one that changes what a *new* user
meets. Its two siblings changed what the app computes and what it says about
what it computes:

- `2026-08-15-solo-mode-walk-strength-run-design.md` added the Daily Walk and
  Challenges.
- `2026-08-15-points-stop-being-spoken-design.md` stopped the daily total being
  rendered outside Goals.

This one changes **the order things are met in, and what is measured while they
are met**. It shares two touchpoints with the points spec, noted in §8.

**A note on `§`.** Numbered sections of *this document* are §1–§14. References to
the product spec are written in full — "spec §5", "`Kairo_Master_Summary.md` §15"
— because the codebase convention uses bare `§` for the Master Summary and both
appear below.

---

## The trigger

An outside review, taken in an investor frame, graded the beta *"product quality
4.5/10, visual execution 7/10 — a visually polished beta wrapped around an
unclear core loop"* and concluded: *"I would not fund growth yet; I would fund a
tightly measured retention experiment."*

Its findings were checked against the code before any of this was planned. That
check is recorded in §1 rather than summarised away, because three of its
findings do not survive contact with the codebase and one gap it never named is
the reason its own headline recommendation is currently impossible.

---

## 1. The review, checked

### 1.1 Findings that hold

| Finding | Evidence |
|---|---|
| The pre-auth pitch says nothing | `app/(auth)/sign-in.tsx:42` — brand plus *"Every day is a Kairo moment."*, then the Apple button. Nothing else. |
| Value is behind three commitments | `sign-in` → `(onboard)/character` → `(onboard)/name` → tabs. The Health ask fires from `PermissionAsks` in `app/(tabs)/_layout.tsx` — fourth. |
| Placeholders read as entered values | `name.tsx:81` `"Aeon"`, `CreateSquadForm.tsx:84` `"Barangay Runners"`, `JoinSquadForm.tsx:75` `"AB12CD"`. |
| Goals ask for a unit nothing else shows | `CreateGoalForm.tsx:250-257` — *"Points to reach"*, placeholders `60000` / `2500`. |
| The empty squad screen sells absence | `SoloBoard.tsx:96-98` hero *"1st / of 1"*, `:110-112` five `LockedSlot`s, `:114-123` the actions last. |
| Program is irreversible | `20260807100100_squads_program.sql` — no UPDATE grant. |

On the placeholders, one detail sharpens the finding: the **accessibility** half
of this bug was already found and commented on (`name.tsx:75`,
`JoinSquadForm.tsx:84` both note that a screen reader reads the placeholder as a
value). The visual half was never drawn from the same observation.

On the program, the irreversibility is deliberate and documented — a mid-beta
change would silently re-rank every day already on the board, and the form
already says *"It cannot be changed."* The defect is not that it is fixed. It is
that it is **chosen when the squad has one member**, which §7.4 records and
deliberately does not scope.

### 1.2 Findings that do not survive checking

**"Replace 'Couldn't reach Apple Health' with 'Apple Health isn't connected.'"**
This is a copy fix for something that is not a copy problem.
`HealthPermissionState` is `'unavailable' | 'should-ask' | 'asked'`
(`permission-state.ts:10`); there is no `'denied'`, because HealthKit
deliberately never reports read-permission denial. **The app cannot know the
user declined.** Further, `sync-status.ts:4-9` records that the failure message
exists *because* of the 9–11 August outage, where silence was the failure. A
copy swap would blind the case the module was built for. §8 adds a state instead.

**"Use universal invitation links instead of codes."** Sound, and not free of
consequence — see §11, which does adopt it. It was previously scoped out
(`mvp-scope.md`, Q8) on a cost assumption that research disproved.

**"The product barely communicates the barkada/OFW angle."** Correct as an
observation, but not because anyone forgot: *barkada* was retired as in-app
vocabulary on 2026-08-11 (deviation #26). The reviewer's point is about
positioning — pitch, tone, examples — which is a different axis from the noun on
the leaderboard. §6.1 separates them and acts on the first without touching the
second.

**"You have built too many retention systems."** Directionally right, and worth
noting the review graded a build that gained the Daily Walk and Challenges the
same day it was tested. `mvp-scope.md` already declines Routines for exactly this
reason. §5 acts on it.

### 1.3 The gap the review did not name

Its headline recommendation — *"run a six-week retention test, kill the loop if
under 25% remain engaged by day 21"* — **cannot be executed today.**

Four telemetry events exist in the entire app: `app_open`,
`health_permission_failed`, `squad_program_selected`, `timezone_sync_failed`.
Three are diagnostics. There is no activation funnel: no event for profile
created, health asked, first scored day, squad created or joined, or goal set.

Worse, `AppEventType` declares a fifth — **`first_sync_seen` — and nothing in the
codebase fires it.** The single most important activation event in the
vocabulary is dead code, in a file whose own header reads: *"This is the
behavioural dataset spec §15's four risk questions get answered from, and it is
impossible to backfill — a beta that ran without it is a beta whose questions
stay open."*

The partial reprieve: **activity retention needs no new events.** `daily_scores`
already carries a row per user per local date, so D1/D7/D21/D42, recovery after a
missed day, and squad survival are all SQL over tables that already exist.
Activation is the blind half.

---

## 2. Decisions recorded

| # | Question | Decision |
|---|---|---|
| D28 | Instrument first or fix first | **Both, before the cohort.** There are no users yet, so there is no baseline to protect and nothing to contaminate. |
| D29 | Cut the MVP to one loop | **Yes, by progressive disclosure.** Goals, Challenges and advanced stats are hidden until the user has data; nothing is deleted. |
| D30 | The disclosure threshold | **3 lifetime scored days**, as a named constant. |
| D31 | What the core loop is | Activity → visible character progress → squad gap, with the **Daily Walk as the one daily action**. |
| D32 | Goal targets | **Daily Walk units.** "Clear the Daily Walk 25 days out of 30." Points move behind an advanced disclosure. |
| D33 | How goals reach a non-points metric | The **stored tier**, not raw steps — `tiers->>'AGI' = 'gold'`, already projected to squadmates by `squad_leaderboard()`. |
| D34 | Health decline copy | **A new state, not new words.** `'no-data'` joins `'failed'`; `'failed'` is untouched. |
| D35 | Onboarding order | `/connect` → `/character` → `/name`. The profile row still commits exactly once, on the name screen. |
| D36 | Cultural positioning | **Pitch, copy and tone only.** No in-app noun changes; deviation #26 stands. |
| D37 | Universal invite links | **Adopted**, on free static hosting. Codes remain as the fallback. |
| D38 | Cumulative distance goals | **Designed here, built after the cohort.** See §12. |
| D39 | Pre-auth telemetry | **Buffered locally, flushed after sign-in** with the original timestamp in the payload. |

---

## 3. Shape and sequencing

One branch, `feat/activation-and-measurement`, off `main`. No cohort is recruited
until it ships.

The ordering rule: **instrumentation is the only workstream that cannot be
retrofitted**, so it goes first regardless of how visible the others are. Every
event missing from user #1's session is missing permanently.

1. Instrumentation (§4)
2. Progressive disclosure (§5)
3. Pre-auth pitch and positioning (§6)
4. Onboarding order (§7)
5. Health state honesty (§8)
6. Solo board and placeholders (§9)
7. Goals in Daily Walk units (§10)
8. Universal invite links (§11)

Two verification gates before recruitment: a TestFlight pass on real hardware,
and an Accessibility Inspector check on the simulator — the latter because §5 and
§9 both restructure element grouping, which is exactly what the 2026-08-14 pass
found the hard way.

---

## 4. Instrumentation

Three parts. Only the first is new code of any size.

### 4.1 Fire `first_sync_seen`

It is declared and never called. Wire it at the first sync that returns data for
a user with no prior successful sync. This is the activation moment the whole
funnel converges on.

### 4.2 Extend `AppEventType`

The minimum that answers the review's five metrics:

| Event | Fired when |
|---|---|
| `onboarding_started` | The connect screen is first shown. |
| `health_ask_completed` | The system sheet returns, with the resulting `HealthPermissionState` in the payload. |
| `profile_created` | The name screen's INSERT succeeds. |
| `first_score_seen` | The user first views a home screen with a non-zero day. |
| `squad_created` / `squad_joined` | The respective mutation succeeds. |
| `goal_created` | A goal is committed. |
| `disclosure_unlocked` | The §5 threshold is crossed. |

`health_ask_completed` deliberately does **not** carry granted/denied. Per §1.2
the app cannot know, and an event asserting otherwise is worse than no event —
it would be believed.

### 4.3 Retention is SQL, not events

D1/D7/D21/D42, recovery-after-miss, and squad survival all derive from
`daily_scores` and `squad_members`. One `security definer` reporting function,
exercised in the PGlite harness like every other SQL rule.

This is worth stating plainly because it is the cheap half: **the review's kill
signal is a query, not a feature.**

### 4.4 The pre-auth blind spot

`track()` returns `false` when `userId` is undefined. §6 adds a screen *before*
sign-in — so without a change here, **the one screen added to fix activation is
the one screen we cannot measure.**

A small local buffer holds pre-auth events and flushes them after sign-in, with
the original timestamp in the payload rather than the flush time. The buffer is
capped and dropped on failure; telemetry never blocks a user action, which is the
existing contract in `events.ts` and is not relaxed here.

---

## 5. Progressive disclosure

The spine of the release, and the answer to D29.

### 5.1 The rule

`disclosureStage(lifetimeScoredDays)` — pure, in `kairo-core`, tested in Node
like every other rule in that package.

- **Core stage** — the home hero in real units, the Daily Walk and its streak,
  the character figure and level, the squad tab and its gap.
- **Full stage** — everything else, at 3 lifetime scored days (D30).

Hidden in core: `/train` and Challenges, Goals in all three places (home card,
`SquadGoalPanel`, create), per-stat ability rating detail, strain.

### 5.2 Why hiding rather than deleting

Every hidden surface stays built, tested and reachable. The threshold is one
constant, so reversing this is a one-line change plus a test update — which is
the property that makes it safe to try on a cohort at all. Deleting Challenges a
day after shipping them would not be.

### 5.3 Lifetime, not recent

The gate reads **lifetime** scored days. A returning user with history must never
be shown the reduced UI; a gate on recent activity would demote someone coming
back from a quiet week, which is precisely the user the review's
"recovery after missed days" metric is about.

### 5.4 The unlock is an event

Crossing the threshold gets a reveal, not a silent appearance of new tabs.
`SlotUnlockReveal` is the existing precedent and the pattern to follow.

### 5.5 Interaction with §10

Deferring Goals until day 3 makes §10 land better rather than worse: by the time
a user meets the goal form, they have three days of Daily Walk history to set a
target against. The review's *"you ask users to set goals before establishing a
baseline"* is answered structurally here, not by copy.

---

## 6. Pre-auth pitch and positioning

Merged, because they are the same screen.

`sign-in.tsx` gains, above the button: the character figure from existing art,
three lines naming the loop — activity → character → squad gap — and the privacy
promise the review singled out as the app's strongest asset. *"Every day is a
Kairo moment."* goes.

**Apple's button is untouched.** Its chrome is required by their HIG and
recolouring it is a review rejection; that constraint is already recorded in
`sign-in.tsx`.

### 6.1 The cultural wedge, precisely scoped

Per D36 this is **positioning, not vocabulary**. The pitch names the actual use
case: a small group of people who already know each other, including family split
across countries. Tone, examples and notification copy carry it. Also touches
`invite-message.ts`.

What does **not** change: the in-app nouns. It remains "your character" and
"squad". Deviation #26 stands, and this spec is not a reversal of it.

---

## 7. Onboarding order

### 7.1 The new order

`/connect` → `/character` → `/name`. `redirectTarget`'s `needs-profile` case
changes from `/character` to `/connect`; `route.test.ts` covers the change.

### 7.2 Why the profile INSERT stays where it is

CLAUDE.md's rule is explicit: **add onboarding steps before the name, never
after.** The profile row committing on the name screen is what lets
`resolveRoute` treat row existence as a sufficient marker, which is why
deviation #22 could delete the `finishingOnboarding` flag. Asking anything after
the INSERT flips the route to `'ready'` under an unfinished screen and needs that
flag back.

`/connect` sits before `/character`, so nothing about that arrangement moves.

### 7.3 What `/connect` does

It requests HealthKit permission and then **reads HealthKit locally** to show
today's real step count immediately. That is the review's *"reveal imported
progress"* moment, and it works before a profile exists because it needs no
server round trip.

The first `sync-health` call still fires after the name screen, when there is a
profile row for buckets to hang from.

### 7.4 Squad program

Not moved in this release. The defect identified in §1.1 — that the program is
chosen when the squad has one member — is real, but every fix for it (defaulting
to `all_around` and prompting later, or a one-time change window) interacts with
the read-time weighting the migration deliberately froze. Recorded here so it is
not re-derived; not scoped.

---

## 8. Health state honesty

`syncStatus` gains a `'no-data'` kind: **asked, no error, and no data has ever
arrived.**

- `'failed'` is unchanged. It exists to catch the 9–11 August outage class, where
  buckets commit while scoring is down, and it must keep firing on a real error.
- `'no-data'` names the state and offers Settings rather than a retry, because
  there is nothing to retry.

The existing assertions in `sync-status.test.ts` must all still pass; this is an
addition to the state machine, not a rewrite of it.

**Touchpoint with the points spec:** the home hero already reads in real units
after `2026-08-15-points-stop-being-spoken-design.md`, so a `'no-data'` day shows
zero steps rather than a bare zero score. The two changes agree; neither needs
adjusting for the other.

---

## 9. Solo board and placeholders

### 9.1 Solo board

- The `"1st" / "of 1"` hero is removed. It is a fake victory at an audience of
  one.
- Create and Join move **above** the row.
- One illustrative `LockedSlot`, not five. Five empty seats is a picture of
  loneliness rendered five times.
- The self row and its real numbers stay. That part works, and it is the only
  place a solo user sees their day on this tab.

### 9.2 Placeholders

Instruction-shaped, not value-shaped:

| Field | Was | Becomes |
|---|---|---|
| Character name | `Aeon` | `Name your character` |
| Squad name | `Barangay Runners` | `Name your squad` |
| Invite code | `AB12CD` | `6-character code` |

This fixes the visual bug and the screen-reader bug already commented in those
files with one change, which is why they are one workstream.

---

## 10. Goals in Daily Walk units

The largest engine change in the release.

### 10.1 The four coordinated changes

1. **`kairo-core`** — `Goal` gains `metric: 'points' | 'daily_walk'`; `GoalDay`
   gains `walkCleared`. `evaluateGoal` tests the boolean instead of
   `total >= target` when the metric is `daily_walk`.
2. **Migration** — `goals.metric`, defaulting to `'points'` so existing rows are
   untouched; `goal_window_scores` returns `walk_cleared`, derived from the
   stored `tiers`.
3. **`CreateGoalForm`** — leads with *"Clear the Daily Walk N days out of M"*.
   Points move behind an advanced disclosure.
4. **`goal-copy.ts`** — speaks days.

### 10.2 Why this does not breach the privacy projection

`goal.ts`'s header states: *"there is deliberately no goal metric that would
reach raw steps."* That reason survives intact.

`walk_cleared` is derived from `daily_scores.tiers`, which `squad_leaderboard()`
**already** returns to squadmates. No raw step count crosses any boundary; a
boolean that was already visible on the leaderboard becomes visible on a goal.
The mechanism changes, the guarantee does not.

This distinction must be preserved by whoever implements it: reading
`health_buckets` here instead would breach spec §5 while producing an identical
screen.

### 10.3 A migration ships with its function redeploy

`goal_window_scores` is read by the client and by `finalize-days`. CLAUDE.md's
rule applies without exception: the migration and the redeploy ship together, and
`supabase/scripts/smoke-sync.mjs` runs after. The August 2026 two-day scoring
outage is what that rule is made of.

---

## 11. Universal invite links

### 11.1 Hosting — free, with one trap

A static site on a free tier (Vercel, Netlify or Cloudflare Pages) serving
`https://<project>.vercel.app/.well-known/apple-app-site-association`. A
`*.vercel.app` subdomain is a fully-qualified HTTPS domain, so **no domain
purchase is required**. `vercel.json` sets `content-type: application/json`
explicitly.

**GitHub Pages does not work for this.** It serves the file as
`application/octet-stream`, allows no custom MIME types or redirects, and a
project-path repo (`user.github.io/repo`) cannot satisfy Apple's domain-root
requirement.

### 11.2 The entitlement chain, and why it is a landmine here

Expo's documentation says to *"build with EAS Build, which ensures the
entitlement is registered with Apple automatically."* **Kairo does not use EAS.**
It builds on Xcode Cloud against a committed `ios/` (deviation #28). All four
steps are therefore manual, and omitting any one fails silently:

1. Associated Domains capability enabled on the App ID in the Apple Developer
   portal.
2. `com.apple.developer.associated-domains` in the committed
   `ios/Kairo/Kairo.entitlements`.
3. `ios.associatedDomains` in `app.config.ts` — **without** the `https://`
   prefix, which is the documented common mistake.
4. `npm run prebuild` and a **commit of the regenerated `ios/`**.

This is the same failure class as `aps-environment`, already recorded in
CLAUDE.md: a native config value that EAS would have owned, which Xcode Cloud
ships exactly as it finds it.

### 11.3 Scope

`/join/<code>` routes into `JoinSquadForm` with the code prefilled. **Code entry
stays.** The link is an accelerator, not a replacement — a user who receives a
code by text with no app installed still needs the manual path.

### 11.4 The cost that is not money

The invite link reads `kairo.vercel.app/join/AB12CD`. Moving to a real domain
later breaks every link already shared. Acceptable for a beta; it should be a
deliberate decision before any public launch, not a discovery.

---

## 12. Staged, not declined

**Cumulative distance goals** — *"walk 1,000 km by March"*.

Personal-only is genuinely feasible: a personal goal touches the user's own data,
so there is no squad projection and no privacy conflict. What it needs is a
second aggregation path off `health_buckets`, which goals do not have today.

It is staged after the cohort, for one reason: **this release deliberately hides
goals from new users until day 3.** Adding a second goal data path in the same
release, to a surface most of the cohort will not see for three days, spends
implementation risk where no learning comes back. Build it when the goal surface
is being looked at again.

Recorded so it is not re-filed as an oversight by the next review.

---

## 13. Testing

Per the house rule, the logic is tested and the UI is verified by hand.

| Area | How |
|---|---|
| `disclosureStage` | `kairo-core` unit tests: boundaries at 0, 2, 3, and a large lifetime count. |
| `evaluateGoal` with `daily_walk` | `kairo-core` unit tests alongside the existing points cases. |
| Onboarding order | `route.test.ts` — `needs-profile` now targets `/connect`. |
| `syncStatus` `'no-data'` | `sync-status.test.ts`, with every existing assertion still passing. |
| `goal_window_scores.walk_cleared` | PGlite schema suite. |
| Retention reporting function | PGlite schema suite. |
| Pre-auth telemetry buffer | Node unit test on the buffer, flush ordering and timestamp preservation. |
| Grouping and Dynamic Type | Accessibility Inspector on the simulator, plus `simctl` content-size capture. |
| Deployed artifact | `smoke-sync.mjs` after the §10 redeploy. |

---

## 14. What this release does not settle

Named so the next review does not file them as findings:

- **Whether the loop works.** That is what the cohort is for. This release makes
  the question answerable; it does not answer it.
- **The squad program timing** (§7.4).
- **Cumulative distance goals** (§12).
- **A real domain** (§11.4).
- **Whether 3 days is the right threshold** (D30). It is a constant, chosen to be
  cheap to move once there is data behind the choice.

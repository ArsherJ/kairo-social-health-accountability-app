# Product critique and MVP design plan

**Status: draft — not an approved-deviations entry.** Nothing here is decided;
it is a critique and a set of proposals for the founder to accept, cut, or
send to brainstorming. Nothing in this document should be treated as
authoritative the way `docs/roadmap.md`'s deviations table is.

Grounded in `docs/roadmap.md`, `docs/mvp-scope.md`, `docs/user-journey.md`,
and the current implementation (`src/features/permissions/ask-order.ts`,
`src/features/notifications/ask-policy.ts`) as of 2026-08-18.

---

## 1. Critical Analysis & Critique (The Roast)

**The engine is excellent. The game is missing.** The backend is genuinely
sophisticated — server-authoritative scoring, replay-safe XP, privacy as
projections — wrapped in an app where the user's only verb is *look*. Open
Kairo and there is nothing to **do**: no tap that claims anything, no
decision, no interaction with another human. Sabotage was the interaction
layer; removing it (rightly) never replaced the *verb*, only the *data*.

**"Challenge your friends" doesn't exist in the product.** Squads are a
leaderboard you spectate. There is no way to challenge a friend. Challenges
(`/train`) are solo by design — you vs. your own trailing median. Squad goals
are per-member N-of-M ("we all do the same solo thing near each other"). The
one head-to-head mechanic — direct, named, time-boxed competition between two
people — is absent. This is not a tuning problem; the feature is missing.

**There is a 3-day dead zone with no re-engagement channel — verified in
code.** `shouldAskForNotifications` requires `hasSquad || hasGoal`. Goals are
hidden until 3 scored days (`disclosureStage`). A solo user who doesn't join a
squad — the explicitly first-class user — can receive **zero pushes during
days 1–3**, the exact window where most churn happens. The Daily Walk streak
is a "why" that already exists in this window and isn't wired to the ask.

**Reward moments fire while everyone is asleep.** The day finalizes ~2 AM. XP,
level-ups, streak increments — the entire variable-reward payload — lands
silently into a database. The user wakes up to numbers that are just already
different. There's an 11 PM urgency push but no morning payoff push: tension
with no release.

**Levels buy nothing, and the character barely notices you.** One static
artwork per species; level changes a ground shadow, dominance changes a tint,
rating changes a ring. Elegant code-driven design, but from the couch it means
weeks of effort produce changes a user can barely perceive. Nothing in the app
is a *sink*: no unlocks, no cosmetics, no evolution moments, no milestones
rendered as events.

**The number system is philosophically clean and experientially confusing.**
Tiers hidden (#23), score hidden (#30) — each individually right — but the
leaderboard shows a gap in an undefined unit, and a consistency points goal
can't be self-checked mid-day (recorded and deliberately unfixed in deviation
#30). A user asking "am I on pace today?" has no answer.

**10,000 steps is a brutal day-1 floor for this market.** The Daily Walk is
the only streak surface a `core` user sees, and a sedentary new user fails it
day one, two, and three — the streak reads 0 throughout the exact window
everything else is stripped out.

---

## 2. UX & User Journey Overhaul

Onboarding is already strong (health-first reveal, single INSERT, 60-second
character). The broken stretch is days 1–7.

- **Notifications ask widens to include the Daily Walk as a "why."** Closes
  the 3-day dead zone without violating §5's "every ask has a visible why."
- **Morning payoff push.** *"Yesterday finalized: +540 XP · streak 4 · 2nd in
  your squad."* Reuses `finalize-days`, dispatch, quiet hours, deep-link
  routing — a new trigger, not new infrastructure.
- **Make the disclosure unlock a ceremony.** Crossing 3 scored days currently
  fires telemetry and quietly renders four more cards. Should be the biggest
  moment of week one: full-screen takeover, the animal reacts, *"Goals,
  Challenges and your full stats are open."*
- **Give the open a verb.** Present yesterday's finalized result as an
  unclaimed card the user taps to reveal (count-up, haptic, streak flame).
  Pure client theatre over already-final server data — nothing stored,
  nothing rescored.
- **Fix the mid-day pace answer.** On `app/goal/[id].tsx` (inside
  `src/features/goals/`, where points are allowed to speak per #30), show
  today's running total against a consistency target.
- **Ladder the walk for `core` users.** Keep 10,000 permanent and flat, but
  show progress *toward* it during `core` stage ("6,240 of 10,000") rather
  than a cleared/failed binary, so days 1–3 read as climbing, not failing.

---

## 3. UI & Visual Suggestions

The "clunky" feeling is stillness + card-stack monotony, not layout.

- **Motion is the missing design layer.** Idle breathing/blink loop on the
  species figure (Reanimated transforms on existing artwork, no new art);
  count-up on the hero number; spring physics on leaderboard rank changes;
  haptics on streak increment and goal ticks.
- **A daily-walk progress ring around the character figure.** Fuses the
  character and today surfaces into one focal composition instead of a stack
  of equal-weight cards — same code-driven-response philosophy as the
  presence ring. Highest-value single UI change.
- **Break the card grid.** Every panel has equal visual weight, which reads
  as template. One hero zone (figure + ring + real-units line), then a dense
  secondary shelf.
- **Lean into the species hue as the app's accent.** The registry already
  carries per-species hues — tint the rings and small accents by the user's
  animal.
- **Leaderboard rows need faces, not initials-with-rank.** Species art is
  already projected by `squad_leaderboard()`. A row of distinct animals reads
  as a party; a list of names reads as a spreadsheet.
- Route all of this through the `frontend-design` skill pass per the project
  convention.

---

## 4. The "Delight" Factor

1. **The animal lives your day** — 3–4 poses per species driven by current
   activity level (sleeping, ambling, running, triumphant).
2. **The Morning Chest** — finalized day as a tappable reveal; escalating
   theatrics at streak milestones (day 7 confetti, day 30 habitat change).
3. **The growing habitat** — streak/level milestones permanently add detail
   behind the figure. The XP sink the app currently lacks.
4. **Cheers & taunts** — one-tap animal-sticker reactions on leaderboard rows.
   Lightweight social verb to replace what sabotage's removal left behind.
5. **Duels** — "Challenge [name]: most active hours over 3 days." Cosmetic
   crown for the winner's row. The literal "challenge your friends" mechanic
   the product's premise promises and currently doesn't have.

---

## 5. MVP Design Plan

### A. Already on the roadmap, still open (not new scope — the ship checklist)

Not additions — the unticked boxes between here and external testers:

- APNs auth key uploaded via `eas credentials`
- Background delivery verified on a real device (Phase 3)
- `AppleExerciseTime` populated on a phone-only device
- Retention migration `20260816120000` applied + function redeploy
- Two-client check that one member's finalization updates the other's board
- Accessibility Inspector pass on the newest cards
- Privacy policy / ToS / nutrition labels finished
- Undeploy `seed-health` before external testers join
- `app_events` instrumentation completed

### B. New MVP additions

Each serves one of the beta's four risk questions (week-3 stamina, whether a
self-set target survives a bad week, stranger-squad validity, score fairness
perception), respects existing invariants (scoring untouched, projections
only, existing quiet-hours/budget machinery reused), and is small.

**B1 — Daily Walk unlocks the notification ask**
*Serves: week-3 stamina.* Widen `shouldAskForNotifications` with a third
condition — health connected and the walk shelf visible (effectively every
`core` user). Copy: *"Want a nudge when you clear your 10,000?"* Same
`PermissionAsks` host, same one-modal rule, same per-session dismissal.
~10 lines in a pure module + tests + one copy variant.

**B2 — Morning payoff push**
*Serves: week-3 stamina.* New trigger in `dispatch-notifications` —
*"Yesterday finalized: +540 XP · streak 4 · 2nd in your squad"* — sent after
7 AM local, counting against the daily budget, deep-linking to `/`. Solo copy
variant drops the rank clause.

**B3 — Disclosure-unlock ceremony**
*Serves: week-3 stamina / activation.* On `disclosure_unlocked` (already
fires exactly once via the MMKV marker), present a full-screen moment: the
species figure, *"Goals, Challenges and your full stats are open,"* one
button into `/goal/new`. A route push, not a modal — `PermissionAsks` owns
the app's single modal.

**B4 — Consistency-goal mid-day readback**
*Serves: self-set target surviving a bad week + fairness perception.*
Deviation #30's recorded, unfixed loss. On `app/goal/[id].tsx` only, show
today's running total against the daily bar: *"Today: 840 of 1,200."* Data
already exists client-side; this is a read, a UI line, and an updated
accessible label.

**B5 — Minimum juice pass (one tightly-scoped batch)**
*Serves: fairness perception, and the "feels clunky" complaint.* Exactly
three things, nothing more:
- Daily Walk progress ring around the character figure
- Count-up animation on the hero numerals
- Haptic on streak increment and goal-day tick

Defer idle animation, poses, and everything else to Future.

### C. Borderline — founder call, with costs

**Cheer/taunt reactions on leaderboard rows.** *For:* the only candidate that
serves **stranger-squad validity** — a spectate-only board gives stranger
squads nothing to bond over, and that's a beta question. *Against:* the only
item here with a server write path (new table, RLS, push trigger, UI —
~2–4 days vs. hours for B1–B4). Worth it only if stranger-squad validity must
be answered in *this* beta wave rather than a second one.

### D. Future builds (explicitly not MVP)

**Wave 1 — first post-beta sprint:**
- Morning Chest reveal ritual
- Duels (1v1 fixed-window challenge, projection-based like
  `goal_window_scores()`, cosmetic crown)
- Cheers/taunts (if cut from MVP)
- Species pose states (activity-driven)
- iOS widget + Live Activity ("2h left · 2nd place") — big retention lever,
  but needs a new native target under the committed-`ios/` regime (#28); wrong
  risk to take right before a beta

**Wave 2 — progression sinks & identity:**
- Habitat progression (the XP sink)
- Species evolution art at level bands (first real illustration spend, only
  after retention is proven)
- Monthly cosmetic leagues/seasons

**Wave 3 — scale:**
- AI weekly recap card (already spec'd V1+, Sunday 10 PM)
- Community events (endemic-species conservation tie-ins)
- Android, paid tier (multi-squad + cosmetics — the 6-member/1-squad cap is
  the natural paywall)

---

## Bottom line

MVP needs the existing checklist (§5.A) plus B1–B4 (~3–5 days of work, all
display-side or pure-module, none touching scoring), B5 as a one-day polish
batch, and the cheers question (§5.C) as the one real scope decision.
Everything else waits for beta data.

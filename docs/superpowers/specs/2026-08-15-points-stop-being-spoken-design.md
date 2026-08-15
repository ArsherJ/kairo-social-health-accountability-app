# Points stop being spoken — design

**Status:** approved 2026-08-15.

Sibling to `2026-08-15-solo-mode-walk-strength-run-design.md`, written the same
day and reviewable independently. That spec adds Walk, Strength and Run; this one
changes what the app says about the numbers it already has. They share one
touchpoint, noted in §7.

**The trigger**, in the founder's words: *"I think we should remove the scoring.
The first time I see it, I don't know what that is for."*

That reaction is correct, and it is aimed at the most emphasised element in the
app. `app/(tabs)/index.tsx` renders the day's `daily_scores.total` as a `hero`
`Numeral` — a four-digit integer, no unit, no label, no target. Its own source
comment calls it "the single most emphasised element on this screen." A new user
sees `3,200` before they see anything else and has no way to learn what it is.

This is the same complaint the 2026-08-14 assessment opens with — *"the app shows
numbers without saying what they're for"* — pointed at the number that offends
worst.

---

## 1. The decision

**Points are spoken only inside Goals.**

Everywhere else — the home hero, the guidance line, the leaderboard row, the
VoiceOver label — the raw point figure stops appearing. Inside a Goal it stays,
because there the user typed the target themselves, and a number you chose is
self-explaining in a way an ambient daily total never is.

### 1.1 The engine is not removed

`daily_scores.total` still exists, is still computed by `computeDailyScore`, and
still:

- ranks `squad_leaderboard()`,
- scores every Goal (deviation #18),
- feeds `xp_awarded`, `total_xp`, levels and ability ratings,
- carries `flagged`, which via the board is Kairo's **only** anti-cheat
  mechanism (§5, §20 #3).

Removing the engine would take all four with it. What changes is **what is
rendered**, not what is computed — the same distinction deviation #23 already
drew when Bronze/Silver/Gold became internal to scoring and stopped being
vocabulary. This is the next step along that exact line: tiers stopped being
spoken in August, and now the total does too.

### 1.2 Scope, as resolved

The founder's first answer was "the home hero number only." The leaderboard
answer that followed removed the absolute number from board rows as well. The
resolved scope is therefore wider than the first answer alone and is recorded
here explicitly so the two do not read as contradicting each other: **the hero
and the board lose the number; Goals keep it.**

---

## 2. Decisions recorded

| # | Question | Decision |
|---|---|---|
| D21 | How far removal goes | Points are spoken **only inside Goals**. |
| D22 | What replaces the home hero | **The day in real units** — steps, active hours, active minutes. |
| D23 | What a leaderboard row shows | **Rank and relative gap**, no absolute total. |
| D24 | Cumulative Goals | **Keep points.** A target the user set explains itself. |
| D25 | The guidance line's "+400" | **Name the milestone**, not the number. |
| D26 | Does the gap keep a number | **Yes.** A relative gap is legible where an absolute is not. |
| D27 | The program boost chip | **Repurposed** as program information on the board header. |

---

## 3. The home hero

`app/(tabs)/index.tsx`, the `Numeral` at the top of the Today shelf.

**Out:** `<Numeral value={today?.total} size="hero" />`.

**In:** the day in the units it was lived in (D22) — steps, active hours, active
minutes, each with its unit. This is assessment Part 1 §2's third move —
*"'3,200 pts' is a game number; 'you moved through 9 of your day's hours, and hit
Gold on steps' is a sentence about a day a person actually lived"* — **promoted
from a footnote to the headline**. It was specced as a fold-in to the existing
detail line; it becomes the hero treatment instead.

No new data. `useTodayBuckets` already supplies every figure, and
`resolveStatDetail` already reads them.

The `hero` size on `Numeral` is retained for whichever figure leads, so the shelf
keeps a focal point. Which figure leads is a design-pass question, not a spec
one — but it must be a number with a unit attached, which is the whole point.

### 3.1 One line deletes for free

```
Includes 1,200 for consistency and recovery.
```

This exists solely because "the four coins visibly do not account for the hero
total" — its own comment says so. With no hero total to reconcile against, it is
explaining a discrepancy that no longer exists. It goes, and nothing replaces it.

The consistency bonus and REC still score exactly as they do today (§5). They
simply stop being narrated as arithmetic.

---

## 4. The guidance line

`detailCopy()` in `app/(tabs)/index.tsx`, fed by `resolveStatDetail`.

**Today:** `1,240 more steps for +400 AGI.`

**After (D25):** name what crossing the band *is*, not what it is worth —
e.g. *"1,240 more steps tops out your Agility today."*

`nextTierFor()` already returns the threshold and which band is next, so this is
the same fact in language that means something. No new unit is invented, and
nothing about scoring changes.

This is the third vocabulary this one line has carried, and the lineage is worth
stating because each step had the same motive:

| Vocabulary | Retired by |
|---|---|
| `"1,240 more steps for Gold"` | Deviation #23 — tiers became internal to scoring |
| `"1,240 more steps for +400 AGI"` | **This spec** — points stop being spoken |
| `"1,240 more steps tops out your Agility today"` | — |

`StatDetail.points` becomes unused by this caller. **Leave it on the type.** It
is derived from `TIER_POINTS`, it is tested, and `resolveStatDetail`'s choice of
*which* stat to mention still depends on band arithmetic. Removing the field
would mean re-deriving it the next time anything needs it; it is the sentence
that changes, not the calculation.

---

## 5. The leaderboard

### 5.1 The row

`src/features/squad/LeaderboardRow.tsx:183` renders `<Numeral value={row.total}>`.
That number goes (D23). Rank and the relative gap carry the row.

**The data already exists.** `resolveStanding()` in
`src/features/character/standing.ts` already returns
`{ rank, ahead: { name, gap } }`, already handles the tie case correctly
(`squad_leaderboard` shares a rank between tied members, so the row above may be
two ranks up), and is already tested. The squad screen's own hero already renders
rank plus a gap subline. This change brings the row into line with a pattern the
app has already built twice — it does not invent one.

**The gap keeps its number** (D26). A relative figure answers "am I catchable
today" in a way an absolute total never did, and it preserves the social pressure
§5 and §20 #3 make load-bearing: the board is the only anti-cheat mechanism
Kairo has, and a board nobody can read closely stops applying pressure.

### 5.2 The VoiceOver label must change with it

`src/features/squad/row-label.ts:50`:

```ts
parts.push(`${input.total.toLocaleString()} points`);
```

**This is not optional cleanup.** Leaving it means VoiceOver users hear a figure
sighted users can no longer see — the label and the row would describe different
products. `total` comes off `LeaderboardRowLabelInput`, the gap goes in, and
`row-label.test.ts` moves with it.

That module exists precisely because composing this label has real edges (a
six-person board was seventy-odd swipes before it), so the change lands there and
is tested there, not inline in the component.

### 5.3 The boost chip

`boostChipLabel(row.program)`, rendered on your own row. Its comment states its
purpose exactly:

> The character screen shows the *unweighted* total for the same day — stored
> scores are program-independent (deviation #11) — so anyone who compares the two
> numbers will find them different. The chip is the explanation; hiding the gap
> would cost trust in the score.

With the character screen showing no total and the row showing no total, **there
are no two numbers left to compare.** The chip's documented reason is gone.

It is repurposed rather than deleted (D27): it becomes a statement of the game
the squad is playing — *"This squad boosts Agility"* — on the **board header**
rather than on the self row, because it is a property of the squad, not of you.
Deleting it would leave nothing on the board indicating a program exists at all,
which is deviation #12's entire mechanic.

`program-copy.ts` owns this copy and already frames a program as what the squad is
"actually competing on," so the words largely exist. Note that
`2026-08-15-solo-mode-walk-strength-run-design.md` §8 renames the `gym` program
value to `strength` — whichever of the two lands second inherits the rename.

---

## 6. What this does not touch

- **Goal surfaces.** `GoalCard`, `GoalBar`, `SquadGoalPanel`, `goal-copy.ts`,
  `CreateGoalForm` all keep speaking points (D24). `statusLine()`'s "behind
  pace" and the pace marker are unaffected.
- **Scoring, storage, projections.** No migration. No `kairo-core` scoring
  change. No RPC change. `squad_leaderboard()` still returns `total` — the client
  still needs it to compute the gap and to rank.
- **XP, levels, ability ratings.** Untouched and still displayed. A level is a
  number with a meaning; that was never the complaint.
- **`MAX_DAILY_SCORE_PHONE_ONLY` and friends.** Still used for UI sizing —
  meters need a denominator whether or not the numerator is printed.

---

## 7. Relationship to the solo-mode spec

One touchpoint. `2026-08-15-solo-mode-walk-strength-run-design.md` §4.3 says
Part 1 §2's "say the day" move *"folds into the Today shelf's existing detail
line rather than becoming its own element."*

**That is superseded here**: with the hero gone, saying the day is not a fold-in,
it is the hero treatment (§3 above). That spec's §4.3 is amended to point here.

Nothing else in the two specs overlaps. The Daily Walk card, the Challenges
engine and `/train` are all unaffected — none of them ever spoke in points, which
is worth noticing: the new mechanics were designed in real units from the start,
and this spec brings the old surfaces to the same standard.

---

## 8. Testing

Mostly a copy and composition change, so the test surface is small and the hand
verification matters more than usual.

| Suite | Covers |
|---|---|
| `src/features/squad/row-label.test.ts` | The label speaks rank and gap, never a total. Existing cases updated, not appended to — a passing old assertion would mean the number survived. |
| `src/features/character/standing.test.ts` | Unchanged. `resolveStanding` already produces the shape; this spec adds a consumer, not a behaviour. |
| `src/features/character/stat-detail.test.ts` | Unchanged — `resolveStatDetail` still returns `points`; only the sentence built from it changes. |

**Grep is part of the verification here.** The claim "points are spoken only
inside Goals" is falsifiable by search, and a missed surface is exactly how this
half-lands. Before calling it done, search the app for point rendering outside
`src/features/goals/` and confirm every hit is either a Goal surface, a meter
denominator, or internal.

**By hand, on device:**

- The home shelf at default and at `accessibility-extra-extra-extra-large`, since
  the hero changes from one short integer to several unit-bearing figures and
  that is a wrapping change, not a swap. `xcrun simctl ui booted content_size …`
  sets it with no GUI.
- A leaderboard row under VoiceOver, confirming it is **one stop** and that the
  spoken text matches the visible text. The row's grouping is the fix that cost
  two builds to find and confirm (`CLAUDE.md`); this change edits that exact
  label, so it is re-verified rather than assumed.

---

## 9. Sequencing

Small enough to land in one pass, in this order — each step leaves the app
coherent:

1. `row-label.ts` + its test — the label first, so no window exists where the
   spoken and visible rows disagree.
2. `LeaderboardRow` — drop the total, render rank and gap.
3. Board header — the repurposed program chip.
4. `detailCopy()` — the milestone sentence.
5. Home hero — the day in real units, and delete the consistency-bonus line.

Steps 4 and 5 are the ones that need the **frontend-design** skill pass, per
`CLAUDE.md`: the hero is the app's focal element and swapping what occupies it is
a composition decision, not a text edit.

---

## 10. Documentation owed

- `docs/roadmap.md` — a new deviation. It sits directly downstream of #23
  (tiers became internal) and should say so: the same argument, applied to the
  total rather than to the band names.
- `docs/user-journey.md` — the daily loop's opening beat changes. This is the
  first thing a user sees, so the journey doc is wrong the moment this ships.
- `CLAUDE.md` — a line stating that points are spoken only inside Goals, in the
  same register as the existing tier and Hunter entries, so a future pass does
  not "helpfully" restore a total to the home screen.
- `Kairo_Master_Summary.md` — **no change.** §5 and §6 specify how scoring works,
  not what the home screen renders, and both remain true.

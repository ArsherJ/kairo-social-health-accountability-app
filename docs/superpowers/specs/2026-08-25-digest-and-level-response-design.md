# The Daily Digest and the Level Response — design

**Date:** 2026-08-25
**Status:** Design approved. Sub-project 5 of 5.
**Parent:** `docs/superpowers/specs/2026-08-25-character-race-pivot-design.md`
**Plan:** `docs/superpowers/plans/2026-08-25-digest-and-level-response.md`
**Depends on:** sub-projects 1, 3 and 4
**Proposes roadmap deviations:** **#44**, **#52** (and the `race_results` half of **#46**)

This is the last of the five sub-projects and it closes the pivot out. The
parent spec is authoritative for everything cross-cutting; this document covers
the digest, the stored race result and the character's response to levelling,
and records the decisions taken while planning them.

---

## 1. Thesis

> One push a day, carrying a result worth waking up to — and a character who
> visibly answers every time you level.

Three subsystems that look unrelated and are not. The digest needs a *result* to
carry, which is why `race_results` lives here rather than in plan 1. And with no
cosmetics and no coins in Phase 1 (parent §11), **the figure itself is the
reward** — so the thing the digest is calling somebody back to has to be visibly
different from yesterday.

## 2. What this covers, and what it does not

**Covers.** `race_results` and its gated read; `finalize-days` writing it; the
collapse of three scheduled pushes into one digest; the server-side cap; the
figure's level response; the retention instrumentation re-pointed at the new
loop (deviation #44).

**Does not cover:**

| Out of this subsystem | Where it lives |
|---|---|
| `race.ts`, `rankRacers`, the widened projection | Plan 1 |
| The Today tab the digest routes to | Plan 3 |
| `event_progress()` the digest reads | Plan 4 |
| Cosmetics, equipment, animation runtimes | Deferred, parent §11 |

**Depends on all three siblings.** `race_results` snapshots plan 1's
`rankRacers` output and reads plan 1's widened projection; the digest routes to
plan 3's `/today` and reports plan 4's Event progress. This plan runs last.

## 3. Governing decisions inherited from the parent

- **One digest per user per local day, maximum** (parent §2, §8).
- **It fires at 08:00 in `profiles.timezone`, not at finalization** (parent
  §4.2), carrying *yesterday's final result* and *today's live standing*, plus
  event progress if an event is live.
- **The cap is enforced server-side, in the dispatch query** — a client-side cap
  is not a cap, it is a race between devices.
- **`race_results` is written once**, when the last member's day for that date
  finalizes, and never changes: a later Apple revision does not retract anyone's
  win (parent §7.3, §19's rule).
- **`standings` is snapshotted** because the underlying projection can no longer
  answer "who won on 14 March" once the buckets behind it have been revised.
- **The figure's three existing responses become substantially more legible**
  (parent §5.4) — wider bands, larger deltas, a visible change at each level-up.
  **No new dependency:** `react-native-svg`, Rive and Reanimated all stay
  uninstalled. This is a tuning-and-art pass, not an animation build.

## 4. Decisions taken while planning

### 4.1 `race_results` stores everything and the *read* is gated

Parent §7.3 defines the table. Plan 1 put raw steps behind a **per-viewer**
reciprocal consent gate. Those two do not compose: one stored JSON row is read
by six different people, so it cannot carry a per-viewer gate inside itself.

**Decision: the table stores the full snapshot and grants `authenticated`
nothing at all.** `race_result(squad_id, local_date)` is a `security definer`
function applying exactly the gate `squad_leaderboard()` applies.

- **Rank and species are returned unconditionally** — a rank is not a health
  figure, and species is already in two projections (deviation #40).
- **Capped steps are the disclosure** and carry the reciprocal gate.

The absent grant is a **stronger invariant than a policy and easier to check**:
no client role holds SELECT on `race_results`, and a schema test pins the empty
grant listing. A policy can be subtly wrong; a missing grant cannot be subtly
present.

A member who has not consented is still **stored with a real rank and a
`capped_steps` of 0** rather than dropped — dropping them would make the stored
history disagree with the board their squad watched all day. The 0 is withheld
again on the way out, so the substitution discloses nothing.

### 4.2 The last member writes, and an empty roster writes nothing

Days are per-user local (§2), so a squad spans several calendar dates at any
instant and its race for date *D* is not final until **every** member's *D* is.
Writing on the first member's finalization would crown whoever's timezone
happens to be furthest west.

`squadDayIsComplete()` therefore returns **false for an empty roster**, which is
not the obvious behaviour: `every` over an empty list is `true`, and that would
write an empty standings row for a squad nobody is in — permanently occupying a
**write-once** primary key that nothing would ever correct.

A failed snapshot never stops a day becoming final. The day is the durable
thing; the standing can be written by the next member's finalization, and if
none is left the squad simply has no history row for that date — which the
digest already reads as "no result".

### 4.3 The cap lives in two places, and both are load-bearing

1. **`users_needing_digest()` excludes anyone already sent.** This is the
   *behaviour* — the ordinary path never attempts a second send, and there is no
   window between deciding and checking because the exclusion is a join in the
   same query.
2. **`notification_log_one_digest_per_day`**, a partial unique index. This is
   the *guarantee* — a second insert fails even if the selection query is wrong.

`notification_log` already **is** the ledger parent §4.2 asks for: it records
`(user_id, kind, local_date)` for every successful send. A second table would be
a second thing to keep in step with it.

The index is **partial** on purpose. Every other `kind` stays free to repeat,
because those are bounded by `MAX_NOTIFICATIONS_PER_DAY` in `@kairo/core`, and
moving that rule into the database would take it out of the module that owns it
and tests it.

### 4.4 `MAX_NOTIFICATIONS_PER_DAY` stays 3

Deviation #52 caps the **scheduled** pushes at one. It does not touch the budget
that bounds the event-driven ones — a digest plus an Event completion plus a
Challenge clear is still three, and each of the latter two fires from something
the user did.

Collapsing the two rules would be a scheduling decision quietly changing an
unrelated one.

### 4.5 The retired triggers stay in the type

`day_starts`, `day_ending_soon` and `day_ends` are retired — nothing emits them
— and they **stay in `NotificationTrigger`**, alongside `goal_completed` from
plan 4. `notification_log.kind` is free `text` with no check constraint, rows
already say all four, `countsAgainstBudget` reads them, and a push sent minutes
before the deploy can be tapped minutes after it.

A historical value matching no case is a tap that goes nowhere, which is
indistinguishable from push being broken.

`daily_digest` is deliberately **not** quiet-hours exempt. The exemptions the
retired evening pair needed were for 23:00 and 00:00; 08:00 is never in quiet
hours, so needing an exemption would mean the schedule itself was wrong — and an
exemption would hide that.

`users_at_local_hour()` is **not dropped**. Dropping a general helper because
one caller stopped using it is how the next feature reimplements it.

### 4.6 `kairo_retention()` is deliberately not re-pointed

Parent §1 says `kairo_retention()` and the milestone events are "re-pointed at
the loop described here". Planning it produced a narrower answer, and the
narrower answer is the right one.

`kairo_retention(p_day)` measures whether a `daily_scores` row exists on cohort
day + N. **The pivot redefined what the app shows, not what counts as an active
day.** Rewriting that denominator would make every measurement taken before
2026-08-25 incomparable to every one after — which is the opposite of what a
pivot's instrumentation is for. Keeping it fixed is what lets every chart be
*split* on the pivot date and actually mean something.

What is genuinely stale is the **funnel vocabulary**: `goal_created` names a
surface that no longer exists, and nothing records the four moments the new loop
turns on. Those become new `AppEventType` values —
`squad_data_consent_granted`, `race_seen`, `quest_cleared`, `event_created` —
with `goal_created` kept as a historical value, since `app_events` rows already
carry it and the pre-pivot funnel queries still read it.

**`race_seen` fires once per local day**, on the same once-per-day marker
pattern `milestone-store.ts` uses — not on every render, or the count measures
scrolling rather than engagement. `quest_cleared` carries `{ tier }` and never
the quest id: a tier answers "are the bars set right", where an id would make
the table a per-quest leaderboard nobody asked for. `event_created` carries
`{ kind, difficulty }` and never the target — a boss's HP is the squad's own
number, the rule `goal_created` already followed.

The question the pivot exists to answer gets its own query in
`docs/beta-measurement.md`: **does a user who saw a race come back tomorrow more
often than one who did not?**

### 4.7 The figure has to change at every level, not every band

Parent §5.4 asks for "a visible change at each level-up rather than a change you
would need two screenshots to notice". The existing code **cannot do the first
half at all**: it responds to `stage`, and `evolutionStageForLevel` moves only
at levels 6, 11 and 21. Levelling 12 → 13 changes nothing.

Two changes, and only one of them is a number:

- **The bands are wider.** The old shadow spanned 146 points at level 1 to 200
  at level 21 — a 37% range across the entire game, which is why the QA pass
  reported the character "did not morph" even though three responses were wired
  and working. The new curve spans over 1.7×, pinned by a test so a later tuning
  pass cannot quietly flatten it back.
- **A within-band term.** The shadow now grows a little at every level, with the
  band boundary still the bigger jump — so the four artworks stay the milestone
  and each level in between is still a reward.

Both need a **ceiling** (level 40, roughly a year of strong daily play):
unbounded growth eventually pushes the figure out of the diorama, and a
two-year-old account should not render as a poster.

The arithmetic moves out of `CharacterFigure.tsx` into a tested pure module,
because the point of the change is to widen bands *against assertions* rather
than by eye. The three expressions it replaces were inline, correct, tasteful
and almost invisible.

## 5. Data model

### 5.1 `race_results` — new

```
race_results(squad_id, local_date, standings jsonb, finalized_at)
primary key (squad_id, local_date)
```

`standings` is `[{ user_id, rank, capped_steps, species }]`. `capped_steps` is
`min(steps, DAILY_STEP_BASELINE)` **as `rankRacers()` computed it** — the race
cap, not the raw figure. RLS on, no policy, no client grant.

`rankRacers()` is the single implementation of the ordering, called by both the
live track and this snapshot. A second ordering here would mean the history
disagreed with the board everybody watched all day, which is the one thing a
snapshot exists to prevent.

### 5.2 `notification_log_one_digest_per_day`

Partial unique index on `(user_id, local_date) where kind = 'daily_digest'`.

### 5.3 `users_needing_digest(p_hour integer)`

Timezone arithmetic **and** the already-sent exclusion in one query. Cron-only —
EXECUTE revoked from `public`, `anon` and `authenticated`, the same posture
`kairo_retention()` takes, because it enumerates every user in the system.

### 5.4 `level-response.ts`

`figureResponse({ level, stage, aura, shadowWeight, height })` →
`{ shadowWidth, shadowOpacity, ringSize, ringWidth }`. Pure, types only, tested
in Node.

`CharacterFigure` gains a `level` prop. It currently takes only `stage`, and
passing the level rather than deriving it keeps the figure a pure function of
what it is given, like everything else in that file.

## 6. The digest's copy

Four states, four sentences. **A single template with holes** — "You were
{rank}. You are {rank}." — reads as a template on the second morning, and this
is the only push most users will ever see. It carries the whole relationship the
app has with somebody who has not opened it yet.

The states: won yesterday; placed yesterday; no result yet but a live standing;
no squad at all.

**A solo user gets a digest too, and it never mentions rank.** They are racing
their own past days (parent §5.1), and "1st of 4" against three ghosts would be
a claim about other people that is not true.

Today's standing is read from `squad_leaderboard()` and is therefore ranked by
the **weighted total**, not by capped steps. At 08:00 almost nobody has moved,
so the two orderings agree in practice, and re-ranking here would mean a second
implementation of `rankRacers` on the server for a difference nobody can
observe. Stated so it is a decision rather than an oversight.

The push payload's `screen` is `'today'`, which plan 3's fourth tab provides.

## 7. Verification

- Pure modules tested in Node: `planDigest`, `digestCopy`, `squadDayIsComplete`,
  `buildStandings`, `figureResponse`.
- Schema suite (PGlite): the empty grant listing on `race_results`, write-once,
  the gate in all four consent combinations, the refusal for a non-member, the
  empty result for a day with no row, the partial unique index, and that
  `users_needing_digest` is unreachable from a client session.
- **Live, after deploy:** `select kind, count(*) from notification_log where
  sent_at > now() - interval '24 hours' group by kind` must show no
  `day_starts`, `day_ends` or `day_ending_soon`. A row there after the deploy
  means the old artifact is still live — **redeploy, do not debug the code.**
  That is the August 2026 lesson.
- **On device:** one push per local day at 08:00, tapping it lands on `/today`,
  a second cron run in the same local day sends nothing.
- **The figure at four levels plus one in-band step.** Levels 1, 6, 11, 21 show
  visibly different figures, and level 12 differs from level 11. XP is hand-set
  through `remote-sql.sh` and **set back with `recalculate_user_xp` afterwards**,
  or the next sync reports a level drop.
- At `accessibility-extra-extra-extra-large` after a relaunch: the character HUD
  still flows and nothing overlaps the enlarged figure. **The HUD is one flowing
  column and no child may gain a `top`** — a larger figure is exactly the
  pressure that invites one.

## 8. Proposed roadmap deviations

| # | Deviation |
|---|---|
| 44 | Pre-launch pivot to character racing; funnel instrumentation re-pointed, `kairo_retention()` deliberately unchanged (§4.6) |
| 52 | One notification digest per user per local day, at 08:00 local, capped server-side by a query exclusion **and** a partial unique index |

The `race_results` half is recorded **under #46**, this document's sibling's
deviation, rather than claiming a number of its own — it is the deferred half of
one decision, not a second decision.

**#44 belongs here rather than in plan 1** because it is only true once every
part has shipped, and a roadmap row claiming a pivot that is four-fifths built
is a row that misleads.

## 9. Documentation this change closes out

This is the last sub-project, so its documentation task closes the pivot:
`docs/mvp-scope.md` becomes the post-pivot IN/OUT contract, `docs/user-journey.md`
walks the built flow end to end, `CLAUDE.md` gains the closing block and sheds
the blocks the five plans made stale, and `docs/Kairo_Master_Summary.md` §8 and
§14 get in-place supersede notes.

After it, **no document outside `docs/archive/` describes the app as a
leaderboard with goals.**

## 10. Open risks

- **One push a day may be too few to matter, and there is no way to know before
  shipping it.** The prior three were never measured against a control either.
  The digest's open rate against `race_seen` is the closest available signal.
- **08:00 is a guess.** It is the right *shape* — decoupled from finalization,
  in the recipient's own timezone — but the hour itself is unvalidated, and
  moving it is a one-constant change plus a redeploy.
- **The figure's new curve is checked on four screenshots, not on a cohort.** A
  1.7× span is loud on a simulator; whether it reads as *reward* on a real phone
  in a pocket is a device-pass question.
- **`race_results` accumulates one row per squad per day forever**, with no
  retention policy. It is small and it is history somebody might want; worth a
  decision before the table is large rather than after.

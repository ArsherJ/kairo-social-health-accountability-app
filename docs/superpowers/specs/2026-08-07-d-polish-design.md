# D. Polish, telemetry, and defects

Status: approved 2026-08-07. Workstream D of `docs/mvp-completion-plan.md`.

## Goal

The remaining §15 MVP gap that is not a feature, plus the defects found during
the 2026-08-07 UI verification, plus the telemetry two earlier phases left owed.

Independent of A, B and C. Sequenced last because none of it blocks anything —
but the privacy policy in E7 has a lead time, so **start that during this
workstream**, not at the Apple gate.

---

## D1. Hunter placeholder art

§15 scopes MVP to "AI-placeholder static art". `HunterSilhouette` is still plain
`View` primitives.

The component already varies by evolution stage and dominant stat, and
`app/(tabs)/index.tsx:75` passes both. **So this is asset generation plus
swapping the primitives — the component's interface does not change.**

- Assets under `assets/hunter/`, one per (stage × dominance) the component
  already switches on, plus the `null`-dominance unstarted case.
- `expo-asset` is already a dependency; no new package, no `react-native-svg`,
  no Rive. The 2026-08-01 spec's reasoning holds: adding an animation runtime
  for a placeholder is the wrong trade.
- Keep the existing primitives as the fallback branch if an asset is missing. A
  character that fails to render is worse than a plain one.

Verified by eye on the simulator across every stage the seed data can reach.

---

## D2. Telemetry for silent failures

`app_events` and `src/features/telemetry/events.ts` both exist, so this is three
`track()` calls, not a system. `app_events.type` is free text with a length
check (`20260727120300_progression_and_infra.sql:61`), so no migration.

Add to `AppEventType` (`events.ts:16`): `'timezone_sync_failed'` and
`'health_permission_failed'`.

`'app_open'` is **owned by spec C**, not by this workstream. Workstream C's
`day_starts` trigger cannot function without it, and C ships before D — putting
it here would make the sequenced-last workstream a dependency of the one before
it.

### The two silent failures

**Timezone reconcile** — `src/features/profile/timezone-sync.ts:34` is a bare
`if (error) return;`. This is the failure the file's own header comment warns
about: *"a user who travels keeps finalizing on their old midnight, and nothing
in the app looks broken while their day closes at the wrong hour."* The write
failing is exactly that scenario, and today it leaves no trace anywhere.

**`HealthPermissionSheet.ask()`** — `src/features/health/HealthPermissionSheet.tsx:30-42`
is `try { … } finally { … }` with no `catch`. Precisely: it does not swallow the
error, it becomes an **unhandled promise rejection** from an `onPress` handler
— and the `finally` closes the sheet regardless, so the user sees the sheet
dismiss as though it worked while the permission was never granted. Add a
`catch` that tracks and leaves the sheet open with an error line.

`track()` is fire-and-forget and never throws (`events.ts:22-34`), so none of
these can make the failure worse.

---

## D3. Defects from the 2026-08-07 UI verification

### 1. `letterSpacing` bleeds from the join field into the create field

**Repro:** squad tab → Join → Back → Create. The name field renders with wide
letter spacing and the placeholder "Barangay Runners" truncates.

**Cause:** native view recycling. `JoinSquadForm`'s input sets
`letterSpacing: 8` (`JoinSquadForm.tsx:178`); `CreateSquadForm`'s input style
(`CreateSquadForm.tsx:208-216`) simply omits the property, so the recycled
native view keeps the stale value. React Native only applies properties that are
present — an omitted property is not a reset.

**Fix:** `letterSpacing: 0` explicitly in `CreateSquadForm`'s `input` style.

Pre-existing (`fc9f1f5`), not introduced by the squad-program work.

### 2. The gym accuracy warning renders below the fold

`programNote(program)` renders *after* the program picker
(`CreateSquadForm.tsx:140-142`). At the moment Gym is tapped, the note is below
the visible area — so someone who taps Gym and then Create never sees it.

That defeats the honest-capability rule it exists to serve: STR comes from
estimated active energy, which a phone in a pocket measures poorly during a
lifting session, and §15's per-program risk question depends on gym squads
knowing this before they commit.

**Fix:** move the note above the picker, between `sectionHelp` and
`styles.programs`. It is conditional, so on the other three programs the layout
is unchanged.

### 3. Stale comments assert the opposite of what `squad_leaderboard` does

`Leaderboard.tsx:36-38` and `queries.ts:100-107` both state that
`squad_leaderboard` "returns only members who have scored", and
`useSquadMemberCount` exists because of it. The 2026-08-01 spec records the same
claim as "the locked-slot trap".

**It has never been true.** Every version of the function joins
`squad_members → profiles` and reaches `daily_scores` by **`left join`** — the
original (`20260727120500_rpc.sql:70-76`), the completed-mode rewrite
(`20260729100000`), and the current program-weighted one
(`20260807100200_leaderboard_program_weighting.sql:165-192`). A member who has
not moved today appears with `total = 0`, not absent.

**Fix: correct the comments.** Both of them, plus a one-line note in the
2026-08-01 spec so the claim does not get copied forward a fourth time.

**Leave `useSquadMemberCount` in place.** It is now redundant for slot maths,
but removing it is a refactor of `Leaderboard`'s data flow and this workstream
is not the place for it. Record it as a V1 cleanup instead. Workstream A depends
on the corrected reading — the deploy sheet's target list comes from board rows,
which is only safe because every member is on them.

---

## D4. Verify the slot-unlock reveal

Phase 7 follow-up #5, previously untestable: the only test squad was 6/6, so
`useSlotUnlockReveal` never had a transition to observe. Takbo Manila now has
four spare seats.

Verify on the simulator: with the board open, add a member (via
`seed-health`/`remote-sql.sh`), foreground the app, and confirm the reveal
animates once and does not re-fire on subsequent refetches. Membership changes
do not broadcast, so the trigger is the foreground refetch riding
`useSquadRealtime`'s `refetch()` (`useSquadRealtime.ts:45-51`).

---

## D5. Correct the stale roadmap line

`docs/roadmap.md:192-194` still reads:

> **Still owed: deploy `sync-health` and rescore or reseed the live dev
> `daily_scores` rows**

Both were done on 2026-08-07. Mark it done rather than deleting it — the
roadmap's phase entries are a record, not a task list.

While there, add the approved decisions from `docs/mvp-completion-plan.md` to
the deviations table where they change a committed value:

- `DAILY_ITEM_GRANT_FREE` raised from 1 to 2 for the beta (decision #1).
- Quiet hours exempt the day-boundary pair, against §14's literal wording
  (decision #2).
- N-of-M squad streak moved from Phase 6 to V1, per §15 (decision #5).

Decisions #3 and #4 need no entry — both are what the spec already says.

---

## D6. Start the long-lead compliance items

§15 lists the privacy policy and ToS under V1, but external TestFlight testers
need both, and they have a lead time measured in days. Draft them now so E7 is a
review rather than a write:

- Privacy policy and ToS covering HealthKit data, the Data Privacy Act exposure
  §5 names, and the retention position.
- The privacy nutrition label answers, which follow from the policy.

Not code. Listed here because starting it late is the thing that delays a beta.

---

## Tests

| Item | How |
|---|---|
| `letterSpacing` fix | Hand-verified: Join → Back → Create, placeholder renders full |
| Gym note position | Hand-verified: tap Gym, note visible without scrolling |
| Telemetry calls | Hand-verified: force each failure, confirm the `app_events` row via `remote-sql.sh` |
| Hunter art | Hand-verified across every reachable stage |
| Slot-unlock reveal | Hand-verified on Takbo Manila |
| Comment corrections | No test — but the `squad_feed` column-list assertion in spec A is the structural guard on the projection this touches |

Nothing here changes scoring, day boundaries, sabotage or streaks, so nothing
here is TDD. That is the repo's posture, not an omission.

## What this deliberately does not do

- **No `useSquadMemberCount` removal.** V1 cleanup; see D3.3.
- **No `pane` state-model rework** in `app/(tabs)/squad.tsx`. Workstream B adds
  the one reset it needs.
- **No animation runtime.** §15 scopes MVP to static placeholder art.
- **No general telemetry expansion.** Three calls closing two named
  follow-ups and feeding one workstream-C trigger.

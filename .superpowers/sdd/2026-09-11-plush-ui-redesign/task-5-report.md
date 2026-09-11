# Task 5 report — Compact Flock perch and readable board

## Outcome

Implemented the approved Task 5 Flock presentation without changing query ownership, consent semantics, ranking rules, invitation/share behavior, whack availability, or modal ownership.

The pre-change source baseline used 104-point-wide perch members with a 184-point minimum height, a 100-point character, `space.lg` header/roster top spacing, and an 8-point sage perch bar. The existing controller capture `output/ui-redesign/2026-09-11/before-flock-light.png` confirmed that this made the roster and walk card consume nearly the whole first viewport. I did not operate the controller-owned simulator, browser, or Metro server.

## Changes

- Compacted each perch member to 96 points wide and a 152-point minimum height, with an 84-point `CharacterFigure`, `radius.lg` continuous corners, apricot self wash, lilac flockmate wash, tighter header/roster spacing, two-line names, and a 3-point neutral perch rule.
- Preserved the horizontal roster, trailing invite, leader guard and crown, supplied whack marker, full member payload, callbacks, and minimum interactive sizing.
- Moved Today/Yesterday before the mode-dependent summary in the live board and preview.
- Reduced the Daily Walk summary to a compact quiet lilac surface and smaller 24-point marks while retaining the single composed accessibility label and withheld-reading ring.
- Made the leaderboard a lifted surface and removed per-row card shadows/radii. Rows now use spacing plus a subtle separator; the gold leader rule and apricot self wash compose when the same row is both.
- Wrapped the solo self row in the same lifted board surface while preserving `ranked={false}` and the real-day loading/error/retry branches.
- Quieted the consolidated locked-seat row without changing its count or optional invitation action.
- Tightened the bird sheet's visual grouping with a compact side-by-side identity header and a quiet stat tray. The existing modal lease, safe-area bounds, scrollability, close action, day wording, and sample-only whack flow are unchanged.
- Moved the preview's existing local Invite disclosure directly below `FlockPerch`, before the day controls. Its copy, close behavior, and local `inviting` state are unchanged; no modal or live share behavior was added.

## Files changed

- `src/features/squad/FlockPerch.tsx`
- `src/features/squad/Leaderboard.tsx`
- `src/features/squad/LeaderboardRow.tsx`
- `src/features/squad/FlockStrip.tsx`
- `src/features/squad/LockedSlot.tsx`
- `src/features/squad/PerchBirdSheet.tsx`
- `src/features/squad/SoloBoard.tsx`
- `src/features/preview/FlockPreviewScreen.tsx`
- `.superpowers/sdd/2026-09-11-plush-ui-redesign/task-5-report.md`

## TDD / test strategy

No pure production logic or copy contract changed in this task, so there was no new pure behavior for a red-green TDD cycle. The required pure/source tests were run before the paint change as a 68-test characterization baseline and again afterward. The visual and hierarchy changes remain assigned to controller simulator QA, as required by the brief.

## Verification

### Required focused baseline and regression suite

Command (before and after implementation):

```sh
npx vitest run --config vitest.config.ts \
  src/features/squad/perch-copy.test.ts \
  src/features/squad/row-label.test.ts \
  src/features/squad/standing.test.ts \
  src/features/squad/flock-walk.test.ts \
  src/features/squad/slots.test.ts \
  src/features/squad/invite-code.test.ts
```

Output after implementation: 6 files passed, 68 tests passed, 0 failed.

### Typecheck

Command: `npm run typecheck`

Output: root TypeScript, `@kairo/core` TypeScript, and all Supabase Edge Function Deno checks completed successfully; exit 0.

### Full suite

Command: `npm test`

Output:

- `@kairo/core`: 21 files passed, 495 tests passed.
- Root/schema suite: 124 files passed, 1,735 tests passed.
- Combined: 145 files and 2,230 tests passed, 0 failed; exit 0.

### Static review

- `git diff --check`: clean.
- Confirmed the live board still owns `useState<LeaderboardMode>('current')`, `useSquadLeaderboard`, and local `selectedBird`.
- Confirmed `PerchBirdSheet` still claims/releases the single `perch-bird` modal lease.
- Confirmed live `Leaderboard` has no `onWhack`; the preview keeps sample-only local send state.
- Confirmed null readings still render as unknown/Not sharing, and solo rows still pass `ranked={false}`.
- Confirmed the parent-owned plan edit and `output/ui-redesign/` captures are not part of Task 5 staging.

## Controller QA

The controller was notified when paint was ready and completed the native normal-size pass on the existing server:

- Light and dark compact perch/board presentation passed.
- Today/Yesterday changed roster ordering and kept the walk summary on the selected day.
- The yesterday bird sheet showed its grouped stats and day reading, and Close remained available.
- The current sample Whack closed the sheet and updated both the perch marker and row label.
- The relocated Invite disclosure appeared beside its trigger and dismissed correctly.
- Private rows retained Not sharing; the light solo row retained no rank and one invitation seat.

The final accessibility-XXXL/long-name matrix is assigned to Task 8. No Task 5 visual blocker was found.

## Concerns

No code, automated-verification, or normal-size visual concerns. The cross-task accessibility-XXXL/long-name matrix remains for Task 8.

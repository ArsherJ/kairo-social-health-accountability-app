# Mobile UI branch alignment

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for independent tasks, or superpowers:executing-plans for sequential execution. These merge tasks are tightly coupled and will be executed together, then independently reviewed.

**Goal:** Combine `claude/mobile-app-ui-redesign-j5knw2` (`e2174b5`) and `codex/mobile-screen-refresh` (`659ec28`) into an inspectable, coherent baseline on `codex/ui-alignment`.

**Architecture:** Claude's canonical light/dark theme, Today dashboard, Sky minimap and quiet Flock/You layouts remain the foundation. Preserve the Codex perch and leased sheet, text sharing, welcome screen, preview and accessibility/state fixes. The preview composes the same production components and canonical themes, without changing the persisted appearance preference.

**Tech Stack:** Existing Expo / React Native / Expo Router, Zustand, TanStack Query, token-based StyleSheets and existing twrnc layout utilities. No dependency upgrades.

**Spec:** User-approved alignment proposal in this conversation, 2026-09-11; `docs/engineering/surfaces.md` and existing branch changes. This precedes, and does not implement, the later full UI/UX redesign.

## Global Constraints

- Preserve both source branches and the original checkout; work only in `.worktrees/ui-alignment`.
- Do not start a preview, simulator, native build, deployment or push.
- No scoring, auth, privacy, telemetry, schema or native dependency changes.
- Use `Screen`, shared primitives and canonical theme roles. Bright fills use `ink`; fixed deep scenes use `onDeep`. No new font families, literal colors or `fontWeight`.
- Preserve loading/error/withheld distinctions, minimum 44-point controls, grouped accessibility, one modal lease and safe-area clearances.
- Sky keeps shared path geometry and step-driven progress coloring. A geometry redesign belongs to the next design phase.
- Retain Claude's native `userInterfaceStyle: automatic` change and document that System appearance needs the future compatible build; do not ship it now.

## Task 1: Merge the shared foundation

- [x] Create isolated branch/worktree from Claude and install locked dependencies.
- [x] Verify Claude baseline: `npm run typecheck` and `npm test` (495 core + 1707 root tests).
- [x] Merge Codex with `git merge --no-commit --no-ff codex/mobile-screen-refresh`.
- [x] Resolve routes, `Diorama`, `TodayHud`, `TodayNextStep`, `Screen`, `Leaderboard`, `SoloBoard`, `RecordsCard` and `ClearedCalendar` preserving the approved ownership above.
- [x] Consolidate `src/ui/use-theme.ts`, `src/ui/Screen.tsx`, `src/theme.ts` and `src/ui/status-bar-tone.ts`; use a scoped canonical theme for preview/fixed onboarding scenes, not a second palette or a persisted preference write.
- [x] Exercise theme/appearance/status-bar/contrast tests and typecheck before expanding to preview call sites.

## Task 2: Align feature composition and preview

- [x] Keep Today dashboard composition and terminal error retry; preserve compact character rendering fixes.
- [x] Integrate `FlockPerch` and `PerchBirdSheet` into the quiet Flock layout; theme their surfaces and preserve unavailable-data copy and the modal lease.
- [x] Preserve best-day selection/share/error behavior in themed `RecordsCard`, responsive calendar cells and reusable welcome screen.
- [x] Update `src/features/preview/MobilePreview.tsx and the four `*PreviewScreen.tsx` files` to canonical theme hooks and production dashboard/minimap/segmented controls. Keep preview interactions local and honest.
- [x] Add or extend pure tests before changing derived behavior; run the existing copy, state, geometry and accessibility guards.
- [x] Update `docs/engineering/mobile-screen-preview.md` with the integrated architecture and verification limits.

## Task 3: Verify and finish locally

- [x] Run `npm run typecheck` and `npm test`; confirm clean conflict-marker and whitespace checks.
- [x] Run non-serving Expo bundle checks if supported; do not launch a server or simulator.
- [x] Request independent review of the integration against both source branches and fix material regressions.
- [x] Record actual verification evidence here, stage only integration work and finish the merge commit.
- [x] Confirm both source branch SHAs are unchanged and the integration worktree is clean.

## Verification record

- Device, Dynamic Type and Accessibility Inspector verification remains pending because the user requested the simulator stay stopped.
- Final `npm run typecheck && npm test`: passed (495 core + 1,732 root tests; app, core and all Edge Function typechecks).
- Final non-serving exports: iOS release Hermes bundle and development web-preview bundle passed. Artifacts are under `/private/tmp/kairo-ui-alignment-export.AggEcE/{ios-final,web-final}`. No binary built, no server left running, no deployment.
- Independent integration review: no remaining Critical/Important/Minor findings. Restored web preview initial `scrollTo`/minimap synchronization and the Flock self-standing summary; geometry and standing tests passed after the fixes.
- `git diff --check`: clean. Preview port 8082 has no listener. Original checkout remains clean on `codex/mobile-screen-refresh`; both source branch SHAs were verified unchanged.
- Dependency installation used the merged lockfile and existing patch-package patch. `npm ci` reported 24 audit findings (16 moderate, 8 high); dependency security remediation is outside this branch-alignment task. No automatic audit fixes or dependency upgrades were applied.
- The full redesign, new path geometry, device/XXXL/VoiceOver validation and the compatible native build remain separate follow-up work.

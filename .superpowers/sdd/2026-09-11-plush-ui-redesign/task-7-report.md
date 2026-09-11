# Task 7 report — shared themed onboarding presentation

## Result

- Added one theme-aware `OnboardingFrame` and dumb injected presentation views for Welcome, One Sky, Mirror, Connect, Difficulty, Privacy, and Name.
- Replaced the six stateful route render trees with thin adapters; `/welcome` remains the existing adapter.
- Onboarding now follows the selected appearance. `/sign-in` remains fixed light.
- The policy control now opens `PRIVACY_POLICY_URL`; it no longer routes to `/progress`.

## Test record

Baseline before application edits:

- `npm run typecheck && npm test` — PASS: typecheck/Edge Function checks; 495 core tests and 1,737 root tests.

RED:

- `npx vitest run src/ui/status-bar-tone.test.ts` — EXPECTED FAIL: 1 of 4 tests; onboarding dark appearance resolved to light under the old fixed-light policy.
- `npx vitest run src/features/onboarding/onboarding-screen-copy.test.ts src/features/privacy/claim-surfaces.test.ts` — EXPECTED FAIL: 10 of 85 tests; the new copy/shared views did not yet exist and the privacy route still lacked `PRIVACY_POLICY_URL`.

GREEN and final verification:

- `npx vitest run src/ui/status-bar-tone.test.ts src/features/onboarding src/features/privacy/claim-surfaces.test.ts` — PASS: 11 files, 165 tests.
- `npm run typecheck` — PASS, including workspace typecheck and Deno Edge Function checks.
- `npx vitest run src/features/telemetry/telemetry-payloads.test.ts` — PASS: 1 file, 19 tests; emitting-route allowlist remains intact and shared views emit nothing.
- `npm test` — PASS: 495 core tests; 126 root files, 1,741 root tests.
- `python3 assets/character/verify_pack.py` — PASS: all 11 v3 renders and 11 crest masks satisfy the 570×636 RGBA framing/mask contract.

## Files

Created:

- `src/features/onboarding/{OnboardingFrame,OneSkyScreen,MirrorScreen,ConnectScreen,DifficultyScreen,PrivacyScreen,NameScreen}.tsx`
- `src/features/onboarding/onboarding-screen-copy.ts`
- `src/features/onboarding/onboarding-screen-copy.test.ts`

Modified:

- `app/(onboard)/{one-sky,mirror,connect,difficulty,privacy,name}.tsx`
- `src/features/onboarding/{WelcomeScreen,OnboardingChrome,OnboardingCta,HatchingBeat}.tsx`
- `src/features/onboarding/welcome-screen-copy.ts`
- `src/ui/Screen.tsx`
- `src/ui/{status-bar-tone,status-bar-tone.test}.ts`
- `src/features/privacy/claim-surfaces.test.ts`
- `src/theme.ts`

## Retained route behavior

- Route order and destinations remain `/welcome → /one-sky → /mirror → /connect → /difficulty → /privacy → /name`; both skip controls still derive the Mirror destination from `onboardingSkipTarget()`.
- Every routed beat keeps its existing `useBeatImpression` call. Connect alone keeps `onboarding_started` telemetry.
- Connect retains the permission call, today's-step read, calibration read, pending-step ref, hatching branch, later-of-read/minimum timing predicate, and one scheduled timer.
- Difficulty calibration note and selected tier, plus Privacy sharing consent, remain route/store-owned answers.
- Name retains the synchronous single-submit ref, exactly one `createProfile.mutate`, the post-insert answer update/reset, and replacement to `/`.
- The only navigation change is the explicitly approved public privacy-policy URL.

## Review notes

- Presentation views import no router, session, HealthKit, Supabase, answer store, or telemetry module.
- Runtime presentation colors come from `useTheme`/module-level `useStyles`; no component color literals were added.
- Name keeps keyboard avoidance and handled keyboard taps. Its portrait is the canonical v3 base render and its accessibility label no longer claims a pose the base art does not guarantee.
- Welcome was visually checked by the controller in light and dark. The known preview double-inset/first-viewport CTA spacing is assigned to Task 8, which will mount and inspect the complete shared-view matrix.

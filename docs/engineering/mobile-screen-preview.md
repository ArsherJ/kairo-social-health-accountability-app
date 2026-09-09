# Mobile screen preview

Branch: `codex/mobile-screen-refresh`.

Run `npm run preview:ui`, then open <http://localhost:8082>.
The preview requires no account, health permission, or Supabase connection.

## What to inspect

- Today: stage-aware bird, day reading, next step, details disclosure, sample whack banner.
- Flock: perch, trailing invite, Today/Yesterday switch, accessible bird sheet, one local whack interaction.
- Sky: shared flight, flock rail, find-my-bird control and explanation toggle.
- You: profile, streak, selectable best days and the platform text-share action.
- Onboarding: refreshed welcome beat with expandable explanation. Continue/Skip returns to Today in the preview; the real route retains the existing onboarding flow.

Use the toolbar to switch light/dark and Ready/Loading/Empty/Private/Error fixtures.
Private readings stay null and members remain visible. Error provides retry.
The toolbar, fixtures and navigation are preview-only; they do not replace app state.
Sharing a best day can open the system share sheet, but nothing is sent automatically.

## Implementation boundaries

Shared screen components live under their existing `src/features/<domain>/` modules.
`src/features/preview/MobilePreview.tsx` composes them with sample data.
Normal `npm start` still opens the authenticated app. The root `index.ts` selects
the preview only when both `__DEV__` and `EXPO_PUBLIC_UI_PREVIEW=1` are true;
release bundles always register Expo Router.

Tailwind utilities use `twrnc` through `src/ui/tailwind.ts`, mapped to existing
theme tokens. This is deliberately not a NativeWind/Reanimated installation:
the visual pass adds no native module, avoiding a new EAS binary requirement.
Existing primitives retain their shared styling contracts.

This is not the full Phase 3 rollout. No whack schema, real send RPC, notification
dispatch, daily seen marker, new reaction art, or voice-setting migration is added.
The sample whack is local to the preview. Cohort gates and the Phase 4 native-build
batch remain unchanged. Only the welcome beat is visually replaced; later
onboarding routes keep their current implementation.

## Verification

This pass checked the browser preview at 320-point width, an existing iPhone 17
Pro development client at the largest accessibility text size, the bird-sheet
accessibility grouping, best-day selection, and opening/dismissing the native
share sheet without sending. The simulator's original text size was restored.
The source suite passed 2,170 tests; app/core/Edge Function typechecks and a local
iOS release-bundle export also passed. No native binary was rebuilt or uploaded.

Run `npm run typecheck && npm test` before integration. The browser preview is
useful for visual and state checks, but does not substitute for iOS VoiceOver,
Accessibility Inspector at XXXL Dynamic Type, native share-sheet testing, or a
TestFlight device pass. No release or TestFlight cut is part of this change.

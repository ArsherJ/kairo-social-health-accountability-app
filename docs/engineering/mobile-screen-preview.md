# Mobile screen preview

This UI baseline was integrated on `codex/ui-alignment` from
`claude/mobile-app-ui-redesign-j5knw2` and `codex/mobile-screen-refresh`.
The commands below run from the repository checkout, including `main` after integration.

When a preview is requested, run `npm run preview:ui`, then open <http://localhost:8082>.
The alignment pass intentionally leaves the preview and simulator stopped.
The preview requires no account, health permission, or Supabase connection.

## What to inspect

- Today: production dashboard tiles and quest rows, card-sized stage-aware bird, next step, details disclosure, sample whack banner.
- Flock: perch, trailing invite, Today/Yesterday switch, accessible bird sheet, one local whack interaction.
- Sky: shared flight and right-side scrubbable minimap, step-driven trail fill, flock rail, find-my-bird control and explanation toggle. Path geometry is unchanged; changing its shape belongs to the later redesign.
- You: profile, streak, selectable best days and the platform text-share action.
- Onboarding: refreshed welcome beat with expandable explanation. Continue/Skip returns to Today in the preview; the real route retains the existing onboarding flow.

The minimap strip is at least 44 points wide because the strip itself handles touch/drag.
The pre-merge accessibility correction widens it from 40 to 44 points; the underlying flight
geometry, vertical scrub mapping, and step progression are unchanged.

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
the visual pass adds no native module. The integrated Claude branch does retain
`userInterfaceStyle: automatic`, a native configuration change requiring a
compatible build before System appearance can work on installed clients.
No build or OTA is part of this alignment.

The preview's local toggle selects canonical `themes` through `ThemeScope`.
Shared primitives and scene gradients follow it; it never writes Settings'
persisted appearance preference. Auth/onboarding keep their authored palette.
Tailwind is used for layout; dynamic colors come from the shared theme roles.

This is not the full Phase 3 rollout. No whack schema, real send RPC, notification
dispatch, daily seen marker, new reaction art, or voice-setting migration is added.
The sample whack is local to the preview. Cohort gates and the Phase 4 native-build
batch remain unchanged. Only the welcome beat is visually replaced; later
onboarding routes keep their current implementation.

## Earlier screen-refresh verification (before alignment)

This pass checked the browser preview at 320-point width, an existing iPhone 17
Pro development client at the largest accessibility text size, the bird-sheet
accessibility grouping, best-day selection, and opening/dismissing the native
share sheet without sending. The simulator's original text size was restored.
The source suite passed 2,170 tests; app/core/Edge Function typechecks and a local
iOS release-bundle export also passed. No native binary was rebuilt or uploaded.

## Alignment verification

The integrated layout has not been rechecked on a device or in a running
browser: both remain stopped at the user's request. Fresh automated results
are recorded in `docs/superpowers/plans/2026-09-11-ui-alignment.md`.

Run `npm run typecheck && npm test` before a release. The browser preview is
useful for visual and state checks, but does not substitute for iOS VoiceOver,
Accessibility Inspector at XXXL Dynamic Type, native share-sheet testing, or a
TestFlight device pass. No release or TestFlight cut is part of this change.

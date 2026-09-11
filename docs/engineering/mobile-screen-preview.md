# Mobile screen preview

The account-free preview renders the same presentation components as the real
Today, Sky, Flock, You, and onboarding routes. It supplies local fixture data;
it does not sign in, request Health access, write a profile, change the saved
appearance preference, emit telemetry, or send a social action.

Run `npm run preview:ui`, then open <http://localhost:8082>. Normal `npm start`
still opens the authenticated app. The root entry selects the preview only when
both `__DEV__` and `EXPO_PUBLIC_UI_PREVIEW=1` are true, so a release bundle
always registers Expo Router.

## Controls and coverage

The top toolbar switches Light/Dark, opens the seven-view Onboarding preview,
and reveals two control rows:

- **Screen state:** Ready, Loading, Empty, Private, Error. Private flock
  readings remain null; it never turns a withheld reading into measured zero.
- **Fixtures:** Everyday, Long names, Ridge, Ceiling + reaction, No sleep,
  Ghost days, Wide sky label, Crowded sky. Crowded sky is a Sky-only six-bird
  sample with nearby progress and self in front; it does not change live data.
  The Today fixture passes readings through `resolveLivingMirror`;
  the Ridge case
  reaches the `summit` pose through that resolver, and the ceiling sample uses
  the real reaction priority and growth ceiling. Long names reach all four tab
  adapters and every roster member. Ghost days uses the real solo-rival and
  race-ranking resolvers; on You, Everyday, Ridge, and Ceiling + reaction expose
  locked, banked, and recharging shield copy respectively.

The canonical shared tab bar remains the only tab registry. The preview canvas
overrides only its top safe-area inset because the toolbar already consumed it;
the real bottom inset and 96-point navigation clearance remain in force. Real
routes retain their existing safe-area ownership.

Onboarding mounts all seven shared views in route order:
`/welcome → /one-sky → /mirror → /connect → /difficulty → /privacy → /name`.
The chooser can jump to any view; Back and Skip are local. The Connect action
reveals a labeled sample reading and its setup panel can be inspected as a
phase, not an eighth route. Busy and error controls are local samples; an empty
name shows the real disabled state, and **Fill sample name** makes completion
reachable. Quest selection, the sharing switch, and the name input stay in
component state. Completion returns to Today rather than creating an account.
The policy link may open the public policy page and performs no submission.
The nested Name preview measures the shared canvas in window coordinates and
passes that value as its keyboard offset; the normal route keeps the component's
zero default.

## What to inspect

- **Today:** first-viewport Motion progress beside the plush eagle, details,
  all three quests, missing sleep, Ridge/summit, crest ceiling, and reaction.
- **Sky:** open-air flight with automatic lateral drift, layered ridges,
  right-side minimap, Locate, explanation, solo, private, ghost, and
  ridge-clearance states. No trail is painted. The scene/map/Locate share a
  straight progress projection; `flightFrame` still owns measured clearances
  and `raceProgress` remains the earned-step authority. Reduce Motion makes the
  scene static; drifting never adds steps or changes a rank.
- **Flock:** compact perch, Today/Yesterday summary, every roster bird, one
  trailing invitation, private readings, solo/no-rank, and bird-sheet close.
  Maximum-length names widen their own horizontal perch card and wrap without
  a line clamp; short-name cards retain the compact minimum.
- **You:** one portrait/header, Settings affordance, streak shield branches,
  selectable best days, native Share open/cancel, growth copy, and calendar.
- **Onboarding:** every shared view, Back/Skip, local connection states, quest
  choice, sharing switch, name keyboard, and disabled/busy/error presentation.

## Boundaries and verification limits

The preview proves shared presentation and sample-state behavior. It is not an
authenticated HealthKit, profile-write, consent, invite, whack, notification,
or route-gate end-to-end run. Opening the native Share sheet is safe only when
it is canceled without choosing a recipient. The sample whack and invitation
never call a backend.

Browser inspection is useful for a 320-point layout and pointer-driven minimap
drag, but it does not prove iOS native behavior. The current browser baseline
also logs known development warnings for legacy shadow props, `pointerEvents`,
image tint, and the native animation-driver fallback; those warnings predate
this redesign. The final native Metro pass also emitted
`Sending onAnimatedValueUpdate with no listeners registered.` twice around a
bundle/QA reload. That native warning has no established pre-redesign baseline;
no runtime error or red screen accompanied it, and this pass did not change a
dependency to suppress it. Simulator automation can verify minimap taps and accessible
increment/decrement actions, but its coordinate drag/scroll is unreliable, so
native drag must remain explicitly unverified unless a human gesture or other
reliable native tool performs it.

No Accessibility Inspector, physical-device, TestFlight, authenticated account,
real Health grant, profile insert, consent mutation, invite, or whack is claimed
by this preview pass. Those require separate release validation and, where
applicable, a directed test account.

The initial 2026-09-11 plush-redesign matrix (before the open-flight refinement)
covered all four tabs and all seven
onboarding views in both schemes at normal text size on the iPhone 17 simulator
and in Chrome responsive 320×598. Cold-relaunch XXXL Dynamic Type covered all
four tabs and all seven onboarding views in dark mode, with light-mode checks
of all four tabs, Privacy, and shared controls. Native taps,
accessible minimap adjustment, local states, the actual Name software keyboard,
and native Share/Cancel were exercised; browser forward/reverse minimap drag
was exercised separately. Text size `large`, system light appearance, and
Reduce Motion off were restored. Native drag and the authenticated/physical
limits above remain unverified; no six-member visual fixture is claimed.
Representative before/final captures are in the
[2026-09-11 preview evidence](../../output/ui-redesign/2026-09-11/); experimental,
issue, and full-window browser captures are intentionally excluded.

The branch-wide review then found two presentation gaps and three verification
gaps. Its fix wave makes each privacy card's complete injected disclosure
available to assistive technology while leaving the sharing switch as a
separate action; fixes the Sky bird to a figure-sized path anchor while its
120-point label moves independently above or below; keeps the Ghost fixture's
current self at 6,840 steps across Today, Sky, and Flock; and makes Ceiling
details read the fixture day's 10,000 steps and 1,200 active kcal. **Wide sky
label** is a preview-only fixture for the 44-point rival/120-point pill boundary:
it places the named 400-step rival near the ground threshold while pure tests
pin both exact sides and the post-measurement transition. Chrome responsive
inspection confirmed that same rival's label above at 320 points, below at 460,
and above again after returning to 320, with the bird centered on the path in
both schemes. Native iPhone 17 portrait confirmed the wide label above in both
schemes; Long names also confirmed wide mid-flight/ridge labels below and
path-centered after measurement in both schemes. The app is portrait-locked,
so rotation is not native threshold evidence. Native accessibility-hierarchy
inspection exposed both complete privacy claims and the separate switch, which
toggled off to on; this was not a VoiceOver audio or Accessibility Inspector
pass. Final scoped re-review of `a048895..6d4cda4` found no remaining Critical or
Important issue and no fix-introduced regression. Four findings were addressed;
one Minor test-coverage finding is explicitly deferred: the guard pins route
claim bindings and generic spoken-body use, but not the intervening
`body={healthCopy}` / `body={sharingCopy}` bindings inside `PrivacyScreen`.
Those bindings are correct in the code and both full claims were confirmed in
the native accessibility hierarchy. A future missing or swapped child binding
could nevertheless evade this source guard. The controller accepted that
bounded coverage gap after the single final fix wave; it is not a claim of
complete automated rendering coverage.

Independent controller verification on `6d4cda4` passed
TypeScript/workspace/Edge Function checks and 2,256 tests (495 core and 1,761
root/schema), with `git diff --check` clean. The branch remains
`codex/plush-ui-redesign`; `main` is unchanged, and no merge, push, deployment,
native build, or account mutation was performed.

## Open-flight verification — 2026-09-11

The follow-up removes both trails and adds automatic horizontal bird/cloud
drift over layered ridge silhouettes. Birds keep identity-based lateral rest
positions. A shared bounded layout separates nearby complete markers and
drift envelopes; scene, map and Locate all consume that same result. Displayed
percentages, ranking and step scoring remain unchanged. Actual measured header,
footer and navigation clearances keep the start/finish reachable. Reduce Motion
and foreground/focus gating stop and reset decorative motion.

Independent checks on the final open-flight tree passed TypeScript, workspace
and Edge Function checks, **2,266 tests** (495 core + 1,771 root/schema), and
`git diff --check`. Final scoped code review found no remaining Critical,
Important or Minor change request. Regression tests cover nearby/tied groups,
all one-to-six counts, whole bird/name intersections, progress monotonicity,
mixed ridge/midnight positions, measured footer clearance and crowded Locate.

Controller visual checks on iPhone 17/iOS 26.5 covered the six-bird fixture in
both schemes, maximum Dynamic Type with Locate below the rail, native map
top/bottom taps and accessible adjustment, Private/Empty/Loading/Error/Retry,
and the shared One Sky illustration in both schemes. Chrome at 320×598 covered
both schemes and forward/reverse minimap dragging. A small viewport shows only
part of the scrollable flock at once. Frozen-code Reduce Motion checks showed
a static scene; switching tabs and backgrounding/returning did not produce a
runtime error. Text size `large`, system light appearance and Reduce Motion off
were restored. Representative captures use the `open-sky-` prefix in the
preview-evidence directory above.

These are account-free preview checks, not an authenticated flight, VoiceOver
audio, Accessibility Inspector, physical-device or TestFlight pass. Native
gesture dragging remains unverified; browser drag is separate evidence. The
earlier development-warning and release-validation limits still apply. This
refinement stays on `codex/plush-ui-redesign`, with no merge, push, new native
dependency, asset regeneration or backend write.

## Implementation boundary

Shared screen components stay in their existing `src/features/<domain>/`
modules. `src/features/preview/MobilePreview.tsx` is only an adapter around
those components and canonical theme roles. No new native module, styling
runtime, route, backend feature, schema change, or production state store is
part of the preview.

# Kairo — warm-pastel UI redesign

Date: 2026-09-11

Branch: `codex/plush-ui-redesign`

Basis: `main` at `3b3cbdb`, including the installed plush eagle v3 pack.

Status: Visual direction and written specification approved in conversation on 2026-09-11.

## 1. Outcome and scope

Redesign the existing application around the cream-and-brown plush eagle: minimalist, modern, and playful in light and dark mode. The supplied reference informs the soft palette, rounded surfaces, spacious hierarchy, and character-led illustration. It does not introduce the reference application's courses, currencies, trophies, or game mechanics into Kairo.

The deliverable is working React Native UI in the existing feature modules, used by both the real routes and the account-free preview. It is not a second, mock-only app. The focus screens are Today, Sky, Flock, You, and the seven onboarding beats. Settings, sheets, and navigation receive the shared visual system so they do not feel like a different application.

Preserve the existing eagle artwork, routes, server reads and writes, scoring, health ingestion, privacy rules, progressive disclosure, quest selection, and character reaction semantics. The earlier architecture brief is context, not authorization to build unfinished backend features during this visual pass.

## 2. Visual system

### Palette

Keep semantic token names in `src/theme.ts`; change values and component usage rather than creating screen-specific palettes. The following anchor colors define the direction. Full ramps must retain their existing tested ink-strength contract.

| Role | Light direction | Dark direction |
| --- | --- | --- |
| Page | Warm cream `#FBF8F2` | Warm charcoal-plum `#211C23` |
| Card | White `#FFFFFF` | Lifted plum `#302932` |
| Primary text | Cocoa `#382B29` | Cream `#FAF3EB` |
| Primary/self fill | Soft apricot `#F4AF82` | Soft apricot `#F4AF82` |
| Supporting/lane wash | Pale lilac `#F0E8F8` | Muted plum `#403249` |
| Rest/supporting wash | Pale mint `#E7F3EB` | Deep muted teal `#263C35` |

Use darker family inks on pale washes and lighter family inks on dark washes. `colors.ink` remains dark for bright fills in either theme; `colors.onDeep` remains light for deep fills. Gold still means earned, coral still means streak/error, and sky tones remain scenery rather than stat or status colors. Every text-bearing pairing must satisfy the existing contrast tests; intermediate ramp values are chosen against those pairings.

Apricot marks the person and primary action. Lilac supports the flock, Mind, and selected navigation; it is not a new primary button color. Mint gives secondary actions and restful surfaces a distinct place. Avoid a rainbow of equally prominent cards.

### Shape, type, and depth

- Use rounded continuous corners, mostly `radius.lg` for cards and the existing pill radius for controls. No containment borders; a border may indicate selection.
- Use white-on-cream or lifted-on-charcoal surfaces with restrained shadows. Reduce stacked panels, hard button lips, and heavy rings.
- Keep bundled Fredoka for names and important numbers, Nunito for prose and supporting labels. Font families remain declared only in `src/theme.ts`.
- Use the existing custom `Text`, never React Native `Text`; select bundled font cuts through the theme instead of `fontWeight`. Keep color literals in the theme, not component styles.
- Prefer sentence-case headings and quiet labels over repeated uppercase eyebrows.
- Use the existing icon family; no new icon or native dependency.
- Use illustration sparingly: one meaningful character composition per screen, not a decorative bird in every card.
- Keep meaningful presence, growth, and earned cues visible. Quieting the ring is a presentation change, not removal of `auraStrength`, level scaling, plumage, or ceiling-day feedback.

### Shared navigation and controls

Retain Today, Sky, Flock, and You in that order. The floating bar becomes a quieter rounded surface with a compact lilac selected treatment, readable labels, and no raised center action. `NAV_HEIGHT` stays 96; existing screen clearance remains authoritative.

Reuse `Button`, `CtaPill`, `SegmentedControl`, `Panel`, `Text`, and `Screen`. Update primitives first so settings and sheets inherit the same palette. Every interactive target is at least 44 by 44 points; primary buttons retain their existing larger minimum. Selection is expressed through shape, label, or accessibility state as well as color.

## 3. Screen layouts

### Today — progress beside the character

Order:

1. Compact date/name header with existing level and personal streak chips.
2. A unified hero: the day's Motion reading and progress alongside the v3 eagle, on a soft scene.
3. The existing next-step sentence and details action.
4. Body and Mind supporting readings, two columns where they fit and stacked at larger text sizes.
5. The existing three quest rows, with only the selected next quest emphasized.
6. Existing notices and available social feedback in their current eligibility states.

On a normal-size iPhone, the first viewport must show the Motion figure and progress without requiring a scroll past a standalone illustration. At accessibility sizes the hero may stack; no important text is clipped to maintain an illustration height. Render Motion once rather than repeating a hero reading in a second tile.

The character still resolves from the current day, including `summit`, verified-strength pose, Mind state, reaction priority, level scale, and crest tint. Replace saturated blue bands with soft scenery and reduce the ring's visual weight. The ceiling day's scene and explanatory sentence remain distinct. Keep the details sheet and its existing modal lease, safe-area handling, and disclosure-gated links.

### Sky — a calm, navigable flight

Keep the scrollable flight, current bird placement, ghost rivals, and the right-side minimap. The existing `flightFrame`, `raceProgress`, and minimap functions remain the single geometry/progress authority.

Use a quieter sky with restrained cloud/landmark decoration, a finer continuous-looking path, and a clear difference between traveled and upcoming segments. Replace the large bead-like path treatment; do not replace it with a new curve or new progression calculation. Bird labels and the ridge remain legible in both schemes.

Compact the pinned controls and flock rail while continuing to measure their actual height. The drawing box must remain below the rail, including at large text sizes. Keep exactly one trailing invitation/overflow slot.

The minimap stays at least 44 points wide, tracks the viewport, supports tap and drag, and retains its accessible adjustment behavior. It is navigational, not a decorative miniature. Solo and withheld-data states remain honest: no fabricated opponent and no private member placed at zero.

### Flock — a small gathering, then the board

Use a compact title and soft pastel perch with the existing birds, one trailing invite, a restrained self treatment, and earned gold for the actual board leader. Give the board more space in the initial viewport by reducing decorative header height.

Keep the Today/Yesterday segmented filter connected to both the board and flock-walk summary. Compose rows as one clean card with limited separators and sufficient space for names and figures. A leader cue and a self cue must remain distinguishable when they occur on the same row.

Preserve the existing bird detail interaction and any already-supported action; do not add a simulated send action to a live route. Preserve create, join, share, leave, and consumed route intents. Keep one consolidated open-seats row, not one empty row per vacant seat. A squad of one has no ranking boast; withheld readings say what is unknown rather than looking like a failed day.

### You — personal progress, not a statistics wall

Create a character-led header with one portrait on a soft backdrop, the person's name, species line, and a clearly reachable Settings action. Do not layer a second bird behind the portrait or add unsupported trophies.

Follow with compact streak information, the truthful shield note, the best-days card with selectable records and Share, the existing growth explanation/disclosure, and the cleared-day calendar. Use white space and typography to establish hierarchy instead of nested outlined cards. Keep the current and longest streak meanings separate.

Keep best-day selection local to the component; share the selected real reading through the existing share behavior. Missing records keep their empty state, not invented zeros. Expanded detail remains a local, accessible disclosure, and its existing account-age gate is unchanged.

### Onboarding — one idea and one eagle per beat

Retain `/welcome → /one-sky → /mirror → /connect → /difficulty → /privacy → /name` and the shared beat registry. Refresh the illustration framing, surfaces, and action hierarchy across the run. Use the same soft palette and single-character emphasis, with optional subdued scene details only where they support the beat.

Make the run coherent in both appearance schemes rather than leaving fixed navy pages inside the new light experience. This intentionally supersedes the previous decision to force the entire onboarding run to light. Update the local theme scoping and status-bar policy together; a dark scene gets light status-bar ink, and a light scene gets dark ink. Do not invert a scene without updating its shared controls.

Primary actions, skip/decline actions, and the name input must remain reachable with large text and the keyboard. Preserve all existing copy claims, permission sequencing, hatching timing, calibration selection, and pending-answer behavior. The profile row is still inserted exactly once, on `/name`, and no question is added after that insertion.

## 4. Component boundaries and state

Use the existing structure rather than adding a parallel `src/components/screens` tree.

Keep the installed React Native styling approach: theme-aware style factories and existing `twrnc` layout utilities. Do not install NativeWind or replace the styling runtime for this pass; the latest request is for the redesigned UI, not a framework migration.

| Area | Ownership |
| --- | --- |
| Palette and ramps | `src/theme.ts` |
| Theme and status-bar policy | `src/ui/use-theme.ts`, `src/ui/status-bar-tone.ts`, existing root theme scope |
| Shared surfaces and navigation | `src/ui/{Panel,Button,CtaPill,Tile,SegmentedControl,TabPill}.tsx` |
| Today layout | Existing `src/features/character/TodayBoard.tsx`, `TodayHud.tsx`, `TodayNextStep.tsx`, and `Diorama.tsx`; add a focused `TodayProgressHero.tsx` for the combined Motion/character composition |
| Sky presentation | Existing `src/features/squad/Sky*.tsx`; preserve pure geometry modules |
| Flock presentation | Existing perch, strip, leaderboard, row, and invite components under `src/features/squad/` |
| You presentation | Existing header, streak, best-day, and growth components under `src/features/profile/` |
| Onboarding | Existing shared chrome, CTA, welcome component, and thin beat routes |
| Preview and verification | Existing `src/features/preview/` screens and `docs/engineering/mobile-screen-preview.md` |

`TodayProgressHero` accepts the already-derived Motion reading and a character presentation slot. It owns responsive layout only; it does not fetch health data, calculate a new target, or choose a character pose. Adapt the supporting tile composition to avoid a duplicate Motion tile. Real routes and sample previews use the same hero.

Keep `useState` inline for local interactions: selected day, selected best day, open disclosure, and preview-only theme/screen-state toggles. Do not create duplicate local copies of server progress, session state, or persisted appearance. Keep callbacks connected to existing navigation and mutation hooks. No new UI control may appear interactive without performing a real action.

Copy remains in existing pure copy modules; any new explanatory or accessibility sentence goes into a nearby `*-copy.ts` with tests. Routes compose feature components and existing hooks instead of absorbing reusable layout or new business rules.

## 5. States, accessibility, and safeguards

- Preserve loading, cached-data, error/retry, empty, and withheld states in both schemes. Null is never presented as a measured zero.
- Use `Screen` and the existing onboarding scaffold as the safe-area owners. Bleeding headers apply the top inset exactly once; stacked routes keep their nav-hiding behavior.
- Group meaningful readings into one accessible element with the composed label and both child-hiding mechanisms already required by the repo. Keep separate actionable children as separate controls.
- All targets are at least 44 by 44 points. The minimap's visual width must not regress below its current 44-point minimum.
- Keep names, units, and action labels readable at XXXL Dynamic Type; allow rows to grow and paired tiles to stack.
- Respect reduce motion using existing hooks. Silent meaningful reactions retain their accessibility announcements.
- Keep one modal host/lease; sheets remain bounded, scrollable, point-width constrained, and bottom-inset aware.
- No new telemetry is needed for a visual redesign. Existing payloads and impression behavior remain unchanged.
- No new native dependency, font package, prebuild, schema migration, API service, or paid generation. No deployment, merge to main, or push is included.

## 6. Verification and handoff

Treat `docs/mvp-scope.md` as the feature-scope reference, with current `CLAUDE.md` ground truth and roadmap deviations #72–#73 resolving its older visual descriptions. Do not report intentionally gated or retired features as missing.

Implementation verification must include:

1. Test-first changes to any new pure layout/state/copy rule and the onboarding/status-bar policy. Preserve existing tests for contrast, font faces, safe areas, modal ownership, Today composition, route gates, and minimap geometry.
2. `npm run typecheck` and `npm test`, with actual exit status and counts recorded after the final code changes.
3. Simulator inspection of all four tabs and every onboarding beat in light and dark, using the account-free preview where available. Clearly label sample-data validation; it is not an authenticated HealthKit end-to-end pass.
4. Interact with the day filter, bird details/invite entry, best-day selection/share path, details sheet, appearance controls, and minimap tap/drag/accessible adjustment. No production social action or account mutation is sent as a visual check.
5. Repeat layout checks at XXXL Dynamic Type after relaunch, including the narrowest supported layout, bottom actions, name keyboard, and sheet dismissal. Check accessible grouping with simulator tooling; do not claim physical-device or TestFlight verification.
6. Record representative before/after evidence and any remaining environment limitation in the preview documentation. Update the governing surface documentation in the same implementation pass.

Handoff includes the implementation branch, a concise change summary, verification results, and a running local preview when available. Keep the selected v3 asset pack intact and leave `main` unchanged.

# Warm-pastel Kairo UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved cream, cocoa, lilac, mint, and apricot redesign across Today, Sky, Flock, You, onboarding, and shared chrome, with working interactions and both appearance schemes.

**Architecture:** Keep the existing data hooks, route gate, character resolver, and scoring engine. Change semantic theme values and reusable presentation components; extract presentation from the onboarding routes where the same view needs sample-data verification. The preview consumes production presentation with local state and never invokes account or health mutations.

**Tech Stack:** Existing Expo SDK 57, React Native 0.86, Expo Router, TypeScript, `twrnc`, TanStack Query 5, Zustand 5, MMKV, Vitest, and bundled Fredoka/Nunito. No dependency installation.

**Spec:** `docs/superpowers/specs/2026-09-11-plush-ui-redesign-design.md` — approved by the user on 2026-09-11.

## Global Constraints

- Keep the selected v3 asset pack intact and leave `main` unchanged.
- Every interactive target is at least 44 by 44 points; primary buttons retain their existing larger minimum.
- `NAV_HEIGHT` stays 96; existing screen clearance remains authoritative.
- Keep bundled Fredoka for names and important numbers, Nunito for prose and supporting labels. Font families remain declared only in `src/theme.ts`.
- Use the existing custom `Text`, never React Native `Text`; select bundled font cuts through the theme instead of `fontWeight`. Keep color literals in the theme, not component styles.
- Null is never presented as a measured zero.
- No new telemetry is needed for a visual redesign. Existing payloads and impression behavior remain unchanged.
- No new native dependency, font package, prebuild, schema migration, API service, or paid generation. No deployment, merge to main, or push is included.
- Retain `/welcome → /one-sky → /mirror → /connect → /difficulty → /privacy → /name` and the shared beat registry.
- The profile row is still inserted exactly once, on `/name`, and no question is added after that insertion.
- Runtime colors come from `useTheme()`; style factories passed to `useStyles()` are module-level constants. Do not capture static light colors in a themed view.
- Pure test modules use relative value imports and never load the UI barrel, React Native, native HealthKit, or icon runtime. Component rendering is verified on the simulator, not through root Vitest.
- Preserve contrast requirements at 4.5:1 for body text and 3:1 for large text. Update obsolete measured-value characterizations explicitly; never lower accessibility thresholds to make a palette pass.
- Component radii use `borderCurve: 'continuous'`. Keep reduce-motion behavior, explicit accessible groups, single modal leases, and safe-area ownership.
- This is one shared visual-system change, not a backend Phase 3 rollout. Preview whacks remain sample-only.

## Execution setup and baseline

Work in the existing clean checkout on `codex/plush-ui-redesign`, created from `3b3cbdb`. Do not create another worktree or switch back to main. The design spec is committed as `d56ae4b`; subsequent documentation commits may change HEAD without changing the application.

Read current `CLAUDE.md`, the approved spec, `docs/engineering/surfaces.md`, and `docs/mvp-scope.md`. Current ground truth and deviations #72–#73 supersede dated visual descriptions in the older documents. Read the React Native and Expo UI skills before implementation, TDD before pure-rule changes, and verification-before-completion before committing claims. The repository-requested frontend-design skill is not installed in the available catalog; state that and use the available Expo UI and React Native guidance as the fallback. Context7 was unavailable during planning; use installed declarations and official documentation when a dependency API needs verification.

Run a fresh baseline before the first application edit:

```bash
git status --short --branch
npm run typecheck
npm test
```

The inspected baseline passed 495 core tests and 1,715 root tests before design changes. Treat those as historical observations, not a substitute for the fresh run.

For the existing iOS development client, the working local preview command is:

```bash
NODE_OPTIONS=--dns-result-order=ipv4first EXPO_NO_DOTENV=1 EXPO_PUBLIC_UI_PREVIEW=1 npm start -- --localhost --port 8081
```

Check whether the earlier server is still running before starting another. This machine previously resolved localhost to IPv6 while the client requested IPv4; the Node flag above corrected the listener without an app change. Do not load `.env` or print secrets for sample UI work. Use the existing installed simulator client; do not run `prebuild` or an EAS build.

## File and dependency map

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| Theme/primitives | Semantic colors, restrained depth, readable controls | Existing token roles and contrast rules |
| `TabBar` | Shared visual navigation, motion, touch targets | Theme and existing `tabPillGeometry` |
| `TodayProgressHero` | Motion reading beside the character slot | Existing `TileReading`, `Diorama`, responsive policy |
| Sky presentation | Fine trail, legible markers/chrome/minimap | Unchanged core curve, flight frame, minimap math |
| Flock presentation | Compact perch and one clean board | Existing leaderboard/consent/standing hooks |
| Profile presentation | One portrait, streaks, selectable best days | Existing profile/records/share contracts |
| Onboarding views | Theme-aware beat layouts without side effects | Beat registry and injected state/callbacks |
| Preview | Shared views plus sample-only local interactions | All presentation units above |

Tasks 1–2 establish shared primitives. Tasks 3–6 consume them. Task 7 extracts and themes the onboarding views. Task 8 completes preview coverage and verification. No task changes `packages/kairo-core`, server handlers, health ingestion, or schema.

## Task 1: Warm-pastel tokens and coherent controls

**Files**

- Modify: `src/theme.ts`, `src/ui/Panel.tsx`, `src/ui/Button.tsx`, `src/ui/CtaPill.tsx`, `src/ui/Tile.tsx`, `src/ui/SegmentedControl.tsx`, `src/ui/Glass.tsx`.
- Test: `src/ui/contrast.test.ts`, new `src/ui/plush-theme.test.ts`, existing `src/ui/type-faces.test.ts`.
- Inspect: `src/ui/Glass.tsx`, `src/ui/avatar-tint.ts`, `src/ui/stat-colors.ts` for the fills held by the contrast suite.

**Interfaces**

- Consumes existing `Theme`, `Scheme`, `themes`, `colors`, `ramp`, `glass`, `shadow`.
- Produces the same exports and primitive props. Do not rename roles or change the `Theme` shape.
- `Button` continues to take `label`, `onPress`, `variant`, `disabled`, `busy`; `CtaPill` remains a non-interactive child of an existing control.

- [ ] **1. Add palette acceptance tests first.** Create `plush-theme.test.ts` with the approved anchors and text pairings:

```ts
import { describe, expect, it } from 'vitest';
import { dark, light } from '../theme.ts';
import { contrastRatio } from './contrast.ts';

describe('the plush palette', () => {
  it('uses warm grounds and a shared apricot fill', () => {
    expect(light.colors.bg.toLowerCase()).toBe('#fbf8f2');
    expect(light.colors.text.toLowerCase()).toBe('#382b29');
    expect(dark.colors.bg.toLowerCase()).toBe('#211c23');
    expect(dark.colors.surface.toLowerCase()).toBe('#302932');
    expect(dark.colors.text.toLowerCase()).toBe('#faf3eb');
    for (const theme of [light, dark]) {
      expect(theme.colors.accent.toLowerCase()).toBe('#f4af82');
    }
  });
  it('reads on the page, card, and supporting washes in either scheme', () => {
    for (const theme of [light, dark]) {
      for (const bg of [theme.colors.bg, theme.colors.surface,
        theme.ramp.sage[200], theme.ramp.teal[200]]) {
        expect(contrastRatio(theme.colors.text, bg)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(theme.ramp.sage[800], theme.ramp.sage[200]))
        .toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.colors.ink, theme.colors.accent))
        .toBeGreaterThanOrEqual(4.5);
    }
  });
});
```

Run `npx vitest run src/ui/plush-theme.test.ts`; expect failure on the old palette values.

- [ ] **2. Apply the anchored palette and complete its existing ramps.** Set these entries in the existing declarations; keep every other role present:

```ts
// Light colors entries:
bg: '#fbf8f2', surface: '#ffffff', surfaceLift: '#ffffff',
text: '#382b29', ink: '#382b29', onDeep: '#fbf8f2',
border: '#382b291f', midnight: '#211c23',
// Dark colors entries:
bg: '#211c23', surface: '#302932', surfaceLift: '#3a313d',
text: '#faf3eb', border: '#faf3eb29', midnight: '#19161c',
// Both accent ramps:
500: '#f4af82',
// Light sage/teal 200; dark sage/teal 200 respectively:
// sage: '#f0e8f8' / '#403249'; teal: '#e7f3eb' / '#263c35'.
```

Replace neutral's indigo inks with cocoa: light 600/700/800/900 = `#756761` / `#61524d` / `#4b3b35` / `#382b29`; dark 100/200/300/400/500/600/700/800/900 = `#282229` / `#342c35` / `#453a45` / `#665967` / `#958796` / `#bfb0bf` / `#d8cbd5` / `#eee2e8` / `#faf3eb`. Use light accent 100/200/300/400/600/700/800/900 = `#fff8f1` / `#faeadc` / `#f7d8bf` / `#f5bd96` / `#d48658` / `#99582f` / `#754326` / `#4f2f20`; dark 100/200/300/400/600/700/800/900 = `#30221f` / `#433026` / `#62432f` / `#f5bd96` / `#d48658` / `#efb38e` / `#f6cfb4` / `#ffe6d1`.

Soften decorative sage 400/500 to `#c9b2e9` / `#ac8bd3`, keeping sage 600 a genuinely deep fill (`#795398`) and light 700/800/900 readable (`#6e448f` / `#523564` / `#38283f`). Use warm muted dark ink steps 700/800/900 = `#ceb1e5` / `#e5d0f2` / `#f5e9fc`. Sage 500 stays identical across schemes. Keep teal's secondary-action fill deep enough for `onDeep`; use mint washes and soften decorative teal 400/500 to `#b2dcca` / `#77bba7` in both schemes. Keep gold earned, and tune coral as a soft coral-pink fill with a dark readable damage ink, not a red CTA.

Run the complete existing contrast suite after each family edit. Its old stat-hue ratio characterizations and the assertion that accent 900 *fails* on the primary fill are palette-era measurements: update those to the newly measured facts and preserve the real rule that the self avatar uses `colors.ink`. Do not force an inaccessible color to preserve an obsolete negative pairing. Keep coralEdge decorative-only, with no words added to it. Update stale numeric comments with measurements or remove the numeric assertion from prose; do not retain claims about old hex values.

- [ ] **3. Flatten excessive depth without changing control behavior.** Use the following style changes:

```ts
// shadow entries in theme.ts; preserve their existing shape and names.
sm: { shadowColor: ramp.neutral[900], shadowOpacity: 0.05,
  shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
md: { shadowColor: ramp.neutral[900], shadowOpacity: 0.07,
  shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
lg: { shadowColor: ramp.neutral[900], shadowOpacity: 0.12,
  shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
// Button fill styles, leaving behavior and accessible names untouched:
primary: { backgroundColor: colors.accent },
secondary: { backgroundColor: colors.teal },
```

Use cocoa/plum translucent fills for `glass.dark` and the dark theme's `glass.light`, with enough opacity for text over scenery. Preserve `Glass` as a fill, not a blur. Keep Button's minimum at least its existing 54 points and ensure its busy indicator takes the same ink as its label (including secondary). Add continuous corners to existing CtaPill/Panel edges. Keep destructive action confirmation and styling distinct. Remove caption truncation in `Tile`; its container must grow instead of dropping the second half of a reading. Use `font` spreads rather than new font-family declarations.

Simulator refinement during Task 1: remove Glass's lower-half white fade starting at 45%; it draws a hard horizontal band through sheet content. Preserve fill, edge, shadow, radius, and public API, with sufficient fill opacity for text. This is paint-only within the approved flat surface direction.

- [ ] **4. Verify automated and visual behavior.** Run:

```bash
npx vitest run src/ui/plush-theme.test.ts src/ui/contrast.test.ts src/ui/type-faces.test.ts
npm run typecheck
```

Inspect existing preview cards and primary/secondary buttons in both themes. Check disabled/busy labels, selected segments, and raised sheets; document any pairing that requires a token adjustment.

- [ ] **5. Commit only this unit after verification.**

```bash
git add src/theme.ts src/ui/Panel.tsx src/ui/Button.tsx src/ui/CtaPill.tsx src/ui/Tile.tsx src/ui/SegmentedControl.tsx src/ui/contrast.test.ts src/ui/plush-theme.test.ts
git diff --cached --check
git commit -m "feat(ui): establish the warm-pastel theme"
```

## Task 2: One shared, quieter tab bar

**Files**

- Create: `src/ui/TabBar.tsx`, `src/ui/tab-copy.ts`, `src/ui/tab-copy.test.ts`.
- Modify: `src/ui/TabPill.tsx`, `src/features/preview/MobilePreview.tsx`.
- Test: `src/ui/tab-pill-geometry.test.ts`, `src/ui/motion-policy.test.ts`.

**Interfaces**

- `TAB_ITEMS` is a readonly registry with `id: 'index' | 'sky' | 'flock' | 'profile'`, `label`, and existing icon names.
- `TabBar({ value, onChange, bottomInset })` renders those four items; `value` and callback use `TabId`. It owns the existing measured selection-pill animation.
- `TabPill` remains the Expo Router adapter and exports `NAV_HEIGHT = 96`. It observes `navHidden` and maps navigation state to `TabBar`.
- Preview maps `today` to `index` and `you` to `profile`, with the reverse mapping on selection. No fake navigation object is constructed.

- [ ] **1. Test the registry before extracting it.**

```ts
import { expect, it } from 'vitest';
import { TAB_ITEMS } from './tab-copy.ts';
it('keeps the four routes and player-facing names', () => {
  expect(TAB_ITEMS.map(({ id, label }) => [id, label])).toEqual([
    ['index', 'Today'], ['sky', 'Sky'], ['flock', 'Flock'], ['profile', 'You'],
  ]);
});
```

Run `npx vitest run src/ui/tab-copy.test.ts`; expect missing-module failure. Implement the registry using the current `white-balance-sunny`, `weather-windy`, `account-multiple`, and `account` icons, with no new family.

- [ ] **2. Extract the presentation and wire both adapters.** Move the existing TabPill measurement, reduced-motion handling, and animated pill into `TabBar`; replace navigation calls with `onChange(item.id)`:

```ts
export type TabId = 'index' | 'sky' | 'flock' | 'profile';
export interface TabBarProps {
  value: TabId;
  onChange: (value: TabId) => void;
  bottomInset: number;
}
// TabPill adapter after resolving the focused route:
// <TabBar value={focusedId} bottomInset={insets.bottom}
//   onChange={(id) => navigation.navigate(id)} />
```

Keep all four visible labels. Use equal item widths (`focusedFlex = 1` in the existing geometry helper), a 68-point bar, and a compact selected wash using `ramp.sage[200]` with `ramp.sage[800]` ink. Do not shrink the touchable to the drawn icon badge. Retain the short selection motion and instant transitions before Reduce Motion resolves. Keep bottom placement inside the current 96-point clearance.

- [ ] **3. Replace preview-only navigation markup with TabBar.** Use explicit maps:

```ts
const previewToRoute = { today: 'index', sky: 'sky', flock: 'flock', you: 'profile' } as const;
const routeToPreview = { index: 'today', sky: 'sky', flock: 'flock', profile: 'you' } as const;
// <TabBar value={previewToRoute[tab]} bottomInset={insets.bottom}
//   onChange={(id) => setTab(routeToPreview[id])} />
```

Remove the independent 80-point preview bar and duplicated icon/label styles. Keep `setNavHidden(onboarding)` and its cleanup. `Screen` still reads clearance from the exported `NAV_HEIGHT`.

- [ ] **4. Verify.** Run registry/geometry/motion tests and typecheck. In the simulator select every tab in both themes, inspect selected accessibility state, and check a 320-point layout with large labels. Confirm no bar overlap with final content.

- [ ] **5. Commit.** Stage only the five created/modified files above and commit as `feat(ui): share the pastel tab bar with the preview` after `git diff --cached --check`.

## Task 3: Today progress-and-character hero

**Files**

- Create: `src/features/character/TodayProgressHero.tsx`, `src/features/character/dashboard-layout.ts`, `src/features/character/dashboard-layout.test.ts`.
- Modify: `src/features/character/TodayBoard.tsx`, `src/features/character/TodayHud.tsx`, `src/features/character/TodayNextStep.tsx`, `src/features/character/Diorama.tsx`, `src/ui/GroundShadow.tsx`, `src/theme.ts`, `app/(tabs)/index.tsx`, `src/features/preview/TodayPreviewScreen.tsx`.
- Test: `src/features/character/today-composition.test.ts`, `src/features/character/today-board.test.ts`, `src/features/character/living-mirror.test.ts`, `src/features/character/living-reaction.test.ts`, `src/features/character/level-response.test.ts`.

**Interfaces**

- `stackDashboard(width: number, fontScale: number): boolean` controls paired layout only; no health/state dependencies.
- `TodayProgressHero({ motion, character })`: `motion: TileReading`, `character: ReactNode`.
- `TodayTiles({ body, mind })` renders supporting readings only. Remove its `motion` prop at both callers.
- `Diorama` retains every existing required prop and its character selection; only its scenery changes.

- [ ] **1. Write and run responsive/composition tests first.**

```ts
import { describe, expect, it } from 'vitest';
import { stackDashboard } from './dashboard-layout.ts';
describe('dashboard layout', () => {
  it.each([[320, 1, true], [369, 1, true], [370, 1, false],
    [393, 1.25, false], [393, 1.26, true], [440, 2, true]])(
    'width %i at scale %f stacks: %s', (width, scale, expected) => {
      expect(stackDashboard(width, scale)).toBe(expected);
    });
});
```

Extend the existing source scan to require `<TodayProgressHero`, retain `<Diorama`, `<TodayNextStep`, `<TodayTiles`, `<QuestRows`, and `<TodayDetailsSheet`, and inspect `TodayBoard.tsx` to ensure no `motion: TileReading` remains in `TodayTiles`. Preserve every existing business-rule exclusion. Run the two tests; expect missing helper/hero failures.

- [ ] **2. Implement the layout policy and focused hero.**

```ts
export function stackDashboard(width: number, fontScale: number): boolean {
  return width < 370 || fontScale > 1.25;
}
```

The hero uses `useWindowDimensions()`, `stackDashboard`, `useStyles`, and a `Panel` with `marginTop: 0`. A flowing row becomes a column when stacked. Its reading column is one accessible group; the character remains a separate accessible image. Use this composition inside the Panel:

```tsx
<View style={[styles.content, stacked && styles.stacked]}>
  <View accessible accessibilityLabel={motion.label} style={styles.reading}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text scale="chrome" style={styles.eyebrow}>{motion.eyebrow}</Text>
      <Text scale="fixed" style={styles.figure} numberOfLines={1}
        adjustsFontSizeToFit minimumFontScale={0.8}>{motion.figure}</Text>
      {motion.unit && <Text scale="chrome" style={styles.unit}>{motion.unit}</Text>}
      {motion.fraction !== null &&
        <Meter fraction={motion.fraction} color={colors.accent} height={8} />}
      {motion.caption && <Text style={styles.caption}>{motion.caption}</Text>}
    </View>
  </View>
  <View style={[styles.character, stacked && styles.characterStacked]}>{character}</View>
</View>
```

Use `content: { flexDirection: 'row', alignItems: 'center', gap: space.md }`, `stacked: { flexDirection: 'column', alignItems: 'stretch' }`, `reading: { flex: 1, minWidth: 0 }`, `character: { width: 148 }`, and `characterStacked: { width: '100%' }`. The figure uses the display hero font at 44 points; caption uses prose with wrapping and no line cap. The character slot renders Diorama at 208 points high, giving the bird about 125 points of height without taking a full independent screen card. Use the soft sky palette; no numeric progress is calculated inside the hero.

- [ ] **3. Wire production and preview, then quiet scenery.** Wrap each existing Diorama JSX tree as `character={...}` and pass its existing derived Motion reading to the hero. Keep the entire real character prop set, including dominance/lifetime points, crest, reaction, Body, and figure label. Move no hooks or effects into the hero.

Remove Motion from `TodayTiles` and its callers. Apply the same `stackDashboard(width, fontScale)` policy to the Body/Mind pair. Use coral and lilac accent details on white cards rather than saturated full cards. Reduce the gap above the next-step line; keep the details action at least 44 points high. Keep the date/name and level/streak header in flow and allow wrapping.

Replace `dioramaSky` stops with soft sky-to-page values in both schemes. Use `ramp.sky[200]`/`ramp.sage[100]` for light scenery and their dark equivalents; the crest variant uses the existing gold wash and remains paired with the ceiling line. Remove the three large clipped cloud bars and use at most two subdued clouds. In `GroundShadow.tsx`, adjust only the ring's painted thickness/opacity; do not change `auraStrength`, `figureResponse`, Body weight, or the visibility predicate.

- [ ] **4. Verify.** Run the listed tests and typecheck. In the simulator inspect Today ready/empty/private/error/loading, light/dark, and enlarged text. Confirm Motion appears once, its figure and progress are in the first normal-size viewport, captions do not truncate, and the details action works. Check the character at an early level and at ridge/ceiling states without substituting a different asset or changing rules.

- [ ] **5. Commit.** Stage the explicit Task 3 files that changed, run `git diff --cached --check`, and commit as `feat(today): pair daily progress with the plush eagle`.

## Task 4: A finer Sky trail and quieter navigation chrome

**Files**

- Modify: `src/features/squad/SkyCorridor.tsx`, `SkyControls.tsx`, `SkyMarker.tsx`, `SkyFlockRail.tsx`, `SkyMinimap.tsx`, `SkyStanding.tsx` in the same directory; `src/theme.ts`, `app/(tabs)/sky.tsx`, `src/features/preview/SkyPreviewScreen.tsx`.
- Create: `src/features/squad/sky-trail.ts`, `sky-trail.test.ts` for normalized-to-rendered tangent projection, added after simulator evidence below.
- Test: `src/features/squad/minimap.test.ts`, `flight-frame.test.ts`, `race-label.test.ts`, `sky-reading.test.ts` in that directory.

**Interfaces**

- Preserve `SkyCorridor({ width, progress, children })` and all existing minimap props.
- Preserve `flightFrame`, `miniPath`, `miniRacers`, `viewportWindow`, `offsetForMapY`, `raceProgress`, `pointAt`, and `placeRacers` unchanged.
- `SkyControls` retains its inline `expanded` state and `onLocate` callback.

- [ ] **1. Record the current visual failure and lock the existing invariants.** Save a baseline view of the thick beaded trail. Run all four listed tests before edits. Confirm the minimap source still declares a 44-point-or-larger interaction width and the route still passes measured `chromeBottom` to `flightFrame`.

- [ ] **2. Change paint, not progression.** In `SkyCorridor.tsx` use:

```ts
const SEGMENTS = 72;
const BAND = 12 / 393;
// Keep the existing arc-length samples, tangent angles, pathLength,
// progress clamp, and children placement. Retain overlapping segments.
```

Give the segment's existing style `borderCurve: 'continuous'`. Use `ramp.neutral[300]` for the future path and `colors.accent` for traveled segments, with a low-contrast supporting backdrop but readable labels outside it. Keep the ridge mark earned gold and wide enough to remain visible despite the thinner trail; do not derive its width from a 12-point stroke if that makes it disappear.

Implementation refinement from simulator evidence: the legacy normalized tangent is not the physical tangent after the tall drawing-box projection, causing rope-like thin capsules. Keep core `angleAt`, points, arc sampling, path length, placements and progression unchanged; project the tangent into the box aspect ratio in a small tested presentation helper. This supersedes retaining the unprojected segment rotation above. Test agreement with finite differences of rendered points, including bends/endpoints and vertical direction, then visually verify smoothness.

Set the `flightSky` stops in `theme.ts` to a soft daylight range (sky 200 → sage 100 → cream) and a dark muted range (night → dark sky 200 → dark page). Remove hard saturated cyan/orange ends. Keep the drawing box, top inset, viewport clamping, and scroll position untouched.

- [ ] **3. Retheme the chrome consistently.** For SkyControls and the flock rail use `Glass tone="light"` and `colors.text`/`colors.subtle`, so the ground follows the selected scheme. Change fixed `onDeep` labels only when their ground changes; retained deep chips keep `onDeep`. The compact controls use `space.sm` vertical padding and the existing 48-point icon targets. Keep the explanatory text in flow below the control row when `expanded` is true.

Give the minimap a readable lifted ground, family-ink viewport outline, and separated self/rival dots. Retain its existing PanResponder, animated viewport interpolation, accessibility actions, and at-least-44-point width. Keep the pinned rail and foot measurements; do not hard-code their height after restyling.

- [ ] **4. Verify.** Re-run the four tests and typecheck. In both schemes tap the top/middle/bottom of the minimap, drag it, adjust it through accessibility actions, use Locate, and open/close the explanation. Check ready, solo, empty, and private fixtures at normal and XXXL text. Confirm the ridge never disappears under the rail and null-step members have no invented position.

- [ ] **5. Commit.** Stage only changed Task 4 files, run `git diff --cached --check`, and commit as `feat(sky): soften the flight and refine its minimap chrome`.

## Task 5: Compact Flock perch and readable board

**Files**

- Modify: `src/features/squad/FlockPerch.tsx`, `Leaderboard.tsx`, `LeaderboardRow.tsx`, `FlockStrip.tsx`, `LockedSlot.tsx`, `PerchBirdSheet.tsx`, `SoloBoard.tsx`; `src/features/preview/FlockPreviewScreen.tsx`.
- Test: `src/features/squad/perch-copy.test.ts`, `row-label.test.ts`, `standing.test.ts`, `flock-walk.test.ts`, `slots.test.ts`, `invite-code.test.ts`.

**Interfaces**

- Preserve `PerchMember`, FlockPerch callbacks, Leaderboard hook ownership, and PerchBirdSheet's modal lease.
- Keep `useState<LeaderboardMode>('current')` in Leaderboard and existing local `selectedBird` state. Do not duplicate the query into FlockPerch.

- [ ] **1. Check the current visual baseline and guard states.** Run the listed pure/source tests. In the preview inspect Today/Yesterday, a squad of one, and private readings. Note the header/perch height before changing it.

- [ ] **2. Compact the perch without clipping the roster.** Update the existing layout values:

```ts
// FlockPerch member button style:
width: 96,
minHeight: 152,
borderRadius: radius.lg,
borderCurve: 'continuous',
backgroundColor: member.is_self ? ramp.accent[200] : ramp.sage[100],
// CharacterFigure remains compact with identical data; height becomes 84.
// Header padding: topInset + space.md; roster top spacing: space.md.
```

Keep a horizontal roster so all members remain reachable. Retain the existing `members.length > 1` leader guard, crown, whack marker when supplied, and one trailing invite. Use a 3-point muted perch rule rather than the current 8-point bar. Names may wrap to two lines inside their item; do not shrink the whole interaction below 44 points.

- [ ] **3. Establish the board hierarchy.** Place the day segment before the mode-dependent walk summary. Keep program/date copy near the board. Reduce the walk summary card to a quiet compact surface and make the leaderboard itself the dominant white/lifted card. Rows keep a gold leader rule and an apricot self wash, including when both apply. Replace nested card-like row backgrounds with spacing and subtle separators; keep row accessibility labels unchanged.

Maintain pending/error/retry branches, mixed-date explanation, solo observation, reciprocal consent, leave confirmation, invite-code fitting, and the single consolidated LockedSlot. Apply the same presentation order to FlockPreviewScreen, but keep its sample send state local. Do not wire `onWhack` into the live Leaderboard without a backend; its absence is intentional.

Native baseline refinement: move the preview's existing sample invitation disclosure directly below the perch while open, keeping its local copy/close behavior. Its previous position after the entire board was offscreen and made the perch Invite button appear inert. Live invitation/share behavior and the normal day→summary→board order remain unchanged.

- [ ] **4. Verify.** Re-run listed tests and typecheck. Select both days and confirm the summary follows the same day. Open/close a bird sheet, inspect its grouping, test the sample-only action, and open/dismiss invite UI without sending. At XXXL, verify sheet Close and all roster names remain reachable; withheld readings remain unknown and a solo board announces no rank.

- [ ] **5. Commit.** Stage changed Task 5 files, check the staged diff, and commit as `feat(flock): compact the perch and clarify the board`.

## Task 6: One profile header and calmer personal progress

**Files**

- Modify: `src/features/profile/ProfileHeader.tsx`, `StreakCard.tsx`, `RecordsCard.tsx`, `GrowthCard.tsx`, `ClearedCalendar.tsx`; `app/(tabs)/profile.tsx`, `src/features/preview/YouPreviewScreen.tsx`.
- Create: `src/features/profile/profile-header-copy.ts`, `profile-header-copy.test.ts`.
- Test: `src/features/profile/record-copy.test.ts`, `share-copy.test.ts`, `shield-note.test.ts`, `month-grid.test.ts`, `src/ui/bleed-inset.test.ts`.

**Interfaces**

- Keep ProfileHeader's existing identity props and add optional `onSettings?: () => void`. Remove its `useRouter` dependency; render the control only when a callback is supplied.
- The real route supplies `onSettings={() => router.push('/settings')}`. The preview supplies a callback opening a clearly labeled local preview-controls panel, not a dead button or account route.
- `profileHeaderLabel({ name, species, level, toNext, joined })` returns the combined identity label; `joined` is `string | null`.
- RecordsCard retains `selectedStat` and the real `BestDayShareButton` behavior.

- [ ] **1. Add the identity-label test first.**

```ts
import { expect, it } from 'vitest';
import { profileHeaderLabel } from './profile-header-copy.ts';
it('speaks identity once and does not invent a join date', () => {
  const label = profileHeaderLabel({ name: 'Dagit', species: 'A Philippine eagle',
    level: 12, toNext: 380, joined: null });
  expect(label).toBe('Dagit. A Philippine eagle. Level 12. 380 XP to the next.');
  expect(label).not.toMatch(/undefined|null|Joined/);
});
```

Run that test and expect the new module to be absent. Implement the function with the supplied strings and `toNext.toLocaleString('en-US')`; append `joined` only when present. Use type-only inputs and no native imports. Keep the species phrase supplied by the existing species registry rather than adding a second in-app copy.

- [ ] **2. Compose one shared identity.** Keep the top safe-area row and its 44-point gear. Center a single roughly 112-point portrait inside a lilac wash, then name, species, joined metadata, and the existing XP progress. Place the XP ring around that portrait at 3-point thickness rather than adding another bird or another separate progress card. At large type allow all metadata to wrap.

Make the identity container one accessible group using the tested label and hide its direct visual children. Include joined metadata in that label before hiding it; the current implementation hides the word column separately from the labeled image, which is not a reason to drop a fact from the spoken reading.

Delete the duplicated header JSX in YouPreviewScreen and pass its sample values into ProfileHeader. Add its local `useState(false)` preview-controls disclosure and use existing preview copy for the explanatory content; do not persist a real setting from that panel.

- [ ] **3. Simplify the cards and retain real state.** Give StreakCard two calm figures and a wrapping shield note; a banked shield uses earned gold detail, while below-minimum/recharging copy still comes from `shieldNote`. In RecordsCard keep `useState<CoreStat>('AGI')`, the fallback to the first actual record, error/loading/empty branches, and the selection accessibility state. Make unselected rows transparent inside one Panel, selected rows a soft apricot wash with a restrained selection border. Keep at least 64-point rows and the existing Share button.

Keep GrowthCard as an explanation, not a new reward. Reduce competing chips, allow text to wrap, and leave `StatRail` and the route's `railOpen` disclosure gate intact. Keep the cleared calendar's meanings and month arithmetic unchanged; add continuous corners where the touched styles lack them.

- [ ] **4. Verify.** Run the listed tests and typecheck. Inspect normal/empty/error views in both themes, select each available best day, open and cancel the native share sheet without sending, toggle the real expanded detail where eligible, and confirm Settings is reachable. At XXXL check the portrait/header, shield line, calendar, and long names without clipped text or overlapping controls.

- [ ] **5. Commit.** Stage changed Task 6 files, check the staged diff, and commit as `feat(profile): center personal progress around the plush eagle`.

## Task 7: Theme-aware, previewable onboarding views

**Files**

- Create under `src/features/onboarding/`: `OnboardingFrame.tsx`, `OneSkyScreen.tsx`, `MirrorScreen.tsx`, `ConnectScreen.tsx`, `DifficultyScreen.tsx`, `PrivacyScreen.tsx`, `NameScreen.tsx`, `onboarding-screen-copy.ts`, `onboarding-screen-copy.test.ts`.
- Modify in that directory: `WelcomeScreen.tsx`, `OnboardingChrome.tsx`, `OnboardingCta.tsx`, `HatchingBeat.tsx`.
- Modify routes: `app/(onboard)/one-sky.tsx`, `mirror.tsx`, `connect.tsx`, `difficulty.tsx`, `privacy.tsx`, `name.tsx`; keep `welcome.tsx` as its existing thin adapter.
- Modify: `src/ui/status-bar-tone.ts`, `src/ui/status-bar-tone.test.ts`, `src/features/privacy/claim-surfaces.test.ts` only when needed to keep its rendering assertions bound to the actual shared view, `src/theme.ts` for remaining authored field colors.
- Test: existing onboarding beat registry, answers, calibration copy, hatching window, welcome copy; privacy claims and telemetry payload scans.

**Interfaces**

The presentation views have no session, router, Supabase, health, tracking, or answer-store imports. Each receives `beat: OnboardingBeat` plus these props:

```ts
type Back = { onBack: () => void };
type Continue = { onContinue: () => void };
type OneSkyScreenProps = Back & Continue & { onSkip: () => void };
type MirrorScreenProps = Back & Continue;
type ConnectScreenProps = Back & Continue & {
  supportsPermission: boolean; phase: 'asking' | 'revealed';
  busy: boolean; failed: boolean; steps: number | null;
  privacyCopy: string; onConnect: () => void;
};
type DifficultyScreenProps = Back & Continue & {
  chosen: QuestTier | null; onChoose: (tier: QuestTier | null) => void;
  note: CalibrationNote | null;
};
type PrivacyScreenProps = Back & Continue & {
  shareTotals: boolean; onShareTotalsChange: (value: boolean) => void;
  healthCopy: string; sharingCopy: string; onPolicy: () => void;
};
type NameScreenProps = Back & {
  name: string; onNameChange: (name: string) => void;
  valid: boolean; busy: boolean; error: string | null;
  onSubmit: () => void;
};
```

`QuestTier` comes from `@kairo/core` as a type; `CalibrationNote` comes from the existing calibration-copy module. Define each exported view's props in its own file, intersecting `{ beat: OnboardingBeat }`; the short Back/Continue notation above names existing callback shapes, not a new generic framework.

`OnboardingFrame({ beat, onBack?, onSkip?, children, footer? })` owns the `Screen` root, one top inset, shared rail, wrapping content, and footer spacing. It takes `ReactNode` children/footer and does not choose navigation or change a beat. NameScreen retains a keyboard-avoiding wrapper around its frame and handled keyboard taps.

- [ ] **1. Write the scheme-policy test before changing the rule.** Replace the old fixed-onboarding assertions with:

```ts
it('lets every onboarding beat follow the selected appearance', () => {
  for (const path of ['/welcome', '/one-sky', '/mirror', '/connect',
    '/difficulty', '/privacy', '/name']) {
    expect(surfaceScheme(path, 'light')).toBe('light');
    expect(surfaceScheme(path, 'dark')).toBe('dark');
    expect(statusBarTone(path, false)).toBe('dark');
    expect(statusBarTone(path, true)).toBe('light');
  }
});
```

Keep sign-in's current fixed-light policy. In the redesign all onboarding top chrome uses the scheme's page ground, so there is no fixed-deep exception left at the status bar. Run `npx vitest run src/ui/status-bar-tone.test.ts`; expect failure on the old fixed-light and deep-beat policy.

- [ ] **2. Implement the shared frame and theme policy.** Reduce `FIXED_LIGHT_ROUTES` to `'/sign-in'` and remove `DEEP_BEATS`; retain the same `surfaceScheme` and `statusBarTone` signatures:

```ts
export function statusBarTone(pathname: string, dark: boolean): 'light' | 'dark' {
  return surfaceScheme(pathname, dark ? 'dark' : 'light') === 'dark' ? 'light' : 'dark';
}
```

The existing root ThemeScope will now select the right theme without a new provider. Remove WelcomeScreen's forced `ThemeScope scheme='light'` and `Screen tone='dark'`. Convert shared chrome, dots, CTA, and hatching styles to `useTheme`/module-level `useStyles`. Make the rail's default ink follow the page; preserve an explicit inverse-tone option only for existing callers still on an intentional deep panel. Bright CTA uses `colors.ink`; deep CTA uses `colors.onDeep`; translucent CTA uses the theme's readable surface ink. Remove hard lips and keep its 62-point minimum plus two-line labels.

Frame composition:

```tsx
<Screen bleed>
  <View style={[styles.page, { paddingTop: insets.top + space.md }]}>
    <OnboardingRail filled={beat.filled} partial={beat.partial}
      onBack={onBack} onSkip={onSkip} />
    <View style={styles.content}>{children}</View>
    {footer && <View style={styles.footer}>{footer}</View>}
  </View>
</Screen>
```

Use `page: { paddingHorizontal: space.lg, gap: space.lg }`, wrapping child Views, and no fixed-height content cage. The Screen owns bottom clearance; the onboarding shell already hides navigation. The preview must set `navHidden` while a beat is shown. Expose `keyboardShouldPersistTaps` on Screen only if needed for NameScreen, with its default unchanged; otherwise keep NameScreen's existing handled ScrollView and avoid a nested scroll container.

- [ ] **3. Extract layout without moving effects or private state.** Move each route's rendered content and styles to the named view. Keep `useBeatImpression`, session reads, navigation callbacks, calibration seeding, connect timers/refs, name validation, and profile creation in the routes. Connect keeps its `phase === 'hatching'` branch and its current HatchingBeat; the asking/revealed view receives only ready presentation values.

Examples of the route boundary:

```tsx
<PrivacyScreen beat={beat} shareTotals={shareTotals}
  onShareTotalsChange={setShareTotals}
  healthCopy={PRIVACY_CLAIM.healthRequired}
  sharingCopy={PRIVACY_CLAIM.sharingTotals}
  onBack={() => router.back()} onContinue={() => router.push('/name')}
  onPolicy={() => void Linking.openURL(PRIVACY_POLICY_URL)} />

<NameScreen beat={beat} name={name} onNameChange={setName}
  valid={valid} busy={createProfile.isPending}
  error={createProfile.error?.message ?? null}
  onBack={() => router.back()} onSubmit={submit} />
```

The existing privacy-policy control currently points to `/progress`, which the profile gate cannot make a privacy page. Use the already-established `PRIVACY_POLICY_URL` from `src/features/support/links.ts`, as Settings does; this repairs that control's stated action without adding a route, schema, or claim. Add an assertion to the existing privacy surface test that the route uses that URL and no longer routes its policy control to `/progress`.

Move unchanged non-claim route copy to `onboarding-screen-copy.ts`. Keep privacy claims in `claim-copy.ts`, calibration sentences in `calibration-copy.ts`, button labels in `beatCta(beat)`, and sample quest targets derived from the existing catalogue. Test the moved copy for engine-key/retired-word bans and equality to any engine constant it names. Do not clone those rules into a second privacy test suite.

Refresh visuals: welcome shows one idle eagle, OneSky uses a compact real corridor, Mirror shows one quiet eagle, Connect a soft character/reading illustration, Difficulty flat selectable cards, Privacy two readable surfaces with the existing switch, and Name one canonical v3 portrait and input. Remove old navy/cyan bands, static light colors, nested large panels, and unsupported ornamental rewards. Input focus and optional explanation remain inline local state; chosen difficulty/share consent remain route-owned answers.

- [ ] **4. Verify before committing the extraction.** Run:

```bash
npx vitest run src/ui/status-bar-tone.test.ts src/features/onboarding src/features/privacy/claim-surfaces.test.ts
npm run typecheck
```

Run `npx vitest run src/features/telemetry/telemetry-payloads.test.ts`; keep its emitting-route list intact. A moved pure view must emit nothing. Confirm source reads still show one profile insertion, the same beat navigation destinations, and unchanged hatching/calibration predicates. The policy-link correction is the explicitly named exception, not a new onboarding destination. Do not test by granting real health access or creating an account.

- [ ] **5. Commit.** Stage the explicit Task 7 files that changed (including Screen only if its keyboard prop was required), check the staged diff, and commit as `feat(onboarding): share soft themed beat layouts`.

## Task 8: Complete preview coverage, verify, and document

**Files**

- Create: `src/features/preview/OnboardingPreviewScreen.tsx`, `src/features/preview/onboarding-preview.ts`, `src/features/preview/onboarding-preview.test.ts`.
- Modify: `src/features/preview/MobilePreview.tsx`, `preview-copy.ts`, `preview-data.ts`, `preview-data.test.ts` in that directory; `docs/engineering/mobile-screen-preview.md`, `docs/engineering/surfaces.md`, `docs/user-journey.md`, `README.md`, and current-state sections in `CLAUDE.md`.
- Modify fixture consumers as needed: `TodayPreviewScreen.tsx`, `SkyPreviewScreen.tsx`, `FlockPreviewScreen.tsx`, `YouPreviewScreen.tsx` in the preview directory. Today currently hardcodes walk/idle and the adapters hardcode names; the approved real-resolver/long-name cases must reach those consumers, without changing live routes.
- Update: this implementation plan with checked steps and actual verification results.
- Native keyboard QA refinement: `NameScreen.tsx` may receive optional `keyboardVerticalOffset?: number` default0. The preview passes its measured window offset below both toolbars; production retains offset0. This compensates KeyboardAvoidingView's parent-local frame versus screen-absolute keyboard coordinate without hiding preview controls or changing account behavior.
- Native ground-label QA refinement: shared `SkyMarker.tsx` may use a tested pure `sky-marker-label.ts` policy to place its pill above the unchanged bird when the remaining box tail cannot clear the tab bar. Live and preview Sky callers pass their existing inset+TAB_PILL_CLEARANCE. No path, frame, minimap, placement or scoring arithmetic changes.
- Native AXXXL long-name refinement: `FlockPerch.tsx` uses minWidth96 and unclamped name text bounded at144pt, instead of Task5's fixed width/two-line cap. Long cards grow in flow and remain horizontally reachable; short names retain the compact minimum. Add a focused contract test plus simulator verification.

**Interfaces**

- `PREVIEW_BEATS` is derived from `ONBOARDING_BEATS.filter(beat => beat.route !== null)`, excluding hatching as a route.
- `previewBeatAfter(index: number): number` advances with a bound at the last beat; completion returns to the tab preview through a callback, not account navigation.
- `OnboardingPreviewScreen({ onComplete })` owns local beat index, sample connection phase, sample name, chosen quest tier, and share-totals toggle. It mounts the production views from Task 7, not copies of their markup.
- Preview-only controls use the canonical ThemeScope and never call the real appearance store, permission connector, router gate, profile writer, or telemetry emitter.

- [x] **1. Test the fixture navigation and boundaries first.**

```ts
import { expect, it } from 'vitest';
import { PREVIEW_BEATS, previewBeatAfter } from './onboarding-preview.ts';
it('previews exactly the real seven routes and does not invent a hatch route', () => {
  expect(PREVIEW_BEATS.map(beat => beat.route)).toEqual([
    '/welcome', '/one-sky', '/mirror', '/connect', '/difficulty', '/privacy', '/name',
  ]);
  expect(previewBeatAfter(0)).toBe(1);
  expect(previewBeatAfter(6)).toBe(6);
});
```

Run the test, confirm the new module is missing, then implement the registry derivation and `Math.min(PREVIEW_BEATS.length - 1, Math.max(0, index + 1))`. Keep route callbacks out of the pure module.

- [x] **2. Mount every shared onboarding view with safe local state.** Use inline hooks:

```ts
const [index, setIndex] = useState(0);
const [phase, setPhase] = useState<'asking' | 'revealed'>('asking');
const [chosen, setChosen] = useState<QuestTier | null>(null);
const [shareTotals, setShareTotals] = useState(false);
const [name, setName] = useState('');
const next = () => setIndex(current => previewBeatAfter(current));
const back = () => setIndex(current => Math.max(0, current - 1));
```

Use `beat = PREVIEW_BEATS[index]` with a checked fallback to the first registry entry; sample Connect calls `setPhase('revealed')` with a visibly labeled sample step reading, never `connectHealth`. Name uses `isValidCharacterName(name)` from `@kairo/core` and completes via `onComplete`, never profile creation. Skip follows the existing `onboardingSkipTarget()` registry result by finding that beat in PREVIEW_BEATS. Add a preview-only beat chooser so all seven can be checked directly and going back never requires a real account. The hatching panel may be inspected as a sample phase but must not be advertised as an eighth route.

Use existing `PRIVACY_CLAIM` values as passed props; do not hand-write a claim in preview copy. A preview policy callback may open the public policy URL, with no submission. All simulated answers remain local and the toolbar states that explicitly.

- [x] **3. Correct the preview safe-area boundary and cover representative states.** The toolbar already consumes `insets.top`. Wrap the screen canvas in `SafeAreaInsetsContext.Provider` with `{ ...insets, top: 0 }`, leaving real route padding unchanged. This export was verified in `node_modules/react-native-safe-area-context/src/index.tsx` and `src/SafeAreaContext.tsx`. This removes the sample preview's double top gap without a production safe-area workaround.

Keep bottom insets/clearance and the canonical TabBar. Add sample long-name, ridge/ceiling, and no-sleep readings using existing pure resolvers, not manually contradictory character poses. Update preview-data tests so a cleared-day sample reaches `summit` through the real resolver. Continue showing loading/error/private fixtures where each has a real meaning; don't label a measured zero private.

- [x] **4. Run the complete verification matrix.** Automated commands:

```bash
npm run typecheck
npm test
git diff --check
```

Record actual exit codes and test counts after the final code edit. No result from a previous task is the final verification. Inspect the diff for package/native/backend/asset changes; all must be absent unless separately approved.

Simulator checks in both schemes:

| Surface | Required interactions and checks |
| --- | --- |
| Today | First-viewport reading, details, all three quests, absent readings, ridge/ceiling/reaction presentation |
| Sky | Scroll, minimap tap/drag/accessible adjustment, Locate, explanation, solo/private/ghost states, ridge below measured rail |
| Flock | Today/Yesterday summary, all roster birds, one invite, solo/no-rank state, private readings, bird sheet dismissal |
| You | Shared portrait/header, Settings affordance, best-day selection, open/cancel native Share, shield branches, calendar |
| Onboarding | All seven shared views, Back/Skip, sample connection states, quest choice, privacy switch, name keyboard, disabled/busy/error controls |
| Shared | Every tab, button labels, pressed/disabled/busy states, sheet boundaries, reduced motion |

Repeat at XXXL Dynamic Type after relaunch; verify at a narrow 320-point layout as well as the installed iPhone simulator. Record original text size and restore it after the test. Use available simulator UI tooling; do not claim Accessibility Inspector or physical-device verification unless actually performed. If a tool cannot perform a check, document that precise limitation rather than using a green unit suite as visual evidence.

Open/cancel share sheets but do not select a recipient. Do not submit the real name step, send a real invite/whack, mutate consent, or grant health access during preview QA. If authentic end-to-end verification needs an account, report it as separate work requiring the user's test-account direction.

- [ ] **5. Review, document, and hand off.** Use requesting-code-review before integration; follow that skill's bounded reviewer instructions if available and inspect the review against actual diffs. Fix findings with targeted tests, re-run full verification after fixes, and only then mark tasks checked.

Update governing docs with the new palette, combined Today hero, unchanged Sky math, themed onboarding, preview coverage, and exact verification limits. Read writing-for-agents before editing CLAUDE.md; update current-state rules and mark superseded visual eras as history, not competing current instructions. Update user-journey only for changed visible layout/policy-link behavior, not gameplay semantics. Do not auto-sync Notion.

Commit verified application/docs changes with an explicit file list, leaving main unchanged. Hand off the branch, concise change summary, link to preview instructions, actual tests, and a running local preview if available. No automatic merge, push, deployment, or new image generation.

## Plan self-review

- Spec sections 1–2: Tasks 1–2 cover palette, controls, nav, native limits, and existing architecture.
- Spec section 3: Tasks 3–7 cover every requested screen, including all onboarding beats.
- Spec section 4: Exact component boundaries and shared preview adapters are declared above; local toggles remain inline hooks.
- Spec sections 5–6: Every task preserves state/a11y contracts; Task 8 covers the full automated and simulator matrix.
- New type/function names have one declared owner. Existing geometry/resolver functions remain unchanged.
- Execution is not started by writing this plan. Select subagent-driven or inline execution before application edits.

## Verification record

Tasks 1–8 are implemented on `codex/plush-ui-redesign`; Task 8 implementation
and controller QA are complete, with the independent Task 8 and whole-branch
review still pending after its commit. Final Task 8 verification, run after the
last application edit: `npm run typecheck` exit 0; `npm test` exit 0 with 495
core and 1,755 root/schema tests (2,250 total); `git diff --check` exit 0. No
package, native configuration, backend, schema, asset, production resolver, or
gameplay-rule change is in Task 8.

Controller account-free QA passed all four tabs and all seven onboarding views
in both schemes on an iPhone 17 simulator, cold-relaunch XXXL coverage, and
Chrome responsive 320×598 coverage. Native Share was canceled without sending;
browser minimap drag and native tap/accessibility actions are separate evidence.
Original text size large, system light, and Reduce Motion off were restored.
Native drag, Accessibility Inspector, physical device, TestFlight, authenticated
Health/account actions, and a six-member visual fixture are not claimed. Exact
outcomes and limitations are in
`.superpowers/sdd/2026-09-11-plush-ui-redesign/task-8-report.md` and
`task-8-final-qa.md`. No Task 8 reviewer was dispatched under the controller's
explicit instruction during implementation; the controller's independent review
will determine whether Task 8 step 5 can be checked.

# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every screen built through Phase 7 on a shared `src/ui/` primitive layer so each screen makes one clear claim, in the dark palette §6 already fixes.

**Architecture:** Tokens live in `src/theme.ts`; reusable presentation lives in `src/ui/`; every UI *decision* (which stat to talk about, what your standing is) is extracted into a pure module with vitest coverage, exactly as the Edge Functions keep decisions in `*-plan.ts`. Rendering stays thin and is verified by hand on device.

**Tech Stack:** Expo SDK 57, Expo Router, React Native 0.86, TanStack Query, `@kairo/core`, `expo-font`, React Native's built-in `Animated`. **No new runtime dependency is added** beyond promoting `expo-font` (already present transitively) into `package.json`.

## Global Constraints

- **Read `docs/superpowers/specs/2026-08-04-ui-redesign-design.md` first.** It is the source of truth for every decision below.
- **Gold is the top tier.** `Tier` is `none | bronze | silver | gold`. No copy, colour or label may imply a Diamond or Platinum tier.
- **Do not add a second implementation of scoring anywhere.** Tier thresholds live in `packages/kairo-core/src/scoring.ts` and nowhere else.
- **`packages/kairo-core` takes no dependencies** and stays pure — no I/O, no clock reads, no randomness.
- **Pure modules under `src/` must not import the `@/` alias or any native module.** Root vitest resolves neither. Use relative imports plus `@kairo/core`. This is why the pure modules below declare their own minimal row types instead of importing from `queries.ts` (which imports `@/lib/supabase.ts`).
- **Voice is dry and competitive.** State the standing, never the judgment. Sentence case. No exclamation marks, no emoji in UI copy.
- **Glow means earned.** Only the Hunter's aura, the leading squad row, a Gold tier chip, a banked Streak Shield, and the active tab may glow.
- **Colour families:** violet `accent` = you · `tierColors` = earned · `danger` red = sabotage only.
- **All motion respects `AccessibilityInfo.isReduceMotionEnabled`**, resolved once in `src/ui/motion.ts`.
- **Every numeric text style carries `fontVariant: ['tabular-nums']`.**
- **A pending query must never render a claim.** Absence of data is not "none" — this discipline already exists in `app/(tabs)/squad.tsx` and `Leaderboard.tsx` and must survive.
- Imports use explicit `.ts` / `.tsx` extensions.
- Test commands: `npx vitest run --config vitest.config.ts <path>` for `src/**` and `supabase/**`; `npm run test:core` for `packages/kairo-core`. Full gate: `npm test && npm run typecheck`.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `assets/fonts/ChakraPetch-SemiBold.ttf`, `-Bold.ttf` | Display face |
| `src/ui/motion.ts` | The four animation hooks + reduce-motion resolution |
| `src/ui/motion-policy.ts` (+ `.test.ts`) | Pure motion decisions |
| `src/ui/Screen.tsx` | Safe area, scroll, padding rhythm |
| `src/ui/Panel.tsx` | The only card. `plain` / `lift` / `earned` |
| `src/ui/Numeral.tsx` | Display-font tabular number |
| `src/ui/Label.tsx` | Uppercase micro-label |
| `src/ui/Meter.tsx` | The only bar |
| `src/ui/TierChip.tsx` | Stat letter + tier colour |
| `src/ui/Button.tsx` | `primary` / `secondary` / `ghost` |
| `src/ui/Aura.tsx` | The glow, extracted from `HunterSilhouette` |
| `src/ui/TabPill.tsx` | Floating bottom nav |
| `src/ui/index.ts` | Barrel |
| `src/features/character/standing.ts` (+ `.test.ts`) | Character standing line state |
| `src/features/character/stat-detail.ts` (+ `.test.ts`) | Which stat the detail line names |
| `src/features/character/buckets.ts` | Own-day `health_buckets` query |
| `src/features/squad/standing.ts` (+ `.test.ts`) | Squad hero rank state |

**Modified:** `packages/kairo-core/src/scoring.ts`, `src/theme.ts`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/squad.tsx`, `app/(tabs)/profile.tsx`, `app/(auth)/sign-in.tsx`, `app/(onboard)/name.tsx`, `src/features/character/HunterSilhouette.tsx`, `src/features/character/StatBar.tsx`, `src/features/profile/XpBar.tsx`, `src/features/profile/StreakCard.tsx`, `src/features/profile/BodyMetricsCard.tsx`, `src/features/squad/Leaderboard.tsx`, `src/features/squad/LeaderboardRow.tsx`, `src/features/squad/LockedSlot.tsx`, `src/features/squad/SoloBoard.tsx`, `src/features/squad/CreateSquadForm.tsx`, `src/features/squad/JoinSquadForm.tsx`, `src/features/health/HealthPermissionSheet.tsx`, `package.json`.

---

### Task 1: `nextTierFor` in kairo-core

The detail line needs "how much more for the next tier". Thresholds are private to `scoring.ts` and must stay there.

**Files:**
- Modify: `packages/kairo-core/src/scoring.ts`
- Test: `packages/kairo-core/src/scoring.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `NextTier { tier: Exclude<Tier,'none'>; gap: number }` and `nextTierFor(stat: CoreStat, raw: number): NextTier | null`. Exported through `index.ts`'s existing `export * from './scoring.ts'`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/kairo-core/src/scoring.test.ts`:

```ts
describe('nextTierFor', () => {
  it('names bronze and the gap for a stat with no tier yet', () => {
    expect(nextTierFor('AGI', 0)).toEqual({ tier: 'bronze', gap: 1_000 });
  });

  it('names silver from inside bronze', () => {
    expect(nextTierFor('AGI', 4_760)).toEqual({ tier: 'silver', gap: 240 });
  });

  it('names gold from inside silver', () => {
    expect(nextTierFor('AGI', 8_760)).toEqual({ tier: 'gold', gap: 1_240 });
  });

  // Gold is the ceiling (§6). There is no Diamond.
  it('returns null at gold', () => {
    expect(nextTierFor('AGI', 10_000)).toBeNull();
    expect(nextTierFor('AGI', 25_000)).toBeNull();
  });

  it('uses each stat’s own thresholds and units', () => {
    expect(nextTierFor('STR', 120)).toEqual({ tier: 'silver', gap: 80 });
    expect(nextTierFor('END', 9)).toEqual({ tier: 'bronze', gap: 1 });
    expect(nextTierFor('VIT', 5)).toEqual({ tier: 'gold', gap: 4 });
  });

  // active_minutes is numeric(6,2), so raw values arrive fractional. Telling
  // someone they need 0.4 more minutes is not an instruction.
  it('rounds a fractional gap up to a whole unit', () => {
    expect(nextTierFor('END', 29.6)).toEqual({ tier: 'silver', gap: 1 });
  });

  // The boundary is inclusive in tierFor, so it must be inclusive here too or
  // the two disagree about what "at silver" means.
  it('agrees with tierFor on the boundary', () => {
    expect(tierFor('STR', 200)).toBe('silver');
    expect(nextTierFor('STR', 200)).toEqual({ tier: 'gold', gap: 200 });
  });
});
```

Add `nextTierFor` to the existing import from `./scoring.ts` at the top of the file.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm run test:core -- --run src/scoring.test.ts`
Expected: FAIL — `nextTierFor is not a function`.

- [ ] **Step 3: Implement**

In `packages/kairo-core/src/scoring.ts`, directly below `tierFor`:

```ts
export interface NextTier {
  tier: Exclude<Tier, 'none'>;
  /** Raw units still needed to reach it, rounded up. Always > 0. */
  gap: number;
}

/**
 * The next tier up from a raw value, or null once Gold is reached — Gold is
 * the ceiling (§6) and nothing above it exists.
 *
 * Reads the same THRESHOLDS table as `tierFor`, so the two can never disagree
 * about where a boundary sits. Raw values arrive fractional from
 * `active_minutes numeric(6,2)`, and a gap of "0.4 more minutes" is not an
 * instruction, so the gap is rounded up to a whole unit.
 */
export function nextTierFor(stat: CoreStat, raw: number): NextTier | null {
  const t = THRESHOLDS[stat];
  if (raw < t.bronze) return { tier: 'bronze', gap: Math.ceil(t.bronze - raw) };
  if (raw < t.silver) return { tier: 'silver', gap: Math.ceil(t.silver - raw) };
  if (raw < t.gold) return { tier: 'gold', gap: Math.ceil(t.gold - raw) };
  return null;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run test:core -- --run src/scoring.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add packages/kairo-core/src/scoring.ts packages/kairo-core/src/scoring.test.ts
git commit -m "Add nextTierFor to kairo-core"
```

---

### Task 2: Typography tokens and font loading

**Files:**
- Create: `assets/fonts/ChakraPetch-SemiBold.ttf`, `assets/fonts/ChakraPetch-Bold.ttf`
- Modify: `src/theme.ts`, `app/_layout.tsx`, `package.json`
- Modify (mechanical rename only): the 13 files listed in Step 4

**Interfaces:**
- Produces: `colors.surfaceLift`, `colors.borderStrong`, and `font.display.{hero,major,minor,label}` / `font.body.{title,body,label,button}`. Every later task styles through these.

- [ ] **Step 1: Fetch the fonts and declare the dependency**

```bash
mkdir -p assets/fonts
curl -fL -o assets/fonts/ChakraPetch-SemiBold.ttf \
  https://github.com/google/fonts/raw/main/ofl/chakrapetch/ChakraPetch-SemiBold.ttf
curl -fL -o assets/fonts/ChakraPetch-Bold.ttf \
  https://github.com/google/fonts/raw/main/ofl/chakrapetch/ChakraPetch-Bold.ttf
ls -l assets/fonts
npm install expo-font
```

Both files must be non-empty TTFs (roughly 90–110KB each). If `curl` returns HTML or a 404, stop and report — do not proceed with a placeholder font.

- [ ] **Step 2: Rewrite the token file**

Replace the `font` export in `src/theme.ts` and add the two colour tokens. Keep `colors`, `tierColors`, `tierColor`, `space` and `radius` exactly as they are apart from the two additions.

```ts
import type { TextStyle } from 'react-native';

/** Raised surface, for a panel sitting on a panel without a border. */
export const colors = {
  bg: '#08080C',
  surface: '#12121A',
  surfaceLift: '#191922',
  // An 8-digit hex is a real colour to RN — #222230 at 25% alpha. Kept as the
  // hairline, with an opaque partner so borders and focus rings stop competing.
  border: '#22223040',
  borderStrong: '#2E2E3E',
  text: '#F5F5FF',
  subtle: '#9A9AB0',
  muted: '#6E6E85',
  accent: '#8B7CFF',
  danger: '#FF6B6B',
} as const;

/**
 * Two type roles with a hard boundary (see the redesign spec).
 *
 * `display` is Chakra Petch and is for numerals, levels and tier names only —
 * every screen's focal point in Kairo is a number, and this is what stops them
 * reading like system-font bold. `body` is SF Pro and owns all prose.
 *
 * Everything numeric is tabular: boards refetch on realtime broadcasts, and
 * proportional digits make a live number visibly jitter.
 */
const DISPLAY = 'ChakraPetch-Bold';
const DISPLAY_MEDIUM = 'ChakraPetch-SemiBold';
// Typed, not `as const`: `as const` would make this a readonly tuple, which is
// not assignable to TextStyle['fontVariant'].
const NUM: Pick<TextStyle, 'fontVariant'> = { fontVariant: ['tabular-nums'] };

export const font = {
  display: {
    hero: { fontFamily: DISPLAY, fontSize: 64, letterSpacing: -1, ...NUM },
    major: { fontFamily: DISPLAY, fontSize: 34, letterSpacing: -0.5, ...NUM },
    minor: { fontFamily: DISPLAY, fontSize: 20, ...NUM },
    label: { fontFamily: DISPLAY_MEDIUM, fontSize: 12, letterSpacing: 1.5 },
  },
  body: {
    title: { fontSize: 22, fontWeight: '700' },
    body: { fontSize: 15, fontWeight: '400' },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 1.5 },
    button: { fontSize: 16, fontWeight: '700' },
  },
} as const;
```

- [ ] **Step 3: Load the fonts in the root layout**

In `app/_layout.tsx`, add `import { useFonts } from 'expo-font';` and gate `RootLayout`:

```tsx
export default function RootLayout() {
  // A font error proceeds rather than blocking: RN falls back to the system
  // face for an unknown family, and a degraded screen beats a dead app.
  const [fontsLoaded, fontError] = useFonts({
    'ChakraPetch-Bold': require('../assets/fonts/ChakraPetch-Bold.ttf'),
    'ChakraPetch-SemiBold': require('../assets/fonts/ChakraPetch-SemiBold.ttf'),
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Gate />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Update every call site**

35 call sites across 13 files. This is a rename with no behaviour change — map `font.title` → `font.body.title`, `font.body` → `font.body.body`, `font.label` → `font.body.label`, and `font.brand` (only in `app/(auth)/sign-in.tsx`) → `font.display.major`.

```
src/features/squad/Leaderboard.tsx          (4)
src/features/squad/JoinSquadForm.tsx        (4)
src/features/squad/CreateSquadForm.tsx      (4)
src/features/health/HealthPermissionSheet.tsx (4)
app/(onboard)/name.tsx                      (4)
app/(tabs)/index.tsx                        (3)
app/(auth)/sign-in.tsx                      (3)
src/features/squad/SoloBoard.tsx            (2)
app/(tabs)/profile.tsx                      (2)
app/_layout.tsx                             (2)
src/features/profile/StreakCard.tsx         (1)
src/features/profile/BodyMetricsCard.tsx    (1)
app/(tabs)/squad.tsx                        (1)
```

`src/features/character/StatBar.tsx` imports `font` without using it — drop the import.

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: PASS with no `font.` errors.

Run: `npm run ios` and confirm the app boots to the same screens it did before, with numerals unchanged (nothing consumes `font.display` yet).

- [ ] **Step 6: Commit**

```bash
git add assets/fonts package.json package-lock.json src/theme.ts app src/features
git commit -m "Add Chakra Petch and split the type scale into display and body roles"
```

---

### Task 3: Motion policy and hooks

**Files:**
- Create: `src/ui/motion-policy.ts`, `src/ui/motion-policy.test.ts`, `src/ui/motion.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `animationDuration(ms: number, reduceMotion: boolean): number`, `shouldRecount(previous: number | undefined, next: number): boolean`, and the hooks `useReduceMotion(): boolean`, `useCountUp(value: number): number`, `useFloat(): Animated.Value`, `useFillIn(fraction: number): Animated.Value`, `usePressScale(): { scale: Animated.Value; onPressIn: () => void; onPressOut: () => void }`.

- [ ] **Step 1: Write the failing test**

`src/ui/motion-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { animationDuration, shouldRecount } from './motion-policy.ts';

describe('animationDuration', () => {
  it('passes the duration through when motion is allowed', () => {
    expect(animationDuration(600, false)).toBe(600);
  });

  // Reduce Motion is an accessibility setting, not a preference to soften.
  it('collapses to zero when Reduce Motion is on', () => {
    expect(animationDuration(600, true)).toBe(0);
  });
});

describe('shouldRecount', () => {
  it('counts up on the first value it sees', () => {
    expect(shouldRecount(undefined, 4_820)).toBe(true);
  });

  it('counts up when the value changes', () => {
    expect(shouldRecount(4_820, 5_020)).toBe(true);
  });

  // Realtime broadcasts invalidate boards constantly and most refetches return
  // the same number. Re-counting an unchanged value reads as a glitch.
  it('stays still when a refetch returns the same value', () => {
    expect(shouldRecount(4_820, 4_820)).toBe(false);
  });

  it('counts down as readily as up — sabotage lowers a total', () => {
    expect(shouldRecount(4_820, 4_400)).toBe(true);
  });

  it('counts up from zero, which is a real starting total', () => {
    expect(shouldRecount(0, 200)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config vitest.config.ts src/ui/motion-policy.test.ts`
Expected: FAIL — cannot resolve `./motion-policy.ts`.

- [ ] **Step 3: Implement the policy**

`src/ui/motion-policy.ts`:

```ts
/**
 * The two motion decisions worth testing, kept out of the hooks so they can
 * run in plain node. No React, no react-native imports — this file is reached
 * by vitest, which resolves neither.
 */

/** Zero when Reduce Motion is on, so every animation resolves instantly. */
export function animationDuration(ms: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : ms;
}

/**
 * Whether an arriving number should animate.
 *
 * A board refetch that returns an unchanged total must not replay the count —
 * realtime broadcasts make that the common case, and a number that re-counts
 * without changing reads as a rendering bug.
 */
export function shouldRecount(previous: number | undefined, next: number): boolean {
  return previous === undefined || previous !== next;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run --config vitest.config.ts src/ui/motion-policy.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the hooks**

`src/ui/motion.ts` — imports `Animated` and `AccessibilityInfo` from `react-native`, and the policy above. It is not unit-tested (it needs a renderer); every decision inside it comes from `motion-policy.ts`.

```tsx
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { animationDuration, shouldRecount } from './motion-policy.ts';

/** Live Reduce Motion state. Read once here so no screen can forget it. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduce(on);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduce;
}

/**
 * Counts to `value` on arrival and on change. Returns the displayed number.
 *
 * `enabled` is a parameter rather than a caller-side condition because hooks
 * cannot be called conditionally, and `Numeral` renders both animated and
 * static numbers.
 */
export function useCountUp(value: number, enabled = true): number {
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState(value);
  const previous = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      previous.current = value;
      setShown(value);
      return;
    }
    if (!shouldRecount(previous.current, value)) return;

    const from = previous.current ?? 0;
    previous.current = value;

    const ms = animationDuration(600, reduceMotion);
    if (ms === 0) {
      setShown(value);
      return;
    }

    const driver = new Animated.Value(0);
    const id = driver.addListener(({ value: t }) =>
      setShown(Math.round(from + (value - from) * t)),
    );
    Animated.timing(driver, {
      toValue: 1,
      duration: ms,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => setShown(value));

    return () => driver.removeListener(id);
  }, [value, enabled, reduceMotion]);

  return shown;
}

/** The Hunter's idle float. ±6px, 4.5s, forever. Nothing else uses this. */
export function useFloat(): Animated.Value {
  const reduceMotion = useReduceMotion();
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animationDuration(2_250, reduceMotion) === 0) {
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 2_250,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 2_250,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reduceMotion]);

  return drift;
}

/** Grows a meter from zero to `fraction` (0–1). */
export function useFillIn(fraction: number): Animated.Value {
  const reduceMotion = useReduceMotion();
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: Math.max(0, Math.min(1, fraction)),
      duration: animationDuration(500, reduceMotion),
      easing: Easing.out(Easing.cubic),
      // Width is not a transform, so this cannot run on the native driver.
      useNativeDriver: false,
    }).start();
  }, [fill, fraction, reduceMotion]);

  return fill;
}

/** Press feedback for cards and buttons — scale, not the old opacity flicker. */
export function usePressScale() {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const to = (toValue: number) => () => {
    Animated.timing(scale, {
      toValue,
      duration: animationDuration(120, reduceMotion),
      useNativeDriver: true,
    }).start();
  };

  return { scale, onPressIn: to(0.97), onPressOut: to(1) };
}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/motion-policy.ts src/ui/motion-policy.test.ts src/ui/motion.ts
git commit -m "Add the motion layer, with Reduce Motion honoured at the primitive"
```

---

### Task 4: Static primitives

**Files:**
- Create: `src/ui/Screen.tsx`, `src/ui/Panel.tsx`, `src/ui/Numeral.tsx`, `src/ui/Label.tsx`, `src/ui/Meter.tsx`, `src/ui/TierChip.tsx`, `src/ui/Button.tsx`, `src/ui/index.ts`

**Interfaces:**
- Consumes: `src/theme.ts` tokens (Task 2), `useFillIn` / `usePressScale` (Task 3).
- Produces, and every later task depends on these exact signatures:
  - `<Screen scroll?: boolean; refreshControl?: React.ReactElement; children>`
  - `<Panel variant?: 'plain' | 'lift' | 'earned'; style?: ViewStyle; children>`
  - `<Numeral value: number | string; size?: 'hero' | 'major' | 'minor'; color?: string; animate?: boolean>`
  - `<Label>{string}</Label>`
  - `<Meter fraction: number; color: string; height?: number>`
  - `<TierChip stat: string; tier: string | undefined; points: number; fraction: number>`
  - `<Button label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; busy?: boolean>`

- [ ] **Step 1: Write `Screen`**

Owns safe-area insets, the horizontal rhythm, and bottom room for the floating `TabPill` (72pt pill + 24pt gap). Replaces the `insets.top + space.lg` repeated across five screens.

```tsx
import type { ReactElement, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../theme.ts';

/** Clearance for the floating tab pill so content never hides beneath it. */
export const TAB_PILL_CLEARANCE = 96;

export function Screen({
  scroll = true,
  refreshControl,
  children,
}: {
  scroll?: boolean;
  refreshControl?: ReactElement;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + space.lg,
    paddingBottom: insets.bottom + TAB_PILL_CLEARANCE,
    paddingHorizontal: space.lg,
  };

  if (!scroll) {
    return <View style={[styles.container, padding]}>{children}</View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={padding}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
});
```

- [ ] **Step 2: Write `Panel`, `Label` and `Numeral`**

`src/ui/Panel.tsx`:

```tsx
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../theme.ts';

/**
 * The only card in the app.
 *
 * `earned` is the glow rule's one expression on a card — a lit top edge — and
 * belongs to a banked Streak Shield and the squad leader's row, nothing else.
 */
export function Panel({
  variant = 'plain',
  style,
  children,
}: {
  variant?: 'plain' | 'lift' | 'earned';
  style?: ViewStyle;
  children: ReactNode;
}) {
  return (
    <View style={[styles.base, styles[variant], style]}>
      {variant === 'earned' && <View style={styles.edge} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    marginTop: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  plain: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lift: { backgroundColor: colors.surfaceLift },
  earned: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  edge: {
    position: 'absolute',
    top: 0,
    left: space.lg,
    right: space.lg,
    height: 2,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
```

`src/ui/Label.tsx`:

```tsx
import { StyleSheet, Text } from 'react-native';
import { colors, font } from '../theme.ts';

export function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: { ...font.body.label, color: colors.muted, textTransform: 'uppercase' },
});
```

`src/ui/Numeral.tsx`:

```tsx
import { Text, type TextStyle } from 'react-native';
import { colors, font } from '../theme.ts';
import { useCountUp } from './motion.ts';

/**
 * Every focal point in Kairo is a number, and this is the only thing that
 * renders one. Strings are accepted for ordinals ("3rd") so the hero slot has
 * one component rather than two.
 */
export function Numeral({
  value,
  size = 'major',
  color = colors.text,
  animate = false,
  style,
}: {
  value: number | string;
  size?: 'hero' | 'major' | 'minor';
  color?: string;
  animate?: boolean;
  style?: TextStyle;
}) {
  const numeric = typeof value === 'number' ? value : 0;
  const counted = useCountUp(numeric, animate && typeof value === 'number');

  const shown =
    typeof value === 'number' ? (animate ? counted : value).toLocaleString() : value;

  return <Text style={[font.display[size], { color }, style]}>{shown}</Text>;
}
```

- [ ] **Step 3: Write `Meter` and `TierChip`**

`src/ui/Meter.tsx` — this is the geometry `StatBar` and `XpBar` already share on purpose.

```tsx
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme.ts';
import { useFillIn } from './motion.ts';

export function Meter({
  fraction,
  color,
  height = 6,
}: {
  /** 0–1. Clamped inside useFillIn. */
  fraction: number;
  color: string;
  height?: number;
}) {
  const fill = useFillIn(fraction);
  const width = fill.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.track, { height }]}>
      {/* No default background: the colour is always supplied by the caller,
          and a fallback here would only ever mask a missing tier. */}
      <Animated.View style={{ width, height, backgroundColor: color, borderRadius: radius.pill }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
});
```

`src/ui/TierChip.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space, tierColor } from '../theme.ts';
import { Meter } from './Meter.tsx';
import { Numeral } from './Numeral.tsx';

/**
 * One of the four stats, sized for a row of four.
 *
 * Only Gold glows. Bronze and Silver are real achievements but they are not
 * the ceiling, and a glow on all three would make the device meaningless.
 */
export function TierChip({
  stat,
  tier,
  points,
  fraction,
}: {
  stat: string;
  tier: string | undefined;
  points: number;
  fraction: number;
}) {
  const color = tierColor(tier);
  const gold = tier === 'gold';

  return (
    <View style={[styles.chip, gold && { ...styles.glow, shadowColor: color }]}>
      <Text style={styles.stat}>{stat}</Text>
      <Numeral value={points} size="minor" color={colors.subtle} />
      <Meter fraction={fraction} color={color} height={4} />
      <Text style={[styles.tier, { color }]}>{(tier ?? 'none').toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    minWidth: 0,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.xs,
  },
  glow: { shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  stat: { ...font.display.minor, color: colors.text },
  tier: { ...font.body.label, fontSize: 10 },
});
```

- [ ] **Step 4: Write `Button`**

Replaces the six near-identical button styles listed in the spec.

```tsx
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from 'react-native';
import { colors, font, radius, space } from '../theme.ts';
import { usePressScale } from './motion.ts';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const inert = disabled || busy;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: inert, busy }}
        disabled={inert}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.base, styles[variant], disabled && styles.disabled]}
      >
        {busy ? (
          <ActivityIndicator color={variant === 'primary' ? colors.bg : colors.accent} />
        ) : (
          <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    marginTop: space.sm,
    minHeight: 48,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: 1, borderColor: colors.borderStrong },
  ghost: {},
  disabled: { opacity: 0.35 },
  label: { ...font.body.button },
  primaryLabel: { color: colors.bg },
  secondaryLabel: { color: colors.text },
  ghostLabel: { color: colors.subtle },
});
```

- [ ] **Step 5: Write the barrel**

`src/ui/index.ts` re-exports every component above plus `TAB_PILL_CLEARANCE` and the motion hooks.

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui
git commit -m "Add the shared UI primitives"
```

---

### Task 5: `Aura`, and `HunterSilhouette` on top of it

**Files:**
- Create: `src/ui/Aura.tsx`
- Modify: `src/features/character/HunterSilhouette.tsx`

**Interfaces:**
- Produces: `<Aura size: number; color: string; opacity: number; halo?: boolean>`.

**Behaviour that must not change.** `HunterSilhouette`'s `BUILDS` table is §6's evolution table and is not being redesigned. Aura size stays `160 + stage * 14`, opacity stays `0.1 + stage * 0.12 + build.glow`, the All-Rounder halo stays a ring at `size + 22`, and every `shoulders` / `torso` / `height` / `stance` value stays exactly as written.

- [ ] **Step 1:** Move the `aura` and `halo` styles and their two `View`s out of `HunterSilhouette` into `src/ui/Aura.tsx`, taking size, colour, opacity and a `halo` flag as props. Copy the existing comment explaining why the All-Rounder gets a ring rather than more glow.
- [ ] **Step 2:** In `HunterSilhouette`, replace the two `View`s with `<Aura size={auraSize} color={build.aura} opacity={auraOpacity} halo={dominance === 'balanced'} />`, and wrap the whole frame in an `Animated.View` whose `translateY` interpolates `useFloat()` over `[0, 1] → [0, -6]`.
- [ ] **Step 3:** Run `npm run typecheck`. Expected: PASS.
- [ ] **Step 4:** Run `npm run ios`. Confirm on device that the Hunter floats gently, and that switching a seeded account between builds still changes the silhouette and aura colour as before.
- [ ] **Step 5: Commit**

```bash
git add src/ui/Aura.tsx src/features/character/HunterSilhouette.tsx
git commit -m "Extract Aura and give the Hunter an idle float"
```

---

### Task 6: The floating tab pill

**Files:**
- Create: `src/ui/TabPill.tsx`
- Modify: `app/(tabs)/_layout.tsx`

- [ ] **Step 1:** Write `TabPill` as a `BottomTabBar` replacement taking React Navigation's `{ state, descriptors, navigation }` props. Absolutely positioned, `bottom: insets.bottom + space.md`, `left/right: space.lg`, `backgroundColor: colors.surface`, `borderRadius: radius.pill`, `borderWidth: 1`, `borderColor: colors.border`, `height: 72`, three equal flex cells. Each cell renders its label in `font.body.label`, uppercase — `HUNTER`, `SQUAD`, `YOU` — at `colors.muted`, or `colors.accent` when focused, with a 4pt accent dot above the focused label. Each cell is a `Pressable` with `accessibilityRole="tab"` and `accessibilityState={{ selected: focused }}`, calling `navigation.navigate(route.name)`.
- [ ] **Step 2:** In `app/(tabs)/_layout.tsx`, pass `tabBar={(props) => <TabPill {...props} />}` and drop `tabBarStyle` / `tabBarActiveTintColor` / `tabBarInactiveTintColor`. Set `sceneStyle={{ backgroundColor: colors.bg }}`. **Leave the timezone-then-health-sync call order and its comment exactly as they are.**
- [ ] **Step 3:** Run `npm run typecheck`. Expected: PASS.
- [ ] **Step 4:** Run `npm run ios`. Confirm all three tabs switch, the pill floats clear of the home indicator, and no screen's content is trapped under it.
- [ ] **Step 5: Commit**

```bash
git add src/ui/TabPill.tsx "app/(tabs)/_layout.tsx"
git commit -m "Replace the tab bar with a floating pill"
```

---

### Task 7: Character standing line (pure)

**Files:**
- Create: `src/features/character/standing.ts`, `src/features/character/standing.test.ts`

**Interfaces:**
- Produces: `StandingRow`, `Standing`, `resolveStanding(...)`.

- [ ] **Step 1: Write the failing test**

`src/features/character/standing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveStanding, type StandingRow } from './standing.ts';

const row = (
  rank: number,
  character_name: string,
  total: number,
  is_self = false,
): StandingRow => ({ rank, character_name, total, is_self });

const board: StandingRow[] = [
  row(1, 'Ligaya', 6_240),
  row(2, 'Jun', 5_220),
  row(3, 'You', 4_820, true),
];

describe('resolveStanding', () => {
  // A pending query is not an answer. The line renders nothing rather than
  // guessing, the same discipline squad.tsx already applies to its board.
  it('is unknown while squad membership is still loading', () => {
    expect(resolveStanding({ hasSquad: undefined, rows: board })).toEqual({
      kind: 'unknown',
    });
  });

  it('is unknown while the board is still loading', () => {
    expect(resolveStanding({ hasSquad: true, rows: undefined })).toEqual({
      kind: 'unknown',
    });
  });

  it('is solo when the user has no squad', () => {
    expect(resolveStanding({ hasSquad: false, rows: undefined })).toEqual({
      kind: 'solo',
    });
  });

  // squad_leaderboard returns only members who have SCORED, so a user who has
  // not moved today is legitimately absent from their own squad's board.
  it('is unranked when the user has not scored today', () => {
    expect(
      resolveStanding({ hasSquad: true, rows: [row(1, 'Ligaya', 6_240)] }),
    ).toEqual({ kind: 'unranked' });
  });

  it('is unranked when the squad exists but nobody has scored', () => {
    expect(resolveStanding({ hasSquad: true, rows: [] })).toEqual({
      kind: 'unranked',
    });
  });

  it('names the rank and the gap to the player immediately above', () => {
    expect(resolveStanding({ hasSquad: true, rows: board })).toEqual({
      kind: 'ranked',
      rank: 3,
      ahead: { name: 'Jun', gap: 400 },
    });
  });

  // Leading is the one case with nothing to chase.
  it('has nobody ahead in first place', () => {
    const leading = [row(1, 'You', 6_240, true), row(2, 'Jun', 5_220)];
    expect(resolveStanding({ hasSquad: true, rows: leading })).toEqual({
      kind: 'ranked',
      rank: 1,
      ahead: null,
    });
  });

  // Ties share a rank in the RPC's output, so "the row above" is not always
  // rank - 1, and a naive lookup would find nothing and claim first place.
  it('finds the nearest higher-placed player when ranks tie', () => {
    const tied = [
      row(1, 'Ligaya', 6_240),
      row(1, 'Jun', 6_240),
      row(3, 'You', 4_820, true),
    ];
    expect(resolveStanding({ hasSquad: true, rows: tied })).toEqual({
      kind: 'ranked',
      rank: 3,
      ahead: { name: 'Jun', gap: 1_420 },
    });
  });

  it('reports a zero gap when tied with the player above', () => {
    const level = [row(1, 'Jun', 4_820), row(1, 'You', 4_820, true)];
    expect(resolveStanding({ hasSquad: true, rows: level })).toEqual({
      kind: 'ranked',
      rank: 1,
      ahead: { name: 'Jun', gap: 0 },
    });
  });

  // The RPC orders by rank, but nothing in the type system says so.
  it('does not depend on the rows arriving sorted', () => {
    expect(resolveStanding({ hasSquad: true, rows: [...board].reverse() })).toEqual({
      kind: 'ranked',
      rank: 3,
      ahead: { name: 'Jun', gap: 400 },
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config vitest.config.ts src/features/character/standing.test.ts`
Expected: FAIL — cannot resolve `./standing.ts`.

- [ ] **Step 3: Implement**

```ts
/**
 * What the Character screen's standing line says (redesign spec, §5, §7).
 *
 * The row type is a structural subset of `squad_leaderboard`'s output rather
 * than an import from `queries.ts`: that module pulls in `@/lib/supabase.ts`,
 * and vitest resolves neither the alias nor the native client.
 */

export interface StandingRow {
  rank: number;
  character_name: string;
  total: number;
  is_self: boolean;
}

export type Standing =
  /** A query is still in flight. Render nothing — never a guess. */
  | { kind: 'unknown' }
  /** No squad yet. */
  | { kind: 'solo' }
  /** In a squad, but with no scored row today. */
  | { kind: 'unranked' }
  | { kind: 'ranked'; rank: number; ahead: { name: string; gap: number } | null };

export function resolveStanding({
  hasSquad,
  rows,
}: {
  hasSquad: boolean | undefined;
  rows: readonly StandingRow[] | undefined;
}): Standing {
  if (hasSquad === undefined) return { kind: 'unknown' };
  if (!hasSquad) return { kind: 'solo' };
  if (rows === undefined) return { kind: 'unknown' };

  const self = rows.find((r) => r.is_self);
  if (!self) return { kind: 'unranked' };

  // Not `rank - 1`: squad_leaderboard shares a rank between tied members, so
  // the row above may be two ranks up, or may share the caller's own rank.
  const above = rows
    .filter((r) => !r.is_self && r.rank <= self.rank)
    .sort((a, b) => b.rank - a.rank || a.total - b.total)[0];

  return {
    kind: 'ranked',
    rank: self.rank,
    ahead: above
      ? { name: above.character_name, gap: above.total - self.total }
      : null,
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run --config vitest.config.ts src/features/character/standing.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/character/standing.ts src/features/character/standing.test.ts
git commit -m "Resolve the Character screen's standing line"
```

---

### Task 8: Stat detail line (pure) + own-day buckets query

**Files:**
- Create: `src/features/character/stat-detail.ts`, `src/features/character/stat-detail.test.ts`, `src/features/character/buckets.ts`

**Interfaces:**
- Consumes: `nextTierFor`, `CORE_STATS`, `aggregateBuckets`, `HourBucket` from `@kairo/core` (Task 1).
- Produces: `StatDetail`, `resolveStatDetail(...)`, `STAT_UNITS`; and `useTodayBuckets(userId, timeZone)` returning `UseQueryResult<DayTotals>` — never null, because no buckets is a real zero day rather than absence.

- [ ] **Step 1: Write the failing test**

`src/features/character/stat-detail.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DayTotals } from '@kairo/core';
import { resolveStatDetail } from './stat-detail.ts';

const totals = (over: Partial<DayTotals> = {}): DayTotals => ({
  steps: 0,
  distanceM: 0,
  activeKcal: 0,
  activeMinutes: 0,
  activeHours: 0,
  ...over,
});

describe('resolveStatDetail', () => {
  it('is unknown until the day’s totals have loaded', () => {
    expect(resolveStatDetail({ totals: undefined, featuredStat: 'AGI' })).toEqual({
      kind: 'unknown',
    });
  });

  // The weekly meta is the reason to change behaviour this week, so it outranks
  // whichever stat happens to be closest.
  it('prefers the featured stat even when another is closer', () => {
    const detail = resolveStatDetail({
      totals: totals({ steps: 8_760, activeKcal: 199 }),
      featuredStat: 'AGI',
    });
    expect(detail).toEqual({
      kind: 'gap',
      stat: 'AGI',
      featured: true,
      tier: 'gold',
      gap: 1_240,
      unit: 'steps',
    });
  });

  // A featured stat already at Gold has nothing left to ask for.
  it('falls through to the closest stat when the featured stat is maxed', () => {
    const detail = resolveStatDetail({
      totals: totals({ steps: 12_000, activeKcal: 380 }),
      featuredStat: 'AGI',
    });
    expect(detail).toEqual({
      kind: 'gap',
      stat: 'STR',
      featured: false,
      tier: 'gold',
      gap: 20,
      unit: 'kcal',
    });
  });

  it('picks the closest stat when no stat is featured', () => {
    // AGI 500/1,000 and STR 25/50 are both half-way; END at 9 of 10 minutes is
    // nearly there.
    const detail = resolveStatDetail({
      totals: totals({ steps: 500, activeKcal: 25, activeMinutes: 9 }),
      featuredStat: null,
    });
    expect(detail).toEqual({
      kind: 'gap',
      stat: 'END',
      featured: false,
      tier: 'bronze',
      gap: 1,
      unit: 'active minutes',
    });
  });

  // Gaps are in different units, so "smallest" cannot be compared raw across
  // stats — 1 active hour is not easier than 20 kcal. Compare by how far
  // through the band the user is instead.
  it('compares progress through the band, not raw units', () => {
    // VIT: 2 of 3 active hours for bronze — 67% there, 1 hour short.
    // AGI: 100 of 1,000 steps for bronze — 10% there, 900 short.
    const detail = resolveStatDetail({
      totals: totals({ steps: 100, activeHours: 2 }),
      featuredStat: null,
    });
    expect(detail).toEqual({
      kind: 'gap',
      stat: 'VIT',
      featured: false,
      tier: 'bronze',
      gap: 1,
      unit: 'active hours',
    });
  });

  // Gold is the ceiling. Nothing may imply a tier above it.
  it('reports every stat maxed when all four reach gold', () => {
    expect(
      resolveStatDetail({
        totals: totals({
          steps: 10_000,
          activeKcal: 400,
          activeMinutes: 60,
          activeHours: 9,
        }),
        featuredStat: null,
      }),
    ).toEqual({ kind: 'maxed' });
  });

  it('breaks a tie in CORE_STATS order', () => {
    const detail = resolveStatDetail({
      totals: totals({ steps: 500, activeKcal: 25 }),
      featuredStat: null,
    });
    expect(detail.kind).toBe('gap');
    expect(detail.kind === 'gap' && detail.stat).toBe('AGI');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config vitest.config.ts src/features/character/stat-detail.test.ts`
Expected: FAIL — cannot resolve `./stat-detail.ts`.

- [ ] **Step 3: Implement**

```ts
import {
  CORE_STATS,
  nextTierFor,
  type CoreStat,
  type DayTotals,
  type Tier,
} from '@kairo/core';

/** How each stat's raw value reads in a sentence. Copy, so it lives here. */
export const STAT_UNITS: Record<CoreStat, string> = {
  AGI: 'steps',
  STR: 'kcal',
  END: 'active minutes',
  VIT: 'active hours',
};

export type StatDetail =
  | { kind: 'unknown' }
  | { kind: 'maxed' }
  | {
      kind: 'gap';
      stat: CoreStat;
      featured: boolean;
      tier: Exclude<Tier, 'none'>;
      gap: number;
      unit: string;
    };

function rawFor(stat: CoreStat, totals: DayTotals): number {
  switch (stat) {
    case 'AGI':
      return totals.steps;
    case 'STR':
      return totals.activeKcal;
    case 'END':
      return totals.activeMinutes;
    case 'VIT':
      return totals.activeHours;
  }
}

/**
 * The one line of guidance under the stat row.
 *
 * Named in the stat's own raw unit, because points are not something a user
 * can go outside and do. The featured stat wins when it still has room; a
 * featured stat already at Gold has nothing to ask for and falls through.
 */
export function resolveStatDetail({
  totals,
  featuredStat,
}: {
  totals: DayTotals | undefined;
  featuredStat: CoreStat | null;
}): StatDetail {
  if (!totals) return { kind: 'unknown' };

  interface Open {
    stat: CoreStat;
    tier: Exclude<Tier, 'none'>;
    gap: number;
    /** Share of the current band still to go, 0–1. Comparable across stats. */
    remaining: number;
  }

  const open: Open[] = [];
  for (const stat of CORE_STATS) {
    const raw = rawFor(stat, totals);
    const next = nextTierFor(stat, raw);
    // null means this stat is already at Gold, which has nothing to ask for.
    if (!next) continue;
    open.push({
      stat,
      tier: next.tier,
      gap: next.gap,
      remaining: next.gap / (next.gap + raw),
    });
  }

  if (open.length === 0) return { kind: 'maxed' };

  const featured = featuredStat
    ? open.find((c) => c.stat === featuredStat)
    : undefined;

  // Gaps live in different units — one active hour is not comparable to twenty
  // kcal — so "closest" means furthest through the current band, not smallest
  // raw number. The strict `<` leaves CORE_STATS order breaking exact ties.
  const closest = open.reduce((best, c) => (c.remaining < best.remaining ? c : best));

  const chosen = featured ?? closest;

  return {
    kind: 'gap',
    stat: chosen.stat,
    featured: chosen.stat === featuredStat,
    tier: chosen.tier,
    gap: chosen.gap,
    unit: STAT_UNITS[chosen.stat],
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run --config vitest.config.ts src/features/character/stat-detail.test.ts`
Expected: PASS, 7 tests. If the band-progress test fails, the comparator is wrong — fix the comparator, not the test.

- [ ] **Step 5: Write the buckets query**

`src/features/character/buckets.ts`. Mirrors `useTodayScore`'s shape and key discipline. `health_buckets_select_own` already grants this; no migration.

```tsx
import { useQuery } from '@tanstack/react-query';
import { aggregateBuckets, currentLocalDate, type DayTotals, type HourBucket } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';

export function todayBucketsKey(
  userId: string | undefined,
  localDate: string | undefined,
) {
  return ['today-buckets', userId ?? 'none', localDate ?? 'none'] as const;
}

/**
 * The caller's OWN hourly buckets for today, aggregated.
 *
 * `daily_scores` stores points and tiers, not raw values, so the stat detail
 * line's "1,240 more steps for Gold" is not derivable from it. Own rows only —
 * `health_buckets_select_own` is the whole grant, and §5's projection is
 * untouched: nothing here can widen into a squadmate's raw movement.
 */
export function useTodayBuckets(userId: string | undefined, timeZone: string | undefined) {
  const localDate = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  return useQuery({
    queryKey: todayBucketsKey(userId, localDate),
    enabled: Boolean(userId && localDate),
    queryFn: async (): Promise<DayTotals> => {
      const { data, error } = await supabase
        .from('health_buckets')
        .select('hour, steps, distance_m, active_kcal, active_minutes')
        .eq('user_id', userId as string)
        .eq('local_date', localDate as string);

      if (error) throw new Error(error.message);

      const buckets: HourBucket[] = (data ?? []).map((b: Record<string, number>) => ({
        hour: b.hour,
        steps: b.steps,
        distanceM: Number(b.distance_m),
        activeKcal: Number(b.active_kcal),
        activeMinutes: Number(b.active_minutes),
      }));

      // No rows is a real, correct zero day — not an error and not absence.
      return aggregateBuckets(buckets);
    },
  });
}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/character/stat-detail.ts src/features/character/stat-detail.test.ts src/features/character/buckets.ts
git commit -m "Resolve the stat detail line from the caller's own buckets"
```

---

### Task 9: Character screen

**Files:**
- Modify: `app/(tabs)/index.tsx`, `src/features/character/StatBar.tsx`
- Create: `src/features/character/StatRow.tsx`

**Interfaces:**
- Consumes: `Screen`, `Panel`, `Numeral`, `Label`, `Meter`, `TierChip` (Task 4); `resolveStanding` (Task 7); `resolveStatDetail`, `useTodayBuckets` (Task 8); `useMySquad`, `useSquadLeaderboard` from `src/features/squad/queries.ts`.

- [ ] **Step 1: Build `StatRow`**

Four `TierChip`s in a row (`flexDirection: 'row'`, `gap: space.sm`, each `flex: 1`), wrapped in a `Pressable` that toggles local `expanded` state. When expanded it renders the four existing `StatBar`s beneath, unchanged in content — including the human-readable labels ("Steps and distance"). Collapsed on every mount; state is not persisted. `accessibilityRole="button"`, `accessibilityState={{ expanded }}`, label "Show per-stat detail" / "Hide per-stat detail".

Each chip's `fraction` is `points / (featured ? STAT_POINTS_MAX_FEATURED : STAT_POINTS_MAX)` — the same ceiling logic `StatBar` already documents, and for the same reason: sizing a featured Gold against 900 would peg it at 100% and erase the weekly meta's only visual.

- [ ] **Step 2: Restyle `StatBar`**

Keep its ceiling logic and its comments verbatim. Replace its hand-rolled track and fill with `<Meter fraction={fill} color={tierColor(tier)} />`, and move its type to `font.body` / `font.display.minor`. No behaviour change.

- [ ] **Step 3: Rebuild `app/(tabs)/index.tsx`**

Order: `Label` "LEVEL {n}" and the character name → `HunterSilhouette` → build label (still only when `dominance.data != null`, keeping the existing comment about not cheapening All-Rounder) → `<Numeral value={today?.total ?? 0} size="hero" color={colors.accent} animate />` → standing line → `StatRow` → detail line.

Standing line, from `resolveStanding({ hasSquad: squad.data === undefined ? undefined : squad.data !== null, rows: board.data })`:

| kind | Copy |
|---|---|
| `unknown` | render nothing |
| `solo` | `No squad yet.` |
| `unranked` | `Unranked today.` |
| `ranked`, `ahead` null | `1st · leading.` |
| `ranked`, gap 0 | `{ordinal} · level with {name}.` |
| `ranked` | `{ordinal} · {name} is {gap} ahead.` |

Detail line, from `resolveStatDetail({ totals: buckets.data, featuredStat: today?.featured_stat ?? null })`:

| kind | Copy |
|---|---|
| `unknown` | render nothing |
| `maxed` | `Every stat at Gold.` |
| `gap`, featured | `{stat} ×1.5 this week — {gap} more {unit} for {Tier}.` |
| `gap` | `{gap} more {unit} for {Tier} on {stat}.` |

Keep the bonus disclosure: when `consistency_points + rec_points > 0`, append a second muted line reading `Includes {n} for consistency{ and recovery}`. Without it the four chips visibly do not sum to the hero total, which is the reason the current screen carries it.

Data wiring: `const squad = useMySquad(session?.user.id); const board = useSquadLeaderboard(squad.data?.id, 'current');` — TanStack shares this cache with the Squad tab, so it costs no extra request. Keep `HealthPermissionSheet` mounted at the end.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: both PASS. `npm test` must show no change in results — no scoring logic moved.

Run: `npm run ios`. Confirm on device, using the profile tab's dev seed to produce data:
- The hero total counts up once on arrival and does **not** re-count on pull-to-refresh with unchanged data.
- The stat row shows four chips; only a Gold chip glows.
- Tapping the row expands and collapses the four bars.
- The detail line names a real gap in raw units and never says Diamond.
- With no squad the standing line reads `No squad yet.`
- Settings → Accessibility → Motion → Reduce Motion **on**: nothing animates, the Hunter is still, numbers appear instantly.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/index.tsx" src/features/character
git commit -m "Rebuild the Character screen around the Hunter and one number"
```

---

### Task 10: Squad standing (pure)

**Files:**
- Create: `src/features/squad/standing.ts`, `src/features/squad/standing.test.ts`

**Interfaces:**
- Produces: `SquadStanding`, `resolveSquadStanding({ rows, memberCount })`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { resolveSquadStanding } from './standing.ts';
import type { StandingRow } from '../character/standing.ts';

const row = (
  rank: number,
  character_name: string,
  total: number,
  is_self = false,
): StandingRow => ({ rank, character_name, total, is_self });

describe('resolveSquadStanding', () => {
  it('is unknown while the board is loading', () => {
    expect(resolveSquadStanding({ rows: undefined, memberCount: 5 })).toEqual({
      kind: 'unknown',
    });
  });

  it('is unknown while the member count is loading', () => {
    expect(resolveSquadStanding({ rows: [], memberCount: undefined })).toEqual({
      kind: 'unknown',
    });
  });

  it('reports rank, squad size and the gap to the player above', () => {
    const rows = [row(1, 'Ligaya', 6_240), row(2, 'Jun', 5_220), row(3, 'You', 4_820, true)];
    expect(resolveSquadStanding({ rows, memberCount: 5 })).toEqual({
      kind: 'ranked',
      rank: 3,
      of: 5,
      back: 400,
    });
  });

  // The denominator is squad_members, never rows.length: the RPC returns only
  // members who have SCORED, so a squadmate who has not moved is missing from
  // the board but is emphatically still in the squad.
  it('counts the squad, not the scored rows', () => {
    const rows = [row(1, 'You', 4_820, true)];
    expect(resolveSquadStanding({ rows, memberCount: 5 })).toEqual({
      kind: 'ranked',
      rank: 1,
      of: 5,
      back: null,
    });
  });

  it('is unranked with the day’s total when the user has not scored', () => {
    const rows = [row(1, 'Ligaya', 6_240)];
    expect(resolveSquadStanding({ rows, memberCount: 5 })).toEqual({
      kind: 'unranked',
      of: 5,
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --config vitest.config.ts src/features/squad/standing.test.ts`
Expected: FAIL — cannot resolve `./standing.ts`.

- [ ] **Step 3: Implement**

```ts
import { resolveStanding, type StandingRow } from '../character/standing.ts';

export type SquadStanding =
  | { kind: 'unknown' }
  | { kind: 'unranked'; of: number }
  | { kind: 'ranked'; rank: number; of: number; back: number | null };

/**
 * The Squad screen's hero.
 *
 * `back` is the gap to the player immediately above, matching the Character
 * screen's standing line — two different gaps under one word would be worse
 * than either. `of` comes from squad_members, never from the board's length.
 */
export function resolveSquadStanding({
  rows,
  memberCount,
}: {
  rows: readonly StandingRow[] | undefined;
  memberCount: number | undefined;
}): SquadStanding {
  if (rows === undefined || memberCount === undefined) return { kind: 'unknown' };

  const standing = resolveStanding({ hasSquad: true, rows });
  if (standing.kind !== 'ranked') return { kind: 'unranked', of: memberCount };

  return {
    kind: 'ranked',
    rank: standing.rank,
    of: memberCount,
    back: standing.ahead ? standing.ahead.gap : null,
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run --config vitest.config.ts src/features/squad/standing.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/squad/standing.ts src/features/squad/standing.test.ts
git commit -m "Resolve the Squad screen's hero rank"
```

---

### Task 11: Squad screens

**Files:**
- Modify: `src/features/squad/Leaderboard.tsx`, `LeaderboardRow.tsx`, `LockedSlot.tsx`, `SoloBoard.tsx`, `CreateSquadForm.tsx`, `JoinSquadForm.tsx`, `app/(tabs)/squad.tsx`

**Everything below must survive unchanged in substance.** Each is load-bearing and documented in place:

- Pending, error-with-retry, and empty states stay distinct. An error must never render as "nobody here".
- The mixed-timezone note when a completed board spans two dates.
- Locked slots derived from `useSquadMemberCount` via `resolveSlots`, ranked after every member.
- `SlotUnlockReveal` on member-count increase.
- The `Today` / `Yesterday` mode toggle, defaulting to `current`.
- `useSquadRealtime(squad.id)` mounted with the board.
- `LeaderboardRow`'s streak-only-on-`current` rule, and tier pills as the only per-stat detail.

- [ ] **Step 1:** Rebuild `Leaderboard` on `Screen` + `Numeral`. Header is the squad name in `font.body.title` with the date; hero is `resolveSquadStanding`, rendering `3rd` in `font.display.hero` with `of 5 · 400 back` beneath, `Unranked` when `kind === 'unranked'`, and nothing while `unknown`. Mode toggle keeps its shape, restyled to `colors.surface` / `colors.accent`.
- [ ] **Step 2:** Move the invite code out of the top card. Render it inside the empty state and directly above the locked slots, keeping `selectable`, the large letter-spaced treatment (§9), and its `marginLeft` compensation for trailing letter-spacing.
- [ ] **Step 3:** Rebuild `LeaderboardRow` on `Panel`. `is_self` → `borderColor: colors.accent` and rank/name/total in `colors.accent`. `rank === 1` → `variant="earned"` plus the aura glow. Totals become `<Numeral size="minor" />`. Tier pills keep their exact current logic and colours.
- [ ] **Step 4:** Rebuild `LockedSlot` as a dashed `Panel`, preserving its comment and its height-matching against a filled row so the board reads as one list with gaps in it.
- [ ] **Step 5:** Rebuild `SoloBoard` on `Screen`, hero `1st` / `of 1`, its explanatory paragraph kept, and the two actions as `Button` `primary` / `secondary`.
- [ ] **Step 6:** Restyle `CreateSquadForm` and `JoinSquadForm` to `Panel`, `Button` and the `font.body` scale. No logic changes.
- [ ] **Step 7:** Update `app/(tabs)/squad.tsx` to use `Screen` and `Button` for its retry, keeping the pane state machine and the pending/error/success branches exactly as they are.
- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm test`
Expected: both PASS.

Run: `npm run ios`. Confirm: solo account shows `1st of 1` with five locked slots and a readable invite code; a squad shows the hero rank, the leader's row glowing, your row in violet; toggling to Yesterday keeps working; killing the network mid-refresh shows the retry, not an empty board.

- [ ] **Step 9: Commit**

```bash
git add src/features/squad "app/(tabs)/squad.tsx"
git commit -m "Rebuild the Squad screens around where you stand"
```

---

### Task 12: Profile screen

**Files:**
- Modify: `app/(tabs)/profile.tsx`, `src/features/profile/XpBar.tsx`, `StreakCard.tsx`, `BodyMetricsCard.tsx`

- [ ] **Step 1:** `XpBar` — keep `xpProgress` and both explanatory comments verbatim (the bar only moves right; the figures stay because the curve is quadratic). Render the level through `<Numeral value={progress.level} size="hero" />`, the track through `<Meter fraction={progress.fraction} color={colors.accent} />`.
- [ ] **Step 2:** `StreakCard` — a `Panel` whose variant is `earned` when a shield is banked, `plain` otherwise. Current and longest become `<Numeral size="major" />`. Keep all three shield messages and the reasoning that a null `shield_available_on` means banked *now*.
- [ ] **Step 3:** `BodyMetricsCard` — restyle to `Panel`, `Button` and the `font.body` scale. No logic changes.
- [ ] **Step 4:** `app/(tabs)/profile.tsx` — rebuild on `Screen`; name in `font.body.title` with the class beneath; sign out as `Button variant="ghost"` at the bottom. Wrap the dev seed control and its status text in `{__DEV__ && ( ... )}` so it cannot reach a TestFlight build.
- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test`
Expected: both PASS.

Run: `npm run ios`. Confirm the level counts up, the XP figures still read correctly, a banked shield glows and a spent one does not, and the seed button is present in the dev build.

- [ ] **Step 6: Commit**

```bash
git add "app/(tabs)/profile.tsx" src/features/profile
git commit -m "Rebuild the Profile screen around level and streak"
```

---

### Task 13: Sign-in, name, health permission sheet

**Files:**
- Modify: `app/(auth)/sign-in.tsx`, `app/(onboard)/name.tsx`, `src/features/health/HealthPermissionSheet.tsx`, `app/_layout.tsx`

**Logic that must not change.** `name.tsx`'s synchronous `submitting` ref guards a real double-insert caused by TanStack's `notifyManager` scheduling updates through `setTimeout(fn, 0)` — keep the ref, the guard and the comment exactly. Keep sign-in's "no sign-in method is configured" message and its provider loop.

- [ ] **Step 1:** `sign-in.tsx` — `KAIRO` in `font.display.major` with the tagline beneath, vertically centred, and the provider buttons as `Button variant="primary" busy={busy}`. Nothing else on the screen.
- [ ] **Step 2:** `name.tsx` — `Label` "NAME YOUR HUNTER", the question in `font.body.title`, the help line, the input (keeping `autoFocus`, `CHARACTER_NAME_MAX`, `selectionColor`, `onSubmitEditing`), and one `Button` "Begin". Input underline moves to `colors.borderStrong`, becoming `colors.accent` on focus.
- [ ] **Step 3:** `HealthPermissionSheet.tsx` — restyle onto `Panel` and `Button` over a dimmed backdrop (`colors.bg` at 80% opacity). Keep its permission-state logic untouched.
- [ ] **Step 4:** `app/_layout.tsx` — the `profile-error` branch moves onto `Panel` and `Button`, keeping its copy and the comment explaining that `profile-error` renders in place because it has nowhere to navigate to.
- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test`
Expected: both PASS — including `src/features/auth/route.test.ts` and `src/features/health/permission-state.test.ts`, which cover the logic these screens render.

Run: `npm run ios` with a signed-out account. Confirm the whole path — sign in, name the Hunter, land on the Character tab, grant Health — works and looks like one app throughout.

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/sign-in.tsx" "app/(onboard)/name.tsx" app/_layout.tsx src/features/health/HealthPermissionSheet.tsx
git commit -m "Rebuild sign-in, naming and the health sheet"
```

---

### Task 14: Full verification pass

- [ ] **Step 1:** Run `npm test`. Expected: PASS. Any change from the pre-redesign result means logic moved that should not have.
- [ ] **Step 2:** Run `npm run typecheck`. Expected: PASS across all three checks.
- [ ] **Step 3:** Confirm no dead code survives: grep for `font.title`, `font.brand`, `font.label` and `font.body` used as a leaf style, and for any remaining local `StyleSheet` card, bar or button that a `src/ui` primitive now owns.
- [ ] **Step 4:** Grep the whole repo for `Diamond` and `diamond` outside the spec's corrective note. Expected: no matches in `app/`, `src/` or `packages/`.
- [ ] **Step 5:** On device, walk the spec's verification list: every screen at the smallest supported size without clipping; Reduce Motion on produces no animation anywhere; Dynamic Type at large sizes does not break the stat row or a leaderboard row; a squadless account, an account that has scored nothing today, and a full squad each render their correct state rather than an error or an empty board.
- [ ] **Step 6:** Update `docs/roadmap.md` with a Phase 8 entry recording the redesign and pointing at the spec.
- [ ] **Step 7: Commit**

```bash
git add docs/roadmap.md
git commit -m "Record the UI redesign in the roadmap"
```

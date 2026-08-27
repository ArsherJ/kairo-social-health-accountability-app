# Sunlit Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the whole app into the Sunlit palette and move it into the four-tab Today · Sky · Flock · You shell, without touching a screen's composition.

**Architecture:** `src/theme.ts` keeps every token name and changes its values, so ~90 existing call sites re-skin without being edited. The one token that cannot survive that treatment is `colors.accent`, which is used today as both a fill and a text colour and whose new value fails contrast as text — it splits into three named roles and its 53 call sites are classified one at a time. A new zero-import `src/ui/contrast.ts` turns the palette's accessibility claims into a test, so the arithmetic lives in CI rather than in a reviewer's head. Navigation then flattens and the tab files are renamed, with push routing remapped in the same commit so no historical payload lands on a route that no longer exists.

**Tech Stack:** TypeScript, Expo SDK 57, Expo Router, React Native 0.86, Vitest (Node), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-27-one-kairo-one-sky-design.md`

## This is plan 1 of 3

| plan | covers | spec §§ |
|---|---|---|
| **1 — Sunlit Foundation (this plan)** | Tokens, primitives, navigation, push routing | §4, §5 |
| 2 — One Kairo and the screens | `DEFAULT_SPECIES`, onboarding, Today / You / Flock re-composition, `kairo-voice.ts` | §6, §9, §10 |
| 3 — The Sky | `sky-path.ts`, the corridor, retirement of `RaceTrack` / `RaceLane` / `RaceCard` | §7 |

Each plan leaves the app working and shippable. After this one the app is fully
Sunlit and navigable in its final shape, with every screen body unchanged.

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include these.

- **No migration, no `supabase/` change, no Edge Function redeploy.** There is no schema change in this work.
- **`tierFor`, `TIER_POINTS`, `THRESHOLDS`, `computeDailyScore`, `planDay` are untouched.**
- **`RACE_FINISH_LINE`, `rankRacers`, `cappedSteps`, `Racer` are untouched.** `10_000` must not appear as a literal in any new module.
- **No new native dependency.** Anything that moves the fingerprint costs one of the month's fifteen EAS builds and withholds OTA until it lands. If a step reaches for a native module, stop and re-cost.
- **`src/ui/Text.tsx` is the only Text.** Import from `@/ui`, never from `react-native`. `allowFontScaling={false}` appears nowhere.
- **Do not import `@/ui/index.ts` from a module root Vitest tests** — the barrel re-exports every component and the `@/` alias does not resolve there. Reach sibling modules by relative path.
- **No surface renders an engine key.** Stat words come from `src/ui/stat-names.ts`. `stat-names.test.ts` scans every non-test file under `src` and `app` for the word "Agility" and must stay green.
- **Grouping is explicit, both halves.** A parent that means one thing gets `accessible` + `accessibilityLabel`, **and** every direct child gets `accessibilityElementsHidden` **and** `importantForAccessibility="no-hide-descendants"`. Neither half is redundant.
- **`NAV_HEIGHT` stays 96**, so `TAB_PILL_CLEARANCE` does not move and no screen's bottom padding changes.
- **Every commit ends green** on `npm run typecheck` and `npm test`.

---

## The insight that shapes Task 2 and Task 3

There are two ways the accent colour is reached in this codebase, and they
migrate completely differently.

**`ramp.accent[N]` — 37 sites, and none of them is edited.** The ramp's contract
is *ink strength*, not hue: 200 is a wash you put text on, 500 is a fill, 700
and 800 are inks you set text in. If the new amber ramp preserves that contract
step for step, every one of those 37 sites stays correct by construction. This
is the whole reason the palette shifts in place instead of forking.

**`colors.accent` — 53 sites, and roughly thirty are edited.** This token
conflates a fill with a text colour, which was survivable at terracotta
(`#c67139`, 4.7:1 as text) and is not at amber (`#f5a623`, **1.9:1**). Splitting
it is the load-bearing part of this plan, and Task 3 classifies all 53 by hand.

The constraint that falls out of the first paragraph, and which Task 1 pins:
**`ramp.accent[700]` must stay at or above 4.5:1 on `colors.bg`**, because
`Label`'s accent eyebrow is 10pt and reads it. That is why `#c9721c` — the
design's own big-numeral colour — is *not* a ramp step in this plan. It is a
separate named role restricted to large display type.

---

## Task 1: The palette's claims become a test

The palette makes accessibility claims. Right now those claims live in a design
document, which means the next person to nudge a hex value gets no feedback.
This task puts the arithmetic in CI first, so Task 2's values are checked the
moment they are written rather than by hand.

Written before the palette so it fails for the right reason, and so nobody is
tempted to reverse-engineer the thresholds from whatever values happened to
ship.

**Files:**
- Create: `src/ui/contrast.ts`
- Create: `src/ui/contrast.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `contrastRatio(foreground: string, background: string): number` — WCAG 2.1 relative-luminance ratio, 1–21, for two `#rrggbb` strings. Used only by tests.

- [ ] **Step 1: Write the failing test**

`src/ui/contrast.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.ts';
import { colors, ramp } from '../theme.ts';

/**
 * The palette's accessibility claims, as assertions.
 *
 * This file exists because `colors.accent` changed hue on 2026-08-27 and the
 * new amber measures 1.9:1 as text on cream, where the terracotta it replaced
 * measured 4.7:1. Every rule below is a rule the redesign can silently undo by
 * moving one hex value, and none of them fails visibly — low-contrast text
 * renders perfectly, it is just unreadable for some people.
 *
 * WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px
 * bold) and for meaningful non-text such as a hairline rule.
 */

const AA_BODY = 4.5;
const AA_LARGE = 3;

describe('contrastRatio', () => {
  it('is 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#c9721c', '#c9721c')).toBeCloseTo(1, 5);
  });

  it('is symmetric — the order of the arguments does not matter', () => {
    expect(contrastRatio('#3e2e22', '#fff6e8')).toBeCloseTo(
      contrastRatio('#fff6e8', '#3e2e22'),
      5,
    );
  });

  it('accepts three-digit hex and is case-insensitive', () => {
    expect(contrastRatio('#FFF', '#000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#AbCdEf', '#000000')).toBeCloseTo(
      contrastRatio('#abcdef', '#000000'),
      5,
    );
  });
});

describe('body text is readable on every ground it is set on', () => {
  it.each([
    ['text on the page', colors.text, colors.bg],
    ['text on a card', colors.text, colors.surface],
    ['text on the amber tint', colors.text, ramp.accent[200]],
    ['text on the sky field', colors.text, colors.sky],
    ['subtle on the page', colors.subtle, colors.bg],
    ['subtle on a card', colors.subtle, colors.surface],
  ])('%s', (_name, fg, bg) => {
    expect(contrastRatio(fg as string, bg as string)).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe('the three accent roles, each on the ground it is allowed on', () => {
  it('accent is a FILL — ink sits on it, and it is never text', () => {
    // The rule the whole split exists for. If someone re-points a text style
    // at `colors.accent`, this is the number they are choosing.
    expect(contrastRatio(colors.text, colors.accent)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(colors.accent, colors.bg)).toBeLessThan(AA_LARGE);
  });

  it('accentInk is large display type on the page, and nothing smaller', () => {
    expect(contrastRatio(colors.accentInk, colors.bg)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('accentDeep is body-size accent text, on the page and on the tint', () => {
    expect(contrastRatio(colors.accentDeep, colors.bg)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(colors.accentDeep, ramp.accent[200])).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe('the ramp keeps its ink-strength contract', () => {
  // This is what lets 37 `ramp.accent[N]` call sites migrate without being
  // edited. Break it and they all quietly go wrong at once.
  it('accent 700 carries body text on the page — Label sets a 10pt eyebrow in it', () => {
    expect(contrastRatio(ramp.accent[700], colors.bg)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('accent 800 and 900 carry body text on the 200 wash', () => {
    expect(contrastRatio(ramp.accent[800], ramp.accent[200])).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(ramp.accent[900], ramp.accent[200])).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('sage 700 and 800 carry body text on the page and on the sage wash', () => {
    expect(contrastRatio(ramp.sage[700], colors.bg)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(ramp.sage[800], ramp.sage[200])).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('neutral 600 is the lightest step that may carry body text', () => {
    expect(contrastRatio(ramp.neutral[600], colors.bg)).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe('the supporting families', () => {
  it('teal is a fill that carries a cream label at body size', () => {
    // The secondary button. `font.display.action` is 18pt Caprasimo, which is
    // NOT "large" under WCAG — large needs 24pt, or 18.66pt *bold*, and
    // Caprasimo ships in one weight so there is no bold to reach for. So this
    // is the body threshold, and it is why `colors.teal` is a darker step than
    // the design's bright `#35a99b`: that one measures 2.7:1 against cream.
    expect(contrastRatio(colors.bg, colors.teal)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('tealInk is text on the teal wash', () => {
    expect(contrastRatio(colors.tealInk, colors.tealTint)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('the decorative teal is never asked to carry a label', () => {
    // `ramp.teal[500]` is the design's bright teal and exists for dots and
    // washes. Asserting it fails as a label ground is what stops it being
    // reached for as a button fill later.
    expect(contrastRatio(colors.bg, ramp.teal[500])).toBeLessThan(AA_BODY);
  });

  it('damage carries body text on the page', () => {
    expect(contrastRatio(colors.damage, colors.bg)).toBeGreaterThanOrEqual(AA_BODY);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts src/ui/contrast.test.ts`

Expected: FAIL — `Failed to resolve import "./contrast.ts"`.

- [ ] **Step 3: Write the implementation**

`src/ui/contrast.ts`:

```ts
/**
 * WCAG 2.1 contrast ratio, for the palette's tests.
 *
 * **Zero imports, deliberately.** Root Vitest has no `@/` alias and cannot
 * parse React Native's Flow syntax, so anything reaching `react-native` — or
 * `@/ui/index.ts`, which re-exports every component — is untestable there. Same
 * constraint that shaped `stat-names.ts`, `buffer.ts` and `milestones.ts`.
 *
 * This is a test helper and nothing renders with it. It lives under `src/ui`
 * rather than in the test file because `theme.ts` documents the ratios it
 * claims, and a reader following that comment should find the definition.
 */

/** `#rgb` or `#rrggbb`, any case, to three 0–255 channels. */
function channels(hex: string): [number, number, number] {
  const raw = hex.trim().replace(/^#/, '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not an opaque hex colour: ${hex}`);
  }

  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. The 0.03928 knee and 2.4 exponent are the spec's. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The ratio between two opaque colours, 1–21. Symmetric.
 *
 * **Opaque only.** `colors.border` is an 8-digit hex (`#201e1d29`) — a real
 * colour to React Native and not one this can measure, because the answer
 * depends on what is behind it. Passing one throws rather than silently
 * measuring the wrong thing.
 */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}
```

- [ ] **Step 4: Run the test to verify it fails for the right reason now**

Run: `npx vitest run --config vitest.config.ts src/ui/contrast.test.ts`

Expected: the three `contrastRatio` unit tests **PASS**. Everything below them
FAILS, because `colors.sky`, `colors.accentInk`, `colors.accentDeep`,
`colors.teal`, `colors.tealTint` and `colors.tealInk` do not exist yet —
TypeScript errors inside the test file. That is the correct failure and Task 2
resolves it.

- [ ] **Step 5: Commit**

```bash
git add src/ui/contrast.ts src/ui/contrast.test.ts
git commit -m "test: make the palette's contrast claims assertable

The Sunlit palette replaces a terracotta accent that measured 4.7:1 as text
with an amber that measures 1.9:1. Every rule the redesign can silently undo
by moving one hex value is now a test, because low-contrast text renders
perfectly and fails only for the people it fails for.

The token assertions fail until the Sunlit palette lands.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `theme.ts` becomes Sunlit

**Files:**
- Modify: `src/theme.ts` — `ramp`, `colors`, `earnedColor`, `radius`, `shadow`

**Interfaces:**
- Consumes: `contrastRatio` from Task 1, through the test only.
- Produces: `colors.sky`, `colors.accentInk`, `colors.accentDeep`, `colors.accentEdge`, `colors.teal`, `colors.tealEdge`, `colors.tealTint`, `colors.tealInk`, `colors.coral`. Every existing export keeps its name and its type.

- [ ] **Step 1: Replace the three ramps**

In `src/theme.ts`, replace the whole `ramp` object. Keep the docstring above it
and add the sentence marked below.

```ts
export const ramp = {
  neutral: {
    100: '#fff9ef',
    200: '#f3e7d6',
    300: '#e3d5c0',
    400: '#c9bba8',
    500: '#a3927e',
    600: '#7d6c59',
    700: '#635341',
    800: '#4a3a2c',
    900: '#3e2e22',
  },
  accent: {
    100: '#fff4e0',
    200: '#fcebcb',
    300: '#fbdca6',
    400: '#f7c56a',
    500: '#f5a623',
    600: '#d1860f',
    700: '#a35f0e',
    800: '#7a4409',
    900: '#4a2907',
  },
  sage: {
    100: '#f4f8e6',
    200: '#eef3dc',
    300: '#d7e3bd',
    400: '#b3c894',
    500: '#8fae6a',
    600: '#6f8f4c',
    700: '#566f39',
    800: '#3f5228',
    900: '#2a3719',
  },
  teal: {
    100: '#f0f8f5',
    200: '#e4f2ec',
    300: '#cbe6dc',
    400: '#7fc9bb',
    500: '#35a99b',
    600: '#237f72',
    700: '#1a5f55',
    800: '#2f5c50',
    900: '#173a33',
  },
} as const;
```

**Why sage covers the design's "moss" and teal does not cover its bright fill.**
The spec's §4.3 listed a separate `moss` family. It is not needed: the design's
moss card is `#EEF3DC` ground with `#4C5A32` text, which is `ramp.sage[200]` and
`ramp.sage[800]` to within a hair — a fifth family would be two tables of the
same colour, which is the drift `STAT_NAMES` and `dominanceName()` exist to
prevent. Teal is the opposite case and genuinely needs its own ramp, because the
design's `#35a99b` measures **2.7:1** against a cream label and cannot be the
secondary button's fill. `500` keeps that bright value for dots and washes;
`600` is the darker step the button actually uses.

Note `teal[800]` is *lighter* than `teal[700]` — `#2f5c50` is the design's own
ink for the teal wash, and it is placed at 800 because that is the step every
other family uses for text-on-a-200-ground. The strength contract is about the
job, not about a monotonic luminance curve.

Add to the ramp's existing docstring, immediately before the closing `*/`:

```
 * **The step contract is ink strength, and it is load-bearing.** 200 is a wash
 * you set text on; 500 is a fill; 700 and 800 are inks. Thirty-seven call sites
 * read `ramp.accent[N]` directly and none of them was edited when the palette
 * changed hue on 2026-08-27 — they are correct by construction *because* the
 * contract held. `contrast.test.ts` pins the three steps that carry text.
 * Moving a step's strength silently breaks every site that reads it.
```

- [ ] **Step 2: Replace the `colors` object**

```ts
export const colors = {
  bg: '#fff6e8',
  /**
   * A card. On Sunlit a card is separated from the ground by **shadow**, not
   * by tint — the two differ by a hair on purpose, which is why `Panel.plain`
   * gained an elevation when this landed. Reaching for a darker surface to
   * make a card legible is working against the system.
   */
  surface: ramp.neutral[100],
  /** Raised surface. White, for chrome that floats over content — the tab bar. */
  surfaceLift: '#ffffff',
  /**
   * The warm field the character occupies. **A place, not a card**: no radius
   * of its own, no shadow, and nothing that is not the character's own sky may
   * use it.
   */
  sky: '#ffe7bc',
  // An 8-digit hex is a real colour to RN — the system's divider at 16% alpha.
  // Not measurable by `contrastRatio`, which is why it is excluded there.
  border: '#3e2e2229',
  borderStrong: ramp.neutral[400],
  text: '#3e2e22',
  subtle: ramp.neutral[700],
  muted: ramp.neutral[600],
  /**
   * Amber. **A fill and never text** — 1.9:1 on `bg`, which is invisible.
   *
   * This token was terracotta until 2026-08-27 and could be used for both. It
   * cannot now, and that is the single easiest thing in this redesign to undo
   * by accident: pointing a `color:` at it renders perfectly and is unreadable.
   * `contrast.test.ts` asserts it fails as text, so the test goes red if the
   * value ever drifts back into a range that would tempt someone.
   *
   * Ink on it is `colors.text` at 6.4:1.
   */
  accent: ramp.accent[500],
  /**
   * Accent as **large display type only** — 24pt and up, or 18.66pt bold.
   * 3.3:1 on `bg`. The day's step count at 56pt is what this exists for.
   *
   * Deliberately *not* a ramp step: `ramp.accent[700]` has to carry `Label`'s
   * 10pt eyebrow, and this is too light for that.
   */
  accentInk: '#c9721c',
  /**
   * Accent as **body-size text**, on the page or on the `ramp.accent[200]` wash.
   *
   * `ramp.accent[800]` and not 700, which was the obvious choice and is wrong:
   * 700 measures 4.71:1 on `bg` but only **4.30:1** on the amber wash, and
   * accent text on the amber wash is the commonest thing this token does. One
   * value that passes on both grounds beats two that each pass on one.
   */
  accentDeep: ramp.accent[800],
  /** The hard 3px lip under a primary button. Never a text colour. */
  accentEdge: ramp.accent[600],
  /** Sage. Your lane, squad warmth, and the design's "moss". Never a call to action. */
  sage: ramp.sage[600],
  /**
   * Teal. **Rest, and the secondary action** — the sleep card, the invite
   * block, "Cheer the flock".
   *
   * The fourth family, added 2026-08-27. It earns a place beside sage because
   * the two say different things: sage is *your lane*, teal is *recovery* and
   * the second button on a screen that already spent its amber.
   *
   * `ramp.teal[600]` and not the design's bright `[500]`: a cream label on
   * `#35a99b` is 2.7:1, and `font.display.action` is 18pt Caprasimo, which is
   * not "large" under WCAG — Caprasimo has one weight, so there is no bold cut
   * to qualify it. The bright step stays available for dots and washes.
   */
  teal: ramp.teal[600],
  tealEdge: ramp.teal[700],
  tealTint: ramp.teal[200],
  tealInk: ramp.teal[800],
  /**
   * The streak. One job, one place — the pill on the character's HUD.
   * A fill; `damage` is the readable ink in this hue.
   */
  coral: '#ff7a5c',
  /**
   * A battle slipping away, and only that.
   *
   * Retargeted from sabotage on 2026-08-09 and re-hued on 2026-08-27: it used
   * to be `ramp.accent[800]`, which is now an amber and would have made every
   * "behind pace" line read as an accent. It is a deep coral instead — the same
   * family as `coral`, dark enough to set body text in.
   */
  damage: '#b04530',
  /** @deprecated Kept so older call sites still compile. Use `damage`. */
  danger: '#b04530',
} as const;
```

- [ ] **Step 3: Re-point `earnedColor`**

`earnedColor` keeps its ramp step and therefore its job. Only its docstring
gains a line:

```ts
export const earnedColor = ramp.accent[600];
```

Append to that docstring, before the closing `*/`:

```
 * Unchanged by the Sunlit shift: it is `ramp.accent[600]` before and after, so
 * it moved hue with the ramp and kept its strength. It is a fill and an edge —
 * `colors.accentEdge` is the same value under the name the button uses.
```

- [ ] **Step 4: Run the contrast test**

Run: `npx vitest run --config vitest.config.ts src/ui/contrast.test.ts`

Expected: PASS, every assertion. **These values were computed against the test
before this plan was written**, so a failure here means a hex was mistyped, not
that the palette needs redesigning.

If one does fail, **adjust the hex value, never the threshold.** The thresholds
are WCAG's and are not negotiable inside this plan.

**Three margins are tight enough to be worth knowing before anyone nudges a
value.** Everything else clears 5:1 or better.

| pair | measures | floor |
|---|---|---|
| cream label on `colors.teal` | 4.51 | 4.5 |
| `ramp.accent[700]` on `colors.bg` | 4.67 | 4.5 |
| `ramp.neutral[600]` on `colors.bg` | 4.71 | 4.5 |

Lightening any of those three by a shade puts it under. That is the test's whole
job, but it is cheaper to know now.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run typecheck && npm test`

Expected: PASS. Nothing outside `theme.ts` has changed and every token name
still exists, so this is the check that the shift really was in place.

- [ ] **Step 6: Commit**

```bash
git add src/theme.ts
git commit -m "feat(theme): the Sunlit palette

Cream ground, amber accent, warm ink, and a fourth family for rest. Every
token keeps its name so the ~90 sites that read the ramps re-skin without
being edited — the ramps preserve their ink-strength contract step for step,
which is what makes that true.

Three roles replace the one accent: a fill (1.9:1 as text, so never text), a
large-display ink at 3.3:1, and a body-size ink at 4.5:1+. Splitting them is
the whole reason this is not a find-and-replace. contrast.test.ts is green.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `colors.accent` splits — all 53 sites, classified

Every remaining use of `colors.accent` is a fill that stays or a text colour
that must move. There is no rule that decides it from the code, because the
prop is called `color` in both cases — `<Meter color={...}>` is a fill and
`<Feather color={...}>` is ink. The table below is the classification; work it
top to bottom.

**Files:** the twenty-two listed in the table.

**Interfaces:**
- Consumes: `colors.accent`, `colors.accentInk`, `colors.accentDeep` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Change the FILL sites — no edit, verify only**

These are fills and **stay on `colors.accent`**. Open each, confirm it is a
background, a meter fill, a rule, or an avatar tint, and move on. Do not edit.

| file:line | what it is |
|---|---|
| `src/ui/CtaPill.tsx:41` | `backgroundColor` |
| `src/ui/Button.tsx:68` | `primary` background — rewritten in Task 4 |
| `src/ui/TabPill.tsx:142` | `focused` disc — rewritten in Task 6 |
| `src/ui/Avatar.tsx:41` | self tint, `ink: colors.bg` sits on it |
| `src/features/quests/QuestList.tsx:52` | `Meter` fill |
| `src/features/character/StatBar.tsx:132` | `Meter` fill |
| `src/features/character/CharacterFigure.tsx:150` | aura fill |
| `src/features/squad/Leaderboard.tsx:504` | `toggleActive` background |
| `src/features/squad/LeaderboardRow.tsx:241` | background |
| `src/features/squad/RaceLane.tsx:279` | the finish rule — file retired in plan 3 |
| `src/features/squad/RaceCard.tsx:57` | `Meter` fill — file retired in plan 3 |
| `src/features/squad/RaceCard.tsx:74` | pip background — file retired in plan 3 |
| `src/features/train/DailyWalkCard.tsx:86` | `Meter` fill |
| `src/features/events/BattleCard.tsx:130` | the `FILL` tone map |
| `app/(tabs)/profile.tsx:237` | `chipOn` background |
| `app/(tabs)/index.tsx:768` | background — screen rewritten in plan 2 |

- [ ] **Step 2: Change the INK sites to `colors.accentDeep`**

All of these set text, a glyph, or a hairline on `colors.bg` or on a card, at
body size. Replace `colors.accent` with `colors.accentDeep` in each.

| file:line | what it is |
|---|---|
| `src/ui/Button.tsx:44` | busy spinner on a non-primary button — rewritten in Task 4 |
| `src/features/character/StatBar.tsx:104` | `StatIcon` glyph |
| `src/features/character/StatBar.tsx:163` | `statLane` text |
| `src/features/character/StatBar.tsx:164` | `laneTag` text |
| `src/features/character/StatBar.tsx:171` | `meterLane` 1px border |
| `src/features/character/FirstSyncCallout.tsx:75` | `card` 1px border |
| `src/features/character/FirstSyncCallout.tsx:77` | `label` text |
| `src/features/character/SyncStatus.tsx:141` | `actionLabel` text |
| `src/features/health/HealthPermissionSheet.tsx:130` | `label` text |
| `src/features/squad/Leaderboard.tsx:315` | `ActivityIndicator` |
| `src/features/squad/SquadDataConsentSheet.tsx:179` | `eyebrow` text |
| `src/features/squad/RaceLane.tsx:237` | `nameSelf` text — file retired in plan 3 |
| `src/features/squad/RaceTrack.tsx:99` | `eyebrow` text — file retired in plan 3 |
| `src/features/squad/CreateSquadForm.tsx:111` | `selectionColor` — the caret |
| `src/features/squad/CreateSquadForm.tsx:205` | `programSelected` border |
| `src/features/squad/CreateSquadForm.tsx:207` | `programLabelSelected` text |
| `src/features/squad/CreateSquadForm.tsx:221` | input underline |
| `src/features/squad/JoinSquadForm.tsx:128` | `selectionColor` |
| `src/features/squad/JoinSquadForm.tsx:214` | input underline |
| `src/features/squad/JoinSquadForm.tsx:249` | border |
| `src/features/squad/JoinSquadForm.tsx:254` | `boostLabel` text |
| `src/features/notifications/NotificationPermissionSheet.tsx:71` | `label` text |
| `app/progress.tsx:106` | `StatIcon` glyph |
| `app/progress.tsx:144` | text |
| `app/train.tsx:264` | `areaStateOn` text |
| `app/delete-account.tsx:124` | `survivesLabel` text |
| `app/join/[code].tsx:85` | `ActivityIndicator` |
| `app/(tabs)/profile.tsx:72` | `ActivityIndicator` |
| `app/(tabs)/squad.tsx:69` | `ActivityIndicator` — file renamed in Task 7 |
| `app/_layout.tsx:73` | `ActivityIndicator` |
| `app/_layout.tsx:160` | `ActivityIndicator` |
| `app/event/[id].tsx:78` | `ActivityIndicator` |
| `app/event/new.tsx:53` | `ActivityIndicator` |
| `app/(onboard)/name.tsx:86` | `selectionColor` |
| `app/(onboard)/name.tsx:90` | focused input underline |
| `app/(tabs)/index.tsx:811` | text — screen rewritten in plan 2 |

A caret and a 1px rule are "meaningful non-text" under WCAG and want 3:1, not
4.5:1 — `accentInk` would technically pass. They go to `accentDeep` anyway,
because a hairline at exactly 3:1 on a cream ground is a hairline nobody sees,
and because one rule for "accent that is not a fill" is worth more here than
two.

- [ ] **Step 3: Change the one large-display site to `colors.accentInk`**

`app/_layout.tsx:203` — `holdMark`, the KAIRO wordmark on the hold overlay, set
in `font.display.brand` at 34pt. This is the one place in the current codebase
that qualifies for the large-text role.

```ts
  holdMark: { color: colors.accentInk, ...font.display.brand },
```

- [ ] **Step 4: Move `Label`'s accent eyebrow off the ramp**

`src/ui/Label.tsx:35` reads `ramp.accent[700]`, which passes on cream (4.71:1)
and on a card (4.81:1) but measures **4.30:1** on the amber wash — and plan 2
puts eyebrows on that wash. One value that is right on all three grounds is
worth more than a rule about which ground an eyebrow is allowed on.

```ts
  accent: { color: colors.accentDeep },
```

Add `colors` to the file's import, which currently pulls only `font` and `ramp`:

```ts
import { colors, font, ramp } from '../theme.ts';
```

`ramp` is still read by the `sage` and `muted` tones, so it stays.

- [ ] **Step 5: Prove no `color:` still points at the fill**

Run:

```bash
grep -rn "color: colors\.accent\b\|color={colors\.accent}" src app --include="*.tsx" --include="*.ts"
```

Expected: **no output.** Every remaining `colors.accent` is a
`backgroundColor`, a `border*Color`, or a value in a fill map.

If a line appears that Step 1 classified as a fill, it is a `<Meter color=…>`
or a `<CharacterFigure color=…>` — those are fills reached through a prop named
`color` and are the exception this grep cannot distinguish. Confirm by opening
it; there are five such lines and all five are in Step 1's table.

- [ ] **Step 6: Typecheck and run the suite**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(theme): split accent's fill and ink call sites

53 sites, classified one at a time, because the prop is named 'color' whether
it is a Meter's fill or a Feather glyph's ink and nothing in the code
distinguishes them. Fills stay on colors.accent; body-size text, glyphs,
carets and hairlines move to accentDeep; the 34pt hold-overlay wordmark is the
one site that qualifies for accentInk.

The 37 sites reading ramp.accent[N] are deliberately untouched — the ramp kept
its ink-strength contract, so they were already right.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `Button` gets the Sunlit lip

The design's buttons carry a hard 3px edge (`box-shadow: 0 4px 0 #DC9014`) and
a teal secondary. In React Native this is a `borderBottomWidth`, not a shadow —
a shadow blurs and this edge does not.

**Files:**
- Modify: `src/ui/Button.tsx`

**Interfaces:**
- Consumes: `colors.accentEdge`, `colors.teal`, `colors.tealEdge`, `colors.accentDeep` from Task 2.
- Produces: `Button`'s prop signature is unchanged — `variant` keeps its four values, so no call site is edited.

- [ ] **Step 1: Replace the styles block and the spinner colour**

In `src/ui/Button.tsx`, replace the `ActivityIndicator` line:

```tsx
          <ActivityIndicator color={variant === 'primary' ? colors.text : colors.accentDeep} />
```

and replace the whole `StyleSheet.create` call:

```ts
const styles = StyleSheet.create({
  base: {
    marginTop: space.sm,
    minHeight: 56,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * The lip.
   *
   * `borderBottomWidth`, never `shadow` — the design's `0 4px 0` has no blur,
   * and RN's `shadowRadius: 0` still composites differently on the two
   * platforms. A border is the same 3px everywhere and costs nothing.
   *
   * It is on the filled variants only. A ghost button has no body for an edge
   * to be the underside of.
   */
  primary: {
    backgroundColor: colors.accent,
    borderBottomWidth: 3,
    borderBottomColor: colors.accentEdge,
  },
  secondary: {
    backgroundColor: colors.teal,
    borderBottomWidth: 3,
    borderBottomColor: colors.tealEdge,
  },
  ghost: {},
  /**
   * Leaving a battle, leaving a squad.
   *
   * Outlined in the damage colour rather than filled with it: these belong at
   * the foot of a screen and must not compete with the primary action above
   * them, but "quiet" was taken too far once — both were 12.5pt grey text,
   * which hand-testing did not read as a button at all. Chrome without weight
   * is what this variant is for. It takes no lip, because it has no fill to be
   * the underside of. The `Alert.alert` confirm behind each one is still the
   * real guard.
   */
  destructive: {
    borderWidth: 1,
    borderColor: colors.damage,
    backgroundColor: 'transparent',
  },
  disabled: { opacity: 0.45 },
  label: { ...font.display.action },
  /** `colors.text` on amber is 6.4:1. `colors.bg` on it would be 1.9:1. */
  primaryLabel: { color: colors.text },
  /** Cream on teal. The one filled variant whose label is light. */
  secondaryLabel: { color: colors.bg },
  ghostLabel: { color: colors.accentDeep },
  destructiveLabel: { color: colors.damage },
});
```

- [ ] **Step 2: Fix the now-unused import**

`ramp` and `shadow` are no longer read by this file. Update the import to
exactly what remains:

```ts
import { colors, font, radius, space } from '../theme.ts';
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: PASS. A leftover `ramp` or `shadow` import surfaces here as an
unused-import error rather than at runtime.

- [ ] **Step 4: Run the suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Button.tsx
git commit -m "feat(ui): Sunlit buttons — a hard lip and a teal secondary

borderBottomWidth rather than a shadow: the design's 0 4px 0 has no blur, and
RN composites a zero-radius shadow differently on the two platforms.

The secondary variant becomes the teal fill the design uses for its second
action. primaryLabel moves to colors.text — cream on amber is 1.9:1, which is
the same trap the accent split exists for, one layer down.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `Panel` gains `sky` and `tint`, and `plain` gains an elevation

On Sunlit a card is separated from the ground by shadow rather than by tint —
`colors.surface` and `colors.bg` differ by a hair on purpose. `plain` therefore
needs an elevation it did not need before, or every card on the app dissolves
into the page.

**Files:**
- Modify: `src/ui/Panel.tsx`

**Interfaces:**
- Consumes: `colors.sky`, `colors.surface`, `ramp.accent[200]` from Task 2.
- Produces: `Panel`'s `variant` union gains `'sky'` and `'tint'` — `'plain' | 'lift' | 'earned' | 'sky' | 'tint'`. Plan 2 mounts both.

- [ ] **Step 1: Widen the variant union**

```tsx
export function Panel({
  variant = 'plain',
  style,
  children,
}: {
  variant?: 'plain' | 'lift' | 'earned' | 'sky' | 'tint';
  style?: ViewStyle;
  children: ReactNode;
}) {
```

- [ ] **Step 2: Replace the component's docstring**

```tsx
/**
 * The only card in the app.
 *
 * On Sunlit a card is separated from the ground by **shadow**, not by tint:
 * `colors.surface` and `colors.bg` differ by a hair on purpose. That is a
 * change from the warm system that preceded it, where the tint did the work —
 * so `plain` carries an elevation now, and anything reaching for a darker
 * surface to make a card legible is working against the system twice over.
 *
 * - `plain` — the default. Card tint plus a small shadow: it sits on the page.
 * - `lift` — leaves the page. White plus a real shadow, for chrome floating
 *   over content.
 * - `earned` — sage, with an amber top edge. The glow rule's one expression on
 *   a card, and it belongs to a banked Streak Shield and the squad leader's
 *   row, nothing else.
 * - `sky` — the warm field the character occupies. **Not a card**: no shadow,
 *   because it is a place rather than an object, and nothing that is not the
 *   character's own sky may use it.
 * - `tint` — the amber wash that means *this one is you*. The self row on a
 *   board, and the name block on the onboarding meet screen.
 */
```

- [ ] **Step 3: Add the two variants and give `plain` its shadow**

Replace the `plain` entry and add the two new ones inside `StyleSheet.create`:

```ts
  plain: { backgroundColor: colors.surface, ...shadow.sm },
  // `overflow: 'hidden'` on `base` clips a shadow on Android, where elevation
  // is drawn by the platform rather than composited outside the bounds. iOS
  // ships first (§15) and renders this correctly; if Android matters later,
  // these variants need a wrapper view to carry the shadow.
  lift: { backgroundColor: colors.surfaceLift, ...shadow.md },
  earned: { backgroundColor: ramp.sage[200] },
  /** No shadow, deliberately. A place does not float. */
  sky: { backgroundColor: colors.sky },
  tint: { backgroundColor: ramp.accent[200] },
```

- [ ] **Step 4: Typecheck and run the suite**

Run: `npm run typecheck && npm test`

Expected: PASS. No existing call site passes `sky` or `tint` yet, and every
current variant name still resolves.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Panel.tsx
git commit -m "feat(ui): Panel gains sky and tint, and plain gains a shadow

On Sunlit the card tint and the page ground differ by a hair, so tint alone no
longer separates a card from what it sits on — plain carries shadow.sm now or
every card dissolves into the page.

sky is a place rather than an object and takes no shadow. tint is the amber
wash that means 'this one is you'. Plan 2 mounts both.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: `TabPill` flattens to four labelled items

**Files:**
- Rewrite: `src/ui/TabPill.tsx`

**Interfaces:**
- Consumes: `colors.surfaceLift`, `colors.accentDeep` from Task 2.
- Produces: `NAV_HEIGHT` stays exported and stays **96**. `LABELS` and `ICONS` are re-keyed to `index` / `sky` / `flock` / `profile`, which Task 7 creates. **This task leaves the app broken until Task 7 lands** — the two are one change split for reviewability, and Task 7's commit is the one that must be green.

**`src/ui/Screen.tsx` is not edited.** The spec's §4.4 anticipated it would be,
on the assumption that flattening the bar would move `NAV_HEIGHT`. It does not:
the discs became a bar of the same height, so `TAB_PILL_CLEARANCE` is unchanged
and every screen's bottom padding is already correct. Touching `Screen` here
would be a change with no cause.

- [ ] **Step 1: Rewrite the file**

```tsx
import Feather from '@expo/vector-icons/Feather';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, font, radius, shadow, space } from '../theme.ts';
import { useChromeStore } from './chrome.ts';
import { Text } from './Text.tsx';

/**
 * Route name -> label. **Painted as well as spoken**, since 2026-08-27.
 *
 * It used to be `accessibilityLabel` only, because three word-discs read as
 * buttons rather than as places. A flat four-item bar is not three discs: the
 * label is what makes it a bar, and the design carries one under every glyph.
 * These strings are load-bearing in both jobs now.
 */
const LABELS: Record<string, string> = {
  index: 'Today',
  sky: 'Sky',
  flock: 'Flock',
  profile: 'You',
};

/**
 * Feather, because lucide is a fork of Feather and the design's glyphs are
 * literally these at the same 2px stroke. The hairline/solid split is total in
 * both directions: chrome is Feather, character data is
 * MaterialCommunityIcons. Do not blur it here.
 */
const ICONS: Record<string, 'sun' | 'wind' | 'users' | 'user'> = {
  index: 'sun',
  // The sky corridor, and the nearest Feather has to a bird in flight without
  // reaching into a second family.
  sky: 'wind',
  flock: 'users',
  profile: 'user',
};

/**
 * The tab bar. A `BottomTabBar` replacement passed as the `tabBar` prop on the
 * `Tabs` navigator, so it receives React Navigation's own props unmodified —
 * including `insets`, which is why no `useSafeAreaInsets` call lives here.
 *
 * **Flat, and no raised disc** (2026-08-27, superseding deviation #50). The
 * raised disc meant *anchor*, and the anchor was the character tab. There is no
 * character tab now, and raising an arbitrary one of four is exactly what that
 * deviation forbade. Do not reintroduce one.
 *
 * `NAV_HEIGHT` is unchanged at 96, so `TAB_PILL_CLEARANCE` does not move and no
 * screen's bottom padding changes with this.
 */
export const NAV_HEIGHT = 96;

const ICON_SIZE = 22;

/**
 * The bar's own inset from the screen edge. Named because the width budget
 * below is computed against it: 320 - 2*14 = 292pt of usable bar.
 */
const BAR_INSET = 14;

export function TabPill({ state, navigation, insets }: BottomTabBarProps) {
  // Create and join are full-screen tasks. `Screen` drops its clearance on the
  // same flag, so the two stay in step.
  const navHidden = useChromeStore((s) => s.navHidden);
  if (navHidden) return null;

  // The bar's order, which the navigator's need not match and does not.
  const order = ['index', 'sky', 'flock', 'profile'];
  const routes = order
    .map((name) => state.routes.find((r) => r.name === name))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { bottom: insets.bottom + space.sm, left: BAR_INSET, right: BAR_INSET }]}
    >
      {routes.map((route) => {
        const focused = state.routes[state.index]?.key === route.key;
        const label = LABELS[route.name] ?? route.name;
        const ink = focused ? colors.accentDeep : colors.muted;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => navigation.navigate(route.name)}
            style={styles.item}
          >
            {/*
              Both halves of the grouping fix. The `Pressable` already names
              itself, so the glyph and the painted label must not be reachable
              as their own stops — otherwise a four-tab bar is eight.
            */}
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.itemBody}
            >
              <Feather name={ICONS[route.name] ?? 'user'} size={ICON_SIZE} color={ink} />
              {/*
                `numberOfLines={1}` and no fixed width on the item.

                At the `chrome` scale's 1.4x cap a 10pt label reaches ~14pt and
                "FLOCK" measures about 56pt — four fixed 64pt items still fit
                the 292pt budget, but a fixed width here is the two-column row
                that could not fit past ~1.3x, in a new place. Let the items
                flex and let the word truncate rather than the row break.
              */}
              <Text
                scale="chrome"
                numberOfLines={1}
                style={[styles.label, focused ? styles.labelOn : styles.labelOff]}
              >
                {label.toUpperCase()}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    height: NAV_HEIGHT - space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLift,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    paddingHorizontal: space.sm,
    ...shadow.md,
  },
  // `flex: 1` rather than a width: four equal shares of whatever the screen
  // gives, so the bar is correct at 320pt and at 440pt without a breakpoint.
  item: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  itemBody: { alignItems: 'center', gap: space.xs },
  label: { ...font.body.label },
  labelOn: { color: colors.text },
  labelOff: { color: colors.muted },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: **FAIL**, and only in `app/(tabs)/_layout.tsx` — the navigator still
declares `today` and `squad`, which `order` no longer lists. This is the
expected intermediate state; Task 7 resolves it. Do not fix it here by
re-adding the old names.

- [ ] **Step 3: Commit**

```bash
git add src/ui/TabPill.tsx
git commit -m "feat(ui): flatten the tab bar to four labelled items

One white pill, four equal shares, a Feather glyph over a painted label. The
raised centre disc goes: it meant 'anchor', the anchor was the character tab,
and deviation #50's own reasoning forbids raising an arbitrary one of four.

NAV_HEIGHT stays 96 so TAB_PILL_CLEARANCE does not move. Items flex rather
than holding a width — at the chrome scale's 1.4x cap FLOCK reaches ~56pt, and
a fixed width here is the two-column row that could not fit past 1.3x.

Does not typecheck until the routes are renamed in the next commit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The routes are renamed, and push routing moves with them

`/today` and `/squad` stop existing. A tap that lands nowhere is
indistinguishable from push being broken, so `notificationTarget` is remapped in
the same commit — this is the rule `goal_completed` is kept alive by.

**Files:**
- Rename: `app/(tabs)/squad.tsx` → `app/(tabs)/flock.tsx`
- Create: `app/(tabs)/sky.tsx`
- Move: `app/(tabs)/today.tsx` → `src/features/character/TodayShelf.tsx`
- Modify: `app/(tabs)/_layout.tsx`
- Modify: `src/features/notifications/routing.ts`
- Modify: `src/features/notifications/routing.test.ts`
- Modify: `app/join/[code].tsx:94,110,130`

**Interfaces:**
- Consumes: `TabPill`'s `order` from Task 6 — `index`, `sky`, `flock`, `profile`.
- Produces: `NotificationDestination` becomes `'/' | '/flock' | '/sky' | '/train' | \`/event/${string}\``.

- [ ] **Step 1: Write the failing routing test**

Replace the first two cases in `src/features/notifications/routing.test.ts`:

```ts
  it('sends the daily digest to the Today tab, which is now `/`', () => {
    // The one scheduled push (deviation #52). `dispatch-notifications` still
    // sends `screen: 'today'` and is not redeployed — only this build's
    // reading of it moved, because Today became the tabs group's index on
    // 2026-08-27 and `/today` no longer resolves.
    expect(
      notificationTarget({
        trigger: 'daily_digest',
        localDate: '2026-08-25',
        screen: 'today',
      }),
    ).toBe('/');
  });

  it('still lands a squad push from before the digest, on the Flock tab', () => {
    // Historical, from the retired evening loop, and `notification_log.kind` is
    // free text — these payloads genuinely still exist. `/squad` is gone, so
    // this resolves to the tab that replaced it rather than to nothing.
    expect(
      notificationTarget({
        trigger: 'day_ending_soon',
        localDate: '2026-08-14',
        screen: 'squad',
      }),
    ).toBe('/flock');
  });
```

And add one case at the end of the first `describe`, immediately before its
closing `});`:

```ts
  it('never returns a route the app no longer has', () => {
    // The whole point of the two cases above, stated once so it cannot be
    // regressed by editing them individually. `/today` and `/squad` were real
    // routes until 2026-08-27; a payload still naming them must land on a real
    // screen, and the union type is not enough on its own because a historical
    // string can be added back to the switch by hand.
    const retired = ['/today', '/squad'];
    for (const screen of ['today', 'squad', 'character', 'events', 'goals', 'train']) {
      const target = notificationTarget({ screen });
      if (target !== null) expect(retired).not.toContain(target);
    }
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config vitest.config.ts src/features/notifications/routing.test.ts`

Expected: FAIL — three assertions, `expected '/today' to be '/'` among them.

- [ ] **Step 3: Remap `routing.ts`**

Replace the `NotificationDestination` union:

```ts
export type NotificationDestination =
  | '/'
  | '/flock'
  | '/sky'
  | '/train'
  | `/event/${string}`;
```

Replace the `CHARACTER_TAB` constant and its docstring:

```ts
/**
 * The Today tab, and the fallback for anything addressable but underspecified.
 *
 * It is `/` — the tabs group's index. Today *became* the index on 2026-08-27
 * when the character tab dissolved, so this constant changed meaning without
 * changing value, and the historical `screen: 'character'` payloads kept
 * working for free.
 *
 * Emphatically **not** `/character`, which does not exist any more either: it
 * was the onboarding species picker, retired with the one-Kairo change. A
 * future route by that name would inherit exactly one silent confusion.
 */
const HOME_TAB = '/' as const;
```

Replace the three `case` arms:

```ts
    case 'today':
      // The digest's destination (deviation #52). Today is the index tab since
      // 2026-08-27; `/today` no longer resolves and must not be returned.
      return HOME_TAB;
    case 'squad':
      // **Historical**, from the retired evening loop. The squad tab is the
      // Flock tab now, and a tap that goes nowhere is indistinguishable from
      // push being broken.
      return '/flock';
    case 'character':
      // **Historical**, from the retired mid-morning nudge. The character tab
      // is gone and its hero is the first thing on Today.
      return HOME_TAB;
```

Then replace the remaining three `CHARACTER_TAB` references in the `'events'`
and `'goals'` arms with `HOME_TAB`, and update the file's header comment: the
sentence listing the historical shapes should read

```
 * Three shapes are **historical** and still routed, because a push sent minutes
 * before a deploy can be tapped minutes after it: `{ screen: 'goals', goalId }`
 * from before the 2026-08-25 Goals -> Events rename, and `{ screen: 'squad' }`
 * and `{ screen: 'character' }` from the three scheduled pushes deviation #52
 * retired. `'today'` is not historical — it is live — but its *route* moved on
 * 2026-08-27 and the payload did not.
```

- [ ] **Step 4: Run the routing test to verify it passes**

Run: `npx vitest run --config vitest.config.ts src/features/notifications/routing.test.ts`

Expected: PASS.

- [ ] **Step 5: Rename the tab files, and keep the Today shelf mounted**

```bash
git mv "app/(tabs)/squad.tsx" "app/(tabs)/flock.tsx"
git mv "app/(tabs)/today.tsx" "src/features/character/TodayShelf.tsx"
```

In the renamed `app/(tabs)/flock.tsx`, rename the default export:

```tsx
export default function Flock() {
```

**`today.tsx` is moved, not deleted, and this is a correctness point rather than
a convenience.** Deleting it would take quests, the Daily Walk, the Challenge
door and two telemetry markers off the app for the whole gap between this plan
and plan 2 — `race_seen` and `quest_cleared` fire from that file, and nothing
else claims those markers. This plan's claim to leave a shippable app would be
false. Moving it costs three lines.

In the moved `src/features/character/TodayShelf.tsx`, make exactly two changes.
Rename the export:

```tsx
export function TodayShelf() {
```

and replace its `<Screen>` wrapper with a plain `<View>`, because `index.tsx`
already provides the scroll container and a `ScrollView` inside a `ScrollView`
scrolls neither well:

```tsx
  return (
    <View>
      <Label>Today</Label>
```

...and the closing `</Screen>` becomes `</View>`. Update the imports: drop
`Screen` from the `@/ui` import, and add `View` to the `react-native` import
(the file does not currently import it).

Its docstring gains a line at the top:

```
 * **Interim shape (2026-08-27).** This was `app/(tabs)/today.tsx` until the
 * character tab dissolved. It is mounted at the foot of the Today tab so
 * quests, the Daily Walk and the `race_seen` / `quest_cleared` markers keep
 * working, and plan 2 dissolves it into that screen's real composition. Do not
 * build anything new on it.
```

- [ ] **Step 6: Create the Sky tab as a placeholder that is honest about itself**

`app/(tabs)/sky.tsx`:

```tsx
import { RaceTrack } from '@/features/squad/RaceTrack.tsx';
import { useSessionStore } from '@/features/auth/session.ts';
import { useMySquad, useSquadLeaderboard } from '@/features/squad/queries.ts';
import { Label, Screen } from '@/ui/index.ts';

/**
 * The Sky tab — the daily race, on a screen of its own.
 *
 * **This is the tab's foundation, not its design.** Plan 3 replaces
 * `RaceTrack` with the sky corridor from `Canvas.dc.html` screen 2c. Until
 * then it renders the track that was on the squad screen, moved rather than
 * redrawn, so the tab is real and navigable from the moment it exists.
 *
 * It reads the **same query** the Flock board reads, on the same key, so the
 * two cannot disagree in one frame and this tab adds no request. The re-rank by
 * capped steps happens inside `RaceTrack`; `squad_leaderboard()` orders by the
 * program-weighted total and must keep doing so (deviation #11).
 */
export default function Sky() {
  const session = useSessionStore((s) => s.session);
  const squad = useMySquad(session?.user.id);
  const board = useSquadLeaderboard(squad.data?.id, 'current');

  return (
    <Screen>
      <Label>Today&apos;s race</Label>
      <RaceTrack rows={board.data ?? []} />
    </Screen>
  );
}
```

- [ ] **Step 7: Mount the shelf on the Today tab**

At the foot of `app/(tabs)/index.tsx`'s `ScrollView`, immediately before its
closing `</ScrollView>`, add:

```tsx
        {/* Interim (2026-08-27): the Today tab is the character screen plus the
            shelf that used to be its own tab, until plan 2 composes the two
            into one screen. Both were already mounting the same queries on the
            same keys, so this adds no request. */}
        <TodayShelf />
```

and import it:

```tsx
import { TodayShelf } from '@/features/character/TodayShelf.tsx';
```

- [ ] **Step 8: Update the navigator**

In `app/(tabs)/_layout.tsx`, replace the four `Tabs.Screen` lines and the
comment above them:

```tsx
        {/* This order is the navigator's; `TabPill`'s own `order` array is the
            bar's. They are allowed to differ, and here they agree. */}
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="sky" options={{ title: 'Sky' }} />
        <Tabs.Screen name="flock" options={{ title: 'Flock' }} />
        <Tabs.Screen name="profile" options={{ title: 'You' }} />
```

- [ ] **Step 9: Repoint the three `/squad` navigations**

In `app/join/[code].tsx`, lines 94, 110 and 130 — replace each
`router.replace('/squad')` with `router.replace('/flock')`.

- [ ] **Step 10: Prove no retired route literal survives**

Run:

```bash
grep -rn "'/squad'\|\"/squad\"\|'/today'\|\"/today\"" src app --include="*.ts" --include="*.tsx"
```

Expected: **no output.**

- [ ] **Step 11: Typecheck and run the whole suite**

Run: `npm run typecheck && npm test`

Expected: PASS. Typed routes are on (`experiments.typedRoutes`), so a route
literal that no longer resolves is a compile error rather than a runtime
surprise — this step is the real check that the rename is complete.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(nav): Today, Sky, Flock, You

The character tab dissolves — its hero belongs at the top of Today and its
level and growth on You, and a third home for the same subject is what
deviation #50 split apart. index becomes Today, squad becomes flock, and sky is
a new tab that shows the moved RaceTrack until plan 3 redraws it as the
corridor.

Push routing moves in the same commit or taps land nowhere: 'today' resolves to
'/' and 'squad' to '/flock'. dispatch-notifications is unchanged and is not
redeployed — only this build's reading of the payload moved. A test asserts no
retired route can be returned.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Documentation

Documentation is part of the change, not a follow-up. This task records what
plans 2 and 3 must not undo.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/roadmap.md`
- Modify: `README.md`

- [ ] **Step 1: Add the two deviation rows**

In `docs/roadmap.md`, append to the approved-deviations table (currently ending
at #52):

```markdown
| 53 | The warm "Organic" system: cream ground, terracotta accent, three colour families (2026-08-04 redesign) | **Sunlit.** Same token names, new values — amber accent, warmer ink, and teal as a fourth family for rest and the secondary action. `colors.accent` **splits into three roles**: a fill (`#f5a623`, 1.9:1 as text and therefore never text), `accentInk` for large display type, and `accentDeep` for body-size accent text. | The design's accent is a fill colour and the old one was not, so one token could no longer do both jobs — pointing a `color:` at amber renders perfectly and is unreadable. The ramps keep their ink-strength contract step for step, which is what let 37 `ramp.accent[N]` call sites migrate without being edited. `src/ui/contrast.test.ts` pins every claim. |
| 54 | Four tabs — Character · Today · Squad · You, with the character raised (#50) | **Four tabs — Today · Sky · Flock · You, flat.** The character tab dissolves: its hero opens Today, its level and growth live on You. The race gets a tab of its own. | The design has no character tab, and three screens whose subject is the character is what #50 split apart. The raised disc meant *anchor* and the anchor was the character tab; raising an arbitrary one of four is what #50 itself forbids. `NAV_HEIGHT` stays 96 so no screen's clearance moves. Push routing remaps in the same commit — `/today` and `/squad` stop resolving, and a tap that goes nowhere is indistinguishable from push being broken. |
```

- [ ] **Step 2: Add the CLAUDE.md block**

Insert immediately before the block beginning **"Kairo has four tabs as of
2026-08-25"**, and change that block's opening words to
**"Kairo had four tabs from 2026-08-25 to 2026-08-27"** so the two read in
sequence rather than contradicting each other.

```markdown
**Kairo is Sunlit as of 2026-08-27** (deviations #53, #54). The palette shifted
in place — every token in `src/theme.ts` kept its name and changed its value, so
around ninety call sites re-skinned without being edited. The tabs are
**Today · Sky · Flock · You**, flat, and the character tab is gone. Three things
break easily:

- **`colors.accent` is a fill and never text.** It is `#f5a623`, which measures
  **1.9:1** on the cream ground — invisible, and it renders perfectly while
  being so. The terracotta it replaced measured 4.7:1 and could do both jobs,
  which is why 53 call sites had to be classified by hand rather than
  find-and-replaced: the prop is named `color` whether it is `<Meter>`'s fill or
  `<Feather>`'s ink. Body-size accent text is **`colors.accentDeep`**; large
  display type is **`colors.accentInk`** (3.3:1, so 24pt and up only). The guard
  is `src/ui/contrast.test.ts`, which asserts `accent` *fails* as text — so the
  test goes red if the value ever drifts back into a range that would tempt
  somebody.
- **The ramps' step contract is ink strength, and 37 call sites depend on it.**
  200 is a wash you set text on, 500 is a fill, 700 and 800 are inks.
  `ramp.accent[700]` in particular must stay at or above 4.5:1 on `colors.bg`,
  because `Label`'s accent eyebrow is 10pt and reads it — that is why the
  design's own `#c9721c` is *not* a ramp step but a separate large-text-only
  role. Change a step's strength and every site reading it goes wrong at once,
  silently.
- **`NAV_HEIGHT` stays 96 and there is no raised disc.** The discs became a flat
  bar; the bar's height did not move, so `TAB_PILL_CLEARANCE` and every screen's
  bottom padding are unchanged. The raised disc meant *anchor* and the anchor
  was the character tab — do not add one back for Today. Tab items are `flex: 1`
  with `numberOfLines={1}`: the labels are painted now, and at the `chrome`
  scale's 1.4× cap "FLOCK" reaches ~56pt, so a fixed item width is the
  two-column row that could not fit past 1.3× in a new place.
- **`/today` and `/squad` no longer resolve.** `notificationTarget()` maps
  `'today'` → `/` and `'squad'` → `/flock`. `dispatch-notifications` still sends
  `screen: 'today'` and was **not** redeployed — only the client's reading moved,
  which is why this needed no Edge Function change. A test asserts no retired
  route can be returned.
```

- [ ] **Step 3: Update README's tab list**

In `README.md`, replace any description of the tab set with:

```markdown
Four tabs: **Today** (the character and the day), **Sky** (the daily race),
**Flock** (the squad) and **You**.
```

Run `grep -n "Character · Today · Squad\|four tabs\|Squad tab" README.md` first
to find every place that needs it.

- [ ] **Step 4: Verify the docs agree with the code**

Run:

```bash
grep -rn "raised\|centre disc" src/ui/TabPill.tsx
grep -n "NAV_HEIGHT = " src/ui/TabPill.tsx
```

Expected: `TabPill.tsx` says the raised disc is retired, and `NAV_HEIGHT = 96`.
A doc block claiming either of these while the code disagrees is the failure
this step exists to catch.

- [ ] **Step 5: Run the full suite one last time**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/roadmap.md README.md
git commit -m "docs: record the Sunlit shift and the four-tab restructure

Deviations #53 and #54. The three things plans 2 and 3 must not undo: accent
is a fill and never text, the ramps' steps are ink strengths that 37 call
sites depend on, and NAV_HEIGHT stays 96 with no raised disc.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Hand verification, before this plan is called done

Automated tests cannot see any of this. Both passes are mandatory — each
corresponds to a bug class this repo has already paid a build to find.

- [ ] **Default type.** `npm run ios`, then walk all four tabs. Check: no text has vanished into a low-contrast amber; every card is still distinguishable from the page now that `plain` carries the separation in shadow rather than tint; the tab bar's four labels are legible and the active one is obvious.

- [ ] **Largest type.** `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`, **then relaunch the app** — RN caches text measurements, so a size change on a running app renders correct text inside stale boxes and looks exactly like a layout regression. Check the tab bar specifically: four labels, one line each, nothing clipped mid-word and nothing pushed off the ends.

- [ ] **Accessibility Inspector.** Open it against the simulator and select the tab bar. Expected: **four** elements, each announcing its label and its selected state — not eight. The glyph and the painted label inside each item are hidden with both halves of the grouping fix, and this is the check that both halves took.

- [ ] `xcrun simctl io booted screenshot` at both sizes, for the record.

Simulator UI automation is unreliable on this machine — synthetic taps land
60–120 seconds late — so the taps and the Inspector pass are the user's.
Dynamic Type and screenshots are headless and can be run here.

## Definition of done

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes, including the new `src/ui/contrast.test.ts`
- [ ] `grep -rn "color: colors\.accent\b" src app --include="*.tsx" --include="*.ts"` returns nothing
- [ ] `grep -rn "'/squad'\|'/today'" src app --include="*.ts" --include="*.tsx"` returns nothing
- [ ] `npm run eas:fingerprint` matches the value from before the branch — this plan adds no native input, and that is the property that keeps it OTA-shippable
- [ ] All four tabs navigate, at default and at the largest content size
- [ ] The tab bar is four accessibility elements, confirmed in the Inspector
- [ ] `CLAUDE.md`, `docs/roadmap.md` and `README.md` describe the app that now exists

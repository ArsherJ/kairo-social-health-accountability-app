# One Kairo and the Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every character becomes a Philippine eagle, onboarding becomes a meeting rather than a picker, and Today / You / Flock take the compositions from `Canvas.dc.html` screens 2a, 2b, 2d and 2e.

**Architecture:** `profiles.species` is never written differently — a single `DEFAULT_SPECIES` resolution at the render boundary makes everyone an eagle while every stored value survives, so the decision is a one-line reversal rather than a migration. The bird's sentences move into a pure zero-import copy module, the same split `race-label.ts` and `quest-copy.ts` already use, so the voice is tested in Node and no screen decides what to say. The three screens are then re-composed from components that already exist: this is a layout change, not a rewrite of the features underneath it.

**Tech Stack:** TypeScript, Expo SDK 57, Expo Router, React Native 0.86, Vitest (Node), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-27-one-kairo-one-sky-design.md`

## This is plan 2 of 3

| plan | covers | status |
|---|---|---|
| 1 — Sunlit Foundation | Tokens, primitives, navigation, push routing | must land first |
| **2 — One Kairo and the screens (this plan)** | `DEFAULT_SPECIES`, onboarding, Today / You / Flock, `kairo-voice.ts` | |
| 3 — The Sky | `sky-path.ts`, the corridor, retiring `RaceTrack` / `RaceLane` / `RaceCard` | after this one |

**Depends on plan 1** for four things, all in Task 5 onward: `Panel`'s `sky` and
`tint` variants, `colors.accentInk` / `accentDeep` / `sky` / `teal*`, the
`index` / `sky` / `flock` / `profile` route names, and
`src/features/character/TodayShelf.tsx`, which plan 1 created as the interim
home for quests and which Task 5 dissolves.

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include these.

- **No migration, no `supabase/` change, no Edge Function redeploy.** `profiles.species` is read differently, never written differently.
- **`tierFor`, `TIER_POINTS`, `THRESHOLDS`, `computeDailyScore`, `planDay`, `RACE_FINISH_LINE`, `rankRacers`, `cappedSteps` are untouched.** `10_000` must not appear as a literal in any new module.
- **No new native dependency.** Anything that moves the fingerprint costs one of the month's fifteen EAS builds.
- **The disclosure gate does not move.** Deviation #37's constant, its `total > 0` filter, its lifetime-not-recent rule and its `resolved && stage` navigation rule are unchanged. Only which *file* mounts each gated surface changes, and Task 8 records where each landed.
- **No surface renders an engine key.** Stat words come from `src/ui/stat-names.ts`. `stat-names.test.ts` scans `src` and `app` for "Agility" and must stay green.
- **No surface renders a score total.** `daily_scores.total` still ranks the board and feeds XP; nothing prints it. Raw units only.
- **`src/ui/Text.tsx` is the only Text.** Import from `@/ui`, never from `react-native`.
- **Do not import `@/ui/index.ts` from a module root Vitest tests** — reach sibling modules by relative path, as `program-copy.ts` reaches `stat-names.ts`.
- **Grouping is explicit, both halves** — `accessible` + `accessibilityLabel` on the parent, **and** `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"` on every direct child.
- **Onboarding steps go before the name, never after.** The profile row commits exactly once, on the last screen. Deviation #22 deleted the `finishingOnboarding` flag when onboarding collapsed; asking anything after the INSERT flips `resolveRoute` to `'ready'` under an unfinished screen and needs that flag back.
- **Every commit ends green** on `npm run typecheck` and `npm test`.

---

## Task 1: `DEFAULT_SPECIES`, and the eagle at the render boundary

The decision is display-only. Nothing writes `'eagle'` anywhere, and every
stored `'tamaraw'` survives untouched — which is the entire mechanism by which
this is reversible.

**Files:**
- Modify: `src/features/character/species.ts`
- Modify: `src/features/character/species.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DEFAULT_SPECIES: SpeciesId` (the value `'eagle'`), and `displaySpecies(stored: SpeciesId | null): SpeciesId`. Every render path that resolves art calls `displaySpecies`; Tasks 2, 5, 6 and 7 do.

- [ ] **Step 1: Write the failing test**

Append to `src/features/character/species.test.ts`:

```ts
describe('one Kairo (2026-08-27)', () => {
  it('defaults to the eagle', () => {
    expect(DEFAULT_SPECIES).toBe('eagle');
    // The default has to be a real registry entry, not a string that happens
    // to look like one — `SPECIES[DEFAULT_SPECIES]` is what every art lookup
    // ends up indexing.
    expect(SPECIES[DEFAULT_SPECIES]).toBeDefined();
  });

  it('shows the eagle for an account that never chose', () => {
    expect(displaySpecies(null)).toBe('eagle');
  });

  it('shows the eagle for an account that chose something else', () => {
    // The point of the deviation, not a side effect of it. Someone who picked
    // a tamaraw renders as an eagle from now on, and the stored value is what
    // makes that undoable.
    expect(displaySpecies('tamaraw')).toBe('eagle');
    expect(displaySpecies('pilandok')).toBe('eagle');
    expect(displaySpecies('carabao')).toBe('eagle');
  });

  it('keeps the other three in the registry', () => {
    // Deleting them would make this a migration rather than a display
    // decision. `SPECIES_IDS` still mirrors the CHECK constraint in
    // 20260818120000_species.sql, and that constraint did not move.
    expect(SPECIES_IDS).toEqual(['pilandok', 'tamaraw', 'carabao', 'eagle']);
  });

  it('does not change what the database is allowed to hold', () => {
    // `parseSpecies` guards a value coming off a URL or a row. Narrowing it to
    // the eagle would reject every stored row on read, which is the difference
    // between a display decision and a destructive one.
    expect(parseSpecies('tamaraw')).toBe('tamaraw');
    expect(parseSpecies('nothing')).toBeNull();
  });
});
```

Extend that file's existing import to cover the new names:

```ts
import {
  DEFAULT_SPECIES,
  SPECIES,
  SPECIES_IDS,
  displaySpecies,
  parseSpecies,
} from './species.ts';
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:core -- --run 2>/dev/null; npx vitest run --config vitest.config.ts src/features/character/species.test.ts`

Expected: FAIL — `DEFAULT_SPECIES` and `displaySpecies` are not exported.

- [ ] **Step 3: Add the two exports**

Append to `src/features/character/species.ts`:

```ts
/**
 * The one Kairo (roadmap deviation #55).
 *
 * Every character is a Philippine eagle as of 2026-08-27. Four species meant
 * the app had no character at all — nothing could be *about* your Kairo when
 * your Kairo was one of four interchangeable skins, and the picker asked for an
 * identity declaration at the highest-attention moment in onboarding to buy
 * that.
 */
export const DEFAULT_SPECIES: SpeciesId = 'eagle';

/**
 * The species to *draw*, given the species that is *stored*.
 *
 * Always the eagle. This is the entire mechanism of deviation #55 and it is
 * deliberately this small: `profiles.species` is not migrated, not dropped and
 * never written differently, so every pre-2026-08-27 choice survives in the
 * column and reversing the decision is deleting the first line of this
 * function.
 *
 * Call it at the **render boundary** — wherever art, a hue or a species name is
 * resolved. Do not call it before a write, and do not call it inside
 * `parseSpecies`, which guards what the database is allowed to hold and must
 * keep accepting all four or every stored row fails on read.
 */
export function displaySpecies(_stored: SpeciesId | null): SpeciesId {
  return DEFAULT_SPECIES;
}
```

The parameter is prefixed with `_` because it is deliberately unread — the
signature takes the stored value so that every call site is a place the decision
is visibly applied, and so reversing it needs no call-site changes.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts src/features/character/species.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/character/species.ts src/features/character/species.test.ts
git commit -m "feat(character): one Kairo — DEFAULT_SPECIES and displaySpecies

Every character renders as a Philippine eagle. profiles.species is not
migrated, not dropped and never written differently, so every stored choice
survives and reversing this is deleting one line.

displaySpecies takes the stored value it does not read, so each call site is a
visible application of the decision and a reversal needs no call-site changes.
parseSpecies still accepts all four — narrowing it would fail every stored row
on read.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Retire the picker

**Files:**
- Delete: `src/features/character/SpeciesPicker.tsx`
- Delete: `app/species.tsx`
- Delete: `app/(onboard)/character.tsx`
- Modify: `app/(tabs)/profile.tsx` — remove the Companion panel
- Modify: `app/(tabs)/index.tsx` — remove the species prompt effect and its module flag
- Modify: `src/features/character/Diorama.tsx`, `src/features/squad/RaceLane.tsx`, `src/features/squad/LeaderboardRow.tsx` — resolve art through `displaySpecies`

**Interfaces:**
- Consumes: `displaySpecies` from Task 1.
- Produces: no `/species` route and no `(onboard)/character` route. Task 3 removes the last navigation into the latter.

- [ ] **Step 1: Find every species-art resolution**

Run:

```bash
grep -rn "SPECIES_FIGURES\|SPECIES_HABITATS\|SPECIES\[" src app --include="*.tsx" --include="*.ts" | grep -v "species-art.ts\|species.ts:\|\.test\."
```

Every hit is a render boundary and must resolve through `displaySpecies`. Work
the list; the three files named above are the expected result, and if a fourth
appears it gets the same treatment.

The transformation in each is the same shape — an example from
`src/features/squad/RaceLane.tsx`'s `Figure`:

```tsx
  // `displaySpecies` rather than the stored id (deviation #55): everyone is an
  // eagle. The stored value is still passed in, so the day this is reversed
  // nothing here changes.
  const figure = SPECIES_FIGURES[displaySpecies(racer.species as SpeciesId | null)];

  return <Image source={figure} style={style} resizeMode="contain" />;
```

Note this **removes the `Avatar` fallback branch** in `RaceLane`, `Diorama` and
`LeaderboardRow`: there is no longer a "predating the choice" case, because
`displaySpecies(null)` is an eagle. Delete the branch rather than leaving it
unreachable, and drop the now-unused `Avatar` import where nothing else in the
file uses it. `Avatar` itself stays — squadmate faces on the Flock board still
use it.

- [ ] **Step 2: Remove the Companion panel**

In `app/(tabs)/profile.tsx`, delete the whole `<Panel>` block whose `Label` is
`Companion` — it runs from the comment beginning "Above Timezone, because this
one is a choice" to that panel's closing `</Panel>`. Remove the now-unused
import:

```ts
import { SPECIES_NAMES } from '@/features/character/species.ts';
```

- [ ] **Step 3: Remove the species prompt**

In `app/(tabs)/index.tsx`, delete the `useEffect` whose comment begins "The
one-time offer for accounts created before the species column existed", and
delete the module-scope `speciesPrompted` flag it reads. Both go entirely — a
prompt for a choice that no longer exists is a prompt to nowhere.

If `useRouter` / `router` is then unused in that file, drop it too. Run
`npm run typecheck` to find out rather than guessing.

- [ ] **Step 4: Delete the three files**

```bash
git rm src/features/character/SpeciesPicker.tsx app/species.tsx "app/(onboard)/character.tsx"
```

`species-label.ts` **stays** — `Diorama.tsx` reads `speciesFigureLabel()` for
the hero's accessible name and the hero survives on Today.
`SPECIES_HABITATS` and the three unused figure PNGs stay on disk; they cost
nothing and they are half of what "reversible" means.

- [ ] **Step 5: Prove nothing still routes to the deleted screens**

Run:

```bash
grep -rn "'/species'\|\"/species\"\|(onboard)/character\|SpeciesPicker" src app --include="*.ts" --include="*.tsx"
```

Expected: **one** hit — the `router.push('/name?species=...')` line in
`app/(onboard)/connect.tsx` or wherever onboarding currently hands off. Task 3
removes it. If the grep returns nothing at all, that navigation was already
elsewhere and Task 3's Step 4 will confirm.

- [ ] **Step 6: Typecheck and run the suite**

Run: `npm run typecheck && npm test`

Expected: FAIL in `app/(onboard)/character.tsx`'s former importers only — that
is Task 3's work. If anything else fails, a render boundary was missed in Step 1.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(character): retire the species picker

Three files go: SpeciesPicker, /species and (onboard)/character. Every art
resolution now runs through displaySpecies, which also removes the Avatar
fallback for accounts predating the choice — there is no such case any more.

species-label.ts stays: Diorama still reads speciesFigureLabel for the hero's
accessible name. The habitat art and the three unused figures stay on disk,
which is half of what reversible means.

Onboarding still navigates to the deleted screen; the next commit fixes that.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Onboarding becomes a meeting

`/connect` → `/name`, with `/name` rendered as screen 2a. This **removes** a
step, so the profile row still commits exactly once and still last — deviation
#22's rule is strengthened rather than merely respected.

**Files:**
- Rewrite: `app/(onboard)/name.tsx`
- Modify: `app/(onboard)/connect.tsx` — the handoff target

**Interfaces:**
- Consumes: `DEFAULT_SPECIES` from Task 1; `Panel`'s `sky` and `tint` variants from plan 1.
- Produces: onboarding is two screens. `useCreateProfile` is called with `{ name, species: DEFAULT_SPECIES }`.

- [ ] **Step 1: Rewrite `app/(onboard)/name.tsx`**

```tsx
import { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHARACTER_NAME_MAX, isValidCharacterName } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { DEFAULT_SPECIES, SPECIES } from '@/features/character/species.ts';
import { SPECIES_FIGURES } from '@/features/character/species-art.ts';
import { useCreateProfile } from '@/features/profile/create-profile.ts';
import { Button, Label, Panel, Text } from '@/ui/index.ts';
import { colors, font, radius, space } from '@/theme.ts';

/**
 * Meet your Kairo — the last onboarding screen (`Canvas.dc.html` 2a).
 *
 * Onboarding is `/connect` → here, two screens, as of 2026-08-27. It used to be
 * three: the species picker sat between them and is retired with deviation #55.
 *
 * **The profile row still commits exactly once, and still here.** Removing a
 * step strengthens deviation #22's rule rather than merely respecting it —
 * that deviation deleted the `finishingOnboarding` flag when onboarding
 * collapsed, and anything asked *after* the INSERT flips `resolveRoute` to
 * `'ready'` underneath an unfinished screen and needs the flag back. Add
 * onboarding steps before the name, never after.
 *
 * The screen is a meeting rather than a form: the bird is already there, and
 * the only question is what to call it.
 */
export default function MeetYourKairo() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const createProfile = useCreateProfile(session?.user.id);
  const [name, setName] = useState('');
  const [inputFocused, setInputFocused] = useState(false);

  const valid = isValidCharacterName(name);

  // createProfile.isPending flips through TanStack's notifyManager, which by
  // default schedules the update via setTimeout(fn, 0) rather than delivering
  // it synchronously with mutate(). A keyboard "Done" and an already-queued
  // touch can both fire within the same tick and both still read the previous
  // render's isPending === false, producing two inserts with the same id. This
  // ref is flipped synchronously, before mutate() runs, so the second event in
  // the same tick is rejected regardless of render timing.
  const submitting = useRef(false);

  function submit() {
    if (!valid || createProfile.isPending || submitting.current) return;
    submitting.current = true;
    createProfile.mutate(
      // `DEFAULT_SPECIES`, not a route param. The picker is gone and there is
      // nothing to carry — but the column is still written, because it is a
      // real column and a null here would be a second way of saying "eagle".
      { name, species: DEFAULT_SPECIES },
      {
        // The profile row now exists, so the route gate reads this user as
        // onboarded and would send them here on its own. Replacing explicitly
        // keeps the transition predictable and one frame earlier.
        onSuccess: () => router.replace('/'),
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/*
        Scrolls, and its text sits in a container with a real width. Both are
        the permission sheet's 2026-08-17 lessons: at the largest content sizes
        this screen's copy plus a 28pt input plus a button does not fit a
        phone, and a direct `Text` child of a scroll container lays out wider
        than the screen and clips mid-word.
      */}
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Panel variant="sky" style={styles.stage}>
          <Image
            source={SPECIES_FIGURES[DEFAULT_SPECIES]}
            style={styles.figure}
            resizeMode="contain"
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Your ${SPECIES[DEFAULT_SPECIES].name}, wings half open`}
          />
        </Panel>

        <View style={styles.copy}>
          <Label>It found you</Label>
          <Text style={styles.title}>Meet your Kairo</Text>
          <Text style={styles.help}>
            {`A ${SPECIES[DEFAULT_SPECIES].name}, and from today it lives off your movement — your walks, your sessions, your sleep. Nothing you buy, nothing you tap.`}
          </Text>
        </View>

        <Panel variant="tint">
          <Label>Its name</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            autoCorrect={false}
            maxLength={CHARACTER_NAME_MAX}
            // The placeholder instructs rather than exemplifies. A specimen
            // name read as a name already entered — sighted, next to a
            // disabled button, that looks like a broken app; unlabelled, a
            // screen reader announced it as the field's value, on the one
            // screen where the whole task is choosing your own. The label is
            // still needed: a placeholder is not an accessible name whatever
            // it says.
            accessibilityLabel="Your Kairo's name"
            accessibilityHint={`Up to ${CHARACTER_NAME_MAX} characters`}
            maxFontSizeMultiplier={1.4}
            placeholder="Name your Kairo"
            placeholderTextColor={colors.muted}
            selectionColor={colors.accentDeep}
            style={[
              styles.input,
              { borderBottomColor: inputFocused ? colors.accentDeep : colors.borderStrong },
            ]}
            returnKeyType="done"
            onSubmitEditing={submit}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
        </Panel>

        {createProfile.error && <Text style={styles.error}>{createProfile.error.message}</Text>}

        <Button
          label="Say hello"
          onPress={submit}
          variant="primary"
          disabled={!valid}
          busy={createProfile.isPending}
        />

        <Text style={styles.footnote}>Rename it whenever you like.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: space.lg, gap: space.sm },
  stage: {
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    borderCurve: 'continuous',
  },
  figure: { width: 200, height: 200 },
  copy: { marginTop: space.md, gap: space.sm },
  title: { color: colors.text, ...font.display.major },
  help: { color: colors.subtle, ...font.body.body, lineHeight: 22 },
  input: {
    marginTop: space.sm,
    borderBottomWidth: 2,
    color: colors.text,
    fontSize: 28,
    fontFamily: 'Figtree-Bold',
    paddingVertical: space.sm,
  },
  error: { color: colors.damage, ...font.body.body, marginTop: space.md },
  footnote: {
    color: colors.muted,
    ...font.body.strong,
    textAlign: 'center',
    marginTop: space.sm,
  },
});
```

- [ ] **Step 2: Repoint the handoff**

In `app/(onboard)/connect.tsx`, find the navigation that currently targets
`/character` and change it to:

```tsx
router.push('/name');
```

No `species` query param — there is nothing to carry.

- [ ] **Step 3: Typecheck and run the suite**

Run: `npm run typecheck && npm test`

Expected: PASS. Typed routes are on, so a navigation to the deleted
`/character` route is a compile error here rather than a runtime surprise.

- [ ] **Step 4: Prove the picker is unreachable**

Run:

```bash
grep -rn "'/species'\|\"/species\"\|/character'\|SpeciesPicker\|parseSpecies" src app --include="*.ts" --include="*.tsx" | grep -v "species.ts:\|species.test.ts:"
```

Expected: **no output.** `parseSpecies` stays exported and tested — it guards
what the database may hold — but nothing in the app calls it any more.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(onboarding): meet your Kairo

/connect -> /name, two screens. The species picker sat between them and is
gone; the bird is simply there and the only question is what to call it.

This removes a step, so the profile row still commits exactly once and still
last — deviation #22's rule is strengthened rather than respected. The name
screen writes DEFAULT_SPECIES rather than a route param: the column is real
and a null would be a second way of saying eagle.

Scrolls, and its copy sits in a width-bounded container — the permission
sheet's 2026-08-17 lessons, in a screen with a 28pt input on it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `kairo-voice.ts` — the bird's sentences

**Files:**
- Create: `src/features/character/kairo-voice.ts`
- Create: `src/features/character/kairo-voice.test.ts`

**Interfaces:**
- Consumes: `CoreStat` (type only) from `@kairo/core`; `STAT_NAMES` from `../../ui/stat-names.ts` by relative path.
- Produces:
  - `heroSentence(input: HeroInput): string`
  - `sleepLine(input: SleepInput): { eyebrow: string; body: string }`
  - `laneLine(input: LaneInput): { eyebrow: string; body: string } | null`
  - Interfaces `HeroInput`, `SleepInput`, `LaneInput` as written in Step 3.

  Task 5 mounts all three.

- [ ] **Step 1: Write the failing test**

`src/features/character/kairo-voice.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { heroSentence, laneLine, sleepLine } from './kairo-voice.ts';

const AEON = 'Aeon';

describe('heroSentence', () => {
  it('says nothing has happened yet, without accusing anyone', () => {
    // A day with no steps in it is usually a phone on a table, not a person who
    // did nothing. The bird is waiting; the reader is not being told off.
    expect(heroSentence({ characterName: AEON, progress: 0, rival: null })).toBe(
      'Aeon has not left the branch yet.',
    );
  });

  it('climbs through four bands as the day fills', () => {
    const at = (progress: number) =>
      heroSentence({ characterName: AEON, progress, rival: null });

    expect(at(0.2)).toBe('Aeon is stretching its wings.');
    expect(at(0.5)).toBe('Enough to lift Aeon over the treeline.');
    expect(at(0.9)).toBe('Aeon has the whole valley under it.');
    expect(at(1)).toBe('Aeon cleared the ridge. The day is done.');
  });

  it('names the gap to the bird directly ahead', () => {
    // The design's line, and the reason the race card leaves the Today tab:
    // the sentence carries the race, and the Sky tab carries the picture.
    expect(
      heroSentence({
        characterName: AEON,
        progress: 0.48,
        rival: { name: 'Ramon', stepsAhead: 1240 },
      }),
    ).toBe("Enough to lift Aeon over the treeline. Ramon's is still 1,240 ahead of you.");
  });

  it('says level rather than a gap of zero', () => {
    expect(
      heroSentence({
        characterName: AEON,
        progress: 0.48,
        rival: { name: 'Ramon', stepsAhead: 0 },
      }),
    ).toBe('Enough to lift Aeon over the treeline. You are level with Ramon.');
  });

  it('drops the rival clause once the day is done', () => {
    // Past the flag the gap stops meaning anything — `cappedSteps` stops at
    // the line, so extra steps buy nothing and a gap would imply they do.
    expect(
      heroSentence({
        characterName: AEON,
        progress: 1,
        rival: { name: 'Ramon', stepsAhead: 900 },
      }),
    ).toBe('Aeon cleared the ridge. The day is done.');
  });

  it('clamps a progress value from outside 0 to 1', () => {
    expect(heroSentence({ characterName: AEON, progress: 4, rival: null })).toBe(
      'Aeon cleared the ridge. The day is done.',
    );
    expect(heroSentence({ characterName: AEON, progress: -1, rival: null })).toBe(
      'Aeon has not left the branch yet.',
    );
  });
});

describe('sleepLine', () => {
  it('says there is no reading rather than inventing a bad night', () => {
    // null is not zero. A hand-typed night scores no Mind at all, and
    // `finalize-days` grades by the same rule — a card claiming someone did
    // not sleep is the accusation this branch exists to avoid.
    expect(sleepLine({ characterName: AEON, sleepMinutes: null })).toEqual({
      eyebrow: 'Aeon is waiting on last night',
      body: 'No reading yet.',
    });
  });

  it('reads a full night as hours and minutes, in the bird’s voice', () => {
    expect(sleepLine({ characterName: AEON, sleepMinutes: 440 })).toEqual({
      eyebrow: 'Aeon slept when you did',
      body: 'Seven hours twenty. It has energy to burn all afternoon.',
    });
  });

  it('reads a short night without scolding', () => {
    expect(sleepLine({ characterName: AEON, sleepMinutes: 250 })).toEqual({
      eyebrow: 'Aeon slept when you did',
      body: 'Four hours ten. It will be gliding more than flapping today.',
    });
  });

  it('says a whole number of hours without a stray zero', () => {
    expect(sleepLine({ characterName: AEON, sleepMinutes: 420 }).body).toBe(
      'Seven hours. It has energy to burn all afternoon.',
    );
  });
});

describe('laneLine', () => {
  it('is silent when no lane has emerged', () => {
    // Naming a build for someone who has done nothing cheapens the one visual
    // §6 says must be earned. Silence, not a guess.
    expect(laneLine({ characterName: AEON, lane: null })).toBeNull();
  });

  it('names the lane in the player’s vocabulary, never the engine key', () => {
    const line = laneLine({ characterName: AEON, lane: 'AGI' });
    expect(line).toEqual({
      eyebrow: 'Your lane · Motion',
      body: "One more loop of the block and Aeon's Motion tops out for the day.",
    });
    // The rule, stated so it cannot regress by editing the string above.
    expect(JSON.stringify(line)).not.toMatch(/AGI|STR|MND/);
  });

  it('has a line for each of the three lanes', () => {
    expect(laneLine({ characterName: AEON, lane: 'STR' })?.eyebrow).toBe('Your lane · Body');
    expect(laneLine({ characterName: AEON, lane: 'MND' })?.eyebrow).toBe('Your lane · Mind');
  });
});

describe('the voice never says a number the surface does not show', () => {
  it('prints no score total anywhere', () => {
    // Deviation #34 is still in force: daily_scores.total ranks the board and
    // feeds XP, and no ambient surface prints it. The bird speaks in raw units
    // — steps, hours — and in nothing else.
    const all = [
      heroSentence({ characterName: AEON, progress: 0.5, rival: { name: 'R', stepsAhead: 12 } }),
      sleepLine({ characterName: AEON, sleepMinutes: 440 }).body,
      laneLine({ characterName: AEON, lane: 'AGI' })?.body ?? '',
    ].join(' ');

    expect(all).not.toMatch(/points?|score|pts/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config vitest.config.ts src/features/character/kairo-voice.test.ts`

Expected: FAIL — `Failed to resolve import "./kairo-voice.ts"`.

- [ ] **Step 3: Write the module**

`src/features/character/kairo-voice.ts`:

```ts
import type { CoreStat } from '@kairo/core';
// Relative, never `@/ui` — the barrel re-exports every component and the `@/`
// alias does not resolve under root Vitest. Exactly how `program-copy.ts`
// reaches this same module.
import { STAT_NAMES } from '../../ui/stat-names.ts';

/**
 * The bird's voice.
 *
 * Kairo stopped speaking as an app on 2026-08-27. A number on its own is a
 * dashboard; a number attached to a sentence about the character is a game that
 * happens to run on your real life, and that distinction is the redesign's
 * whole thesis.
 *
 * The house split, same as `race-label.ts`, `row-label.ts`, `quest-copy.ts` and
 * `program-copy.ts`: the decision lives in a zero-runtime-import module tested
 * in plain Node, and the component only performs it. Nothing here reads a
 * clock, a query or a store.
 *
 * Three rules, and each has a test that fails if it is broken:
 *
 * - **No score total, ever.** `daily_scores.total` still ranks the board and
 *   feeds XP; no ambient surface prints it (deviation #34). The bird speaks in
 *   raw units.
 * - **No engine key.** Stat words come from `STAT_NAMES` (deviation #51).
 * - **A missing figure yields a shorter sentence, never a fabricated one.** A
 *   null night reads "No reading yet" — the identical rule `finalize-days`
 *   grades by, and the difference between silence and an accusation.
 */

export interface HeroInput {
  characterName: string;
  /** 0–1 toward the day's flag. Clamped here. */
  progress: number;
  /**
   * The racer directly ahead, already resolved by the caller.
   *
   * Null when the reader is leading, when nobody else is on the track, or when
   * the squadmate ahead has not consented to share (deviation #47) — all three
   * are "there is no gap to name", and the sentence is shorter rather than
   * vaguer.
   */
  rival: { name: string; stepsAhead: number } | null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function heroSentence(input: HeroInput): string {
  const progress = clamp01(input.progress);
  const name = input.characterName;

  if (progress >= 1) return `${name} cleared the ridge. The day is done.`;

  const effort =
    progress === 0
      ? `${name} has not left the branch yet.`
      : progress < 0.35
        ? `${name} is stretching its wings.`
        : progress < 0.75
          ? `Enough to lift ${name} over the treeline.`
          : `${name} has the whole valley under it.`;

  if (input.rival === null) return effort;

  // Past the flag the gap stops meaning anything — `cappedSteps` stops at the
  // line, so extra steps buy nothing and naming a gap would imply they do. That
  // case is already returned above; this is the tie.
  if (input.rival.stepsAhead <= 0) {
    return `${effort} You are level with ${input.rival.name}.`;
  }

  // "Ramon's" — the possessive of the person, standing for their bird. The
  // rivals in this app are characters, and their owners are who you know.
  return `${effort} ${input.rival.name}'s is still ${input.rival.stepsAhead.toLocaleString()} ahead of you.`;
}

export interface SleepInput {
  characterName: string;
  /**
   * The night the *score* saw, never the raw `daily_sleep.minutes` column.
   *
   * A hand-typed night scores no Mind at all, so a raw read would have this
   * card congratulating someone on a night the engine ignored. Callers pass
   * `scoredSleepMinutes`, which is the rule `finalize-days` grades by.
   */
  sleepMinutes: number | null;
}

const HOUR_WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
] as const;

const MINUTE_WORDS: Record<number, string> = {
  0: '',
  5: 'five',
  10: 'ten',
  15: 'fifteen',
  20: 'twenty',
  25: 'twenty-five',
  30: 'thirty',
  35: 'thirty-five',
  40: 'forty',
  45: 'forty-five',
  50: 'fifty',
  55: 'fifty-five',
};

/**
 * "Seven hours twenty", the way somebody says it out loud.
 *
 * Rounded to five minutes, because a bird does not report to the minute and
 * because HealthKit's sleep totals are not that precise anyway. Beyond twelve
 * hours the words run out and it falls back to digits — a fifteen-hour night is
 * a data artefact, and a sentence that reads oddly is the right amount of
 * attention to draw to one.
 */
function spokenDuration(minutes: number): string {
  const rounded = Math.round(minutes / 5) * 5;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;

  if (hours >= HOUR_WORDS.length) {
    return mins === 0 ? `${hours} hours` : `${hours}h ${mins}m`;
  }

  const hourWord = HOUR_WORDS[hours] ?? String(hours);
  const unit = hours === 1 ? 'hour' : 'hours';
  const minuteWord = MINUTE_WORDS[mins];

  return minuteWord ? `${hourWord} ${unit} ${minuteWord}` : `${hourWord} ${unit}`;
}

/** Below this the bird glides rather than flaps. Six hours, in minutes. */
const RESTED_MINUTES = 360;

export function sleepLine(input: SleepInput): { eyebrow: string; body: string } {
  if (input.sleepMinutes === null || !Number.isFinite(input.sleepMinutes)) {
    return {
      eyebrow: `${input.characterName} is waiting on last night`,
      body: 'No reading yet.',
    };
  }

  const rested = input.sleepMinutes >= RESTED_MINUTES;

  return {
    eyebrow: `${input.characterName} slept when you did`,
    body: `${spokenDuration(input.sleepMinutes)}. ${
      rested
        ? 'It has energy to burn all afternoon.'
        : 'It will be gliding more than flapping today.'
    }`,
  };
}

export interface LaneInput {
  characterName: string;
  /**
   * The observed dominant stat, or null while it is unknown.
   *
   * Null covers both "no lane has emerged" and "the query is in flight", which
   * are the same thing to a caller with nothing to draw — and naming a build
   * for someone who has done nothing cheapens the one visual §6 says must be
   * earned.
   */
  lane: CoreStat | null;
}

/** What each lane's last stretch of the day looks like, in the bird's terms. */
const LANE_NUDGE: Record<CoreStat, string> = {
  AGI: 'One more loop of the block',
  STR: 'One more set',
  MND: 'An early night',
};

export function laneLine(input: LaneInput): { eyebrow: string; body: string } | null {
  if (input.lane === null) return null;

  const word = STAT_NAMES[input.lane];

  return {
    eyebrow: `Your lane · ${word}`,
    body: `${LANE_NUDGE[input.lane]} and ${input.characterName}'s ${word} tops out for the day.`,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts src/features/character/kairo-voice.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/character/kairo-voice.ts src/features/character/kairo-voice.test.ts
git commit -m "feat(character): the bird's voice

A number on its own is a dashboard; a number attached to a sentence about the
character is a game that happens to run on your real life. Three composers —
the hero sentence, the sleep line, the lane line — in the house split: a
zero-runtime-import module tested in plain Node, with the component only
performing the decision.

Three rules with tests behind them: no score total, no engine key, and a
missing figure yields a shorter sentence rather than a fabricated one. The
null night reads 'No reading yet', which is the rule finalize-days grades by.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Today

The character screen and the Today shelf become one screen: the bird in its
sky, the day's steps at display size, the sentence, then the sleep and lane
cards, then quests, the Daily Walk and the Challenge door.

**Files:**
- Rewrite: `app/(tabs)/index.tsx`
- Delete: `src/features/character/TodayShelf.tsx` (plan 1's interim file)

**Interfaces:**
- Consumes: `heroSentence`, `sleepLine`, `laneLine` from Task 4; `displaySpecies` from Task 1; `Panel`'s `sky` variant from plan 1.
- Produces: `RaceCard` is no longer mounted anywhere. **Plan 3 deletes the file**; this task only removes the mount, so the two can land in either order without a broken build.

- [ ] **Step 1: Rewrite the screen**

`app/(tabs)/index.tsx`. This keeps every hook the current file has — the list is
unchanged and deliberately so, since the two screens being merged already
mounted the same queries on the same keys — and replaces what is rendered.

```tsx
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  currentLocalDate,
  evolutionStageForLevel,
  ghostRivals,
  levelForXp,
  questTier,
  rankRacers,
  type RacerInput,
} from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { Diorama } from '@/features/character/Diorama.tsx';
import { FirstSyncCallout } from '@/features/character/FirstSyncCallout.tsx';
import { SyncStatus } from '@/features/character/SyncStatus.tsx';
import { heroSentence, laneLine, sleepLine } from '@/features/character/kairo-voice.ts';
import { laneStat } from '@/features/character/lane.ts';
import { useTodayBuckets, useTodayVitals } from '@/features/character/buckets.ts';
import {
  useDominantStat,
  useScoredDayCount,
  useTodayScore,
} from '@/features/character/queries.ts';
import { useDisclosure } from '@/features/character/useDisclosure.ts';
import { useProfile, useStreak } from '@/features/profile/queries.ts';
import { QuestList } from '@/features/quests/QuestList.tsx';
import { todayQuests, useQuestCompletions } from '@/features/quests/queries.ts';
import { ghostDayLabel } from '@/features/squad/ghost-day-label.ts';
import { useMySquad, useOwnRecentDays, useSquadLeaderboard } from '@/features/squad/queries.ts';
import { claimDaily, type DailyMarker } from '@/features/telemetry/daily-marker.ts';
import { track } from '@/features/telemetry/events.ts';
import { DailyWalkCard } from '@/features/train/DailyWalkCard.tsx';
import { TrainEntry } from '@/features/train/TrainEntry.tsx';
import { Label, Numeral, Panel, Screen, Text } from '@/ui/index.ts';
import { colors, font, ramp, space } from '@/theme.ts';

/**
 * Today — the character and the day, on one screen (`Canvas.dc.html` 2b).
 *
 * The character tab and the Today tab merged here on 2026-08-27. They were
 * split by deviation #50 because the character screen's hero had a different
 * subject from everything below it; the redesign resolves that the other way,
 * by making the day *about* the character rather than a list beside it. The
 * hero is the bird, the one big number is the day in real units, and the rest
 * is the bird saying how its day went.
 *
 * **Every query here was already mounted by one of the two screens this
 * replaces, on the same key.** The merge adds no request and cannot disagree
 * with the Sky or Flock tab in one frame.
 *
 * **The race is a sentence, not a card.** `RaceCard` is gone: the race has its
 * own tab now, and the hero sentence names the gap to the bird ahead, which is
 * the only part of it that belongs on a screen about your own day. The
 * `race_seen` marker moved to the Sky tab with the picture — it measures
 * looking at the race, and this screen no longer shows one.
 *
 * **The disclosure gate is unchanged** (deviation #37). Same constant, same
 * `total > 0` filter, same rule. The sleep and lane cards are the Strain/Sleep
 * rows in a new dress and keep their `full` gate; `TrainEntry` keeps its
 * wrapper; quests, the hero and the Daily Walk are ungated. A `core` account
 * meets the bird, its day, three quests and the walk.
 */
export default function Today() {
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const timeZone = profile.data?.timezone;

  const score = useTodayScore(userId, timeZone);
  const buckets = useTodayBuckets(userId, timeZone);
  const vitals = useTodayVitals(userId, timeZone);
  const dominance = useDominantStat(userId, timeZone);
  const streak = useStreak(userId);
  const squad = useMySquad(userId);
  const board = useSquadLeaderboard(squad.data?.id, 'current');
  const days = useOwnRecentDays(userId, timeZone);
  const disclosure = useDisclosure(userId);
  const scoredDays = useScoredDayCount(userId);

  const localToday = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;
  const completions = useQuestCompletions(userId, localToday);

  const totalXp = profile.data?.total_xp ?? 0;
  const level = profile.data?.level ?? levelForXp(totalXp);
  const stage = evolutionStageForLevel(level);
  const totals = buckets.data?.totals;
  const steps = totals?.steps ?? 0;
  const characterName = profile.data?.character_name ?? 'Your Kairo';

  const quests = todayQuests({
    userId,
    localDate: localToday,
    // `?? 0` while the count is in flight puts a first-frame account on the
    // starter tier, which is the safe direction: showing an easy quest then a
    // harder one is a correction, where the reverse is a bar disappearing out
    // from under someone mid-walk.
    scoredDays: scoredDays.data ?? 0,
    tierOverride: profile.data?.quest_tier_override ?? null,
    day: totals && {
      steps: totals.steps,
      activeKcal: totals.activeKcal,
      activeHours: totals.activeHours,
      distanceM: totals.distanceM,
      // Null, never 0, and never the raw column: an unknown night must read
      // "No reading yet" rather than accuse somebody of not sleeping.
      sleepMinutes: vitals.data?.sleepMinutes ?? null,
    },
    completedIds: completions.data ?? [],
  });

  // The bird directly ahead of you, for the hero sentence. The same payload the
  // Sky tab ranks, ranked the same way — by capped steps, on the client,
  // because `squad_leaderboard()` orders by the program-weighted total and
  // ranking once in SQL would silently delete the program feature.
  const ranked = rankRacers(
    buildRacers({
      inSquad: Boolean(squad.data),
      rows: board.data ?? [],
      userId,
      characterName: profile.data?.character_name,
      species: profile.data?.species ?? null,
      steps,
      total: score.data?.total ?? 0,
      recentDays: days.data ?? [],
      localToday,
    }),
  );
  const me = ranked.find((r) => r.isSelf);
  const ahead = me ? ranked.find((r) => r.rank === me.rank - 1) : undefined;

  const sleep = sleepLine({
    characterName,
    // The night the score saw, not the raw column — a hand-typed night scores
    // no Mind at all, and `finalize-days` grades by the same rule.
    sleepMinutes: vitals.data?.sleepMinutes ?? null,
  });
  const lane = laneLine({ characterName, lane: laneStat(dominance.data) });

  // Once per the user's own local day, not per render: fired on render this
  // would measure scrolling. In an effect because `claimDaily` writes to MMKV
  // and `track` writes a row, and a render that does either is a render with a
  // side effect — React may call it twice.
  const metSlots = quests.map((q) => q.state.met).join(',');
  useEffect(() => {
    if (!userId || !localToday) return;
    const tier = questTier({
      trailingScoredDays: scoredDays.data ?? 0,
      override: profile.data?.quest_tier_override ?? null,
    });
    quests.forEach((entry, index) => {
      if (!entry.state.met) return;
      const marker = `quest_cleared.${index as 0 | 1 | 2}` as DailyMarker;
      if (claimDaily(userId, marker, localToday)) void track(userId, 'quest_cleared', { tier });
    });
    // `metSlots` is the dependency rather than `quests`, which is a fresh array
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, localToday, metSlots]);

  return (
    <Screen>
      {/* The bird, in its sky. `Diorama` already owns the figure, the ground
          shadow and the level staging; this screen supplies the field it sits
          in and nothing else. */}
      <Panel variant="sky" style={styles.stage}>
        <Diorama
          height={300}
          level={level}
          stage={stage}
          dominance={dominance.data}
          species={profile.data?.species ?? null}
        />
      </Panel>

      {/* The day, in real units. One number per screen — never a score total
          (deviation #34), and `Numeral` is tabular so a live refetch does not
          make it jitter. */}
      <View style={styles.hero}>
        <Numeral value={steps} size="hero" color={colors.accentInk} animate />
        <Text scale="fixed" style={styles.heroUnit}>
          STEPS TODAY
        </Text>
      </View>

      {/* The race, as a sentence. The picture is on the Sky tab. */}
      <Text style={styles.sentence}>
        {heroSentence({
          characterName,
          progress: me?.progress ?? 0,
          rival: ahead ? { name: ahead.characterName, stepsAhead: ahead.cappedSteps - (me?.cappedSteps ?? 0) } : null,
        })}
      </Text>

      {/* The Strain/Sleep rows, redrawn. **Still gated** — same rule, new
          dress. A `core` account has not produced the nights these read. */}
      {disclosure.stage === 'full' && (
        <>
          <VoiceCard tone="teal" eyebrow={sleep.eyebrow} body={sleep.body} />
          {lane && <VoiceCard tone="sage" eyebrow={lane.eyebrow} body={lane.body} />}
        </>
      )}

      <SyncStatus userId={userId} timeZone={timeZone} />

      {/* Three small things, reset at the player's own local midnight.
          **Derived, never stored** — `pickQuests()` hashes (account, date,
          tier), so tomorrow hashes to a different three and there is no job, no
          row and nothing for a retroactive Apple revision to invalidate.
          Ungated on purpose: this is what teaches the loop. */}
      <QuestList quests={quests} />

      {/* The one number in Kairo that never moves, and the run of days against
          it. It never scales with the user. */}
      <DailyWalkCard
        userId={userId}
        timeZone={timeZone}
        today={localToday}
        todaySteps={totals?.steps}
      />

      {/* The door to Challenges — **the one gated thing below the fold**. A
          Challenge target is a trailing median over workout sessions a `core`
          account may have none of, so offering it on day one offers depth to
          somebody who has not produced the data it reads.

          Last deliberately: a hidden card at the bottom leaves no hole, where
          one removed from the middle would.

          `stage`, not `resolved && stage` — this hides a card, it does not
          navigate. The redirect in `/train` is the one that has to wait. */}
      {disclosure.stage === 'full' && (
        <TrainEntry userId={userId} timeZone={timeZone} today={localToday} />
      )}

      <FirstSyncCallout userId={userId} streak={streak.data} />
    </Screen>
  );
}

/**
 * One of the bird's observations, as a card.
 *
 * Two tones, and they are the two families that are not the accent: teal is
 * rest, sage is your lane. Neither is a call to action, which is why neither is
 * amber — the screen spends its one accent on the day's number.
 *
 * One accessibility element with both halves of the grouping fix: an eyebrow
 * and a sentence read as two stops otherwise, and the eyebrow alone is not a
 * sentence.
 */
function VoiceCard({
  tone,
  eyebrow,
  body,
}: {
  tone: 'teal' | 'sage';
  eyebrow: string;
  body: string;
}) {
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View
      accessible
      accessibilityLabel={`${eyebrow}. ${body}`}
      style={[styles.voiceCard, tone === 'teal' ? styles.voiceTeal : styles.voiceSage]}
    >
      <Text {...hidden} scale="chrome" style={[styles.voiceEyebrow, tone === 'teal' ? styles.inkTeal : styles.inkSage]}>
        {eyebrow.toUpperCase()}
      </Text>
      <Text {...hidden} style={[styles.voiceBody, tone === 'teal' ? styles.inkTeal : styles.inkSage]}>
        {body}
      </Text>
    </View>
  );
}

/**
 * Who is on the track, from whichever source this account has.
 *
 * In a squad the rivals are squadmates; alone they are the player's own recent
 * days. A squad row whose `steps` is null has not consented, on one side or the
 * other (deviation #47), and cannot be placed — it is dropped here rather than
 * drawn at zero, because a sentence has no room to explain a withheld lane and
 * the Sky tab does that job.
 */
function buildRacers(input: {
  inSquad: boolean;
  rows: readonly { user_id: string; character_name: string; species: string | null;
    steps: number | null; total: number; is_self: boolean }[];
  userId: string | undefined;
  characterName: string | undefined;
  species: string | null;
  steps: number;
  total: number;
  recentDays: readonly { localDate: string; steps: number }[];
  localToday: string | undefined;
}): RacerInput[] {
  if (input.inSquad) {
    return input.rows
      .filter((r) => r.steps !== null)
      .map((r) => ({
        userId: r.user_id,
        characterName: r.character_name,
        species: r.species,
        steps: r.steps ?? 0,
        total: r.total,
        isSelf: r.is_self,
      }));
  }

  const me: RacerInput = {
    userId: input.userId ?? 'self',
    characterName: input.characterName ?? 'You',
    species: input.species,
    steps: input.steps,
    total: input.total,
    isSelf: true,
  };

  // `ghostRivals` drops days that scored nothing, so a new account does not
  // line up against three zeroes — which reads as the feature being broken
  // rather than as an easy win.
  const ghosts = ghostRivals(input.recentDays, 3).map((g) => ({
    ...g,
    // `race-label.ts` prefixes a ghost with "your", so this has to read
    // "your Saturday" — never "your 2026-08-22".
    characterName: input.localToday
      ? ghostDayLabel(g.characterName, input.localToday)
      : g.characterName,
    species: input.species,
  }));

  return [me, ...ghosts];
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 0 },
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.lg },
  heroUnit: { ...font.body.label, color: colors.muted, paddingBottom: space.sm },
  sentence: {
    ...font.body.body,
    fontSize: 16,
    lineHeight: 23,
    color: colors.subtle,
    marginTop: space.sm,
  },
  voiceCard: {
    marginTop: space.md,
    padding: space.lg,
    borderRadius: 24,
    borderCurve: 'continuous',
    gap: space.xs,
  },
  voiceTeal: { backgroundColor: colors.tealTint },
  voiceSage: { backgroundColor: ramp.sage[200] },
  inkTeal: { color: colors.tealInk },
  inkSage: { color: ramp.sage[800] },
  voiceEyebrow: { ...font.body.label },
  voiceBody: { ...font.body.body, fontSize: 14.5, lineHeight: 20 },
});
```

- [ ] **Step 2: Delete the interim shelf**

```bash
git rm src/features/character/TodayShelf.tsx
```

Everything it held is now composed directly into the screen above, including
both telemetry effects. Check that nothing still imports it:

```bash
grep -rn "TodayShelf" src app --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 3: Confirm `race_seen` has no home yet, deliberately**

Run:

```bash
grep -rn "race_seen" src app --include="*.ts" --include="*.tsx" | grep -v "daily-marker.ts"
```

Expected: **no output.** The marker type stays declared in `daily-marker.ts` and
nothing fires it until plan 3 mounts it on the Sky tab, which is where it
belongs — it measures looking at the race, and this screen no longer shows one.
This is the one deliberate gap between plans, and it is recorded in plan 3's
Task 4.

- [ ] **Step 4: Typecheck and run the suite**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(today): the bird, the day, and what it says about it

The character tab and the Today tab become one screen. Deviation #50 split
them because the hero had a different subject from the list below it; this
resolves that the other way, by making the day about the character.

The race is a sentence rather than a card — it has its own tab now, and only
the gap to the bird ahead belongs on a screen about your own day. RaceCard is
unmounted here; plan 3 deletes the file.

The disclosure gate does not move: the sleep and lane cards are the
Strain/Sleep rows in a new dress and keep their full gate, TrainEntry keeps
its wrapper, and the hero, quests and the Daily Walk stay ungated. Every query
was already mounted by one of the two screens on the same key, so the merge
adds no request.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: You

**Files:**
- Modify: `app/(tabs)/profile.tsx`
- Create: `src/features/profile/GrowthCard.tsx`

**Interfaces:**
- Consumes: `STAT_NAMES` from `@/ui`; `displaySpecies`, `SPECIES` from Task 1; `Panel`'s `tint` variant from plan 1.
- Produces: `GrowthCard` — no props. Mounted only here.

- [ ] **Step 1: Write the growth card**

`src/features/profile/GrowthCard.tsx`:

```tsx
import { StyleSheet, View } from 'react-native';
import { CORE_STATS, type CoreStat } from '@kairo/core';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { Panel, STAT_NAMES, Text } from '@/ui/index.ts';

/**
 * How your Kairo grows (`Canvas.dc.html` 2e).
 *
 * A static explainer, not a reading of the account — it says what each stat is
 * *for*, in the bird's terms, and never what the reader has earned. The ratings
 * are on `StatRail`, which is gated; this is not, because a new account needs
 * to know what the three things are before it has any of them.
 *
 * **The design draws `AGI` / `STR` / `MND` chips here and this does not.**
 * Those are engine keys and deviation #51 took the last of them off the
 * surface — `boostChipLabel` printed `AGI ×1.5` and was the final one. The
 * layout and the colour coding are the design's; the vocabulary is
 * `STAT_NAMES`'.
 */

/** What each stat is for, in the bird's terms. One line each. */
const GROWTH: Record<CoreStat, string> = {
  AGI: 'Walks and runs make it faster in the air',
  STR: 'Sessions in the gym widen its wings',
  MND: 'Sleep is what it flies on the next day',
};

/**
 * A dot per stat, and the tint behind its name.
 *
 * Three families, one each, and none of them is the accent: this card is not a
 * call to action. Motion is sage because that is what "your lane" already means
 * in this system; Body is the damage coral, which is the only other hue with an
 * ink dark enough to set a word in; Mind is amber's deep step, which is
 * `earnedColor`'s family and reads as rest rather than as a button.
 */
const DOT: Record<CoreStat, string> = {
  AGI: colors.sage,
  STR: colors.damage,
  MND: colors.accentEdge,
};

const CHIP_BG: Record<CoreStat, string> = {
  AGI: ramp.sage[200],
  STR: colors.tealTint,
  MND: ramp.accent[200],
};

const CHIP_INK: Record<CoreStat, string> = {
  AGI: ramp.sage[800],
  STR: colors.tealInk,
  MND: ramp.accent[800],
};

export function GrowthCard() {
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <Panel>
      <Text scale="chrome" style={styles.title}>
        HOW YOUR KAIRO GROWS
      </Text>

      {CORE_STATS.map((stat) => (
        // One element per row: a dot, a sentence and a chip read as three
        // stops otherwise, and the dot and the chip say nothing on their own.
        <View
          key={stat}
          accessible
          accessibilityLabel={`${STAT_NAMES[stat]}. ${GROWTH[stat]}`}
          style={styles.row}
        >
          <View {...hidden} style={[styles.dot, { backgroundColor: DOT[stat] }]} />
          <Text {...hidden} style={styles.body}>
            {GROWTH[stat]}
          </Text>
          <View {...hidden} style={[styles.chip, { backgroundColor: CHIP_BG[stat] }]}>
            <Text scale="chrome" style={[styles.chipLabel, { color: CHIP_INK[stat] }]}>
              {STAT_NAMES[stat]}
            </Text>
          </View>
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  title: { ...font.display.small, color: colors.text, marginBottom: space.sm },
  // `alignItems: 'flex-start'` rather than 'center': past ~1.3x the sentence
  // wraps to three lines and a centred dot floats in the middle of it.
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginTop: space.md },
  dot: { width: 10, height: 10, borderRadius: radius.pill, marginTop: 6 },
  body: { flex: 1, ...font.body.body, fontSize: 14, lineHeight: 20, color: colors.subtle },
  chip: {
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  chipLabel: { ...font.body.label, letterSpacing: 0.5 },
});
```

- [ ] **Step 2: Mount it, and move the stat rail here**

In `app/(tabs)/profile.tsx`:

Add the imports:

```ts
import { GrowthCard } from '@/features/profile/GrowthCard.tsx';
import { StatRail } from '@/features/character/StatRail.tsx';
import { useDisclosure } from '@/features/character/useDisclosure.ts';
import { ratingForStatPoints, CORE_STATS, type CoreStat } from '@kairo/core';
```

Add the hook alongside the others:

```tsx
  const disclosure = useDisclosure(userId);
  const [railOpen, setRailOpen] = useState(false);
```

And immediately after `<StreakCard streak={streak.data} />`, insert:

```tsx
          {/* The ability ratings, moved here from the character screen when it
              dissolved. **Still gated on `full`** — deviation #37's list did
              not change, only which file mounts it. A rating over a lifetime
              rollup means nothing on an account with no lifetime. */}
          {disclosure.stage === 'full' && (
            <StatRail
              ratings={ratings}
              expanded={railOpen}
              onToggle={() => setRailOpen((open) => !open)}
            />
          )}

          {/* Ungated, deliberately, and the counterpart to the rail above: a
              new account needs to know what the three things *are* before it
              has any of them. This says what each is for and never what has
              been earned. */}
          <GrowthCard />
```

with the ratings derived just above the `return`:

```tsx
  // Lifetime rollups, which is what the rail reads. `ratingForStatPoints`
  // floors at 1, so an unloaded profile says the same thing a brand-new
  // character's does rather than flashing a dash.
  //
  // `mnd_total`, not `mind_total`: the rollup is spelled for the stat, the
  // score column it sums is `mind_points`, and that split has cost a bug.
  const ratings: Partial<Record<CoreStat, number>> | undefined = profile.data && {
    AGI: ratingForStatPoints(profile.data.agi_total),
    STR: ratingForStatPoints(profile.data.str_total),
    MND: ratingForStatPoints(profile.data.mnd_total),
  };
```

- [ ] **Step 3: Name the species on the header line**

The design's 2e reads "Level 12 · Philippine eagle". `ProfileHeader` currently
prints the level and the lifetime XP. Pass the species word through:

In `src/features/profile/ProfileHeader.tsx`, add a prop and render it —

```tsx
export function ProfileHeader({
  name,
  totalXp,
  species,
}: {
  name: string;
  totalXp: number;
  /** Already resolved through `displaySpecies` by the caller. */
  species: string;
}) {
```

and in the `level` line's `<Text>`, replace its content with:

```tsx
        {`Level ${level} · ${species}`}
```

Then in `app/(tabs)/profile.tsx`:

```tsx
          <ProfileHeader
            name={profile.data.character_name}
            totalXp={profile.data.total_xp}
            species={SPECIES[displaySpecies(profile.data.species)].name}
          />
```

with the import:

```ts
import { SPECIES, displaySpecies } from '@/features/character/species.ts';
```

- [ ] **Step 4: Typecheck and run the suite**

Run: `npm run typecheck && npm test`

Expected: PASS. `stat-names.test.ts`'s Agility scan covers `GrowthCard.tsx`
because it walks every non-test file under `src`, and this is the file most
likely to have reintroduced a retired word.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(you): the growth card, and the stat rail's new home

2e's 'how your Kairo grows' block, with the design's layout and colour coding
and STAT_NAMES' vocabulary — the mock draws AGI/STR/MND chips and those are
the engine keys deviation #51 took off the surface.

StatRail moves here from the dissolved character screen and keeps its full
gate: deviation #37's list did not change, only which file mounts it. The
growth card is ungated as its counterpart — a new account needs to know what
the three things are before it has any of them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Flock

The squad board keeps every state it has and takes 2d's composition: the squad
name and age, the week strip, the flock together, the ranked rows, the invite
block.

**Files:**
- Modify: `src/features/squad/Leaderboard.tsx`
- Modify: `src/features/squad/LeaderboardRow.tsx`
- Create: `src/features/squad/WeekStrip.tsx`

**Interfaces:**
- Consumes: `displaySpecies` from Task 1; `Panel`'s `tint` variant from plan 1.
- Produces: `WeekStrip` — takes `{ days: readonly { letter: string; state: 'done' | 'waiting' | 'future' }[] }`.

- [ ] **Step 1: Write the week strip**

`src/features/squad/WeekStrip.tsx`:

```tsx
import { StyleSheet, View } from 'react-native';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { Text } from '@/ui/index.ts';

/**
 * The squad's week, as seven discs (`Canvas.dc.html` 2d).
 *
 * A day is `done` (somebody's day is in), `waiting` (today, still open) or
 * `future`. It draws no names and no figures — that is the board below it —
 * and it never draws a count, because a squad spans timezones and "three of
 * four are in" is a claim about a moment that does not exist for everybody at
 * once (§2).
 *
 * One accessibility element for the whole strip. Seven discs that each say a
 * letter is seven stops for a picture whose meaning is the shape of the row.
 */
export interface WeekDay {
  /** The weekday initial, already localised by the caller. */
  letter: string;
  state: 'done' | 'waiting' | 'future';
}

export function WeekStrip({ days }: { days: readonly WeekDay[] }) {
  const done = days.filter((d) => d.state === 'done').length;

  return (
    <View
      accessible
      accessibilityLabel={`This week: ${done} ${done === 1 ? 'day' : 'days'} recorded`}
      accessibilityElementsHidden={false}
      style={styles.strip}
    >
      {days.map((day, i) => (
        <View
          // The index is the key: two Tuesdays cannot occur in one week, but
          // two days share an initial (T, T and S, S) and the letter alone
          // would collide.
          key={i}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.day}
        >
          <Text scale="fixed" style={[styles.letter, day.state === 'future' && styles.letterFuture]}>
            {day.letter}
          </Text>
          <View style={[styles.disc, styles[day.state]]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: space.xs, marginTop: space.md },
  day: { flex: 1, alignItems: 'center', gap: space.xs },
  letter: { ...font.body.label, color: ramp.accent[700] },
  letterFuture: { color: ramp.neutral[400] },
  disc: { width: 34, height: 34, borderRadius: radius.pill },
  done: { backgroundColor: colors.accent },
  // The one that moves. Today is open, and an outline says so without
  // claiming anything about whether anybody has walked yet.
  waiting: { backgroundColor: ramp.accent[200], borderWidth: 2, borderColor: colors.accent },
  future: { backgroundColor: ramp.neutral[200] },
});
```

- [ ] **Step 2: Build the week from the data that exists**

**The strip shows *your* week, not the squad's, and that is a scope decision
rather than an oversight.** The design's 2d draws a squadmate's face on each
day, which needs a per-day, per-member roster the app has no query for — that
would be a new RPC, and this plan ships no backend change. `useOwnRecentDays`
is already in cache from the Today tab and answers a real question: which of the
last seven days you have recorded. Say so in the eyebrow, so the strip does not
imply a claim it cannot make.

Add to `src/features/squad/Leaderboard.tsx`:

```tsx
/**
 * Your last seven days, as the week strip's input.
 *
 * `timeZone` and not the device clock: §2 runs everybody's day in their own
 * zone, and a squad spans several at any instant. `Intl` is given that zone
 * explicitly for both the date arithmetic and the weekday initial.
 *
 * Today is `waiting` rather than `future` even when nothing has been recorded
 * yet — the day is still open, and marking it `future` would say it is over.
 */
function weekFrom(
  days: readonly { localDate: string; steps: number }[],
  today: string | undefined,
  timeZone: string | undefined,
): WeekDay[] {
  if (!today || !timeZone) return [];

  const recorded = new Set(days.filter((d) => d.steps > 0).map((d) => d.localDate));
  const initial = new Intl.DateTimeFormat(undefined, { weekday: 'narrow', timeZone });

  // Six days back through today, oldest first. Built from the local date
  // string rather than from `Date.now()` so it agrees with every other date in
  // the app.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (6 - i));
    const iso = d.toISOString().slice(0, 10);

    return {
      letter: initial.format(d),
      state: iso === today ? 'waiting' : recorded.has(iso) ? 'done' : 'future',
    };
  });
}
```

Note the `T12:00:00Z` anchor: stepping a `Date` by whole days from midnight can
land on the wrong side of a DST boundary, and midday is far enough from both
edges that it cannot.

- [ ] **Step 3: Compose it into the board**

In `src/features/squad/Leaderboard.tsx`:

Remove the `RaceTrack` import and its mount — the race has its own tab and
drawing it here too is the same picture twice.

Add the hooks alongside the ones already there:

```tsx
  const days = useOwnRecentDays(userId, profile.data?.timezone);
  const localToday = profile.data?.timezone
    ? currentLocalDate(new Date(), profile.data.timezone)
    : undefined;
```

and render the strip immediately under the squad header:

```tsx
      <Label>Your week</Label>
      <WeekStrip days={weekFrom(days.data ?? [], localToday, profile.data?.timezone)} />
```

`currentLocalDate` and `useOwnRecentDays` are both already imported by this
file's neighbours; add them here if not.

Finally, give the self row `Panel`'s `tint` ground in
`src/features/squad/LeaderboardRow.tsx` — that variant was added for exactly
this row.

- [ ] **Step 4: Resolve the row's figure through `displaySpecies`**

In `src/features/squad/LeaderboardRow.tsx`, the species art lookup takes the
same shape as Task 2's:

```tsx
  const figure = SPECIES_FIGURES[displaySpecies(row.species as SpeciesId | null)];
```

and the `Avatar` fallback branch goes, for the same reason.

- [ ] **Step 5: Typecheck and run the suite**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(flock): 2d's composition on the squad board

The week strip, the self row on Panel's tint ground, and every figure resolved
through displaySpecies. The board drops its RaceTrack mount — the race has its
own tab and drawing it twice would be the same picture in two places.

The strip draws no count: a squad spans timezones and 'three of four are in'
is a claim about a moment that does not exist for everybody at once.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/user-journey.md`
- Modify: `README.md`
- Modify: `src/features/character/useDisclosure.ts` — the doc comment's gated list

- [ ] **Step 1: Add the two deviation rows**

Append to `docs/roadmap.md`'s approved-deviations table:

```markdown
| 55 | Four Philippine endemic species with a picker, chosen in onboarding (#40) | **One Kairo.** Every character is a Philippine eagle. The picker, `/species` and `(onboard)/character` are retired; onboarding is `/connect` → `/name`. | Four species meant the app had no character — nothing can be *about* your Kairo when it is one of four interchangeable skins, and the picker spent the highest-attention moment in onboarding on an identity declaration. **Display-only and therefore reversible**: `profiles.species` is not migrated, not dropped and never written differently, so every stored choice survives and reversing this is deleting one line of `displaySpecies`. |
| 57 | A squad is a **squad** (#26); the daily board is a race (#46) | **Flock and Sky** in the player-facing vocabulary. | Deviation #23's split in a third place: the surface gets the player's words and the engine keeps its own. `squads`, `squad_members`, `squad_leaderboard()`, `squads.program`, `race.ts`, `RACE_FINISH_LINE` and `rankRacers` are all unchanged, and so are the analytics values `squad_data_consent_granted`, `race_seen` and `quest_cleared` — those have historical rows behind them and `kairo_retention()` is deliberately unchanged across pivots. |
```

Deviation #56 is plan 3's and is added there.

- [ ] **Step 2: Write down the gated list, where it lives**

`src/features/character/useDisclosure.ts`'s doc comment names the gated
surfaces. Two of them moved file in this plan, and the comment is what let a
wider reading of the gate look plausible once already. Update it to read:

```
 * **What `core` hides, as of 2026-08-27.** The list moved file twice in the
 * redesign and nothing else records it:
 *
 *   - `StatRail` — now on `app/(tabs)/profile.tsx` (was the character screen)
 *   - The sleep and lane cards — now on `app/(tabs)/index.tsx`, drawn as the
 *     bird's observations (they were the Strain/Sleep rows)
 *   - `TrainEntry` — `app/(tabs)/index.tsx`, unchanged
 *   - `/train`'s redirect — unchanged, and the one that gates on
 *     `resolved && stage` rather than on `stage` alone
 *
 * **Nothing was added and nothing was taken out.** The constant, the
 * `total > 0` filter and the lifetime-not-recent rule are all unchanged.
```

- [ ] **Step 3: Add the CLAUDE.md block**

Insert after the Sunlit block plan 1 added:

```markdown
**There is one Kairo, and it is a Philippine eagle, as of 2026-08-27**
(deviations #55, #57). Four things break easily:

- **`profiles.species` is untouched and must stay so.** The eagle is resolved at
  the *render boundary* by `displaySpecies()`, which takes the stored value and
  ignores it. Nothing migrates, nothing is dropped, and `parseSpecies` still
  accepts all four — narrowing it would fail every stored row on read, which is
  the difference between a display decision and a destructive one. Reversing #55
  is deleting one line.
- **Onboarding is `/connect` → `/name`, two screens.** The picker sat between
  them. This *removes* a step, so deviation #22's rule is strengthened rather
  than merely respected: the profile row still commits exactly once, on the last
  screen. Add onboarding steps **before** the name, never after — anything after
  the INSERT flips `resolveRoute` to `'ready'` under an unfinished screen and
  needs the deleted `finishingOnboarding` flag back.
- **`kairo-voice.ts` owns what the bird says**, and it is zero-runtime-import so
  root Vitest can test it — it reaches `stat-names.ts` by relative path, exactly
  as `program-copy.ts` does, because the `@/ui` barrel does not resolve there.
  Three rules have tests behind them: no score total, no engine key, and a
  missing figure yields a *shorter* sentence rather than a fabricated one. The
  null night reads "No reading yet", which is the rule `finalize-days` grades
  by — a raw `daily_sleep.minutes` read would have the card congratulating
  somebody on a night the engine ignored.
- **The Today tab is the character screen and the old Today tab merged**, and
  the race on it is a *sentence*, not a card. `RaceCard` is gone; the picture is
  the Sky tab, and `race_seen` fires there. The disclosure gate did not move —
  the sleep and lane cards are the Strain/Sleep rows in a new dress and keep
  their `full` gate, and `useDisclosure`'s doc comment now names every gated
  surface and which file mounts it.
```

- [ ] **Step 4: Flag the consent sheet's copy — do not reword it**

`src/features/squad/SquadDataConsentSheet.tsx` says "squad" in its body copy.
**Leave it.** It is a privacy disclosure that existing members have already read
and agreed to, and rewording the text somebody consented under is a different
kind of change from renaming a tab — it belongs with the privacy-policy and App
Store privacy-answer work that deviation #47 already lists as a launch blocker,
not inside a vocabulary rename.

Add a comment at the top of that file's copy block so the next person does not
"finish the rename":

```tsx
      {/* Says "squad", deliberately, after the 2026-08-27 rename to "flock"
          (deviation #57). This is the text members consented under; changing it
          belongs with the privacy-policy update, not with a vocabulary pass. */}
```

- [ ] **Step 5: Update the journey and the README**

`docs/user-journey.md` — onboarding is two screens; the daily loop opens on the
bird; the race is a tab. Walk the document and correct every place that says
otherwise; it is the file that describes what is actually built.

`README.md` — replace any statement that the player picks a species.

- [ ] **Step 6: Run the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: one Kairo, the bird's voice, and where the gate's surfaces went

Deviations #55 and #57. useDisclosure's doc comment now names all four gated
surfaces and which file mounts each — two moved file in this plan, and that
comment is what let a wider reading of the gate look plausible once already.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Hand verification, before this plan is called done

- [ ] **Onboarding, from a fresh account.** Sign out, delete the account or use a new one, and walk `/connect` → `/name`. The bird is on screen before the field is. "Say hello" commits once — tap it twice fast and confirm one profile row, which is what the `submitting` ref exists for.
- [ ] **Today, on a `core` account and on a `full` one.** The `core` account sees the bird, the number, the sentence, quests and the Daily Walk — and **not** the sleep card, the lane card or the Challenge door. Switching `quest_tier_override` in You is the quickest way to confirm the screen re-renders without a relaunch.
- [ ] **Largest type.** `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`, **then relaunch** — RN caches text measurements. Check the name screen especially: a 28pt input plus copy plus a button is the composition most likely to overflow, and `Panel` sets `overflow: 'hidden'` so it will clip silently rather than spill.
- [ ] **Accessibility Inspector.** The growth card's three rows must be **three** elements, not nine. The week strip must be **one**. Each of the bird's observation cards must be one.
- [ ] `xcrun simctl io booted screenshot` at both sizes.

Taps and the Inspector pass go to the user — simulator UI automation is
unreliable on this machine, with synthetic taps landing 60–120 seconds late.

## Definition of done

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes, including `kairo-voice.test.ts` and the extended `species.test.ts`
- [ ] `grep -rn "SpeciesPicker\|'/species'" src app --include="*.ts" --include="*.tsx"` returns nothing
- [ ] `grep -rn "race_seen" src app --include="*.ts" --include="*.tsx" | grep -v daily-marker` returns nothing — plan 3 mounts it
- [ ] `stat-names.test.ts`'s Agility scan is green over the new files
- [ ] `npm run eas:fingerprint` is unchanged from before the branch
- [ ] A `core` account and a `full` account each see the right Today
- [ ] `CLAUDE.md`, `docs/roadmap.md`, `docs/user-journey.md` and `README.md` describe the app that now exists

# The First Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut what a new user meets down to one loop, show them the point before asking for anything, and stop treating an intentional choice as a technical failure.

**Architecture:** Progressive disclosure is the spine — a pure `disclosureStage()` in `kairo-core` decides what exists yet, and every advanced surface reads it. Nothing is deleted; the threshold is one constant. Around that: the pitch moves ahead of sign-in, Health connect moves ahead of character choice (still before the single profile INSERT), the health surface gains a state for "connected, nothing arriving", and the solo board stops selling absence.

**Tech Stack:** TypeScript, Expo Router, React Native, TanStack Query, Vitest (root config for `src/**` and `app/**`, package config for `kairo-core`), Supabase/PostgREST.

**Spec:** `docs/superpowers/specs/2026-08-15-activation-and-measurement-design.md` — §5, §6, §7, §8, §9. Plan 1 (`docs/superpowers/plans/2026-08-16-measurement.md`) implemented §4 and is merged.

## Global Constraints

- **`src/ui/Text.tsx` is the only Text.** Import from `@/ui`, never from `react-native`. Three scales chosen by what the type sits inside: `prose` (1.8, the default) for copy in containers that grow, `chrome` (1.4) for buttons and meta lines, `fixed` (1.2) for type locked to drawn geometry.
- **A decorative or duplicative element is hidden** (`accessibilityElementsHidden`); **the group that means something is one element with a composed label.** Before adding a label, read what is already spoken beside it — a label repeating an adjacent line is noise.
- **Grouping is explicit.** A parent that groups keeps `accessible` + `accessibilityLabel` **and** every direct child gets `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`. Neither half is redundant.
- **The character HUD's layout stays flow-based.** Do not reintroduce a `top` on any child.
- **Onboarding steps go before the name screen, never after.** The profile row commits exactly once, on the name screen. Anything asked after that INSERT flips `resolveRoute` to `'ready'` under an unfinished screen and needs deviation #22's deleted flag back.
- **Telemetry never throws and never blocks a user action.**
- Root Vitest cannot resolve the `@/` alias or parse React Native's Flow syntax. Modules needing unit tests import nothing; modules importing the Supabase client, MMKV or `@kingstinct/react-native-healthkit` are I/O and hand-verified.
- **Apple's Sign in with Apple button cannot be restyled** — required by their HIG, and swapping it for Kairo's `Button` is an App Review rejection.
- Stat glyphs are MaterialCommunityIcons; all other chrome is Feather. Hairline = things you operate, solid = things you are. Do not blur it.
- Imports use explicit `.ts`/`.tsx` extensions.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## What Plan 1 left for this plan

Two are spec items; two are findings from Plan 1's whole-branch review that belong here.

| Item | Where | Task |
|---|---|---|
| `disclosure_unlocked` is declared in `AppEventType` and fired nowhere | `src/features/telemetry/events.ts` | 2 |
| `onboarding_started` fires on `/character`; it names the start of onboarding, not that screen | `app/(onboard)/character.tsx:41-43` | 6 |
| **The health-ask step has no denominator.** `health_ask_completed` fires only on success; dismissing the sheet and never being offered it are indistinguishable | `src/features/permissions/PermissionAsks.tsx:97` | 7 |
| The funnel's documented step order will become correct once `/connect` exists | `docs/beta-measurement.md` | 9 |

---

### Task 1: `disclosureStage` — the rule

The spine. A pure function so the threshold is testable in Node and lives in one place.

**Files:**
- Create: `packages/kairo-core/src/disclosure.ts`
- Create: `packages/kairo-core/src/disclosure.test.ts`
- Modify: `packages/kairo-core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type DisclosureStage = 'core' | 'full'`
  - `const DISCLOSURE_THRESHOLD_DAYS = 3`
  - `function disclosureStage(lifetimeScoredDays: number): DisclosureStage`

- [ ] **Step 1: Write the failing test**

Create `packages/kairo-core/src/disclosure.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  DISCLOSURE_THRESHOLD_DAYS,
  disclosureStage,
} from './disclosure.ts';

describe('disclosureStage', () => {
  it('is core on a brand new account', () => {
    expect(disclosureStage(0)).toBe('core');
  });

  it('is still core the day before the threshold', () => {
    expect(disclosureStage(DISCLOSURE_THRESHOLD_DAYS - 1)).toBe('core');
  });

  it('is full at the threshold', () => {
    expect(disclosureStage(DISCLOSURE_THRESHOLD_DAYS)).toBe('full');
  });

  it('stays full well past it', () => {
    expect(disclosureStage(900)).toBe('full');
  });

  // The count is a lifetime total read off the server. A negative or
  // fractional value means the caller passed something it should not have —
  // failing open would hide the whole app from an existing user, so this
  // clamps toward showing less only for values below the threshold.
  it('treats a nonsense count as core rather than throwing', () => {
    expect(disclosureStage(-1)).toBe('core');
    expect(disclosureStage(Number.NaN)).toBe('core');
  });
});

describe('DISCLOSURE_THRESHOLD_DAYS', () => {
  // Pinned deliberately. Moving it is a product decision (design D30), and a
  // silent drift would change what every new user sees with no other signal.
  it('is 3', () => {
    expect(DISCLOSURE_THRESHOLD_DAYS).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:core -- --run src/disclosure.test.ts`

Expected: FAIL — cannot resolve `./disclosure.ts`.

- [ ] **Step 3: Write the implementation**

Create `packages/kairo-core/src/disclosure.ts`:

```typescript
/**
 * How much of Kairo exists yet, for this account (design §5).
 *
 * A new user met eight retention systems at once — level and XP, four ability
 * ratings, a daily score, streaks, raw metrics, a leaderboard, long-horizon
 * goals and squad program multipliers — before having a single day of data to
 * read any of them against. This is the decision to show one loop first:
 * activity, visible character progress, the squad gap, and the Daily Walk as
 * the one daily action.
 *
 * **Hidden, never deleted.** Every gated surface stays built, tested and
 * reachable; the threshold below is one constant, so reversing this is a
 * one-line change plus a test update. That property is what makes it safe to
 * try on a cohort at all.
 *
 * Pure, like everything in this package — the day count is an argument, never
 * a read.
 */

export type DisclosureStage =
  /** The one loop. Goals, Challenges and per-stat detail are not on screen. */
  | 'core'
  /** Everything. */
  | 'full';

/**
 * Scored days before the rest of the app appears.
 *
 * Three, not seven: long enough that the Daily Walk streak on screen is a real
 * baseline to set a goal against, short enough that a curious user is not
 * locked out of the app's depth for a week. Pinned by a test, because moving it
 * changes what every new user sees and nothing else would signal the change.
 */
export const DISCLOSURE_THRESHOLD_DAYS = 3;

/**
 * `lifetimeScoredDays` is a count of the account's `daily_scores` rows — every
 * day it has ever scored, not a recent window. That distinction is load-bearing:
 * a gate on recent activity would demote someone returning from a quiet week
 * back to the reduced app, and that user is precisely the one the retention
 * measurement is about.
 */
export function disclosureStage(lifetimeScoredDays: number): DisclosureStage {
  // Guards a NaN from a failed count as well as a negative: `NaN >= n` is
  // false, so both fall to 'core' without a branch of their own.
  return lifetimeScoredDays >= DISCLOSURE_THRESHOLD_DAYS ? 'full' : 'core';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:core -- --run src/disclosure.test.ts`

Expected: PASS — 6 tests.

- [ ] **Step 5: Export it from the package**

In `packages/kairo-core/src/index.ts`, add to the export list (alongside `export * from './challenge.ts';` and its neighbours):

```typescript
export * from './disclosure.ts';
```

- [ ] **Step 6: Verify the whole suite**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/kairo-core/src/disclosure.ts packages/kairo-core/src/disclosure.test.ts packages/kairo-core/src/index.ts
git commit -m "$(cat <<'EOF'
feat: disclosureStage — how much of Kairo exists yet

A new user met eight retention systems before having a day of data to
read any of them against. This is the rule that shows one loop first.

Hidden, never deleted: the threshold is one constant and every gated
surface stays built, which is what makes this safe to try on a cohort.
Gated on lifetime scored days, not recent ones — a recent-activity gate
would demote someone returning from a quiet week, and that is the user
the retention measurement is about.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The stage hook, and `disclosure_unlocked`

`disclosure_unlocked` is declared in `AppEventType` and fired nowhere — the exact defect Plan 1 was written about. This task gives it its call site.

**Files:**
- Modify: `src/features/character/queries.ts`
- Create: `src/features/character/useDisclosure.ts`
- Modify: `src/features/telemetry/milestones.ts`
- Modify: `src/features/telemetry/milestone-store.ts`

**Interfaces:**
- Consumes: `disclosureStage`, `DisclosureStage`, `DISCLOSURE_THRESHOLD_DAYS` from `@kairo/core` (Task 1); `track` from `src/features/telemetry/events.ts`; `hasReached`/`markReached`/`markUnreached` from `src/features/telemetry/milestone-store.ts`.
- Produces:
  - `function scoredDayCountKey(userId: string | undefined): unknown[]` in `queries.ts`
  - `function useScoredDayCount(userId: string | undefined)` in `queries.ts` — a TanStack query resolving to `number`
  - `function useDisclosure(userId: string | undefined): { stage: DisclosureStage; scoredDays: number; daysToGo: number }` in `useDisclosure.ts`
  - `'disclosure_unlocked'` added to the `Milestone` union and to `ALL_MILESTONES`

- [ ] **Step 1: Add `disclosure_unlocked` to the milestone vocabulary**

In `src/features/telemetry/milestones.ts`, extend the union:

```typescript
export type Milestone =
  | 'first_sync_seen'
  | 'first_score_seen'
  /**
   * The day the rest of the app appeared (design §5). Once-ever like its
   * siblings — the stage is derived from a day count, so without a marker this
   * would re-fire on every launch after the threshold, turning an unlock into a
   * launch counter.
   */
  | 'disclosure_unlocked';
```

In `src/features/telemetry/milestone-store.ts`, add it to the `ALL_MILESTONES` constant that `clearMilestones` enumerates, so signing out still clears every key:

```typescript
const ALL_MILESTONES: readonly Milestone[] = [
  'first_sync_seen',
  'first_score_seen',
  'disclosure_unlocked',
];
```

- [ ] **Step 2: Add the scored-day count query**

In `src/features/character/queries.ts`, following the file's existing query idiom, add:

```typescript
/** Cache key for the account's lifetime scored-day count. */
export function scoredDayCountKey(userId: string | undefined) {
  return ['scored-day-count', userId] as const;
}

/**
 * How many days this account has ever scored **above zero**.
 *
 * The `total > 0` filter is load-bearing, not tidiness. `sync-health` writes a
 * `daily_scores` row for every date in the payload whether or not it scored,
 * and `resolveSyncWindow` always sends today *and* yesterday
 * (`ROUTINE_WINDOW_DAYS = 2`). So a bare row count reads 2 the moment a user
 * installs and syncs once, and 3 the next day — meaning the disclosure gate
 * would open on day 1 for someone who has done nothing, which is the whole
 * design defeated. Counting real days makes the threshold mean what it says.
 *
 * A `head: true` count rather than a select: the rows themselves are never
 * needed, only how many there are, and a user a year in has 365 of them.
 * Clients hold SELECT on their own `daily_scores` rows, so this needs no RPC.
 *
 * Feeds `disclosureStage`, so it is deliberately a **lifetime** count and not a
 * windowed one — see the note in `packages/kairo-core/src/disclosure.ts`.
 */
export function useScoredDayCount(userId: string | undefined) {
  return useQuery({
    queryKey: scoredDayCountKey(userId),
    enabled: userId !== undefined,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('daily_scores')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId!)
        .gt('total', 0);

      if (error) throw error;
      return count ?? 0;
    },
  });
}
```

- [ ] **Step 3: Write the hook**

Create `src/features/character/useDisclosure.ts`:

```typescript
import { useEffect } from 'react';
import { DISCLOSURE_THRESHOLD_DAYS, disclosureStage, type DisclosureStage } from '@kairo/core';
import { track } from '@/features/telemetry/events.ts';
import { hasReached, markReached, markUnreached } from '@/features/telemetry/milestone-store.ts';
import { useScoredDayCount } from './queries.ts';

/**
 * What the app is allowed to show this account, and how close it is.
 *
 * The decision itself is `disclosureStage` in `@kairo/core`, tested in Node.
 * This is the I/O around it — the same split `useHealthSync` and
 * `useSquadRealtime` use.
 *
 * **While the count is loading the stage is `'core'`.** Showing less and then
 * revealing more is a reveal; showing everything and then snatching it back is
 * a bug the user will report. The undercount lasts one query.
 */
export function useDisclosure(userId: string | undefined): {
  stage: DisclosureStage;
  scoredDays: number;
  daysToGo: number;
} {
  const count = useScoredDayCount(userId);
  const scoredDays = count.data ?? 0;
  const stage = disclosureStage(scoredDays);

  useEffect(() => {
    if (!userId) return;
    // Gated on the query having actually resolved: `scoredDays` defaults to 0
    // while loading, and firing off a default would record an unlock that never
    // happened.
    if (count.data === undefined) return;
    if (stage !== 'full') return;

    try {
      if (hasReached(userId, 'disclosure_unlocked')) return;
      markReached(userId, 'disclosure_unlocked');
    } catch (error) {
      console.warn('[disclosure] milestone read failed', error);
      return;
    }

    // Claim before the write, release if the row did not land — the same
    // protocol `markFirstSyncSeen` settled on. `track` resolves true only on a
    // confirmed insert. Releasing means a write that succeeded but reported
    // failure could fire twice; every query reading this counts distinct users,
    // so a duplicate changes no answer and a lost unlock is unrecoverable.
    void track(userId, 'disclosure_unlocked', { scoredDays }).then((landed) => {
      if (landed) return;
      try {
        markUnreached(userId, 'disclosure_unlocked');
      } catch (error) {
        console.warn('[disclosure] milestone release failed', error);
      }
    });
  }, [userId, stage, count.data, scoredDays]);

  return {
    stage,
    scoredDays,
    daysToGo: Math.max(0, DISCLOSURE_THRESHOLD_DAYS - scoredDays),
  };
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`

Expected: PASS. There is no Node test for this hook — it imports the Supabase client and MMKV, so root Vitest cannot load it. The rule it wraps is tested in Task 1.

- [ ] **Step 5: Commit**

```bash
git add packages/kairo-core src/features/character/queries.ts src/features/character/useDisclosure.ts src/features/telemetry/milestones.ts src/features/telemetry/milestone-store.ts
git commit -m "$(cat <<'EOF'
feat: the disclosure stage hook, and fire disclosure_unlocked

disclosure_unlocked was declared in AppEventType and fired nowhere — the
exact defect the measurement plan was written about. This gives it a call
site, using the claim-before-write/release-on-failure protocol the other
two once-ever events settled on.

The stage is 'core' while the count loads: showing less and then revealing
more is a reveal, showing everything and snatching it back is a bug report.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Gate the home screen

`app/(tabs)/index.tsx` is the Character tab and the app's densest screen. In `core` it keeps the day in real units, the Daily Walk and its streak, the figure, the level and the squad gap.

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `useDisclosure` (Task 2).
- Produces: no new exports.

- [ ] **Step 1: Read the screen before changing it**

Open `app/(tabs)/index.tsx` and locate these five, which are what this task gates. Their line numbers move as you edit, so find them by name:

| Surface | Import | Gate to |
|---|---|---|
| `TrainEntry` | `@/features/train/TrainEntry.tsx` | `full` |
| `GoalCard` | `@/features/goals/GoalCard.tsx` | `full` |
| `StatRail` | `@/features/character/StatRail.tsx` | `full` |
| Strain / Sleep block (the section commented "Strain and Sleep appear only with a wearable (§5)") | — | `full` **and** the existing wearable condition |
| `DailyWalkCard` | `@/features/train/DailyWalkCard.tsx` | **always visible — this is the one daily action** |

`Diorama`, `StatBar`, `SyncStatus`, `TodayPanel` and `FirstSyncCallout` all stay in both stages.

- [ ] **Step 2: Wire the hook and gate the four surfaces**

Add the import:

```typescript
import { useDisclosure } from '@/features/character/useDisclosure.ts';
```

Inside the component, beside the existing `useSessionStore` read:

```typescript
  // What this account is allowed to see yet (§5). Everything gated below stays
  // built and reachable — this decides whether it is on screen, nothing more.
  const { stage, daysToGo } = useDisclosure(session?.user.id);
```

Then wrap each of the four surfaces in `{stage === 'full' && ( ... )}`. For the strain/sleep block, add the stage to the condition already there rather than nesting a second conditional — one condition is easier to read and impossible to get half-right.

- [ ] **Step 3: Add the "what's coming" line**

An empty space where a card used to be reads as a missing feature. Under `DailyWalkCard`, in `core` only:

```tsx
        {stage === 'core' && (
          <Text style={styles.disclosureNote}>
            {daysToGo === 1
              ? 'One more day of activity unlocks goals and challenges.'
              : `${daysToGo} more days of activity unlocks goals and challenges.`}
          </Text>
        )}
```

and in the `StyleSheet.create` block at the bottom of the file, beside the other text styles:

```typescript
  disclosureNote: {
    ...font.body.body,
    fontSize: 13,
    color: colors.muted,
    marginTop: space.md,
    textAlign: 'center',
  },
```

This needs no `accessibilityLabel` — it is already text, and a label would duplicate it.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "$(cat <<'EOF'
feat: the home screen shows one loop until there is data behind the rest

Gates TrainEntry, GoalCard, StatRail and the strain block behind the
disclosure stage. The Daily Walk stays — it is the one daily action.

The core stage says what is coming rather than leaving a gap: an empty
space where a card used to be reads as a missing feature.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Gate `/train` and squad goals

Hiding an entry point is not the same as closing a door. `/train` and `/goal/new` are routes, and a push notification or a stale deep link can land on either.

**Files:**
- Modify: `app/train.tsx`
- Modify: `src/features/goals/SquadGoalPanel.tsx`

**Interfaces:**
- Consumes: `useDisclosure` (Task 2).
- Produces: no new exports.

- [ ] **Step 1: Guard the `/train` route**

In `app/train.tsx`, add the imports and, at the top of the component body, redirect a `core` user home rather than rendering Challenges:

```typescript
import { Redirect } from 'expo-router';
import { useDisclosure } from '@/features/character/useDisclosure.ts';
```

```typescript
  const { stage } = useDisclosure(session?.user.id);

  // A hidden entry point is not a closed door: `notificationTarget` can route a
  // Challenge push here, and a user who installed, cleared their data and came
  // back has a live token. Redirect rather than render an empty screen.
  if (stage === 'core') return <Redirect href="/" />;
```

If the component does not already read `session`, add `useSessionStore` exactly as `app/(tabs)/index.tsx` does — do not add a second session source.

- [ ] **Step 2: Gate the squad goal panel**

In `src/features/goals/SquadGoalPanel.tsx`, add the import and an early return at the top of the component, before any other hook-dependent logic but after every hook call — React requires an unconditional hook order:

```typescript
import { useDisclosure } from '@/features/character/useDisclosure.ts';
```

```typescript
  const { stage } = useDisclosure(userId);

  // Rendered nothing rather than gated by the caller: the decision belongs with
  // the component that owns the surface, so a second caller cannot forget it.
  if (stage === 'core') return null;
```

Use whatever the component already calls its user id — do not add a session read if one is already in scope or passed as a prop.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/train.tsx src/features/goals/SquadGoalPanel.tsx
git commit -m "$(cat <<'EOF'
feat: close the doors, not just the entry points

/train and the squad goal panel are reachable by push routing and by deep
link regardless of whether the home screen shows their entry points, so
each checks the disclosure stage itself.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The pre-auth pitch

The sign-in screen currently says `KAIRO` and *"Every day is a Kairo moment."* — which communicates nothing — and then asks for an Apple ID. This puts the loop and the privacy promise ahead of the commitment.

**Files:**
- Modify: `app/(auth)/sign-in.tsx`

**Interfaces:**
- Consumes: `track` from `src/features/telemetry/events.ts` (buffers pre-auth and flushes on sign-in — Plan 1, §4.4).
- Produces: no new exports.

- [ ] **Step 1: Replace the hero**

In `app/(auth)/sign-in.tsx`, replace the `styles.hero` block:

```tsx
      <View style={styles.hero}>
        <Text style={styles.brand}>KAIRO</Text>
        <Text style={styles.tagline}>Every day is a Kairo moment.</Text>
      </View>
```

with the loop, the wedge, and the privacy promise:

```tsx
      <View style={styles.hero}>
        <Text style={styles.brand}>KAIRO</Text>
        <Text style={styles.tagline}>
          Turn everyday movement into a character you level with your friends.
        </Text>

        {/* The loop, in the order it happens. Three lines rather than a
            paragraph: this is the one screen a user reads before deciding
            whether to sign in at all. */}
        <View style={styles.loop}>
          <Step text="Your phone already counts your steps." />
          <Step text="Your character levels from them." />
          <Step text="Your squad sees where you stand today." />
        </View>

        {/* Names who this is for. Design D36: positioning only — the in-app
            nouns stay "your character" and "squad", so deviation #26 stands.
            "Wherever they are" is the wedge doing the work: a squad whose
            members are split across countries is the case Kairo fits and a
            public fitness feed does not. */}
        <Text style={styles.who}>
          Built for small groups who already know each other — your family, your
          friends, wherever they are.
        </Text>

        {/* The privacy line is the strongest thing about the product and was
            previously only visible after signing in. */}
        <Text style={styles.privacy}>
          Your squad sees your progress — never your Health data.
        </Text>
      </View>
```

Add the `Step` component at the bottom of the file, beside the existing styles:

```tsx
function Step({ text }: { text: string }) {
  return (
    <View style={styles.step}>
      {/* Decorative: the sentence beside it carries the whole meaning, and a
          screen reader announcing "bullet" three times is noise. */}
      <View style={styles.dot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}
```

and the styles:

```typescript
  loop: { marginTop: space.lg, gap: space.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 8,
  },
  stepText: { ...font.body.body, fontSize: 15, color: colors.text, flex: 1 },
  who: {
    ...font.body.body,
    fontSize: 14,
    color: colors.subtle,
    marginTop: space.lg,
    lineHeight: 20,
  },
  privacy: {
    ...font.body.strong,
    fontSize: 13,
    color: colors.subtle,
    marginTop: space.lg,
    lineHeight: 19,
  },
```

Keep `styles.tagline` in the stylesheet and reuse it for the new tagline — do not invent a second display style.

**Do not touch the Apple button.** Its chrome is required by Apple's HIG and restyling it is a review rejection.

- [ ] **Step 2: Record that the pitch was seen**

Below the hero's `View`, inside the component:

```typescript
  // The first measurable moment in the funnel. There is no session yet, so
  // `track` buffers this and `flushTelemetryBuffer` attributes it after
  // sign-in, carrying this timestamp rather than the flush time — which is the
  // whole reason the buffer exists.
  useEffect(() => {
    void track(undefined, 'pitch_seen');
  }, []);
```

Add `'pitch_seen'` to `AppEventType` in `src/features/telemetry/events.ts`, in the activation-funnel group, with a comment noting it is the funnel's first step and fires before any session exists.

- [ ] **Step 3: Carry the positioning into the invite**

Design D36 scopes the cultural wedge to pitch, copy and tone — **no in-app noun changes**, so deviation #26 stands and it stays "squad", never "barkada".

The invite message is the one piece of Kairo copy that leaves the app, so it carries the positioning further than any screen. In `src/features/squad/invite-message.ts`, adjust the body so it names what the recipient is being asked into — a small group holding each other to a daily walk — rather than reading as a generic app referral. Keep `inviteTitle()` exactly as it is: `squad-name.test.ts` and `invite-message.test.ts` both assert on it, and `Join <name> on Kairo` is already right.

Run `npx vitest run --config vitest.config.ts src/features/squad/invite-message.test.ts` and update any assertion that pins the body text, keeping every assertion that pins structure (the name appearing, the code appearing).

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/sign-in.tsx" src/features/telemetry/events.ts src/features/squad/invite-message.ts src/features/squad/invite-message.test.ts
git commit -m "$(cat <<'EOF'
feat: say what Kairo is before asking for an Apple ID

"Every day is a Kairo moment" communicated nothing, and the privacy
promise — the strongest thing about the product — was only visible after
signing in. Both fixed on the one screen a user reads before deciding.

pitch_seen is the funnel's first step and fires with no session, which is
what the pre-auth buffer was built for.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `/connect`, and the onboarding reorder

Health moves from fourth to first. The connect screen reads HealthKit **locally** and shows today's real step count, which is the "reveal imported progress" moment — and it works before a profile exists because it needs no server.

**Files:**
- Create: `app/(onboard)/connect.tsx`
- Modify: `src/features/auth/route.ts`
- Modify: `src/features/auth/route.test.ts`
- Modify: `app/(onboard)/character.tsx`

**Interfaces:**
- Consumes: `requestHealthPermission`, `readHealthPermissionState` from `src/features/health/permission.ts`; `queryStepsToday`-equivalent from `src/features/health/read.ts` (find the existing today-steps read — `useTodaySteps` in `src/features/character/queries.ts` names it); `track`.
- Produces: `redirectTarget`'s `needs-profile` case now returns `'/connect'`.

- [ ] **Step 1: Write the failing routing test**

In `src/features/auth/route.test.ts`, find the existing `redirectTarget` case asserting `needs-profile` sends to `'/character'` and change it, adding a second case:

```typescript
  it('sends a user with no profile to the connect screen, the first onboarding step', () => {
    expect(redirectTarget({ route: 'needs-profile', group: undefined })).toBe('/connect');
  });

  it('leaves a user already inside the onboarding group alone', () => {
    // /connect pushes to /character which pushes to /name. The gate only knows
    // "has no profile row yet", so it must not bounce anyone back to step one
    // mid-flow.
    expect(redirectTarget({ route: 'needs-profile', group: '(onboard)' })).toBe(null);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config vitest.config.ts src/features/auth/route.test.ts`

Expected: FAIL — received `'/character'`, expected `'/connect'`.

- [ ] **Step 3: Change the route**

In `src/features/auth/route.ts`, change the return type union to include `'/connect'` and update the `needs-profile` case:

```typescript
    case 'needs-profile':
      // The *first* onboarding screen: `/connect` → `/character` → `/name`.
      // Health is asked before the character is chosen so the name screen can
      // land on a home tab with real numbers rather than zeros. The later
      // screens are reached by pushing, never by this gate, which only knows
      // "has no profile row yet".
      //
      // Every step stays *before* the name screen on purpose. The profile row
      // commits exactly once, there; anything asked after that INSERT flips
      // resolveRoute to 'ready' under an unfinished screen and needs deviation
      // #22's deleted `finishingOnboarding` flag back.
      return input.group === '(onboard)' ? null : '/connect';
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --config vitest.config.ts src/features/auth/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Build the connect screen**

Create `app/(onboard)/connect.tsx`. Its layout mirrors `app/(onboard)/character.tsx` — same `insets`, `Label` + title + help, pinned action — so the three onboarding screens read as one flow.

**Do not write a profile row here.** This screen writes nothing; the body choice and the name both land in the single INSERT on `/name`.

```tsx
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSessionStore } from '@/features/auth/session.ts';
import {
  readHealthPermissionState,
  requestHealthPermission,
} from '@/features/health/permission.ts';
import { readStepsToday } from '@/features/health/read.ts';
import { track } from '@/features/telemetry/events.ts';
import { Button, Label, Numeral, Text } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';

/**
 * The first onboarding screen (design §7).
 *
 * Health used to be asked fourth — after sign-in, choosing a body and naming a
 * character — so the first thing a new user saw was a dashboard of zeroes.
 * Asking here means the name screen lands on a home tab with real numbers.
 *
 * **It reads HealthKit locally and never syncs.** There is no profile row yet,
 * so there is nothing for `health_buckets` to hang from; the first
 * `sync-health` call still happens after `/name`. That is what lets the reveal
 * below work at all this early — it needs no server.
 */
type Phase = 'asking' | 'revealed';

export default function Connect() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const userId = useSessionStore((s) => s.session)?.user.id;
  const [phase, setPhase] = useState<Phase>('asking');
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<number | null>(null);

  useEffect(() => {
    void track(userId, 'onboarding_started');
  }, [userId]);

  async function connect() {
    setBusy(true);
    try {
      await requestHealthPermission();
      // Guarded: a failed status read is telemetry's problem, never the
      // user's. Same reason the sheet's read is guarded.
      const state = await readHealthPermissionState().catch(() => null);
      void track(userId, 'health_ask_completed', { state });

      // A read that throws and a phone with no steps are the same thing here —
      // both mean "nothing to show yet", and neither is a failure.
      const today = await readStepsToday().catch(() => null);
      setSteps(today);
    } finally {
      setBusy(false);
      setPhase('revealed');
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.xl }]}>
      <View style={styles.top}>
        <Label>CONNECT APPLE HEALTH</Label>
        <Text style={styles.title}>Your character levels from what you already do.</Text>
        <Text style={styles.help}>
          Kairo reads your steps, active minutes and calories from Apple Health.
          Your squad sees your progress — never the raw numbers.
        </Text>

        {phase === 'revealed' && steps !== null && steps > 0 && (
          // The reveal. This is the whole reason the ask moved to the front:
          // the user sees their own real activity before committing to anything.
          <View
            style={styles.reveal}
            accessible
            accessibilityLabel={`${steps} steps today, already counted`}
          >
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Numeral value={steps.toLocaleString()} size="hero" color={colors.accent} />
              <Text style={styles.revealCaption}>steps today, already counted</Text>
            </View>
          </View>
        )}

        {phase === 'revealed' && (steps === null || steps === 0) && (
          // Not an error: a new phone, or a phone left on a desk, both land
          // here. Saying "couldn't read" would blame the user for a quiet day.
          <Text style={styles.quiet}>
            We'll pick up your activity as it comes in.
          </Text>
        )}
      </View>

      <View style={{ paddingBottom: insets.bottom + space.xl }}>
        {phase === 'asking' ? (
          <>
            <Button
              label="Connect Apple Health"
              variant="primary"
              busy={busy}
              onPress={() => void connect()}
            />
            {/* A deferral, not a refusal — `PermissionAsks` asks again later. */}
            <Button label="Not now" variant="ghost" onPress={() => router.push('/character')} />
          </>
        ) : (
          <Button
            label="Continue"
            variant="primary"
            onPress={() => router.push('/character')}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', paddingHorizontal: space.lg },
  top: { gap: space.sm },
  title: { ...font.display.small, fontSize: 22, color: colors.text },
  help: { ...font.body.body, fontSize: 15, color: colors.subtle, lineHeight: 22 },
  reveal: { marginTop: space.xl, alignItems: 'center' },
  revealCaption: { ...font.body.body, fontSize: 14, color: colors.subtle, textAlign: 'center' },
  quiet: { ...font.body.body, fontSize: 14, color: colors.muted, marginTop: space.xl },
});
```

**Before writing this, check two things and adapt rather than forcing the code above:**

1. `readStepsToday` may not exist under that name. `src/features/character/queries.ts` has `useTodaySteps` — find the underlying read it calls in `src/features/health/read.ts` and use that. If the only available read requires a timezone, pass the device zone via `deviceTimeZone()` from `src/features/profile/device-timezone.ts`.
2. Confirm `Button` accepts a `busy` prop (`CreateGoalForm.tsx` uses it) and that `Numeral` accepts `value`/`size`/`color` (`SoloBoard.tsx` uses exactly that shape).

- [ ] **Step 6: Move `onboarding_started` off the character screen**

In `app/(onboard)/character.tsx`, delete the `useEffect` firing `track(userId, 'onboarding_started')` and its comment (lines ~38-43), and remove the now-unused `track` import if nothing else in the file uses it. Leave `useSessionStore` if the screen still needs `userId`; remove it if it does not.

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test`

Expected: PASS, including the two updated routing tests.

- [ ] **Step 8: Commit**

```bash
git add "app/(onboard)/connect.tsx" "app/(onboard)/character.tsx" src/features/auth/route.ts src/features/auth/route.test.ts
git commit -m "$(cat <<'EOF'
feat: connect Health first, and show what it found

Onboarding becomes /connect -> /character -> /name. The connect screen
reads HealthKit locally and shows today's real steps, which works before a
profile exists because it needs no server — so the name screen lands on a
home tab with real numbers instead of zeros.

Every step stays before the name screen. The profile row still commits
exactly once, there, so deviation #22's deleted flag stays deleted.

onboarding_started moves here: it names the start of onboarding, not the
character screen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The health surface tells the truth

Two things. A new `syncStatus` state for *connected but nothing arriving*, and the event that gives the health-ask step a denominator.

**Files:**
- Modify: `src/features/health/sync-status.ts`
- Modify: `src/features/health/sync-status.test.ts`
- Modify: `src/features/character/SyncStatus.tsx`
- Modify: `src/features/permissions/PermissionAsks.tsx`
- Modify: `src/features/telemetry/events.ts`

**Interfaces:**
- Consumes: `track`.
- Produces: `SyncStatusKind` gains `'no-data'`; `SyncStatusInput` gains `everReceivedData: boolean`; `AppEventType` gains `'health_ask_dismissed'`.

- [ ] **Step 1: Write the failing tests**

In `src/features/health/sync-status.test.ts`, add:

```typescript
describe('no-data', () => {
  const base = { syncing: false, lastError: null, now: 1_000_000 };

  it('names the state when syncing works but nothing has ever arrived', () => {
    const s = syncStatus({ ...base, lastSyncedAt: 999_000, everReceivedData: false });

    expect(s.kind).toBe('no-data');
    expect(s.message).toBe("Apple Health isn't sending anything yet.");
    expect(s.action).toBe('Open Settings');
    expect(s.attention).toBe(true);
  });

  // The 9-11 Aug outage is why 'failed' exists: buckets kept committing while
  // scoring was down and the app said nothing. An error must still outrank a
  // quiet phone, or this new state would blind the case the module was built
  // for.
  it('does not shadow a real failure', () => {
    const s = syncStatus({
      ...base,
      lastSyncedAt: 999_000,
      lastError: 'boom',
      everReceivedData: false,
    });

    expect(s.kind).toBe('failed');
  });

  it('is fresh once data has arrived', () => {
    const s = syncStatus({ ...base, lastSyncedAt: 999_000, everReceivedData: true });

    expect(s.kind).toBe('fresh');
  });

  // A first sync that has not landed yet is 'never', not 'no-data' — offering
  // Settings to someone whose first sync is still in flight sends them to fix
  // something that is not broken.
  it('stays never before the first sync lands', () => {
    const s = syncStatus({ ...base, lastSyncedAt: null, everReceivedData: false });

    expect(s.kind).toBe('never');
  });
});
```

Then add `everReceivedData: true` to every existing call in that file whose expectation should be unchanged — the field is required, and the existing assertions all describe accounts with data.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config vitest.config.ts src/features/health/sync-status.test.ts`

Expected: FAIL — a type error on `everReceivedData`, and `'no-data'` not produced.

- [ ] **Step 3: Add the state**

In `src/features/health/sync-status.ts`, add `'no-data'` to `SyncStatusKind`, add the field to `SyncStatusInput`:

```typescript
  /**
   * Whether any sync has ever returned a day with data.
   *
   * This is what separates "connected, the phone is just quiet" from "the
   * permission was declined" — which HealthKit deliberately will not tell us,
   * since revealing read authorization would leak whether a user has a given
   * condition. The app cannot know the user said no; it can know nothing has
   * arrived, and that is the honest thing to say.
   */
  everReceivedData: boolean;
```

and insert the branch **after** the `lastError` check and **after** the `age === null` check, so neither a real failure nor a first sync still in flight is shadowed:

```typescript
  if (!input.everReceivedData) {
    return {
      kind: 'no-data',
      message: "Apple Health isn't sending anything yet.",
      action: 'Open Settings',
      attention: true,
    };
  }
```

Update the module header to record why this is a state and not a copy change: the previous message was framed as a failure because the module was built for an outage, and an intentional privacy choice rendered as a technical error is hostile.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --config vitest.config.ts src/features/health/sync-status.test.ts`

Expected: PASS.

- [ ] **Step 5: Wire the caller**

In `src/features/character/SyncStatus.tsx`, pass `everReceivedData`. Reuse Task 2's count rather than adding a query — it already means exactly "days this account scored above zero":

```typescript
import { useScoredDayCount } from '@/features/character/queries.ts';
```

```typescript
  const scoredDays = useScoredDayCount(userId);
  // Parenthesised deliberately: `a ?? 0 > 0` parses as `a ?? (0 > 0)`, which is
  // `a ?? false` and always truthy for any real count.
  const everReceivedData = (scoredDays.data ?? 0) > 0;
```

When `status.action === 'Open Settings'`, the press handler opens iOS Settings via `Linking.openSettings()` rather than retrying — there is nothing to retry.

- [ ] **Step 6: Give the health ask a denominator**

Add `'health_ask_dismissed'` to `AppEventType` in `src/features/telemetry/events.ts`, with a comment: without it, a user who dismissed the sheet and a user who was never offered it produce identical event sequences, so the step the design calls the activation bottleneck has no measurable drop-off.

In `src/features/permissions/PermissionAsks.tsx`, extend the `HealthAsk` `onDismiss` handler:

```tsx
              onDismiss={() => {
                setHealthDismissed(true);
                void track(userId, 'health_ask_dismissed');
              }}
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/health/sync-status.ts src/features/health/sync-status.test.ts src/features/character/SyncStatus.tsx src/features/permissions/PermissionAsks.tsx src/features/telemetry/events.ts
git commit -m "$(cat <<'EOF'
feat: a state for "connected, nothing arriving" — not an error

Declining Health showed "Couldn't reach Apple Health", which reads as a
technical failure for an intentional choice. This is a new state rather
than new words: 'failed' is untouched, because it exists to catch the
9-11 Aug outage class and a copy swap would blind it.

HealthKit will not report read-permission denial, so the app cannot know
the user declined — it can know nothing has arrived, and says that.

Also adds health_ask_dismissed, without which a user who dismissed the
sheet and one never offered it are indistinguishable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The solo board, and the placeholders

**Files:**
- Modify: `src/features/squad/SoloBoard.tsx`
- Modify: `app/(onboard)/name.tsx`
- Modify: `src/features/squad/CreateSquadForm.tsx`
- Modify: `src/features/squad/JoinSquadForm.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports.

- [ ] **Step 1: Rebuild the solo board**

In `src/features/squad/SoloBoard.tsx`:

- **Delete** the `styles.hero` block rendering `<Numeral value="1st" ... />` and `<Text style={styles.standing}>of 1</Text>`, and the `hero`/`standing` styles. Being first of one is a fake victory.
- **Move** the `styles.actions` `View` (Create / Have an invite code) to sit directly beneath `styles.help`, above the self row.
- **Render one** `LockedSlot`, not `locked`. Replace the `Array.from({ length: locked }, ...)` map with a single `<LockedSlot rank={2} />`. Five empty seats is a picture of loneliness drawn five times; one is a picture of what a squad looks like.
- **Keep** `resolveSlots` imported and called only if `locked` is still used; if nothing reads it after this change, remove the call and the import rather than leaving a computed value nothing consumes.
- **Keep** the self row and its real numbers — that part works, and it is the only place a solo user sees their day on this tab.

Update the file's header comment: it currently explains the empty board as a churn-avoidance surface, which is still true, but the reasoning for one seat rather than five belongs beside it.

- [ ] **Step 2: Fix the placeholders**

Three fields present example values that read as text already entered, while the submit button sits disabled. The accessibility half of this was already noticed in two of these files; this fixes both halves.

| File | Line | From | To |
|---|---|---|---|
| `app/(onboard)/name.tsx` | ~81 | `placeholder="Aeon"` | `placeholder="Name your character"` |
| `src/features/squad/CreateSquadForm.tsx` | ~84 | `placeholder="Barangay Runners"` | `placeholder="Name your squad"` |
| `src/features/squad/JoinSquadForm.tsx` | ~75 | `placeholder="AB12CD"` | `placeholder="6-character code"` |

In each file, update the adjacent comment that explains the screen-reader hazard so it describes the instruction-shaped placeholder rather than the example-shaped one.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/squad/SoloBoard.tsx "app/(onboard)/name.tsx" src/features/squad/CreateSquadForm.tsx src/features/squad/JoinSquadForm.tsx
git commit -m "$(cat <<'EOF'
feat: the empty squad board sells possibility, not absence

Removes "1st of 1" — a fake victory at an audience of one — moves Create
and Join above the row, and draws one empty seat instead of five.

Also replaces three example-shaped placeholders with instruction-shaped
ones. "Aeon", "Barangay Runners" and "AB12CD" read as values already
entered while the submit button sat disabled, which reads as a broken app.
The screen-reader half of this was already noted in two of these files.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/user-journey.md`
- Modify: `docs/mvp-scope.md`
- Modify: `docs/beta-measurement.md`
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `docs/user-journey.md`**

Rewrite the onboarding and first-day sections for the new flow: pitch → sign in → `/connect` → `/character` → `/name` → a home tab with real numbers → three days of the core loop → unlock. This file documents what is actually built, so describe the gated app as what a new user sees, not as a temporary state.

- [ ] **Step 2: `docs/mvp-scope.md`**

Under "In scope", record that Goals, Challenges, per-stat ability detail and strain are **built and progressively disclosed** at `DISCLOSURE_THRESHOLD_DAYS` scored days — they are not out of scope, and a QA pass that reports them missing on a fresh install is describing the design working.

- [ ] **Step 3: `docs/beta-measurement.md`**

Three corrections, all now true:

1. The funnel's step order is now correct as written — `/connect` fires `onboarding_started` and `health_ask_completed` before `profile_created`. Remove the note added in Plan 1 saying otherwise.
2. Add `pitch_seen` as step 0 and `health_ask_dismissed` beside `health_ask_completed`, and update the prose about the health step having no denominator: it now has one.
3. Add `disclosure_unlocked` to the funnel section with a line on what it measures — how many activated users reached three scored days, which is the first honest read on whether the core loop holds.

- [ ] **Step 4: `docs/roadmap.md`**

Add deviation rows for progressive disclosure (D29/D30), the onboarding reorder (D35), and the `'no-data'` sync state (D34), each pointing at the design spec.

- [ ] **Step 5: `CLAUDE.md`**

Add a short paragraph recording the three things easiest to break by accident here:

- **`DISCLOSURE_THRESHOLD_DAYS` is pinned by a test** and gates on **lifetime** scored days, never a recent window — a recent-activity gate would demote a returning user back into the reduced app.
- **Hiding an entry point is not closing a door**: `/train` and `SquadGoalPanel` check the stage themselves, because push routing and deep links reach them regardless of the home screen.
- **`syncStatus`'s `'no-data'` never shadows `'failed'`**, which exists for the 9–11 Aug outage class; and HealthKit does not report read-permission denial, so the app can only ever say nothing has arrived, never that the user declined.

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm test`

```bash
git add docs/user-journey.md docs/mvp-scope.md docs/beta-measurement.md docs/roadmap.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: the first run

Records progressive disclosure as a shipped design rather than a missing
feature, corrects the funnel's step order now that /connect exists, and
notes the three things easiest to break here.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Done when

- `npm test` and `npm run typecheck` pass.
- A fresh account sees: the pitch before sign-in, Health connect before character choice, and a home tab with the Daily Walk, the figure and the squad gap — no goals, no `/train`, no per-stat detail.
- `/train` and `/goal/new` redirect home for that account rather than rendering.
- After three scored days the rest appears, once, with `disclosure_unlocked` recorded exactly once.
- Declining Health produces "Apple Health isn't sending anything yet." with an Open Settings action — never "Couldn't reach Apple Health."
- The solo squad tab has no "1st of 1", one empty seat, and Create/Join above the row.

## Verification this plan cannot do

**All of it is UI**, and this machine cannot pair an iPhone (CrowdStrike blocks `usbmuxd`), so device verification is a TestFlight build. Before cutting one:

- **Accessibility Inspector on the simulator** — the solo board and the new connect screen both restructure element grouping, which is exactly what the 2026-08-14 pass found the hard way. Verify the leaderboard row is one element, not twelve.
- **Dynamic Type headlessly** — `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large` then `xcrun simctl io booted screenshot`. The pitch screen's three-line loop and the connect screen's reveal are both new fixed-ish layouts.

## Deliberately not in this plan

- **Goals in Daily Walk units** and **universal invite links** — Plan 3 (spec §10, §11).
- **Cumulative distance goals** — staged after the cohort (spec §12).
- **Squad program timing** — the program is chosen when a squad has one member. Real, recorded at spec §7.4, deliberately unscoped.
- **Changing `kairo_retention`'s SQL.** Plan 1's review established it counts "a scored day exists", which overstates engagement three ways; that is documented in `docs/beta-measurement.md` and tightening it is a product decision, not a fix.

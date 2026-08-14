# Accessibility Device-Pass Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the character tab usable at the largest Dynamic Type size, and make VoiceOver read grouped components as one element instead of many.

**Architecture:** Two independent fixes plus a regression revert. The character HUD's four hardcoded absolute offsets become one flowing column with tightly capped text. Accessibility grouping stops relying on iOS's implicit collapse of an `accessible` parent and instead hides each direct child explicitly. Verification moves from TestFlight to the simulator's Accessibility Inspector.

**Tech Stack:** Expo / React Native 0.86 (New Architecture only), TypeScript, vitest. No component tests exist — UI is verified by hand.

**Spec:** `docs/superpowers/specs/2026-08-14-accessibility-device-fixes-design.md`

## Global Constraints

- **There are no component tests and none may be added.** `vitest.config.ts` includes `src/**/*.test.ts`; `.test.tsx` is deliberately absent. Every task here is verified in the Accessibility Inspector, not by a test.
- **No mocking exists in this repo.** Zero `vi.mock` / `vi.fn` anywhere. Do not introduce it.
- **`src/ui/Text.tsx` is the only Text.** Never import `Text` from `react-native`. Never use `allowFontScaling={false}`.
- **Three scales only:** `prose` (1.8, default), `chrome` (1.4), `fixed` (1.2). Chosen by what the type sits *inside*, not by importance.
- **Before adding an accessible name, read what is already spoken around it.** A label repeating an adjacent line is noise; a label inside a control that already names itself is a bug.
- Imports use explicit `.ts` / `.tsx` extensions.
- Copy never says "Hunter" or "barkada" (roadmap deviation #26). The character is "your character".
- `npm run typecheck` and `npm test` (710 tests) stay green after every task.
- Commit after every task. Do not push until Task 7 passes.

---

### Task 1: Get the simulator loop running

Nothing else in this plan can be verified without it, and the whole point of the plan is to stop verifying accessibility through TestFlight. This task produces no code — its deliverable is a working inspection loop and a written baseline of the two defects.

**Files:** none modified.

**Interfaces:**
- Consumes: nothing.
- Produces: a booted simulator running Kairo, and a recorded baseline that Tasks 2–6 are measured against.

- [ ] **Step 1: Build and run on the simulator**

```bash
npm run ios
```

Expect this to take a long time on first run — React Native compiles from source (roadmap deviation #29, and it is not optional; re-enabling prebuilts brings back a launch crash). Later runs reuse the build and Metro reloads are seconds.

- [ ] **Step 2: Sign in**

The simulator gets anonymous sign-in, which `availableProviders()` keeps behind `__DEV__` for exactly this. Complete onboarding if prompted.

- [ ] **Step 3: Seed health data so the screens have content**

An empty character screen will not show the HUD pills this plan is fixing. Use the dev seeder in `src/features/health/dev-seed.ts`, or run:

```bash
node supabase/scripts/rehearse-squad-join.mjs --cleanup
```

then create a squad in-app so the leaderboard has rows.

- [ ] **Step 4: Open Accessibility Inspector and record the VoiceOver baseline**

```bash
open "/Applications/Xcode.app/Contents/Applications/Accessibility Inspector.app"
```

Point the target selector at the booted simulator, navigate Kairo to the Squad tab, and use the inspector's element navigation to step through one leaderboard row.

Write down the count. **Expected baseline: many elements per row** (rank, name, level, each stat pair, total). This is the defect. If it already reports one element, stop and re-check that the simulator is running the current branch — the rest of Task 3 would be pointless.

- [ ] **Step 5: Record the Dynamic Type baseline**

In Xcode: **Debug → Environment Overrides → Text → enable, drag to the largest size.** Watch the character tab.

**Expected baseline:** the level pill, the streak pill and the stat rail overlap each other. Screenshot it — this is the before image for Task 5.

- [ ] **Step 6: Commit nothing, but record findings**

No code changed. Note both baselines in the working notes for the tasks below; they are the pass/fail criteria.

---

### Task 2: Revert the `StatCoin` regression

`StatCoin` has exactly one call site — `StatRail` — which is one `Pressable` whose label already speaks all four ratings. Making each coin `accessible` either does nothing or splits one control into four. Strictly wrong either way.

**Files:**
- Modify: `src/ui/StatCoin.tsx`

**Interfaces:**
- Consumes: `STAT_NAMES` from `src/ui/StatIcon.tsx` (import becomes unused — remove it).
- Produces: `StatCoin` renders no accessibility element of its own.

- [ ] **Step 1: Confirm the call site before changing anything**

```bash
grep -rn "StatCoin" app src | grep -v "src/ui/StatCoin.tsx" | grep -v "index.ts:"
```

Expected: exactly one usage, in `src/features/character/StatRail.tsx`. If a second call site exists, stop — this task's reasoning does not hold and the coin may need its label.

- [ ] **Step 2: Remove the coin's accessibility element**

In `src/ui/StatCoin.tsx`, replace the `<View accessible accessibilityLabel={...}>` wrapper with:

```tsx
    <View
      // No accessible name of its own. The only caller is `StatRail`, which is
      // a single Pressable whose label already speaks all four ratings — a
      // second element here either does nothing or splits one control into
      // four. The coin's job for a screen reader is to stay out of the way.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.coin, untrained && styles.idle]}
    >
```

Keep `<Text scale="fixed">` on the rating — that part was correct.

- [ ] **Step 3: Remove the now-unused import**

Change the import line to drop `STAT_NAMES`:

```tsx
import { StatIcon } from './StatIcon.tsx';
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck
```

Expected: clean. An unused-import error here means Step 3 was missed.

In the Accessibility Inspector, the stat rail should be **one** element announcing `Agility 41, Strength 27, Endurance 18, Vitality 9. Show per-stat detail`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/StatCoin.tsx
git commit -m "fix(a11y): the stat coin should not name itself

StatRail is one Pressable whose label already speaks all four ratings —
its own comment says so. Giving each coin inside it an accessible name
either does nothing or splits one control into four."
```

---

### Task 3: Make grouping explicit in `LeaderboardRow`

The technique fix. Do this one first and verify it in the inspector before applying the same shape to the other four components — if hiding direct children does not work either, Task 4 must not repeat it.

**Files:**
- Modify: `src/features/squad/LeaderboardRow.tsx`

**Interfaces:**
- Consumes: `leaderboardRowLabel` from `src/features/squad/row-label.ts` (unchanged).
- Produces: one accessibility element per row.

- [ ] **Step 1: Hide the four direct children**

The row's root `View` keeps `accessible` and `accessibilityLabel`. Add to each of its four direct children:

```tsx
      <Text
        scale="fixed"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.rank, row.is_self && styles.rankSelf]}
      >
        {row.rank}
      </Text>

      <Avatar name={row.character_name} self={row.is_self} />

      {/* Hiding the wrapper takes the whole name / meta / ratings subtree with
          it, which is why this is four props and not twenty. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.middle}
      >
```

and on the total:

```tsx
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Numeral
          value={row.total}
          size="minor"
          color={row.is_self ? ramp.accent[800] : colors.text}
        />
      </View>
```

`Avatar` already hides itself, so it needs nothing.

Add a comment above the root `View`'s `accessible` prop explaining why both halves exist:

```tsx
      // `accessible` alone should collapse this on iOS and did not, on the
      // 2026-08-14 build. The mechanism is unconfirmed — RN Text is an
      // accessibility element by default and this app is New Architecture
      // only — so the children are hidden explicitly rather than trusting the
      // implicit behaviour. Do not remove one half thinking it is redundant.
```

- [ ] **Step 2: Verify in the inspector — this is the gate**

Reload Metro (`r` in the Metro terminal), navigate to the Squad tab, and step through a row in the Accessibility Inspector.

Expected: **one element**, announcing e.g.
`Rank 1, Jay, you, 8,400 points, Level 12, 5 day streak, Agility 41, Strength 27, Endurance 18, Vitality 9`

If it is still many elements, **stop and do not proceed to Task 4.** The remaining option is to drop `accessible` from the parent and instead render a single visually-hidden `<Text>` carrying the label with every sibling hidden. Report back before implementing that.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck && npm test
```

Expected: clean, 710 passing.

- [ ] **Step 4: Commit**

```bash
git add src/features/squad/LeaderboardRow.tsx
git commit -m "fix(a11y): group the leaderboard row explicitly

accessible + accessibilityLabel on the parent should collapse the row on
iOS and did not on the 2026-08-14 build. Rather than diagnose the
mechanism and hope, each direct child is now hidden outright, so the
outcome does not depend on implicit grouping."
```

---

### Task 4: Apply the same shape to the other four groups

Only after Task 3's inspector check passes. All four were built on the same assumption in the same pass and are presumably equally broken.

**Files:**
- Modify: `src/features/character/StatBar.tsx`
- Modify: `src/features/goals/GoalBar.tsx`
- Modify: `src/features/profile/StreakCard.tsx`
- Modify: `src/features/character/Diorama.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: one accessibility element each for a stat bar, a goal bar, each streak figure, and the character figure.

- [ ] **Step 1: `StatBar` — hide the header and the label**

The root `View` keeps `accessible accessibilityLabel={spokenLabel}`. Add to its children:

```tsx
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.header}
      >
```

and:

```tsx
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.label}
      >
        {label}
      </Text>
```

and the lane copy at the bottom:

```tsx
      {showLaneCopy && (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.laneCopy}
        >
          {laneEmptyCopy}
        </Text>
      )}
```

The `Meter` inside already hides itself when given no `label` prop.

- [ ] **Step 2: `GoalBar` — hide the title and the numbers row**

```tsx
      {showTitle && (
        <Text
          scale="chrome"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.title}
          numberOfLines={1}
        >
          {row.title}
        </Text>
      )}

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.numbers}
      >
```

- [ ] **Step 3: `StreakCard` — hide each figure's two texts**

Both figure wrappers keep their `accessible accessibilityLabel`. Add the two props to the four `Text` children inside them (the figure and its caption, twice).

- [ ] **Step 4: `Diorama` — hide the figure's contents**

The wrapper keeps `accessible accessibilityRole="image" accessibilityLabel={describeFigure(...)}`. Add to the `CharacterFigure` inside it:

```tsx
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <CharacterFigure
            stage={stage}
            dominance={dominance}
            body={body}
            height={height * 0.6}
            lifetimePoints={lifetimePoints}
          />
        </View>
```

Do **not** touch `{children}` — the HUD lives there and must stay reachable.

- [ ] **Step 5: Verify all four in the inspector**

Character tab: the figure is one element; each stat bar (tap the rail to expand) is one element. Profile: each streak figure is one element. A goal screen: each goal bar is one element.

- [ ] **Step 6: Typecheck, test, commit**

```bash
npm run typecheck && npm test
git add src/features/character/StatBar.tsx src/features/goals/GoalBar.tsx src/features/profile/StreakCard.tsx src/features/character/Diorama.tsx
git commit -m "fix(a11y): apply explicit grouping to the remaining groups

Same assumption, same build, same fix as the leaderboard row."
```

---

### Task 5: Cap the character HUD's text

Do this before the layout restructure so the two can be judged separately: capping alone should already stop the worst of the overlap.

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `Text` from `@/ui/index.ts` (already imported).
- Produces: no HUD text scales past 1.2×.

- [ ] **Step 1: Add `scale="fixed"` to all five HUD texts**

`squadText`, `levelNumber`, `levelMeta`, `streakNumber`, `streakUnit`. For example:

```tsx
              <Text scale="fixed" style={styles.squadText} numberOfLines={1}>
                {standing.ahead.name} is{' '}
                <Text style={styles.squadGap}>{standing.ahead.gap.toLocaleString()}</Text> ahead
              </Text>
```

Add one comment at the first of them explaining the whole group:

```tsx
          {/* `fixed` throughout the HUD. These are short numerals and labels on
              a drawn surface, and every value here is repeated at full `prose`
              scale further down the page — level and XP in the TODAY panel, the
              streak on Profile, the ratings in the expanded StatBars. Nothing
              becomes unreadable; it becomes readable lower down. */}
```

- [ ] **Step 2: Unfix the one fixed width**

```tsx
  levelBody: { minWidth: 96 },
```

Comment it the way `LeaderboardRow`'s `rank` is commented — the column still aligns at the default text size, but scaled content grows the box instead of being clipped by it.

- [ ] **Step 3: Verify at maximum text size**

Environment Overrides at the largest size. The pills should now grow only slightly. Some overlap may remain — Task 6 removes the cause.

- [ ] **Step 4: Typecheck and commit**

```bash
npm run typecheck
git add "app/(tabs)/index.tsx"
git commit -m "fix(a11y): cap the character HUD's text

The codemod moved this file to the default prose (1.8x) cap because the
file was never opened. Every value in the HUD is repeated at full scale
further down the page, so fixed is the right cap here."
```

---

### Task 6: Replace the HUD's magic offsets with a flowing column

The structural fix, and the part that stops this recurring.

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `insets` from `useSafeAreaInsets()` (already present).
- Produces: a HUD whose vertical layout is computed by flexbox, not by constants.

- [ ] **Step 1: Replace the four positioned siblings with one container**

Inside `<Diorama>`, replace the four `<View style={[styles.X, { top: ... }]}>` siblings with:

```tsx
          {/* The HUD. One absolutely-positioned column rather than four
              separately-positioned pieces: the old version pinned each at a
              hardcoded offset (+8, +48, +48, +132) which silently assumed the
              pills were a certain height. At large Dynamic Type sizes they
              grew past each other's offsets and overlapped. Flexbox computes
              it now, so growth pushes downward and cannot collide.

              `box-none` so the column does not swallow taps meant for the
              diorama, while the rail inside it stays tappable. */}
          <View
            pointerEvents="box-none"
            style={[styles.hud, { top: insets.top + space.sm }]}
          >
            {standing.kind === 'ranked' && standing.ahead && (
              <View style={styles.squadPill}>
                <View style={styles.faces}>
                  {others.map((row, i) => (
                    <View key={row.user_id} style={i > 0 && styles.overlap}>
                      <Avatar name={row.character_name} size={24} ringed />
                    </View>
                  ))}
                </View>
                <Text scale="fixed" style={styles.squadText} numberOfLines={1}>
                  {standing.ahead.name} is{' '}
                  <Text style={styles.squadGap}>{standing.ahead.gap.toLocaleString()}</Text> ahead
                </Text>
              </View>
            )}

            <View style={styles.hudRow}>
              <View style={styles.levelPill}>
                <View style={styles.levelDisc}>
                  <Text scale="fixed" style={styles.levelNumber}>{level}</Text>
                </View>
                <View style={styles.levelBody}>
                  <Meter fraction={xp.fraction} color={ramp.accent[500]} height={9} />
                  <Text scale="fixed" style={styles.levelMeta}>
                    {xp.intoLevel.toLocaleString()} / {xp.neededForNext.toLocaleString()} XP
                  </Text>
                </View>
              </View>

              {/* The streak is the only persistent pill. A goal in flight
                  belongs on the shelf below, where it has room for a target
                  and a date. */}
              {(streak.data?.current_streak ?? 0) > 0 && (
                <View style={styles.pill}>
                  <Text scale="fixed" style={styles.streakNumber}>
                    {streak.data?.current_streak}
                  </Text>
                  <Text scale="fixed" style={styles.streakUnit}>
                    day{streak.data?.current_streak === 1 ? '' : 's'}
                  </Text>
                </View>
              )}
            </View>

            {!score.isPending && (
              <View style={styles.railRow}>
                <StatRail
                  ratings={lifetime}
                  expanded={expanded}
                  onToggle={() => setExpanded((e) => !e)}
                />
              </View>
            )}
          </View>
```

- [ ] **Step 2: Rewrite the styles**

Replace the `squadPill` / `levelPill` / `hudRight` / `rail` entries. Each loses `position: 'absolute'` and its side pinning; the container owns placement now.

```tsx
  // — the floating HUD —
  // One column. `left`/`right` rather than a width, so the row below can put
  // the level pill against one edge and the streak pill against the other.
  hud: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    gap: space.sm,
  },
  hudRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  railRow: { alignItems: 'flex-end' },

  squadPill: {
    alignSelf: 'center',
    maxWidth: '86%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 7,
    paddingLeft: 9,
    paddingRight: 15,
    borderRadius: radius.pill,
    backgroundColor: '#f9f4ede6',
    ...shadow.md,
  },
  faces: { flexDirection: 'row' },
  overlap: { marginLeft: -9 },
  squadText: { ...font.body.strong, color: ramp.neutral[800], flexShrink: 1 },
  squadGap: { color: ramp.accent[700] },

  levelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: 8,
    paddingRight: space.md,
    borderRadius: radius.pill,
    backgroundColor: '#f9f4ede6',
    ...shadow.md,
  },
```

Delete the `hudRight` and `rail` style entries entirely — `hudRow` and `railRow` replace them.

- [ ] **Step 3: Give the two pills accessible names**

They were never grouped at all, so they read as loose numbers. Add to `levelPill`:

```tsx
              <View
                accessible
                accessibilityLabel={`Level ${level}, ${xp.intoLevel.toLocaleString()} of ${xp.neededForNext.toLocaleString()} XP`}
                style={styles.levelPill}
              >
```

and hide its two children with `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`, matching Task 3.

Same for the streak pill:

```tsx
                <View
                  accessible
                  accessibilityLabel={`${streak.data?.current_streak} day streak`}
                  style={styles.pill}
                >
```

Note the label says "3 day streak", not "3-day" — the hyphenated form is right on screen and wrong out loud, the same rule `row-label.ts` tests.

- [ ] **Step 4: Verify at maximum text size — this is the gate**

Environment Overrides at the largest size, character tab. Expected: the squad pill, the level/streak row and the rail are stacked with visible gaps and **no overlap**. Compare against the Task 1 Step 5 screenshot.

Then return the override to the default size and confirm the layout is correct again (it will be — this is a fresh render, not the runtime re-layout limitation in §3 of the spec).

- [ ] **Step 5: Verify the diorama is still tappable**

Tap the stat rail — it should expand. If nothing responds, `pointerEvents="box-none"` is missing or on the wrong node.

- [ ] **Step 6: Typecheck, test, commit**

```bash
npm run typecheck && npm test
git add "app/(tabs)/index.tsx"
git commit -m "fix(a11y): the character HUD flows instead of guessing offsets

Four pieces pinned at +8, +48, +48 and a magic +132, each assuming the
pills were a certain height and nothing enforcing it. One flowing column
now, so growth pushes downward and cannot collide. Every other screen in
the app already used paddingTop and flowed, which is exactly why only
this one broke."
```

---

### Task 7: Documentation, then ship

Documentation is part of the change, not a follow-up (`CLAUDE.md`).

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the findings from Tasks 1–6.
- Produces: the record a future session reads instead of re-deriving.

- [ ] **Step 1: Add the device-pass findings to `docs/roadmap.md`**

Under the existing `Device-verification findings (2026-08-14)` heading, add a subsection covering all three findings, the two decisions (cap tight rather than reflow; do not fix the runtime re-layout), and the `StatCoin` regression. State plainly that finding 2 meant a technique shipped across six components did not work.

- [ ] **Step 2: Record the runtime re-layout limitation explicitly**

It must read as a decision, not an oversight: a relaunch clears it, no supported RN subscription exists for `UIContentSizeCategoryDidChangeNotification`, and a fix means a native module or a global remount hack — more risk than the bug.

- [ ] **Step 3: Amend `CLAUDE.md`'s accessibility note**

Add three rules to the existing paragraph:
- Grouping is made **explicit** — parent `accessible` plus each direct child hidden — because the implicit collapse did not hold on 2026-08-14.
- The character HUD's layout stays **flow-based**. No hardcoded vertical offsets; that is what broke it.
- **Structure is verified in Xcode's Accessibility Inspector on the simulator before a TestFlight build is cut.** This amends the "UI is verified by hand on device" posture.

- [ ] **Step 4: Full verification before pushing**

```bash
npm run typecheck && npm test
```

Expected: clean, 710 passing.

- [ ] **Step 5: Commit and push**

```bash
git add docs/roadmap.md CLAUDE.md
git commit -m "docs: what the accessibility device pass found

Three findings, one of which meant a technique shipped across six
components did not work. Records both decisions — cap the HUD rather than
reflow the screen, and do not chase the runtime re-layout limitation —
and moves accessibility structure verification to the simulator's
inspector, which would have caught the grouping failure without a build."
git push origin main
```

- [ ] **Step 6: Confirm on device once TestFlight lands**

Largest text size on the character tab: no overlap. VoiceOver on the squad board: one swipe per squadmate. Both were checked in the inspector already — this is confirmation, not discovery.

---

## Self-review

**Spec coverage.** §1 → Tasks 5 and 6. §2 → Tasks 3 and 4. §3 → Task 7 Step 2. §4 → Task 2. §5 → Task 1, and Task 7 Step 3 makes it standing policy. Out-of-scope items produce no tasks, as intended.

**Placeholders.** None. Every code step carries the code; every verification step names the expected result and, in Tasks 3 and 6, what to do when it is not met.

**Type consistency.** `styles.hud`, `styles.hudRow` and `styles.railRow` are introduced in Task 6 Step 2 and used in Step 1 of the same task; `hudRight` and `rail` are deleted in the same step that removes their last usage. `describeFigure` and `leaderboardRowLabel` are pre-existing and unchanged. `STAT_NAMES` is removed from `StatCoin` in Task 2 Step 3, and no later task references it there.

**One ordering constraint worth restating:** Task 3 gates Task 4. If explicit child-hiding does not produce a single element in the inspector, applying it to four more components multiplies a fix that does not work.

# Accessibility device-pass fixes — design

**Status:** approved 2026-08-14. Implements the fixes for what the first
accessibility build (`90f75aa`) revealed on real hardware.

Read with `docs/roadmap.md` (device-verification findings) and `CLAUDE.md`'s
accessibility section, which this spec amends.

---

## What the device pass found

Build `90f75aa` shipped Dynamic Type caps and VoiceOver names. Tested on an
iPhone at the largest accessibility text size and with VoiceOver:

| # | Finding | Verdict |
|---|---|---|
| 1 | The **character tab** is unreadable at large text. Squad and Profile are fine. | Real, and localised |
| 2 | VoiceOver still reads a **leaderboard row as separate stops**, despite the row carrying `accessible` + `accessibilityLabel`. | A technique that does not work |
| 3 | Layout stays sized for large text after returning to normal, until relaunch. | Real, and not worth fixing |

Finding 2 is the important one: it means a pattern applied across six
components in that build does not do what it claims. The fix is to the
technique, not to the labels.

---

## 1. The character HUD is the only absolutely-positioned chrome in the app

`app/(tabs)/index.tsx` floats four HUD layers over the diorama at hardcoded
vertical offsets:

```
squadPill   top: insets.top + space.sm            (+8)
levelPill   top: insets.top + space.xl + space.sm (+48)
hudRight    top: insets.top + space.xl + space.sm (+48)
rail        top: insets.top + 132                 ← magic number
```

Those constants encode an assumption that the pills are ~40pt and ~84pt tall,
and nothing enforces it. When their text grows, each pill grows past the next
one's offset and they overlap.

**Every other screen uses `paddingTop` and flows**, which is precisely why Squad
and Profile survived the same test. This is a one-file problem.

Two fixed dimensions make it worse: `levelBody: { width: 96 }` and the 44×44
`levelDisc` wrapping a 20pt Caprasimo numeral.

The previous pass contributed: the codemod moved this file's `Text` to the
capped primitive at its **default `prose` (1.8×)** because the file was never
opened. It was already broken — RN scales unbounded to ~3.1× at AX5 — but 1.8×
is still broken.

### Decision: cap tight, keep it floating

The HUD stays pinned over the diorama and its text caps at `fixed` (1.2×).
These are short numerals and labels on a drawn surface, and **every value in
the HUD is repeated at full `prose` scale further down the page** — level and
XP in the TODAY panel, the streak on Profile, the ratings in the expanded
`StatBar`s. Nothing becomes unreadable; it becomes readable lower down.

The offsets are replaced with **one flowing column**: a single absolutely
positioned container at `top: insets.top`, with `gap`, holding the centred
squad pill, then a `space-between` row of level pill and streak pill, then the
rail. Growth pushes downward instead of overlapping, and the magic `132`
disappears — which is what stops this recurring.

Rejected: reflowing the whole screen at large sizes (diorama shrinks, HUD moves
into the shelf). More accessible, but it is a second layout for the app's
signature screen with its own visual decisions, and it is not what stands
between here and a usable build.

---

## 2. Grouping must be explicit, not implied

`LeaderboardRow` sets `accessible` and `accessibilityLabel` on its root `View`,
which on iOS is documented to collapse descendants into one element. On this
build it does not.

**The mechanism is unconfirmed.** RN `Text` is an accessibility element by
default, `Numeral` carries its own `accessibilityLabel`, and this app runs New
Architecture only — any of these could be the cause. The React Native docs do
not settle it.

### Decision: do not depend on knowing why

Keep `accessible` + `accessibilityLabel` on the group, and **additionally mark
each direct child hidden** with `accessibilityElementsHidden` and
`importantForAccessibility="no-hide-descendants"`. The outcome then does not
depend on implicit grouping behaviour at all.

For `LeaderboardRow` this is four props, not twenty — hiding the `middle`
wrapper takes the whole name/meta/ratings subtree with it.

The same treatment applies to every group from that build, since all rest on the
same assumption: `StatBar`, `GoalBar`, `StreakCard`'s two figures, and
`Diorama`'s figure wrapper.

---

## 3. The stuck layout is a known limitation, not a task

A relaunch clears it, so nothing is persisted. This is React Native not
re-measuring existing views when iOS's content size category changes at
runtime: font sizes update, the boxes laid out around them do not.

**Decision: do not fix.** There is no supported RN subscription for
`UIContentSizeCategoryDidChangeNotification`, so a fix means a native module or
a global remount hack — both more risk than the bug. Exposure is limited to a
user who changes text size with Kairo open and does not relaunch, and §1 makes
the mis-sized intermediate state far less destructive.

Recorded in `docs/roadmap.md` so it is a decision rather than an oversight.

---

## 4. A regression to revert: `StatCoin` versus `StatRail`

`StatRail` is **one `Pressable`** whose `accessibilityLabel` already speaks all
four ratings, and its comment says so explicitly: *"The rail is one Pressable,
so its own label is all VoiceOver announces."*

The previous build gave each `StatCoin` inside it `accessible` +
`accessibilityLabel`. `StatCoin` has exactly one call site — `StatRail` — so
that change either does nothing or splits one control into four elements. It is
strictly wrong either way.

**Revert the coin to non-accessible**; keep its `scale="fixed"`, which is
correct.

This is the second instance of the same mistake in one pass, after `GoalBar`'s
pace marker — which was correctly left alone because `statusLine()` already says
"behind pace". The rule was stated and then violated three files later, so it
is promoted here to a spec-level principle:

> **Before adding an accessible name, read what is already spoken around it.**
> A label that repeats an adjacent line is noise; a label inside a control that
> already names itself is a bug.

---

## 5. Verification moves off TestFlight

Finding 2 cost a full build to discover and would have cost another to confirm
blind. It did not need to.

Both findings are reproducible on the **simulator**, which is already set up: an
iPhone 17 Pro is booted, `ios/Pods` is installed, and Xcode's Accessibility
Inspector is present.

- **Dynamic Type**: Xcode → Debug → Environment Overrides → text size slider.
- **VoiceOver structure**: Accessibility Inspector, pointed at the simulator.
  Its element list answers *"is this row one element or twelve"* directly, with
  no VoiceOver gestures and no build.

`npm run ios` is slow once (React Native builds from source, deviation #29),
then Metro reloads make iteration seconds. **No TestFlight build is cut until
the inspector is clean.**

This is a standing change to how UI accessibility work is verified here, not a
one-off for this plan. `CLAUDE.md`'s testing posture — "UI is verified by hand
on device" — gains the qualifier that *structure* is verified in the inspector
first.

---

## Out of scope

- Reflowing the character screen at large text sizes (§1, rejected).
- Any fix for the runtime re-layout limitation (§3).
- New unit tests. `row-label.ts` already covers what the labels *say*; what is
  broken is whether they are *reachable*, which only the inspector can answer.
  The repo has no component tests by construction — `vitest.config.ts` includes
  `src/**/*.test.ts` only, and `.test.tsx` is deliberately absent.

## Test posture

Unchanged from the repo's rule: pure modules are unit-tested in Node, UI is
verified by hand. The change is *where* by-hand happens first — the simulator's
Accessibility Inspector, before a device.

`npm run typecheck` and `npm test` (710 tests) stay green throughout.

# UI redesign — dark minimal, one claim per screen

Status: approved 2026-08-04. Covers every screen built through Phase 7.

## Why

The screens work and the data behind them is right, but they were each built to
prove a mechanism rather than to be looked at every day. The Character tab
stacks level, name, silhouette, build, today's total, a bonus line and four stat
bars at roughly equal visual weight; the Squad tab does the same with squad
name, invite code, mode toggle, note, rows and locked slots. Nothing tells you
what a screen is *for* at a glance.

The reference is Charlie (`Kairo_Master_Summary.md` §1 names it as a
competitor): its screens are calm because each one makes exactly one claim and
everything else is subordinate. That discipline is what this redesign imports.

### What we are *not* importing

A Claude Design project (`Kairo Playful v2.dc.html`) was reviewed as inspiration.
Roughly half of it describes a different product and is explicitly out of scope:

| Design shows | Kairo is |
|---|---|
| "Nobody's last here — send a cheer instead" | §8 sabotage. Opposite philosophy. |
| "ranked by days shown up, never by volume" | §5 score formula, ranked by points |
| Steps / Burn / Move-minute bars | AGI / STR / END / VIT / REC with tiers |
| No character | §6 Hunter, evolves by dominant stat |
| Followers / following | Squads of ≤6, invite code, no follow graph |
| Games tab, trophy shelf, chests | Not in MVP |
| Candy gradients per screen | §6 dark-fantasy Hunter |

Taken from it: one number owning the screen, squad presence as a scannable list
rather than a table, a floating pill nav, large well-spaced cards, a gentle idle
float on the character, and copy written as a voice rather than as labels.

## Decisions

| Axis | Decision |
|---|---|
| Aesthetic | Dark, minimal, `theme.ts` palette retained. §6 stays intact. |
| Scope | Every screen built today, including auth and onboarding. |
| Motion | React Native's built-in `Animated`. No new animation dependency. |
| Voice | Dry and competitive. States the standing, never the judgment. |
| Display face | Chakra Petch, numerals and tier/level labels only. |
| Stats on Character | One row of four chips plus one detail line. |

### On the palette not being a default

"Near-black plus one bright accent" is a generic look. Two things make this a
choice rather than a default: `theme.ts` and §6 already fix the dark palette, and
the distinctiveness is spent on colour *meaning*, one signature device, and
typography instead of on the background.

## The signature: glow means earned

`HunterSilhouette` already renders an aura whose size and colour derive from real
health data. That becomes the app's only decorative device, under one rule:

> Glow is never applied to something the user has not earned.

Applies to: the Hunter's aura, the leading squadmate's row, a Gold tier chip, and
a banked Streak Shield. Everything else is flat and hairline. The rule's job is
to make refusing decoration elsewhere the default.

Not the active tab: tapping a tab is navigation, not something earned, and
`TabPill` renders a flat accent dot on purpose — no glow.

## Tokens (`src/theme.ts`)

Existing `colors`, `tierColors`, `space`, `radius` are kept. Additions:

- `surfaceLift: '#191922'` — lets a panel sit on a panel without a border.
- Split `border` — the current `'#22223040'` is an 8-digit hex RN reads as
  `#222230` at 25% alpha. Becomes explicit `border` (hairline) and
  `borderStrong` (focus / selected), so the two stop competing.

`tierColors` is **not** extended. Gold is the ceiling: §6's four tier tables end
at Gold and `Tier` in `@kairo/core` is `none | bronze | silver | gold`. An
earlier draft of this spec proposed a Diamond tier — it does not exist, and no
copy anywhere may imply one.

Three colour families, each with exactly one job, so a screen's meaning is
legible from colour alone:

| Family | Means |
|---|---|
| `accent` violet | **you** — your score, your row, your level, active tab |
| `tierColors` | **earned** — never decorative |
| `danger` red | **hit** — sabotage only |

Typography becomes two roles with a hard boundary:

- **Display** — Chakra Petch, loaded through `expo-font` (already present in
  `node_modules` as an Expo dependency; add it to `package.json` explicitly).
  Numerals, level, tier names, and the KAIRO wordmark. Two weights, ~157KB, OFL.
- **Body** — SF Pro (system). All prose, buttons, labels, inputs.

The wordmark is the one non-numeric thing in the display face, and it gets its
own `font.display.brand` token rather than borrowing a numeral's: `major` carries
negative tracking tuned for large figures, which squashes a word. Ruled
2026-08-04 after the boundary as first written ("numerals, levels and tier names
only") turned out to exclude the wordmark it was always meant to cover.

The existing `font` object is restructured to match these two roles — `font.brand`,
`font.title`, `font.body` and `font.label` become `font.display.*` and
`font.body.*` — rather than gaining display entries alongside the current ones.
Two overlapping type scales is the same mistake as two bar idioms.

Every numeric style carries `fontVariant: ['tabular-nums']`. Boards refetch on
realtime broadcasts, and proportional digits make a live number jitter.

Font loading is asynchronous. The root layout must hold the splash until fonts
resolve, and must render with the system fallback rather than blocking forever if
loading fails — a missing font is a degraded screen, not a broken app.

## Component vocabulary (`src/ui/`)

New shared layer. Feature components consume it; none of them define cards,
bars or buttons of their own any more.

| Primitive | Responsibility |
|---|---|
| `Screen` | Safe-area, scroll, the single padding rhythm. Replaces `insets.top + space.lg` repeated across five screens. |
| `Panel` | The only card. Variants `plain` (hairline), `lift` (raised, borderless), `earned` (hairline + top-edge glow). |
| `Numeral` | Display-font number, tabular. Sizes `hero` / `major` / `minor`. |
| `Label` | Uppercase micro-label. Replaces ad-hoc `font.label` use. |
| `Meter` | The one bar idiom. `StatBar` and `XpBar` already duplicate this geometry on purpose ("two bar idioms in one app is one too many"); this makes it structural. |
| `TierChip` | Stat letter + tier colour. Glows at Gold+, flat below. |
| `Button` | `primary` / `secondary` / `ghost`, with press-scale and disabled state. |
| `Aura` | Glow extracted from `HunterSilhouette` so the leading squadmate's row can speak the same language. Not the tab bar — see the glow rule above. |
| `TabPill` | Floating bottom nav, replacing the default `Tabs` bar. |

`Aura` extraction must preserve `HunterSilhouette`'s existing behaviour exactly:
size and opacity from `stage`, colour and `glow` offset from the dominance
`BUILDS` table, and the All-Rounder halo ring. That mapping is §6's evolution
table and is not being redesigned here.

### Motion (`src/ui/motion.ts`)

Built-in `Animated` only. Four hooks:

- `useCountUp(value)` — numbers count to their value on arrival and on change.
- `useFloat()` — 4.5s loop, ±6px translateY. The Hunter only.
- `useFillIn(fraction)` — meters grow from zero rather than appearing filled.
- `usePressScale()` — 0.97 on press, replacing today's opacity flicker.

All four read `AccessibilityInfo.isReduceMotionEnabled` and resolve instantly
when it is on. Honoured once, at the primitive, so no screen can forget.

`useCountUp` must not animate on every refetch to the same value — realtime
broadcasts invalidate boards frequently, and a number that re-counts on an
unchanged value reads as a glitch.

### Deleted by this work

Bespoke card styles in `StreakCard`, `BodyMetricsCard`, `LeaderboardRow`,
`LockedSlot`, `Leaderboard` (code card) and `app/(tabs)/index.tsx`; near-identical
button styles in `SoloBoard`, `CreateSquadForm`, `JoinSquadForm`, `sign-in.tsx`,
`name.tsx` and `Leaderboard`'s retry.

## Screens

### Character — "Your Hunter, and what today is worth."

Order: level chip and name (small) → Hunter with aura, floating → build label →
hero total, counting up → standing line → four stat chips → one detail line.

**New data dependency.** The standing line ("3rd · Ligaya +400") needs squad
data this screen does not currently fetch. It composes `useMySquad` and
`useSquadLeaderboard(id, 'current')` — both exist, and TanStack shares the cache
with the Squad tab, so this adds no network cost. States:

- No squad → "No squad yet."
- Query pending → render nothing in the line's place. A pending query must not
  render a claim; this is the same discipline `squad.tsx` already applies.
- Squad exists but the user has not scored today → "Unranked today."
  `squad_leaderboard` returns only members who have scored, so `is_self` may be
  absent from the rows. This is normal, not an error.

**Stat row.** Four chips across: stat letter, points, tier colour, thin fill.
Below it one detail line, chosen in this order: the featured ×1.5 stat if there
is one, otherwise the stat closest to its next tier. It names the gap in the
stat's own raw unit — "1,240 more steps for Gold", "88 more kcal for Silver" —
because points are not something a user can go outside and do.

**Second new data dependency.** `daily_scores` stores points and tiers, not raw
values, so the gap is not derivable from `useTodayScore`. It needs the caller's
own `health_buckets` rows for the day, aggregated through `aggregateBuckets()`
from `@kairo/core`. This requires no migration: `health_buckets_select_own`
already grants the owner SELECT on their own rows, and §5's projection is
untouched — squadmates reach nothing new. A stat already at Gold has no gap and
is skipped when choosing the line; if every stat is at Gold the line says so.

Tapping the row toggles an
inline expansion below it — four `Meter` rows carrying the same information
`StatBar` shows today, including the human-readable stat labels ("Steps and
distance"). Collapsed is the default on every mount; the state is local to the
screen and is not persisted.

The consistency/REC bonus line moves into the detail line's rotation and appears
only on days it is non-zero — which is already the condition the current screen
checks. The reason it exists stays true: without it the four chips visibly do not
sum to the hero total.

### Squad — "Where you stand."

Order: squad name and date (small) → hero rank → board rows → locked slots.

Hero reads rank from the `is_self` row and the gap from the row above it. The
denominator comes from `useSquadMemberCount`, never `rows.length` — the RPC
returns only members who have scored, a trap the current code documents. If
there is no `is_self` row the hero reads "Unranked" with the day's total beneath.

Retained unchanged in substance:

- Tier pills as the only per-stat detail. §5's privacy projection means tiers are
  all a squadmate may see, and keeping that visible keeps the constraint honest.
- Explicit pending, error-with-retry, and empty states. An error must never
  render as "nobody here".
- The mixed-timezone note when a completed board spans two dates.
- Locked slots ranked after every member, scored or not.
- `SlotUnlockReveal` on member-count increase.

Moved: the invite code moves out of a top card into the empty-state and into the
locked-slot region, where the reason to read it actually is. It keeps its
screenshot-sized treatment (§9) and its `selectable` behaviour.

Solo mode keeps its structure — the user's real row from `useTodayScore` plus
locked slots — with the hero reading "1st of 1" and the create/join buttons at
the bottom.

### Profile — "How far you've come."

Order: name and class → hero level with XP meter and figures beneath → streak
panel → body metrics panel → sign out as a ghost button.

`XpBar`'s existing reasoning holds and is preserved: the bar only moves right,
and the absolute figures stay because the curve is quadratic and a creeping bar
without numbers reads as broken.

The streak panel keeps saying the Streak Shield state out loud — the mechanic
only prevents churn if the user knows they have one before the day they need it —
and gains the `earned` glow when banked.

The dev seed control moves behind `__DEV__` so it cannot reach a TestFlight
build.

### Sign-in, Name, Health permission sheet

Sign-in and Name each reduce to one line of type, one field or one button, and
nothing else. §5 asks for name-and-Hunter inside 60 seconds; nothing on either
screen should compete with that. Both keep their current logic untouched —
including `name.tsx`'s synchronous `submitting` ref, which guards a real
double-insert caused by TanStack's `notifyManager` scheduling, and the
"no provider configured" message on sign-in.

The health sheet becomes a `Panel` over a dimmed Character screen: what Kairo
reads, what it never reads, one button.

### Navigation

The default `Tabs` bar is replaced by `TabPill` — floating, three text labels
(HUNTER · SQUAD · YOU), active label in violet with a glow dot. No icon library;
`@expo/vector-icons` is not installed and this avoids adding it.

`app/(tabs)/_layout.tsx` keeps its current ordering comment and behaviour: the
timezone reconcile runs before the health sync, deliberately.

## Out of scope

Sabotage UI (not built yet — this pass gives it a vocabulary to arrive into),
shop and coins, notifications, Rive, commissioned art, class selection, and every
screen from the design project not listed above.

## Verification

Neither `npm run test:core` nor `npm run test:schema` covers rendering, and the
project verifies UI by hand on device — that does not change here. What must
hold:

- `npm run typecheck` passes.
- `npm test` passes: no pure logic moves in this work, so any change in these
  suites means something was altered that should not have been.
- On device: every screen at the smallest supported size without clipping;
  Reduce Motion on produces no animation anywhere; Dynamic Type at large sizes
  does not break the stat row or the leaderboard row; a squadless account, a
  scored-nothing-today account, and a full squad each render their correct
  state rather than an error or an empty board.

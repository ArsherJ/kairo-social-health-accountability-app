# Retired vocabulary — sabotage, tiers, points, body metrics, Hunter, Sunlit


> **2026-09-12 note.** Several files this text calls "still on disk", "unmounted with their tests" or "kept under `@deprecated`" were deleted by the ponytail audit (roadmap deviation #74): `TodayPanel.tsx`, `strain.ts`, `event.ts`, `Avatar.tsx`/`avatar-tint.ts`, `KairoLab.tsx`, `kairo-lab-contract.ts`, `data/*.json`, `validateCharacterManifests`, `species-art.ts`, `species-label.ts`, the `demo/` feature and `scripts/replay-dry-run.mjs`. The schema they served is untouched. Read those sentences as history.
Moved verbatim from `CLAUDE.md` on 2026-09-12 (ponytail audit) to keep that file inside its size limit. The rules are summarised in `CLAUDE.md`; this is the full text and the *why*.

**Body metrics are inert, and the app says so as of 2026-09-04** (deviation
#60). `profiles.height_cm` and `profiles.weight_kg` reach **no scoring path** —
Apple computes active calories against the body profile in the *Health app*,
before Kairo sees them, and Kairo's columns are a disconnected second copy. The
card promised "more accurate Body tracking" for years and that was false; the
copy is `BODY_METRICS_NOTE` in `body-metrics.ts` now, with a test banning a
stat name and any claim of benefit. **`birth_year` has no live reader either**:
its one consumer is `maxHeartRateForAge()` behind the display-only Strain
figure, and `TodayPanel` — the only surface that ever rendered Strain — was
unmounted by deviation #59, so the note names no surface at all and a test
holds it there. All three fields are inert today. They are never asked in
onboarding —
a question that changes nothing does not earn a screen — and the columns,
constraints, grants and editor are all untouched, so collecting them later is
adding a screen rather than restoring a schema.

**Sabotage was removed on 2026-08-09.** It was the original premise (§8, and §20's principle #4 called it "the soul of the product"), so a lot of prose still assumes it. Nothing in the code does. If you find a reference, it is stale — fix it.

**Bronze/Silver/Gold are internal to scoring as of 2026-08-10.** `tierFor()`, `TIER_POINTS` and `daily_scores.tiers` still decide every day exactly as §5/§6 specify — nothing about the engine changed. But no surface renders a tier name or colour any more: the character sheet and the leaderboard both show a numeric **ability rating** from `ratingForStatPoints()` over lifetime per-stat rollups on `profiles`. If you find UI naming a tier, it is stale. **`profiles.focus` was dropped the same day** — `squads.program` is the only focus concept, and the character screen's "lane" reads observed dominance instead.

**Points are spoken nowhere, as of 2026-08-15 and more so since.** `daily_scores.total`
still ranks the board and feeds XP and ratings — nothing
about the engine changed, exactly as with tiers in deviation #23. But no ambient
surface prints it: the home hero is the day in real units, a leaderboard row is
rank and the gap to the row above, and `src/features/squad/row-label.ts` speaks
that gap rather than a total — deliberately, because a screen reader naming a
figure the screen does not show describes a different product. The last exception
went with Goals on 2026-08-25: an Event's target is a number of **calories**,
which the squad produces rather than accrues. If you find any surface rendering
a score total, it is stale — fix it.

**"Hunter" and "barkada" were retired on 2026-08-11** (roadmap deviation #26). The
character has no noun — it is "your character", and the centre tab is `Character`;
a squad is a **squad**. The spec says "Hunter" throughout (§6, §15, §20) and so do
the dated docs under `docs/superpowers/`; both are historical records, not intent.
Two things deliberately still say it and are *not* stale: `profiles.class`'s
`'hunter'` default (inert internal enum, no surface renders it) and the
`output/imagegen/hunter-*.png` render sources. **§20's "dark fantasy hunter
aesthetic" brief and the art-direction prompts in
`scripts/generate_swap_assets*.py` used to be listed here as a genuinely open
decision; deviation #40 settles it** — the direction is flat vector, bold
outlines, colourful, and the subject is an animal. Those prompts are now stale
like anything else. Anywhere else, it is stale — fix it.

**Kairo is Sunlit as of 2026-08-27** (deviations #53, #54). *Palette values and
the icon family are superseded by the Playful block above (#58) and the era
detail is in `docs/archive/design-history.md`; the token roles, the
`/today`→`/`, `/squad`→`/flock` routing, `NAV_HEIGHT` and the flat-bar tab shape
below are still live.* The tabs are **Today · Sky · Flock · You**, flat, and the
character tab is gone. Three things break easily:

- **The accent token has three roles and only one is text-safe.** `colors.accent`
  is fill-only — `src/ui/contrast.test.ts` asserts it *fails* as text, so the
  value can't drift back into a tempting range. Body-size accent text is
  **`colors.accentDeep`**; large display type (24pt+) is **`colors.accentInk`**.
  The prop is named `color` whether it is a fill or ink, which is why the split
  is a rule and not a lint. (Sunlit's amber values: archive file above.)
- **The ramps' step contract is ink strength, and ~37 call sites depend on it.**
  200 is a wash you set text on, 500 is a fill, 700 and 800 are inks.
  `ramp.accent[700]` in particular must stay at or above 4.5:1 on `colors.bg`,
  because `Label`'s accent eyebrow is 10pt and reads it. Change a step's
  strength and every site reading it goes wrong at once, silently.
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

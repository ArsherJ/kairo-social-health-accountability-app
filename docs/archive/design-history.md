# Design history — superseded surfaces

Historical record of Kairo's visual and layout eras. Each was replaced in place,
keeping token names and route names where possible. **The live rules are in
`CLAUDE.md`**; this file holds only the detail of states that no longer exist,
kept because each redesign followed the previous one's reasoning.

If something here contradicts `CLAUDE.md`, `CLAUDE.md` wins — and this file is
stale, fix it.

---

## Palette lineage

**Terracotta (pre-2026-08-27).** `colors.accent` was a terracotta that measured
**4.7:1** on the cream ground and could serve as both a fill and ink — which is
why the Sunlit pass had to hand-classify 53 call sites when the accent stopped
being able to do both jobs (the prop is named `color` whether it is `<Meter>`'s
fill or `<Feather>`'s ink).

**Sunlit (deviations #53, #54 — 2026-08-27).** The palette shifted in place:
every token in `src/theme.ts` kept its name and changed its value, ~90 call
sites re-skinned without being edited. Fonts were Caprasimo + Figtree.

- **`colors.accent` became `#f5a623`**, which measures **1.9:1** on the cream
  ground — a fill only, invisible as text and rendering perfectly while being so.
  Body-size accent text moved to `colors.accentDeep`; large display type (24pt+)
  to `colors.accentInk`, then `#c9721c` at ~3.3:1. `src/ui/contrast.test.ts` was
  written to assert `accent` *fails* as text, so the value can't drift back into
  a tempting range.
- **The ramps' step contract** — 200 is a wash you set text on, 500 a fill, 700
  and 800 inks. `ramp.accent[700]` had to stay ≥ 4.5:1 on `colors.bg` because
  `Label`'s 10pt accent eyebrow reads it; `#c9721c` was a separate
  large-text-only role, not a ramp step.

**Playful (deviation #58 — 2026-08-30)** supersedes Sunlit's palette values,
ramps and fonts (Fredoka + Nunito now). Live rules: `CLAUDE.md`, "Kairo is
Playful". The Sunlit token *roles* survive — `accentDeep` (body accent text),
`accentInk` (24pt+ display), `accent` (fill only) — only the hues moved.

---

## Tab-layout lineage

**Character · Today · Squad · You — four tabs (deviation #50, 2026-08-25 to 08-27).**
The Today tab was the present moment: a race summary card, three quests, the
Daily Walk and the Challenge door, in that order. The character screen kept its
hero, `TodayPanel`, `SyncStatus` and the disclosure note and shed the other two.

- **`TabPill` geometry.** Orbits 52, centre 68, bar gap `space.md`:
  `3 × 52 + 68 + 3 × 16 = 272` against 320pt on the narrowest supported screen.
  `NAV_HEIGHT` stayed 96 (`TAB_PILL_CLEARANCE` unchanged — the discs got
  smaller, not the bar). Order was `['squad', 'index', 'today', 'profile']` so
  Squad stayed leftmost and You rightmost and no existing thumb target moved to
  the other end. **The character kept the raised disc and was no longer
  geometrically centred**: raised meant *anchor*, not *middle*; a raised
  third-of-four would be arbitrary and two raised discs is no anchor at all.
- **The Today tab added no requests.** Every hook on it resolved to a key the
  character or squad screen already used, so the two could not disagree in one
  frame. `RaceCard` re-ranked the board payload by capped steps on the client,
  exactly as `RaceTrack` did.

**Today · Sky · Flock · You — flat bar (deviations #53/#54, 2026-08-27).** The
discs became a flat bar; the bar's height did not move. No raised disc. Tab
items are `flex: 1` with `numberOfLines={1}`. `NAV_HEIGHT`, `TabPill` and the
flat-bar shape are still live — see `CLAUDE.md`, "Kairo is Sunlit".

**Living Mirror (deviation #59, 2026-09-01)** replaced the four-tab Today tab
entirely. Live rules: `CLAUDE.md`, "Today is the Living Mirror".

---

## Squad race lineage

**Six horizontal lanes (deviations #46, #47 — 2026-08-26 to 08-27).** The daily
leaderboard became a track: six characters running horizontal lanes at one
shared flag, over the same payload the board already fetched.

- **A lane was one accessibility element** and needed both halves of the
  2026-08-14 grouping fix. The whole track was **flow-based** — the figure
  placed by two flex spacers, and `flex: 0` on either was the bug (it refuses to
  shrink as well as to grow, so the figure is squeezed at 0% and 100%). The
  finish line was drawn per lane as a right-edge rule with **no vertical gap
  between lanes**, so the segments abutted into one continuous line; a `gap` or
  `marginBottom` there broke the one picture that made it a race rather than six
  bars.

**One sky corridor (deviation #56, 2026-08-27)** replaced the lanes. Nothing
about the scoring engine or the race mechanics changed — same payload,
client-side re-rank by capped steps, derived finish line, reciprocal consent
gate. Live rules: `CLAUDE.md`, "The race is one shared sky". The reciprocal
per-row consent gate (#47) is live — `CLAUDE.md`, "The reciprocal per-row
squad-data consent gate".

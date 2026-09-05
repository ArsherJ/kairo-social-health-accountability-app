# Onboarding wireframe spec — Figma build sheet

**Status (2026-09-05):** partially built. Blocked on the Figma MCP monthly tool-call
quota (Starter plan = 20 calls/month, exhausted). Everything needed to finish the
run in one sitting is written down here.

**File:** `zZGtWxNx75Eahi2VOqojXu` ("Untitled")
**Page:** `Onboarding — 7 beats`, id `18:2`

This sheet exists because the wireframes and the shipped app had drifted apart in
ways that are only visible when you read both. It records what is true in code, so
a frame drawn from it describes Kairo rather than a generic RPG fitness app.

---

## 1. Audit of the existing file

The file holds **two** families of frames plus five uploaded reference photos.

### Family A — `home-dashboard` … `profile-achievements` (9 frames, x 440–3880)

A generic RPG habit app branded **"HabitQuest"**, sword logo, "Alex Mercer /
Novice Adventurer". Tabs: Home · Quests · Party · Stats.

**Do not build from this family.** It contradicts shipped, test-enforced rules:

| What it shows | Why it cannot ship |
|---|---|
| "Body (Strength)", "Motion (Agility)", "Mind (Intelligence)" | Engine keys and old stat words. `stat-names.test.ts` scans every non-test file under `src` and `app` for the word **Agility** and fails. Surface names are Body · Motion · Mind (deviation #51). |
| Tabs Home/Quests/Party/Stats | The app is Today · Sky · Flock · You. "Party" was retired with "barkada" (deviation #26). |
| "HabitQuest" wordmark, sword | Not the product. Kairo's mark is the wordmark; every character is a Philippine eagle (deviations #55/#57). |

### Family B — `kairo-*-enhanced` (6 frames, x 5190–7340)

Kairo-specific and much closer. Covers Today, Today-details, You, Flock, plus two
screens with no app equivalent (`kairo-activity-feed`, `kairo-quest-board`).
Two conflicts worth naming:

- **`kairo-flock-enhanced` draws five dashed "Invite Flock Member N" rows.** That is
  exactly the `LockedSlot` regression fixed on 2026-09-05 — one row per free seat,
  most of a screen of them under a squad of one. `Leaderboard` renders `LockedSlot`
  **once**, carrying the count (`3 seats open`) and no rank. Do not redraw it per seat.
- **The second tab is "Activity" (weekly XP bar chart + log feed); the app's is Sky**
  (the shared race corridor). Decision taken 2026-09-05: **Sky stays.** The activity
  feed is parked as an idea, not intent. No app change.

### Not covered by any frame

Sky, all 7 onboarding beats, Settings, Train, Progress, Event new/detail, squad
join/create, sign-in, the 4 welcome cards, both permission sheets, delete-account.

---

## 2. What is already in the file

**`Kairo Playful` variable collection** — 89 variables, mode named `Playful`,
generated from `src/theme.ts` so the design and the app cannot drift:

- `ramp/{neutral,accent,sage,teal,gold,sky}/{100…900}` — 54 colours, scoped to
  frame/shape/text fill + stroke.
- `color/*` — 24 semantic tokens. Aliased to the ramps wherever `theme.ts` aliases
  (`color/accent` → `ramp/accent/500`), literal where `theme.ts` is literal
  (`color/bg` = `#fff6ec`). `color/border` carries its real 16% alpha.
- `space/{xs,sm,md,lg,xl}` = 4/8/16/24/40, scoped to GAP + WIDTH_HEIGHT.
- `radius/{sm,md,lg,xl,xxl,pill}` = 10/16/24/30/34/999, scoped to CORNER_RADIUS.

**Real character art**, embedded as image fills (uploads and downloads to
`figma.com` are blocked by this environment's network policy, so the PNGs were
downscaled to 144px / 64 colours and injected via `figma.base64Decode` +
`figma.createImage`). Holder frames sit at x −520, y −260, named `asset/kairo-*`.

| Pose | imageHash |
|---|---|
| idle | `4a6834f60b1e58abe637795e157f512fae413327` |
| walk | `d9682ab0bbb6ef732aca7a6e45b57a9d97112d8c` |
| run | `056e15a25421f7590d846326f4740b2e5f4f3950` |
| victory | `74745c025d9562913f9a0f4f22981312acdbd508` |

**Beat 1 (`1 · welcome`, id `19:2`) is half-built** — frame, two decorative blobs,
status bar and the four-segment rail exist. Its middle (eyebrow, wordmark, three-bird
flock, pitch), the value dots and the CTA pill are **missing**; that call was the one
the quota rejected. Finish this frame first.

---

## 3. Shared chrome

**Artboard** 390 × 844 (name beat 8 at 844 too; `/name` scrolls). Horizontal padding
`space.lg` (24). Bottom padding 58 (`insets.bottom` 34 + `space.lg`).

**Status bar** — "9:41" at Nunito Bold 15, three rounded bars (17/15/24 × 11, r2.5)
at 90% ink. Cream on saturated grounds, `color/text` on cream ones.

**Rail** (`OnboardingChrome.tsx`) — one row, gap 12: optional 44×44 back disc, the
track, optional "Skip" (Nunito Bold 13). Track is 4 segments, gap 5, each 8pt tall,
`radius.pill`, `overflow: hidden`, unfilled at `off`. The fill is a **child at a
width**, not a second background, so a half-done phase draws half-filled.

- `tone="light"` (saturated ground): on = `color/bg` cream, off = white 30%.
- `tone="dark"` (cream ground): on = `color/text`, off = `#241b4d` at 16%.

**The rail measures four phases, not screens.** Never draw seven segments.

**Dots** (`OnboardingDots`) — 3 diamonds, 9×9, r3, rotated 45°, gap 9. Lit = cream,
unlit = white 40%. Phase-0 beats only. Decorative.

**CTA** (`OnboardingCta`) — min-height 62, radius 26, gap 9, label Fredoka SemiBold 19
(`font.display.action`), optional 20pt icon.

| tone | fill | edge | label ink |
|---|---|---|---|
| `glass` | white 78% | 1px white 90% | `color/sage` `#6a3bef` |
| `ink` | `color/text` `#241b4d` | 3px bottom `#120c2b` | `color/bg` cream |
| `bright` | `color/accent` `#ff6b35` | 3px bottom `color/accentEdge` `#e0521f` | `color/text` |

> A bright fill takes ink, never cream — orange measures 2.65:1 against cream and
> `contrast.test.ts` pins that failure deliberately.

---

## 4. The eight beats

Rail positions are **derived** by `resolveBeats()` in `src/features/onboarding/beats.ts`
— `filled` is the beat's phase, `partial` is its place within that phase. Do not
hand-write them anywhere else; these are transcribed for drawing only.

| # | Beat | Route | Ground | Rail tone | filled / partial | Back | Skip | Dots | CTA (tone) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | welcome | `/welcome` | `ramp/sage/500` `#7c4dff` | light | 0 / ⅓ | — | yes | 1 of 3 | "Let's fly" (glass) |
| 2 | one-sky | `/one-sky` | `ramp/sky/400` `#5cc6ff` | light | 0 / ⅔ | yes | yes | 2 of 3 | "I'm in" (glass) |
| 3 | mirror | `/mirror` | `ramp/sage/800` `#3b2680` | light | 0 / 1 | yes | — | 3 of 3 | "Show me" (glass) |
| 4 | connect | `/connect` | `color/bg` cream | dark | 1 / ½ | yes | — | — | "Connect Apple Health" (primary) + "Not now" (ghost) |
| 5 | hatching | *(phase of `/connect`)* | `color/midnight` `#141033` | light | 1 / 1 | — | — | — | *(none — advances on a timer)* |
| 6 | difficulty | `/difficulty` | gradient band → cream | light | 2 / ½ | yes | — | — | "Lock it in" (ink) |
| 7 | privacy | `/privacy` | `ramp/sage/600` `#6a3bef` | light | 2 / 1 | yes | — | — | "Good to know" (glass) |
| 8 | name | `/name` | `color/bg` cream | dark | 3 / 1 | yes | — | — | "Say hello" (ink) |

**Beat 3 carries no skip** — it *is* the skip destination. `onboardingSkipTarget()`
derives that as the last beat of phase 0, because skip's purpose is getting past the
pitch and the pitch is phase 0. Beats 1 and 2 skip *to* beat 3, never to `/connect`.

**Beat 8 fills all four segments.** A run that never shows its own completion felt
longer than it was.

### Copy, verbatim from the screens

**1 · welcome** — eyebrow `WELCOME TO` (Nunito Bold 11, ls 2, cream 72%); wordmark
`Kairo` (Fredoka Bold 56, ls −1, cream); three birds in a heap on one baseline,
overlapping (walk 112 · victory 172 · run 120, gap −26), decorative; pitch (Nunito
Bold 13.5 / 20, cream 85%, centred, 318 wide):
> Your steps raise a bird. Walk with your flock, and who flies highest today is settled by real health data — not by talk.

**2 · one-sky** — headline `One sky,⏎one flag`; the real `SkyCorridor` at ~⅓ height
with three birds along it (victory 64 leading, run 54, walk 44), decorative; a flag
chip reading `10,000`; pitch:
> Everyone flies the same 10,000-step lane each day. Cross the flag and your streak grows — the bird does the bragging for you.

> `RACE_FINISH_LINE` **is** `DAILY_STEP_BASELINE`. Draw the figure, never the literal
> in a new constant. Crossing the line is clearing the Daily Walk: one number, two readings.

**3 · mirror** — the statement and its correction at two sizes, never one line with a
word recoloured:
> You're not lazy.
> You're just not being counted.

Then a low `idle` bird (124) over a heavy `GroundShadow` (width 148, `color/midnight`,
50%) — shadow first, bird standing on it. Then:
> Most days disappear the moment they end. Nothing saw the walk to the jeepney stop, the stairs, the long way home.

> Kairo counts them. That's all it does — and that turns out to be enough.

Last paragraph at full-strength cream against 78% above it — emphasis from presence,
not a second hue. This is the wordiest beat; it scrolls.

**4 · connect** — eyebrow `CONNECT APPLE HEALTH`; title:
> Your character levels from what you already do.

help:
> Kairo reads your steps, active minutes and calories from Apple Health. Your squad sees your progress — never the raw numbers.

Draw the **revealed** state as the primary frame: `Numeral size="hero"` (Fredoka 62)
in `ramp/accent/700` with the unit `steps` beside it, caption `today, already counted`.
Set exactly as Today's hero, deliberately — the first number Kairo shows you is the
number that greets you every morning.

Worth a variant each: `We'll pick up your activity as it comes in.` (quiet day) and
`Apple Health didn't connect. Try again, or skip and connect later from Settings.`

**5 · hatching** — a trivia card over the connect ground while the real
`readStepsToday` runs. Copy comes from `trivia.ts`, picked by a hash of the account.
It states **no effect size**; every figure in it is the app's own constant. Card down
at the *later* of "minimum served" and "read finished".

**6 · difficulty** — gradient band, headline `Three quests a day.⏎How big?`. Below it
the reading, above the choices it explains:
> Your typical day is 6,240 steps. We'd start you on Steady.
> Read on your phone. Only the size you pick is saved.

Four rows, each an icon tile + title + samples + radio, the proposal **pre-selected**:

| Row | Icon | Tint / wash |
|---|---|---|
| Automatic — "Grows with how long you have been here" | `auto-fix` | `ramp/teal/600` / `color/tealTint` |
| Starter | `sprout` | `ramp/sage/500` / `ramp/sage/200` |
| Steady | `walk` | `color/accent` / `ramp/accent/200` |
| Strong | `lightning-bolt` | `color/coral` / `color/coralTint` |

Footnote: `Change it any time in Settings. Your choice always wins over the automatic rule.`

> A new account is **not** on Automatic by default any more (deviation #63). Show a
> tier selected. The `no-history` sentence is a different sentence and must stay so —
> one means we could not measure, the other means we did.

**7 · privacy** — headline `Your privacy,⏎your call`; intro:
> Kairo reads your steps to raise your bird and rank your day. You can change any of this later in Settings.

Two cards:
- **Health data** (`heart-pulse`, `ramp/gold/400`) — "Steps, active calories, sleep.
  Required — it is the whole game." Carries a **lock glyph, not a disabled switch**:
  a switch that cannot move reads as broken.
- **Share totals with your flock** (`account-multiple`, `#4ce3ff`) — "Daily totals
  only — never your route, never an hour-by-hour trail. Off means the sky is empty
  both ways." A real switch.

Footer link: `How Kairo handles your data` with `shield-lock-outline` at cream 70%.

**8 · name** — a `Panel variant="sky"` stage holding the `idle` bird; then eyebrow
`It found you`, title `Meet your Kairo`, help:
> A Philippine eagle, and from today it lives off your movement — your walks, your sessions, your sleep. Nothing you buy, nothing you tap.

Then `Panel variant="tint"` with eyebrow `Its name` over a 28pt text input.

> **The profile row commits exactly once, on this beat.** Nothing may be *asked*
> after it. Add beats before the name, never after (deviation #22).

---

## 5. Build order and API notes

Roughly **2 `use_figma` calls per beat** (chrome, then content) ≈ 15 calls to finish,
plus screenshots to verify. That does not fit a Starter month; see §6.

1. Finish `1 · welcome` (middle + dots + CTA).
2. Beats 2 → 8 left to right, 390 wide, 60pt gutter.
3. Screenshot after each beat. Watch for clipped text and overlaps.

Pitfalls hit or narrowly avoided in this pass:

- **Text collapses to a zero-width thread** unless you set `textAutoResize = 'HEIGHT'`
  *and* an explicit width via `'FIXED'` + `resize()`. `FILL` alone is ignored. Assert
  `node.width > 0`.
- **Load every font before touching text.** Fredoka has `SemiBold` / `Bold`; Nunito has
  `SemiBold` / `Bold` / `ExtraBold` — no space, unlike Inter's `Semi Bold`. Verified
  present in this file.
- **Icons: import SVG**, never rebuild from rotated primitives — `rotation` pivots on
  the origin, not the centre.
- **`figma.currentPage` resets every call** — `await figma.setCurrentPageAsync(page)`
  at the top of each one.
- Append to an auto-layout parent **before** setting `HUG`/`FILL`.

---

## 6. Blocker

Figma MCP on the **Starter** plan allows **20 tool calls per month** (a Full/Dev seat
on Professional is 200/day). This pass spent the month's allowance on the audit, the
token collection, the art embed and beat 1's chrome.

Options: wait for the monthly reset; upgrade to Professional with a Full or Dev seat;
or have the remaining beats built by hand in Figma from §3–§4, which are written to be
followed directly.

---

## 7. Follow-ups for the "align app UI" phase

The original request was to align the app to the wireframe. On inspection the drift
mostly runs the other way — the app is ahead. Genuinely open:

- **`kairo-activity-feed` / `kairo-quest-board`** describe screens that do not exist.
  Quests live on Today (one next step) and `/train`. Decide whether either is wanted;
  neither is a redraw of something shipped.
- **The wireframes carry no Sky frame**, so the app's second tab has no design record.
  Highest-value gap after onboarding.
- **Family A should be deleted or moved to an `Archive` page** so nobody builds
  "Agility" from it.

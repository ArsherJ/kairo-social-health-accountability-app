# User Journey

What a player actually walks through, end to end. Grounded in the current implementation (`app/`, `src/`) and cross-referenced to the spec (`Kairo_Master_Summary.md`, cited as `§n`) and `docs/roadmap.md` for what's shipped vs. still planned.

**Keep this current.** A change to onboarding, the daily loop, the character screen, squads, or goals updates this file in the same pass — see `CLAUDE.md` → Tooling conventions.

---

## 1. Sign-in

`app/(auth)/sign-in.tsx` — the only gate before the app is usable. No paywall, no forced squad.

## 2. Onboarding — "character first, permissions in context" (§5)

`app/(onboard)/character.tsx`, then `app/(onboard)/name.tsx`. The spec's ordering principle, and the reason for it: iOS gives one clean shot at the HealthKit and notification prompts, so stacking every permission ask before any fun front-loads friction that costs signups.

1. **Character, then name, within the first 60 seconds** (§5) — emotional investment before any ask. `character.tsx` shows the two character bodies and commits nothing; `name.tsx` names the one picked and is where the profile row is INSERTed — once, on this second screen. Profile-row existence (`character_name` set) *is* the onboarding-complete marker (`app/_layout.tsx` gate) — no separate flag to desync, which is why the choice has to come *before* the name rather than after: deviation #22 deleted the `finishingOnboarding` flag when onboarding collapsed to one step, and asking anything after the INSERT would need it back (deviation #27).
2. **HealthKit permission**, framed as "power your character with real life" — not a cold OS dialog. The sheet lists **every** type Kairo requests with what each is for, and that list is rendered from `HEALTH_DISCLOSURE` rather than written out: `disclosure.test.ts` fails if it and `read-types.ts` disagree in either direction. Prose could not stay honest — the copy named four types while the app asked for eight, and iOS showed the user the true list either way, which is what made it a trust problem rather than a wording one. The `NSHealthShareUsageDescription` in `app.config.ts` carries the same list and is the one half a test cannot lock, so it changes by hand.
3. **Notifications**, requested only once a squad or a goal-in-flight gives them a reason to exist (§14) — not upfront.
4. **Body metrics (height/weight/birth year)** deferred to a persistent soft prompt in Settings ("Add your height and weight for more accurate STR tracking") rather than blocking onboarding. Height/weight feed active-calorie (STR) accuracy; birth year additionally backs the `220 - age` max-heart-rate estimate behind the Strain figure (roadmap deviation #24) — both stay optional, with sane fallbacks.

**MVP scope note:** ships one character class with placeholder art; the other three classes are V1 (§6). The class is internal — `profiles.class` defaults to `'hunter'` and no surface names it. **The character has no in-app noun** as of 2026-08-11 (roadmap deviation #26): it is "your character", never a Hunter. **Onboarding asks which of two character bodies you play as** (2026-08-11, deviation #27) before asking for a name; the answer is `profiles.character_body`, and it is cosmetic only.

## 3. The daily loop (§2)

```
12:00 AM local  →  Day resets for that player (per-user local day, not a shared server midnight — §2).
Throughout day  →  HealthKit background delivery syncs automatically, free and paid users alike.
Anytime         →  Open the app: Character tab, Squad tab, or a goal's progress.
11:00 PM local  →  Push: "1 hour left. You're in [rank] place."
11:59 PM local  →  Day ends; provisional results shown.
~2:00 AM local  →  Day finalizes (grace window for late phone syncs) — coins + XP land.
Sunday 10 PM    →  AI weekly recap card pushed to all squads (V1+).
```

### The numbers say how old they are

Under the TODAY panel on Character, a status line reports when health data last
reached the server: `Synced 4 minutes ago` when healthy, `Last synced 3 hours
ago · Sync now` once it goes stale, and `Couldn't sync. Showing data from 3
hours ago · Try again` when the last attempt failed. `SyncStatus.tsx` renders
it, `sync-status.ts` decides the wording, and retry enters the sync policy as a
`manual` trigger — unthrottled, because it is the escape hatch from exactly the
state it is reporting.

This is not decoration. Between 9 and 11 August 2026 `sync-health` failed on
every call while its bucket write kept committing, so the app displayed real,
climbing step counts against a score of zero and gave no indication anything
was wrong — for two days, to every user. `SyncState` had recorded the failure
the whole time and nothing read it. A figure is now never shown without its
provenance; see the addendum in `docs/qa/kairo-end-to-end-qa-report.md`.

Because each player's day runs midnight-to-midnight in *their own* timezone, a squad spans multiple calendar dates at any instant — this is what makes the OFW-in-Dubai-vs-family-in-Cebu use case work at all, and it's why every score, bucket, and goal window is keyed by local date, never server time (see `CLAUDE.md` → Per-user local days).

### Three engagement hooks, one available with zero friends (§2)
1. **Morning FOMO** — who's ahead while you slept (solo: how long is the streak now).
2. **The commitment** — a goal in flight with a visible days-remaining count. Works with no squad at all — the one hook every user has, solo or not.
3. **Night urgency** — real-time rank notification with a countdown.

## 4. The three tabs

`app/(tabs)/_layout.tsx` defines the shell every session lands in after onboarding.

### Character (`index.tsx`)
The RPG avatar and the day's/lifetime scoring surface.

- Four phone-only passive stats drive it: **AGI** (steps), **STR** (active calories), **END** (active minutes), **VIT** (hourly movement consistency — active hours with 250+ steps, not sleep; §5 explains why sleep can't be the phone-only vitality signal). **REC** (sleep) is a wearable-only bonus stat that simply doesn't appear without a wearable — zero penalty (§5, §6).
- Each stat scores independently per day (None/Bronze/Silver/Gold → 0/200/500/900 pts) plus a consistency bonus for touching multiple stats in the same day (§6). **Tier names are internal to the scoring engine only** — nothing in the UI shows "Bronze/Silver/Gold" (roadmap deviation #23). What the player sees is a numeric **ability rating** built from lifetime per-stat points, plus a guidance line in raw units ("1,240 more steps for +400 AGI").
- **The stats are glyphs on the rail, not letters** (2026-08-11): a footprint, a flexed arm, a stopwatch and a heart-pulse, each over its rating. The abbreviation survives one tap down, on the expanded bars — icon, `AGI`, and "Steps and distance" together — which is where a new player learns the mapping, and in the guidance sentence, which still names the stat in words.
- **Level** is permanent XP, never resets. Two players at the same level can look different — the character's visual build follows whichever stat dominates their lifetime rollup (§6): leaner/faster for AGI, broader silhouette for STR, endurance stance for END, recovery glow for VIT, and a rare "All-Rounder" look — unpurchasable, must be earned — when all four stay within 20% of each other.
- **Strain** (roadmap deviation #24, 2026-08-10) is a derived, wearable-only, display-only figure from hourly heart rate — never stored on `daily_scores`, never ranked, never gates anything.
- A rest day scores 0 and still costs the streak, but the goal card always says how many days are left to make it up (§6) — the app is designed to still be worth opening on a bad day.
- **"How progress works"** (`app/progress.tsx`), linked from the foot of the expanded stat rail, explains the four numbers by the one thing that actually separates them — their timescale: daily score is today, ability ratings are lifetime per stat, level and XP are all-time, streak is the run of days. A route rather than a modal, because `PermissionAsks` owns the single modal the app may present. Offered at the point of expansion rather than beside the hero: expanding the rail *is* the question being asked.

### Squad (`squad.tsx`)
The optional social layer (§7).

- **Solo Mode is not a degraded state** — it's a first-class mode. Character progression, coins, and shop all work with zero squadmates. The leaderboard shows "You vs. ???" with locked slots, which is itself the pitch to go invite people; a squad slot unlocking is an animated moment.
- Joining a squad: shareable link or 6-digit code. Leader can rename, remove members, transfer leadership. Free tier: 6 members / 1 squad; Legendary: 15 members / 3 squads.
- What a squadmate can see is an **aggregate only** — never raw step counts, hourly patterns, or timestamps (§5, `squad_leaderboard()` in `CLAUDE.md`). VIT's hour-by-hour shape reveals sleep/work patterns and stays owner-only.
- **Squad programs** (`squads.program`) are the one "focus" concept left in the app — fixed at squad creation, unlike a per-player goal (see `docs/roadmap.md`, 2026-08-07 scope addition).

### Profile (`profile.tsx`)
Settings, body-metric soft prompt, account actions (including deletion — the legal erasure path noted in `CLAUDE.md`).

- **Notifications** (`NotificationSettingsCard.tsx`) reports whether they are on, and offers `Linking.openSettings()` when iOS has a denial on file. Re-read on every foreground, because the state can only change in iOS Settings — so returning to the app is the only moment worth checking, and reading once at mount is precisely how the QA pass ended up with a screen describing permissions the user had already revoked. It sits above Timezone deliberately: the zone follows the device and cannot silently be wrong, whereas this can.
- The card does **not** campaign for the permission back. A denial is a decision; the row's job is to make it legible and reversible. `shouldAskForNotifications` still owns the contextual ask, so an undetermined state shows no button here.

## 5. Goals (§8) — what replaced Sabotage

Sabotage was the original hook through v1.3; removed 2026-08-09. Goals are what makes the app matter past week three now: a target committed to over a window of days, scored off the same `daily_scores.total` the leaderboard already ranks on, so progress is a read-time projection — never a separately tracked number (see `CLAUDE.md` → Writes are server-authoritative).

`app/goal/new.tsx` to create, `app/goal/[id].tsx` to view progress.

- **Two shapes:** *cumulative* ("75,000 points by 31 December") or *consistency* (a per-day bar met on N of M days, e.g. "2,500/day, 25 of the next 30 days").
- **Window:** a preset length, a picked end date, or **no end date at all**. Open-ended goals are cumulative-only — enforced at the database level, because "clear the bar eventually" can never become unreachable, so there's nothing for a pace marker to fail against (roadmap deviation #21).
- **Personal or squad-shared.** A squad goal's roster is frozen at creation — "everyone must hit it" only means something against a denominator that can't move mid-window.
- **Fixed at creation** apart from title/description. Abandoning is the escape hatch; it's a distinct, visible act from quietly lowering the bar.
- **Completion is a one-way latch**, evaluated only once a day has gone `final`. A later downward revision from Apple's step count never revokes a goal already met (same principle as streak milestones). Reward is XP (scaled by window length, capped) plus a permanent completed-goal record on the profile — no separate badge table.

## 6. Referral — "I'm doing this. Do it with me." (§9, spec'd, not yet built)

**Not in the current implementation** — no referral screens or roadmap phase exist yet; this section documents the intended design so it isn't rediscovered from scratch when the phase starts.

- Reframed away from the old "war declaration" sabotage-era pitch. The share message names the shared commitment, not a challenge: *"[Name] is going for 25 active days this month. Want in?"*
- Highest-converting moment: right when a player sets a goal — freshly committed and naturally shareable.
- Three-layer rewards: referrer gets coins + long-term recruiter status; referee gets a coin head start, is auto-joined to the squad's active goal (kills Day-1 aimlessness), and starts at Level 2; the whole squad gets 2x XP for 3 days.

## 7. Monetization touchpoints (§10, largely V1+)

Not part of the MVP user journey today beyond what's noted above (coins/shop referenced by the goal-completion and character-progression flows are staged for V1 per `docs/roadmap.md`). See the spec for the full coin economy and Legendary subscription design before building against it.

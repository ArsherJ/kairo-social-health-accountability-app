# Solo mode, the profile screen, and dominant-stat evolution

Status: approved 2026-08-01. Phase 7, scoped to what a simulator can verify.

## Goal

Three things, independently shippable:

1. **Solo mode (§7).** The app is worth opening before anyone joins your squad.
   A single player sees their own row and the empty slots beside it, every day.
2. **A basic profile screen (§15).** Level and XP progress, streak, body
   metrics behind §5's soft prompt.
3. **A Hunter that reflects how you earned your points (§6).** Dominant-stat
   evolution, on placeholder art.

## Why solo mode is not cosmetic

§7 calls it a "critical design decision" and the reasoning is a churn argument:
one person downloads, their barkada doesn't join, the app shows nothing, they
leave. Every other feature in the MVP assumes a populated squad. Solo mode is
the only thing standing between a beta invite and an empty screen — and §15
recruits *intact barkadas*, which means the founder-shaped person installs
first and waits.

The locked slots are the mechanism, not decoration: "locked slots are visible
every day — constant pull to invite barkada."

## What already exists — do not rebuild it

- **`daily_scores` for a squadless user is already correct.** Verified on the
  simulator 2026-08-01: a user with no squad scored 3,200 from real HealthKit
  data. Solo mode is a rendering problem, not a scoring one.
- **`useTodayScore`** returns the caller's own row including `tiers`,
  `contributing_stats` and `total` — everything a self row needs.
- **`tierColor()` in `src/theme.ts`** is the shared tier vocabulary, already
  used by both `StatBar` and `LeaderboardRow`.
- **Column-level UPDATE grants on `profiles`** already cover
  `character_name, class, timezone, height_cm, weight_kg, birth_year, sex,
  has_wearable, exclude_from_recap`. The profile screen needs **no migration**.
- **`streaks_select_own`** already lets a user read their own
  `current_streak`, `longest_streak`, `last_scored_date`, `shield_available_on`.
- **`squad_members_select_visible`** lets a member count their own squad.
- **`levelForXp`, `xpForLevel`, `evolutionStageForLevel`** exist in
  `packages/kairo-core/src/progression.ts`, tested.

**This spec adds no migration.** All three parts are client work.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Solo board data source | **`useTodayScore`, not a new RPC** | The row is the caller's own. `squad_leaderboard` exists to project *other* people's data safely; pointing it at an audience of one adds a migration for nothing. |
| Locked slot count | **From real `squad_members` count** | Not from board rows. See the trap below. |
| Squad capacity constant | **`FREE_SQUAD_MAX_MEMBERS` in `@kairo/core`** | The number 6 is currently written three times. |
| Slot-unlocked reveal | **`Animated` on refetch, not Realtime** | Membership changes do not broadcast (Phase 4 follow-up #8). |
| Dominant stat window | **The user's own recent `daily_scores`** | No lifetime per-stat rollup exists, and adding one is a migration plus a trigger for a visual. |
| Squad-visible All-Rounder | **Deferred to V1** | §6 wants it visible to the squad, which means a new field in `squad_leaderboard`'s projection. That is a privacy-surface change and deserves its own review. |
| Character art | **Vary the existing primitives** | §15 scopes MVP to "AI-placeholder static art". No `react-native-svg`, Rive or Reanimated is installed, and adding one for a placeholder is the wrong trade. |

### The locked-slot trap

> ⚠️ **Corrected 2026-08-08 (workstream D3.3). The trap below is not real.**
> `member_day` reaches `daily_scores` by **`left join`**, in every version of the
> function — so an unscored member comes back with `total = 0`, not absent, and
> `rows.length` *is* the member count. The section is kept rather than deleted
> because the claim was copied into `Leaderboard.tsx` and `queries.ts` from here,
> and a deleted paragraph would just get re-derived. `useSquadMemberCount` stays
> for now; removing it is a V1 cleanup, not a comment fix.

The obvious implementation is `max_members - rows.length`, and
`Leaderboard.tsx` already renders `{rows.length} of {squad.max_members}`.

**`rows.length` is not the member count.** `squad_leaderboard` returns one row
per *scored* member — its `member_day` CTE joins `daily_scores`, so a member who
has joined but not yet logged any activity is absent. Deriving locked slots from
it would show a real squadmate as an empty slot, and invite them again.

So the count comes from `squad_members`, which the client can already read. The
existing "N of 6" text is wrong for the same reason and gets fixed with it.

### Why the reveal is not Realtime

§7 wants an animated "squad slot unlocked" moment when the first member joins.
The `daily_scores` trigger does not fire on membership changes (Phase 4
follow-up #8), so there is nothing to subscribe to. Rather than add a trigger
and a topic for a rare event, the reveal fires when a refetch observes the
member count increase. It lands on the next foreground or pull-to-refresh
instead of instantly — the honest cost, and invisible in practice for something
that happens once.

### Dominant stat: what "dominant" is measured over

§6 says "two people at the same overall level look different based on which
stats they grinded", which implies lifetime. There is no lifetime per-stat
rollup: `profiles.total_xp` is a rollup of `xp_awarded`, not of per-stat points,
and `daily_scores` holds per-stat points per date.

MVP sums the user's own recent `daily_scores` client-side. It reads as
"what you've been grinding lately", which is arguably the better signal for a
character that should respond to behaviour — and it costs no migration. The
window is a named constant so it is one edit to change.

**Balanced / All-Rounder** is the only quantitative rule §6 gives: "all within
20% of each other". That is a pure predicate over four numbers and belongs in
`@kairo/core` with tests, next to the tier logic it sits beside.

## What this deliberately does not do

- **No leave-squad UI.** Phase 4 follow-up #9 is not a UI problem: the open
  question is what happens to a squad when its *leader* leaves. The
  account-deletion path already implements succession, and leaving should reuse
  it rather than invent a second rule. That is a backend decision, not polish.
- **No account deletion.** The client has no DELETE grant on `profiles` — only
  trigger functions exist — so this needs an RPC or Edge Function. Apple
  requires it before App Store submission, which puts it in Phase 8.
- **No notification preferences.** §14 says the daily cap is "configurable", but
  there is no notification system yet to configure.
- **No squad-visible All-Rounder.** See the decisions table.
- **No real character art.** Placeholder primitives that differ by dominant
  stat. Commissioned art and Rive are V1 (§6, §15).

## Verified during design

- `squad_leaderboard` returns only members with a `daily_scores` row — confirmed
  in `supabase/migrations/20260729100000_leaderboard_completed_mode.sql`.
- `grant update (…) on public.profiles to authenticated` covers every body
  metric the profile screen edits — `20260727120400_rls.sql`.
- `streaks_select_own` and `squad_members_select_visible` both exist —
  same file.
- The number 6 appears in `squads.max_members` (SQL default), in `create_squad`
  (`case when v_is_legendary then 15 else 6 end`), and as the word "six" in
  `SquadEmptyState.tsx:21`. The core constant unifies the **client** uses; SQL
  keeps its own and gets a cross-reference comment, because migrations cannot
  import TypeScript.

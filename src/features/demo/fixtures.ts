import type { TodayScore } from '@/features/character/queries.ts';
import type { Streak } from '@/features/profile/queries.ts';
import type { LeaderboardRow, Squad } from '@/features/squad/queries.ts';

/**
 * A squad mid-day, with everything the design mocks show actually happening.
 *
 * A fresh account has no streak and no squadmate, so the
 * streak pill, the standing line and the hit callout are all invisible on a
 * simulator — including the bugs they hide. These fixtures make those states
 * reachable without writing a row anywhere.
 *
 * **Typed against the real exported types, deliberately.** `import type` is
 * erased, so this file pulls in none of those modules' native imports, while a
 * column added to `daily_scores` or a field added to `squad_feed()` still
 * breaks the build here rather than quietly rendering an empty screen.
 *
 * Two constraints these values are pinned by, both real:
 * - `streaks_longest_at_least_current` — 21 >= 4.
 * - `feedLine()` **throws** on `actorIsSelf && targetIsSelf`, so no event may
 *   self-target. Ramon hits you; you are never both ends of a hit.
 */

const SQUAD_ID = 'demo-squad-0000-0000-000000000000';
const SELF_ID = 'demo-user-self-0000-000000000000';
const RAMON_ID = 'demo-user-ramon-0000-00000000000';
const TRINA_ID = 'demo-user-trina-0000-00000000000';

/** The local date the fixture board is ranked on. Fixed — nothing derives from it. */
const LOCAL_DATE = '2026-08-09';

const TIERS = { AGI: 'gold', STR: 'silver', END: 'silver', VIT: 'bronze' } as const;

export const DEMO_SQUAD: Squad = {
  id: SQUAD_ID,
  name: 'Barangay Runners',
  invite_code: 'AB12CD',
  leader_id: RAMON_ID,
  // Four seats with three taken, so the board shows exactly one empty seat —
  // enough to prove the row renders without burying the real members under it.
  max_members: 4,
  program: 'running',
};

export const DEMO_MEMBER_COUNT = 3;

/**
 * Ramon 6,060 · you 4,820 · Trina 3,410 — so the home pill reads
 * "Ramon is 1,240 ahead" and the board hero reads "2nd".
 */
export const DEMO_LEADERBOARD: LeaderboardRow[] = [
  {
    rank: 1,
    user_id: RAMON_ID,
    character_name: 'Ramon',
    class: 'runner',
    level: 14,
    local_date: LOCAL_DATE,
    total: 6060,
    tiers: { AGI: 'gold', STR: 'gold', END: 'silver', VIT: 'silver' },
    contributing_stats: 4,
    has_rec: true,
    flagged: false,
    status: 'provisional',
    current_streak: 9,
    is_self: false,
    program: 'running',
  },
  {
    rank: 2,
    user_id: SELF_ID,
    character_name: 'You',
    class: 'runner',
    level: 12,
    local_date: LOCAL_DATE,
    total: 4820,
    tiers: TIERS,
    contributing_stats: 4,
    has_rec: true,
    flagged: false,
    status: 'provisional',
    current_streak: 4,
    is_self: true,
    program: 'running',
  },
  {
    rank: 3,
    user_id: TRINA_ID,
    character_name: 'Trina',
    class: 'runner',
    level: 11,
    local_date: LOCAL_DATE,
    total: 3410,
    tiers: { AGI: 'silver', STR: 'bronze', END: 'bronze', VIT: 'bronze' },
    contributing_stats: 3,
    has_rec: false,
    flagged: false,
    status: 'provisional',
    current_streak: 2,
    is_self: false,
    program: 'running',
  },
];

/**
 * The components sum to 5,320, which is what `total` must be — the same number
 * the board ranks you on. A fixture whose parts did not add up would make the
 * "includes N for consistency" line on the home screen quietly wrong.
 */
export const DEMO_SCORE: TodayScore = {
  agi_points: 1850,
  str_points: 1240,
  end_points: 980,
  vit_points: 700,
  rec_points: 300,
  consistency_points: 250,
  total: 5320,
  tiers: TIERS,
  contributing_stats: 4,
  status: 'provisional',
};

/** `shield_available_on: null` is a shield banked *now*, not a missing date. */
export const DEMO_STREAK: Streak = {
  current_streak: 4,
  longest_streak: 21,
  last_scored_date: LOCAL_DATE,
  shield_available_on: null,
};

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

/** The day the "Yesterday" tab shows. One before `LOCAL_DATE`, and finalized. */
const PREVIOUS_LOCAL_DATE = '2026-08-08';

const TIERS = { AGI: 'gold', STR: 'silver', MND: 'bronze' } as const;

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
 * Ramon 4,450 · you 3,500 · Trina 2,638 — so the home pill reads
 * "Ramon is 950 ahead" and the board hero reads "2nd".
 *
 * **These are board totals, not stored ones.** `LeaderboardRow.total` is what
 * `squad_leaderboard()` returns: the running program's ×1.5 on AGI applied at
 * read time (deviation #11), over the three stats, with §2's normalization
 * folded in — `weightedBoardTotal`'s expression exactly. `DEMO_SCORE` below is
 * the same day *stored*, and it is legitimately a smaller number.
 *
 * They went stale once, in silence: Task 4 taught the board to count MND and
 * to normalize, and these rows kept the unweighted four-stat sums they were
 * born with. A fixture that could not come out of the real board is a state
 * the app can never receive, and anything read off it in a screenshot is
 * describing a product that does not exist — so `fixtures.test.ts` now
 * recomputes every total from the row's own tiers rather than trusting the
 * comments beside them.
 */
// Three different species on purpose: a board where everyone shares one animal
// cannot show whether the row art actually reads from the row, which is the
// same hole the single-day fixture left in the Today/Yesterday toggle below.
export const DEMO_LEADERBOARD: LeaderboardRow[] = [
  {
    rank: 1,
    user_id: RAMON_ID,
    character_name: 'Ramon',
    species: 'eagle',
    class: 'runner',
    level: 14,
    local_date: LOCAL_DATE,
    // (1,200 AGI × 1.5 for the running program) + 1,200 STR + 650 MND
    // = 3,650, plus 800 for full breadth. Three stats earnable, so the
    // normalization factor is 1.
    total: 4450,
    tiers: { AGI: 'gold', STR: 'gold', MND: 'silver' },
    // Lifetime points, not today's — comfortably above the demo user's, which
    // is what makes the board read as a squad you have to catch rather than
    // one you already lead.
    ratings: { AGI: 36_100, STR: 25_600, MND: 14_400 },
    contributing_stats: 3,
    has_rec: true,
    flagged: false,
    status: 'provisional',
    current_streak: 9,
    is_self: false,
    program: 'running',
    // Deviation #47's four gated totals. Non-null throughout, because the demo
    // board exists to show the product working — a demo of the consent gate
    // withholding everything would be a demo of an empty track.
    //
    // The step counts straddle the finish line on purpose: Ramon is past it,
    // you are close, Trina is halfway. That is a race with something at stake
    // in it, which three numbers on the same side of the flag would not be.
    steps: 12_480,
    distance_m: 9_310,
    active_kcal: 604,
    sleep_minutes: 448,
  },
  {
    rank: 2,
    user_id: SELF_ID,
    character_name: 'You',
    species: 'tamaraw',
    class: 'runner',
    level: 12,
    local_date: LOCAL_DATE,
    // (1,200 × 1.5) + 650 + 250 = 2,700, plus 800 for full breadth.
    total: 3500,
    tiers: TIERS,
    ratings: { AGI: 22_500, STR: 14_400, MND: 8_100 },
    contributing_stats: 3,
    has_rec: true,
    flagged: false,
    status: 'provisional',
    current_streak: 4,
    is_self: true,
    program: 'running',
    steps: 8_421,
    distance_m: 6_120,
    active_kcal: 412,
    sleep_minutes: 392,
  },
  {
    rank: 3,
    user_id: TRINA_ID,
    character_name: 'Trina',
    species: 'carabao',
    class: 'runner',
    level: 11,
    local_date: LOCAL_DATE,
    // Phone-only, and the one row that exercises §2's normalization: two stats
    // earnable, so the weighted sum ((650 × 1.5) + 250 = 1,225) scales by 1.5
    // to 1,838 before the 800 lands. Without the scaling she would sit at
    // 2,025 for the same day, which is the leaderboard gradient the rule
    // exists to remove. Rounded once, at the end — the shape both
    // `weightedBoardTotal` and `program_weighted_total` use, so the board and
    // the stored total cannot drift by a rounding step.
    total: 2638,
    tiers: { AGI: 'silver', STR: 'bronze', MND: 'none' },
    ratings: { AGI: 12_100, STR: 6_400, MND: 0 },
    contributing_stats: 2,
    has_rec: false,
    flagged: false,
    status: 'provisional',
    current_streak: 2,
    is_self: false,
    program: 'running',
    steps: 5_140,
    distance_m: 3_640,
    active_kcal: 233,
    // Phone-only, matching her `has_rec: false` above: no wearable reported a
    // night, so this is null rather than 0. It is the one row that exercises
    // the difference, which the track has to render without saying she slept
    // for no time at all.
    sleep_minutes: null,
  },
];

/**
 * Yesterday's board: a **different day**, with a different winner.
 *
 * The two modes used to return this same array, on the reasoning that the
 * toggle was not what the fixtures existed to exercise. The August QA pass
 * showed why that costs more than it saves — Today and Yesterday rendered
 * identically, so the one control that proves the mode argument reaches
 * `squad_leaderboard()` could not be checked by hand at all. UI here is
 * verified by hand on purpose (`CLAUDE.md`), which makes a fixture that cannot
 * distinguish two states a hole in the only method there is.
 *
 * You win this one, and the ranks reorder rather than merely rescaling: a fixture
 * where everyone keeps their place would still not prove the board re-sorts.
 * `status` is `final` throughout, because a completed day is exactly what
 * "Yesterday" means (§19) — which also gives the finalized styling somewhere to
 * be seen. Lifetime `ratings` are carried over unchanged: they are cumulative,
 * so they cannot legitimately differ between two adjacent days by much, and
 * moving them would misrepresent what that column is.
 *
 * **Each row overrides its tiers, not only its total.** They used to carry
 * yesterday's numbers on today's tiers, and the numbers were unreachable: your
 * 7,240 was above the 5,000 ceiling a running squad's board can pay at all.
 * The totals below are the same `weightedBoardTotal` arithmetic as the board
 * above, over each row's own tiers, and `fixtures.test.ts` recomputes them.
 */
export const DEMO_LEADERBOARD_COMPLETED: LeaderboardRow[] = DEMO_LEADERBOARD.map(
  (row) => ({ ...row, local_date: PREVIOUS_LOCAL_DATE, status: 'final' as const }),
)
  .map((row) => {
    // (1,200 × 1.5) + 1,200 + 650 = 3,650, plus 800.
    if (row.is_self) {
      return {
        ...row,
        total: 4450,
        tiers: { AGI: 'gold', STR: 'gold', MND: 'silver' },
        current_streak: 3,
      };
    }
    // (1,200 × 1.5) + 650 + 250 = 2,700, plus 800.
    if (row.character_name === 'Ramon') {
      return {
        ...row,
        total: 3500,
        tiers: { AGI: 'gold', STR: 'silver', MND: 'bronze' },
        current_streak: 8,
      };
    }
    // Phone-only again: ((650 × 1.5) + 650) × 1.5 = 2,438, plus 800. She
    // closes most of the gap without ever passing anyone, which is the row
    // that shows normalization working rather than merely applying.
    return {
      ...row,
      total: 3238,
      tiers: { AGI: 'silver', STR: 'silver', MND: 'none' },
      current_streak: 1,
    };
  })
  // Ranked from the totals rather than hand-numbered, so the fixture cannot
  // disagree with itself the way a typo'd rank column silently would.
  .sort((a, b) => b.total - a.total)
  .map((row, index) => ({ ...row, rank: index + 1 }));

/**
 * The components sum to 2,900, which is what `total` must be.
 *
 * **Not** the same figure as the demo user's leaderboard row above, and that
 * is the point: this is `daily_scores`, which stores base, program-independent
 * points, while the board weights them at read time (deviation #11). The same
 * day is 2,900 stored and 3,500 on a running squad's board. They were
 * identical while the fixture board was an unweighted sum, which is exactly
 * what made that staleness invisible.
 *
 * Nothing renders this arithmetic any more — the "includes N for consistency"
 * line went with the hero total (deviation #30). It still has to hold, because
 * the fixture stands in for a real `daily_scores` row and the server derives
 * `total` from the parts: a demo row where they disagree is a row the app can
 * never actually receive, so anything read off it in a screenshot or a review
 * would be describing a state that does not exist.
 */
export const DEMO_SCORE: TodayScore = {
  agi_points: 1200,
  str_points: 650,
  mind_points: 250,
  consistency_points: 800,
  total: 2900,
  tiers: TIERS,
  contributing_stats: 3,
  status: 'provisional',
};

/** `shield_available_on: null` is a shield banked *now*, not a missing date. */
export const DEMO_STREAK: Streak = {
  current_streak: 4,
  longest_streak: 21,
  last_scored_date: LOCAL_DATE,
  shield_available_on: null,
};

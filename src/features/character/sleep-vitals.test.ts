import { describe, expect, it } from 'vitest';
import {
  scoringSleepMinutes,
  type DailySleepRow,
} from '../../../supabase/functions/_shared/scoring-inputs.ts';
import { scoredSleepMinutes, type DailySleepVitalsRow } from './sleep-vitals.ts';

describe('scoredSleepMinutes', () => {
  it('reports a measured night', () => {
    expect(scoredSleepMinutes({ minutes: 420, was_user_entered: false })).toBe(420);
  });

  it('reports nothing for a hand-typed night, whatever its minutes say', () => {
    // The whole fix. Without this the home screen offers "1h more sleep for
    // Gold Mind" against a day the server scored `mind_points` 0 and MND
    // `none`, and the TODAY panel prints the hours beside it.
    expect(scoredSleepMinutes({ minutes: 360, was_user_entered: true })).toBeNull();
    expect(scoredSleepMinutes({ minutes: 1_440, was_user_entered: true })).toBeNull();
  });

  it('treats a NULL flag as measured, which is the whole existing cohort', () => {
    // Every row written before the expand migration, and every row written by
    // a client that has not updated. Reading NULL as hand entry would blank
    // the sleep row for everyone using Kairo today.
    expect(scoredSleepMinutes({ minutes: 420, was_user_entered: null })).toBe(420);
  });

  it('returns null rather than zero, because they are different claims', () => {
    // `stat-detail.ts` skips a stat whose raw value is null and ranks one
    // whose raw value is 0 — a zero would let MND win the guidance line over
    // stats with real progress, every day, for a user with no sleep data.
    expect(scoredSleepMinutes(null)).toBeNull();
    expect(scoredSleepMinutes(undefined)).toBeNull();
    expect(scoredSleepMinutes({ minutes: 0, was_user_entered: false })).toBeNull();
    expect(scoredSleepMinutes({ minutes: null, was_user_entered: false })).toBeNull();
  });

  it('reads minutes PostgREST widened to a string', () => {
    expect(scoredSleepMinutes({ minutes: '420', was_user_entered: false })).toBe(420);
  });

});

/**
 * The differential, and why it is one.
 *
 * **This is a substitute for a shared module, not a preference.** Every other
 * rule in Kairo has exactly one implementation — `sync-health` and `rescore`
 * both call `planDay`, the Expo client and the Edge Functions both import
 * `@kairo/core`. This rule cannot: one side is a React Native screen and the
 * other is an Edge Function's pure half, and there is no module a screen can
 * import from `supabase/functions/` without dragging the server tree into the
 * app bundle. So the two are kept honest the way `finalizable_days()` in SQL
 * and `isFinalizable()` in `kairo-core` are — by a differential test, which
 * `CLAUDE.md` records as the designated answer for exactly this shape.
 *
 * **It generates its inputs on purpose.** This replaced a pin on three fixed
 * rows (420/false, 420/true, 420/null), which only failed when a change
 * happened to move one of those three outputs. A condition added to one side
 * that left 420 alone — an oversleep cap, a minimum-duration floor — would
 * have kept it green while the two rules silently diverged, which is the
 * failure the pin existed to prevent. The values below straddle every boundary
 * either rule cares about today and the obvious ones neither does yet: zero,
 * one, plausible floors, MND's 5h/6h/7h bands, the 9h oversleep flatten, and
 * the column's own 1,440 ceiling.
 *
 * Do not simplify this back to fixed rows.
 */
describe('the client rule and the server rule agree, for every input either cares about', () => {
  const DAY = '2026-07-27';

  /** Straddles both sides of every threshold in `mind.ts`, plus 0, 1 and the column max. */
  const MINUTES: Array<number | string | null> = [
    0, 1, 30, 59, 60,
    239, 240,
    299, 300, // MND bronze at 5h
    359, 360, // silver at 6h
    419, 420, // gold at 7h
    539, 540, 541, // the 9h oversleep flatten
    1_440, // the column's check constraint ceiling
    null,
    // PostgREST widens a numeric column to text, so both rules read strings.
    '0', '1', '420', '540',
  ];

  /**
   * `absent` omits the key entirely rather than setting it undefined — that is
   * what a select list missing the column actually produces, which is M1's
   * drift and the one case a typed fixture cannot express.
   */
  const FLAGS: Array<{ label: string; value?: boolean | null }> = [
    { label: 'true', value: true },
    { label: 'false', value: false },
    { label: 'null', value: null },
    { label: 'absent' },
  ];

  function rowFor(
    minutes: number | string | null,
    flag: { label: string; value?: boolean | null },
  ): Record<string, unknown> {
    const row: Record<string, unknown> = { minutes };
    if ('value' in flag) row['was_user_entered'] = flag.value;
    return row;
  }

  it('returns the same answer for every (minutes, was_user_entered) pair', () => {
    const disagreements: string[] = [];
    let compared = 0;

    for (const minutes of MINUTES) {
      for (const flag of FLAGS) {
        const raw = rowFor(minutes, flag);

        const client = scoredSleepMinutes(raw as unknown as DailySleepVitalsRow);
        // The server takes the whole capability window and picks the scored
        // date out of it, so the same row is handed to it that way. That
        // shape difference is the only adaptation; nothing about either rule
        // is restated here.
        const server = scoringSleepMinutes(
          [{ ...raw, local_date: DAY } as unknown as DailySleepRow],
          DAY,
        );

        compared += 1;
        if (client !== server) {
          disagreements.push(
            `minutes=${JSON.stringify(minutes)} was_user_entered=${flag.label}: ` +
              `client=${JSON.stringify(client)} server=${JSON.stringify(server)}`,
          );
        }
      }
    }

    // Every disagreement at once rather than the first — the same reason
    // `disclosure.test.ts` returns a list instead of a boolean. A rule that
    // diverged at one boundary usually diverged at several, and the set is
    // what says which condition moved.
    expect(disagreements).toEqual([]);

    // **A differential over zero inputs passes vacuously.** If a refactor
    // empties either list this assertion is the only thing that notices, and
    // without it the whole describe becomes a test that cannot fail — which
    // is the exact defect this file's history is about.
    expect(compared).toBe(MINUTES.length * FLAGS.length);
    expect(compared).toBeGreaterThan(0);
  });

  it('agrees that no row at all is null, which is the one shape they express differently', () => {
    // The client is handed `null` for a missing row; the server is handed a
    // window that does not contain the scored date. Same statement, and it
    // cannot be expressed inside the cross product above.
    expect(scoredSleepMinutes(null)).toBeNull();
    expect(scoredSleepMinutes(undefined)).toBeNull();
    expect(scoringSleepMinutes([], DAY)).toBeNull();
    expect(
      scoringSleepMinutes(
        [{ local_date: '2026-07-20', minutes: 420, was_user_entered: false }],
        DAY,
      ),
    ).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  SLEEP_CAPABILITY_WINDOW_DAYS,
  WORKOUT_SOURCE_ALLOWLIST,
  capabilityWindowStart,
  earnableStatsFor,
  verifiedWorkoutMinutesFrom,
} from './scoring-inputs.ts';

const DAY = '2026-07-27';

function session(overrides: Record<string, unknown> = {}) {
  return {
    duration_s: 3_600,
    source_bundle_id: WORKOUT_SOURCE_ALLOWLIST[0]!,
    was_user_entered: false,
    has_heart_rate_evidence: true,
    ...overrides,
  };
}

describe('capabilityWindowStart', () => {
  it('opens the window SLEEP_CAPABILITY_WINDOW_DAYS back, inclusive of the scored day', () => {
    // The window is a fortnight *counting the scored date itself*, so the
    // start is 13 days back and not 14. Off by one here and the query either
    // reads a night that no longer counts or misses the one that does.
    expect(capabilityWindowStart(DAY)).toBe('2026-07-14');
    expect(SLEEP_CAPABILITY_WINDOW_DAYS).toBe(14);
  });

  it('crosses a month boundary', () => {
    expect(capabilityWindowStart('2026-03-05')).toBe('2026-02-20');
  });
});

describe('earnableStatsFor', () => {
  it('counts three stats when scoring sleep landed inside the window', () => {
    expect(earnableStatsFor(['2026-07-20'], DAY)).toBe(3);
  });

  it('counts two when the window is empty', () => {
    expect(earnableStatsFor([], DAY)).toBe(2);
  });

  it('measures the window from the date being scored, never from wall-clock today', () => {
    // A backfill is the only place these differ, and it is the whole reason
    // this wrapper exists: sleep from July still makes MND *score* on a July
    // date, so it must also make MND *earnable* on that date. Judged against
    // an August "today" the window is empty, the day is normalized as
    // two-stat, and it pays 6,200 against a 4,400 ceiling with
    // contributing_stats at 3 — which the check constraint waves through.
    expect(earnableStatsFor(['2026-07-20'], '2026-07-27')).toBe(3);
    expect(earnableStatsFor(['2026-07-20'], '2026-08-19')).toBe(2);
  });
});

describe('verifiedWorkoutMinutesFrom', () => {
  it('converts SECONDS to minutes', () => {
    // `workout_sessions.duration_s` is seconds; the shift is priced in
    // minutes. Reading the column as minutes hands a one-hour session a 60x
    // shift, which the 25% cap silently absorbs into "always maxed" — a
    // scoring error with no symptom.
    expect(verifiedWorkoutMinutesFrom([session({ duration_s: 3_600 })])).toBe(60);
    expect(verifiedWorkoutMinutesFrom([session({ duration_s: 1_800 })])).toBe(30);
  });

  it('sums every verified session on the date', () => {
    expect(
      verifiedWorkoutMinutesFrom([
        session({ duration_s: 1_200 }),
        session({ duration_s: 600 }),
      ]),
    ).toBe(30);
  });

  it('ignores a session with no heart-rate evidence', () => {
    // §3: a workout needs its source allowlisted AND heart-rate evidence.
    // The shift is worth up to 25% of a band, which is too much to hand to an
    // unverified claim.
    expect(
      verifiedWorkoutMinutesFrom([session({ has_heart_rate_evidence: false })]),
    ).toBe(0);
  });

  it('ignores a hand-typed session', () => {
    expect(verifiedWorkoutMinutesFrom([session({ was_user_entered: true })])).toBe(0);
  });

  it('ignores a session from an unrecognised source', () => {
    // Inert, never inflationary: an unknown source is `flagged`, which is not
    // `trusted`, so it shifts nothing. That is what makes seeding the
    // allowlist conservatively safe.
    expect(
      verifiedWorkoutMinutesFrom([session({ source_bundle_id: 'com.example.faker' })]),
    ).toBe(0);
    expect(verifiedWorkoutMinutesFrom([session({ source_bundle_id: null })])).toBe(0);
  });

  it('treats the columns the expand migration added as unverified when NULL', () => {
    // Every row written before that migration has all three NULL, and every
    // row written before the client learns to send them does too. Null must
    // read as "no evidence", never as "no objection".
    expect(
      verifiedWorkoutMinutesFrom([
        session({
          source_bundle_id: null,
          was_user_entered: null,
          has_heart_rate_evidence: null,
        }),
      ]),
    ).toBe(0);
  });

  it('never allowlists the Health app, which is where hand entry comes from', () => {
    expect(WORKOUT_SOURCE_ALLOWLIST).not.toContain('com.apple.Health');
  });
});
